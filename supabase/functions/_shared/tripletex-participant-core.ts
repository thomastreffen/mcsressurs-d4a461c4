// Pure core for Hub technician -> Tripletex employee link and project participant (TPX-F3). No I/O here.
import { assertAllowed, GuardError, type Connection } from "./tripletex-guard.ts";

export type JobRow = { id: string; company_id: string | null; entity_type: string | null; parent_project_id: string | null; project_number?: string | null };
export type Link = { id: string; status: string; tripletex_id: number | null; tripletex_number: string | null; mcs_entity_id: string };
export type Op = { idempotency_key: string; status: string; attempts: number; error_code: string | null };
export type TtEmployee = { id: number; firstName?: string; lastName?: string; employeeNumber?: string | null; email?: string | null; version?: number };

export interface PStore {
  getOp(key: string): Promise<Op | null>;
  insertOp(key: string, op: string, mcsType: string, mcsId: string): Promise<void>; // ignore unique conflict
  claimOp(key: string, prevAttempts: number): Promise<boolean>; // atomic pending/failed -> running
  updateOp(key: string, patch: Partial<Op> & { http_status?: number | null; request_id?: string | null }): Promise<void>;
  getLink(type: "project" | "employee", mcsId: string): Promise<Link | null>; // non-inactive row in this connection
  findActiveByTripletexId(type: "employee", tid: number): Promise<Link | null>;
  saveEmployeeLink(technicianId: string, e: TtEmployee): Promise<void>;
}
export interface PTtApi {
  getEmployee(id: number): Promise<TtEmployee | null>;
  listParticipantEmployeeIds(projectId: number): Promise<number[]>;
  addParticipant(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; id?: number; request_id?: string | null }>;
}

/** Job -> financial project. Child jobs use their financial parent; others are rejected before network. */
export function resolveFinancialProject(job: JobRow, parent: JobRow | null): JobRow {
  if (job.entity_type === "financial_project") return job;
  if (job.parent_project_id && parent && parent.id === job.parent_project_id && parent.entity_type === "financial_project") return parent;
  throw new GuardError("not_financial", "Jobben hører ikke til et økonomisk prosjekt.");
}

/** Whole-chain company check: connection = job = financial project = technician employment. */
export function assertChain(conn: Connection, job: JobRow, fp: JobRow, technicianCompanyIds: string[], opts: { write: boolean; capability: string }) {
  if (conn.environment !== "test") throw new GuardError("env_blocked", "Kun Tripletex TEST er tillatt i denne fasen.");
  assertAllowed(conn, { sourceCompanyId: job.company_id ?? "__none__", write: opts.write, capability: opts.capability });
  if (fp.company_id !== conn.company_id) throw new GuardError("company_mismatch", "Det økonomiske prosjektet tilhører et annet selskap.");
  if (!technicianCompanyIds.includes(conn.company_id)) throw new GuardError("employee_company", "Montøren er ikke ansatt i samme selskap som tilkoblingen.");
}

export const participantKey = (connId: string, ttProject: number, ttEmployee: number) => `add_participant:${connId}:${ttProject}:${ttEmployee}`;

export type ParticipantResult =
  | { result: "added" | "already_participant"; tripletex_project_id: number; tripletex_employee_id: number }
  | { result: "in_progress" }
  | { result: "failed"; error_code: string };

export async function runAddParticipant(a: { conn: Connection; job: JobRow; parent: JobRow | null; technicianId: string; assigned: boolean; technicianCompanyIds: string[]; store: PStore; tt: PTtApi }): Promise<ParticipantResult> {
  const { conn, store, tt } = a;
  const fp = resolveFinancialProject(a.job, a.parent);
  assertChain(conn, a.job, fp, a.technicianCompanyIds, { write: true, capability: "project_participants_write" });
  if (!a.assigned) throw new GuardError("not_assigned", "Montøren er ikke tildelt denne jobben i ressursplanen.");
  const pl = await store.getLink("project", fp.id);
  if (pl?.status !== "active" || !pl.tripletex_id) throw new GuardError("project_not_linked", "Det økonomiske prosjektet er ikke koblet til Tripletex TEST.");
  const el = await store.getLink("employee", a.technicianId);
  if (el?.status !== "active" || !el.tripletex_id) throw new GuardError("employee_not_linked", "Montøren er ikke koblet til en Tripletex-ansatt.");
  const pid = pl.tripletex_id, eid = el.tripletex_id;

  const key = participantKey(conn.id, pid, eid);
  let op = await store.getOp(key);
  if (!op) { await store.insertOp(key, "add_participant", "employee", a.technicianId); op = await store.getOp(key); }
  if (!op) return { result: "failed", error_code: "op_reserve_failed" };
  if (op.status === "running") return { result: "in_progress" };

  // Idempotent: always check Tripletex first; existing participant means no write.
  const before = await tt.listParticipantEmployeeIds(pid);
  if (before.includes(eid)) {
    if (op.status !== "succeeded") await store.updateOp(key, { status: "succeeded", error_code: null });
    return { result: "already_participant", tripletex_project_id: pid, tripletex_employee_id: eid };
  }
  if (!(await store.claimOp(key, op.attempts))) return { result: "in_progress" };
  let res;
  try {
    res = await tt.addParticipant({ project: { id: pid }, employee: { id: eid }, adminAccess: false });
  } catch {
    await store.updateOp(key, { status: "failed", error_code: "timeout" });
    return { result: "failed", error_code: "timeout" };
  }
  const after = await tt.listParticipantEmployeeIds(pid).catch(() => [] as number[]);
  if (after.includes(eid)) {
    await store.updateOp(key, { status: "succeeded", error_code: null, http_status: res.status, request_id: res.request_id ?? null });
    return { result: "added", tripletex_project_id: pid, tripletex_employee_id: eid };
  }
  await store.updateOp(key, { status: "failed", error_code: res.ok ? "verify_failed" : "tripletex_rejected", http_status: res.status, request_id: res.request_id ?? null });
  return { result: "failed", error_code: res.ok ? "verify_failed" : "tripletex_rejected" };
}

export async function runLinkEmployee(a: { conn: Connection; technicianId: string; technicianCompanyIds: string[]; tripletexEmployeeId: number; store: PStore; tt: PTtApi }) {
  const { conn, store, tt } = a;
  if (conn.environment !== "test") throw new GuardError("env_blocked", "Kun Tripletex TEST er tillatt i denne fasen.");
  assertAllowed(conn, { write: true, capability: "employees_read" });
  if (!a.technicianCompanyIds.includes(conn.company_id)) throw new GuardError("employee_company", "Montøren er ikke ansatt i samme selskap som tilkoblingen.");
  const other = await store.findActiveByTripletexId("employee", a.tripletexEmployeeId);
  if (other && other.mcs_entity_id !== a.technicianId) throw new GuardError("already_linked_elsewhere", "Tripletex-ansatten er allerede koblet til en annen Hub-ansatt.");
  const cur = await store.getLink("employee", a.technicianId);
  if (cur?.status === "active" && cur.tripletex_id && cur.tripletex_id !== a.tripletexEmployeeId)
    throw new GuardError("employee_already_linked", "Hub-ansatten er allerede koblet til en annen Tripletex-ansatt.");
  if (cur?.status === "active" && cur.tripletex_id === a.tripletexEmployeeId) return { result: "already_linked" as const, tripletex_id: a.tripletexEmployeeId };
  const e = await tt.getEmployee(a.tripletexEmployeeId);
  if (!e) throw new GuardError("not_found", "Fant ikke ansatten i Tripletex.");
  await store.saveEmployeeLink(a.technicianId, e);
  return { result: "linked" as const, tripletex_id: e.id };
}
