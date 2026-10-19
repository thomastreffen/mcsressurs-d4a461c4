// Pure, dependency-injected core for Hub -> Tripletex project create/link. No I/O here.
import { assertAllowed, GuardError, type Connection } from "./tripletex-guard.ts";

export type EventRow = { id: string; company_id: string | null; entity_type: string | null; project_number: string | null; title: string; start_time: string | null; customer_id: string | null };
export type Link = { id: string; status: string; tripletex_id: number | null; tripletex_number: string | null; mcs_entity_id: string };
export type Op = { idempotency_key: string; status: string; attempts: number; error_code: string | null };
export type TtProject = { id: number; number: string; name: string; version?: number; customer?: { id: number } | null };

export interface Store {
  getOp(key: string): Promise<Op | null>;
  insertOp(key: string): Promise<void>; // must ignore unique-conflict
  claimOp(key: string, prevAttempts: number): Promise<boolean>; // atomic pending/failed -> running
  updateOp(key: string, patch: Partial<Op> & { http_status?: number | null; request_id?: string | null }): Promise<void>;
  getProjectLink(eventId: string): Promise<Link | null>; // any non-inactive row for event in connection
  reserveProjectLink(eventId: string, source: string): Promise<Link>; // reuses existing pending/failed row
  activateLink(linkId: string, p: TtProject): Promise<void>;
  failLink(linkId: string): Promise<void>;
  findActiveLinkByTripletexId(tid: number): Promise<Link | null>;
}
export interface TtApi {
  findProjectsByNumber(n: string): Promise<TtProject[]>;
  getProject(id: number): Promise<TtProject | null>;
  createProject(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; id?: number; request_id?: string | null }>;
}

export const createKey = (connId: string, eventId: string) => `create_project:${connId}:${eventId}`;

/** Preconditions checked before any network call. */
export function assertProjectWritable(conn: Connection, ev: EventRow, opts: { capability: string }) {
  if (ev.entity_type !== "financial_project") throw new GuardError("not_financial", "Kun bekreftede økonomiske prosjekter kan kobles til Tripletex.");
  if (conn.environment !== "test") throw new GuardError("env_blocked", "Kun Tripletex TEST er tillatt i denne fasen.");
  assertAllowed(conn, { sourceCompanyId: ev.company_id ?? "__none__", write: true, capability: opts.capability });
}

export function assertCreateInputs(ev: EventRow, customerTtId: number | null, pmId: number | null) {
  if (!ev.project_number?.trim()) throw new GuardError("missing_number", "Prosjektnummer mangler i eget felt.");
  if (!customerTtId) throw new GuardError("customer_not_linked", "Kunden må kobles til Tripletex før prosjektet kan opprettes.");
  if (!pmId) throw new GuardError("pm_missing", "Prosjektleder må velges/bekreftes.");
}

const matches = (p: TtProject, ev: EventRow, customerTtId: number) =>
  p.number === ev.project_number && p.customer?.id === customerTtId;

export type CreateResult =
  | { result: "created" | "adopted" | "already_linked"; tripletex_id: number; number: string }
  | { result: "number_exists"; candidates: TtProject[] }
  | { result: "in_progress" }
  | { result: "failed"; error_code: string };

export async function runCreate(a: { conn: Connection; ev: EventRow; customerTtId: number | null; pmId: number | null; name: string; store: Store; tt: TtApi }): Promise<CreateResult> {
  const { conn, ev, store, tt } = a;
  assertProjectWritable(conn, ev, { capability: "projects_write" });
  const existing = await store.getProjectLink(ev.id);
  if (existing?.status === "active" && existing.tripletex_id) return { result: "already_linked", tripletex_id: existing.tripletex_id, number: existing.tripletex_number ?? "" };
  assertCreateInputs(ev, a.customerTtId, a.pmId);
  const customerTtId = a.customerTtId!;
  const number = ev.project_number!.trim();

  const key = createKey(conn.id, ev.id);
  let op = await store.getOp(key);
  if (!op) { await store.insertOp(key); op = await store.getOp(key); }
  if (!op) return { result: "failed", error_code: "op_reserve_failed" };
  if (op.status === "running" || op.status === "succeeded") return { result: "in_progress" };
  const previousPostAttempted = op.error_code === "post_attempted" || op.error_code === "timeout";
  if (!(await store.claimOp(key, op.attempts))) return { result: "in_progress" };

  const link = await store.reserveProjectLink(ev.id, "created_from_mcs");

  // Never create if the number already exists. A previous timed-out POST of ours may be adopted.
  const found = await tt.findProjectsByNumber(number);
  if (found.length > 0) {
    const mine = previousPostAttempted ? found.find((p) => matches(p, ev, customerTtId)) : undefined;
    if (mine && found.length === 1) {
      const verified = await tt.getProject(mine.id);
      if (verified && matches(verified, ev, customerTtId)) {
        await store.activateLink(link.id, verified);
        await store.updateOp(key, { status: "succeeded", error_code: null });
        return { result: "adopted", tripletex_id: verified.id, number: verified.number };
      }
    }
    await store.failLink(link.id);
    await store.updateOp(key, { status: "failed", error_code: "number_exists" });
    return { result: "number_exists", candidates: found };
  }

  await store.updateOp(key, { error_code: "post_attempted" });
  let res;
  try {
    res = await tt.createProject({
      number, name: a.name, customer: { id: customerTtId },
      startDate: (ev.start_time ?? new Date().toISOString()).slice(0, 10),
      isInternal: false, projectManager: { id: a.pmId },
    });
  } catch {
    await store.failLink(link.id);
    await store.updateOp(key, { status: "failed", error_code: "timeout" });
    return { result: "failed", error_code: "timeout" };
  }
  if (!res.ok || !res.id) {
    await store.failLink(link.id);
    await store.updateOp(key, { status: "failed", error_code: "tripletex_rejected", http_status: res.status, request_id: res.request_id ?? null });
    return { result: "failed", error_code: "tripletex_rejected" };
  }
  const back = await tt.getProject(res.id);
  if (!back || back.id !== res.id || back.number !== number || back.name !== a.name || back.customer?.id !== customerTtId) {
    await store.failLink(link.id);
    await store.updateOp(key, { status: "failed", error_code: "verify_failed", http_status: res.status });
    return { result: "failed", error_code: "verify_failed" };
  }
  await store.activateLink(link.id, back);
  await store.updateOp(key, { status: "succeeded", error_code: null, http_status: res.status, request_id: res.request_id ?? null });
  return { result: "created", tripletex_id: back.id, number: back.number };
}

export async function runLinkExisting(a: { conn: Connection; ev: EventRow; tripletexId: number; store: Store; tt: TtApi }) {
  const { conn, ev, store, tt } = a;
  assertProjectWritable(conn, ev, { capability: "projects_write" });
  const other = await store.findActiveLinkByTripletexId(a.tripletexId);
  if (other && other.mcs_entity_id !== ev.id) throw new GuardError("already_linked_elsewhere", "Tripletex-prosjektet er allerede koblet til et annet Hub-prosjekt.");
  const current = await store.getProjectLink(ev.id);
  if (current?.status === "active" && current.tripletex_id && current.tripletex_id !== a.tripletexId)
    throw new GuardError("event_already_linked", "Hub-prosjektet er allerede koblet til et annet Tripletex-prosjekt.");
  const p = await tt.getProject(a.tripletexId);
  if (!p) throw new GuardError("not_found", "Fant ikke prosjektet i Tripletex.");
  const link = await store.reserveProjectLink(ev.id, "manual");
  await store.activateLink(link.id, p);
  return { result: "linked" as const, tripletex_id: p.id, number: p.number };
}
