// Pure core for Tripletex -> Hub financial project import (TPX-F4). No I/O here.
// Normal flow: economic project is created in Tripletex, then imported/linked into Hub by stable Tripletex ID.
import { assertAllowed, GuardError, type Connection } from "./tripletex-guard.ts";

export type TtCustomer = { id: number; name?: string; customerNumber?: number | null; organizationNumber?: string | null };
export type TtImportProject = {
  id: number; number: string; name: string; version?: number; isClosed?: boolean | null;
  startDate?: string | null; endDate?: string | null; customer?: TtCustomer | null;
  projectManager?: { id: number; firstName?: string; lastName?: string } | null;
};
export type HubCustomer = { id: string; company_id: string; org_number: string | null };
export type Op = { idempotency_key: string; status: string; attempts: number; error_code: string | null };

export interface IStore {
  findProjectLinkByTripletexId(tid: number): Promise<{ mcs_entity_id: string } | null>;
  findCustomerLinkByTripletexId(tid: number): Promise<{ mcs_entity_id: string } | null>;
  getCustomerLinkForHub(hubCustomerId: string): Promise<{ tripletex_id: number | null } | null>;
  findHubCustomersByOrg(org: string): Promise<HubCustomer[]>; // same company only, exact normalized org
  getHubCustomer(id: string): Promise<HubCustomer | null>;
  linkCustomer(hubCustomerId: string, c: TtCustomer, source: "auto_match" | "manual"): Promise<void>;
  getOp(key: string): Promise<Op | null>;
  insertOp(key: string, ttId: number): Promise<void>;
  claimOp(key: string, prevAttempts: number): Promise<boolean>;
  updateOp(key: string, patch: Partial<Op>): Promise<void>;
  createShell(p: { ttId: number; number: string; name: string; version: number | null; customerId: string; start: string | null; end: string | null }): Promise<{ event_id: string; created: boolean }>;
}
export interface ITtApi { getProject(id: number): Promise<TtImportProject | null> }

export const importKey = (connId: string, ttId: number) => `import_project:${connId}:${ttId}`;
export const normOrg = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
export const shellTitle = (number: string, name: string) => name.startsWith(number + " ") ? name.slice(number.length + 1).trim() : name.trim();

export function assertImportAllowed(conn: Connection, sourceCompanyId: string) {
  if (conn.environment !== "test") throw new GuardError("env_blocked", "Kun Tripletex TEST er tillatt i denne fasen.");
  assertAllowed(conn, { sourceCompanyId, capability: "projects_read" });
  assertAllowed(conn, { capability: "customers_read" });
}

export type CustomerDecision =
  | { kind: "linked"; hubCustomerId: string }
  | { kind: "suggested"; hubCustomerId: string } // unique exact org match, needs explicit confirmation
  | { kind: "confirmed"; hubCustomerId: string; source: "auto_match" | "manual" }
  | { kind: "blocked"; reason: "no_customer" | "no_match" | "ambiguous" | "customer_linked_elsewhere" | "customer_company" };

/** Customer resolution: existing link > exact org.nr (needs confirmation) > explicit manual choice. Never by name. */
export async function decideCustomer(conn: Connection, tc: TtCustomer | null | undefined, confirmId: string | null, store: IStore): Promise<CustomerDecision> {
  if (!tc?.id) return { kind: "blocked", reason: "no_customer" };
  const linked = await store.findCustomerLinkByTripletexId(tc.id);
  if (linked) return { kind: "linked", hubCustomerId: linked.mcs_entity_id };
  const org = normOrg(tc.organizationNumber);
  const matches = org.length === 9 ? (await store.findHubCustomersByOrg(org)).filter((c) => c.company_id === conn.company_id) : [];
  if (confirmId) {
    const hub = await store.getHubCustomer(confirmId);
    if (!hub || hub.company_id !== conn.company_id) return { kind: "blocked", reason: "customer_company" };
    const other = await store.getCustomerLinkForHub(hub.id);
    if (other?.tripletex_id && other.tripletex_id !== tc.id) return { kind: "blocked", reason: "customer_linked_elsewhere" };
    const orgOk = matches.length === 1 && matches[0].id === hub.id;
    return { kind: "confirmed", hubCustomerId: hub.id, source: orgOk ? "auto_match" : "manual" };
  }
  if (matches.length === 1) return { kind: "suggested", hubCustomerId: matches[0].id };
  return { kind: "blocked", reason: matches.length > 1 ? "ambiguous" : "no_match" };
}

export type ImportResult =
  | { result: "imported" | "already_linked"; event_id: string; tripletex_id: number; closed: boolean }
  | { result: "needs_closed_confirmation"; tripletex_id: number }
  | { result: "needs_customer_confirmation"; suggestion: string | null; reason?: string }
  | { result: "in_progress" }
  | { result: "failed"; error_code: string };

export async function runImport(a: { conn: Connection; sourceCompanyId: string; tripletexId: number; confirmClosed: boolean; confirmCustomerId: string | null; store: IStore; tt: ITtApi }): Promise<ImportResult> {
  const { conn, store, tt } = a;
  assertImportAllowed(conn, a.sourceCompanyId);
  const existing = await store.findProjectLinkByTripletexId(a.tripletexId);
  // Fresh read-back from Tripletex before any Hub write.
  const p = await tt.getProject(a.tripletexId);
  if (!p || p.id !== a.tripletexId || !p.number) throw new GuardError("not_found", "Fant ikke prosjektet i Tripletex.");
  if (typeof p.isClosed !== "boolean") throw new GuardError("project_status_unknown", "Kunne ikke lese prosjektstatus fra Tripletex.");
  if (existing) return { result: "already_linked", event_id: existing.mcs_entity_id, tripletex_id: p.id, closed: p.isClosed };
  if (p.isClosed && !a.confirmClosed) return { result: "needs_closed_confirmation", tripletex_id: p.id };

  const cd = await decideCustomer(conn, p.customer, a.confirmCustomerId, store);
  if (cd.kind === "blocked") return { result: "needs_customer_confirmation", suggestion: null, reason: cd.reason };
  if (cd.kind === "suggested") return { result: "needs_customer_confirmation", suggestion: cd.hubCustomerId };

  const key = importKey(conn.id, p.id);
  let op = await store.getOp(key);
  if (!op) { await store.insertOp(key, p.id); op = await store.getOp(key); }
  if (!op) return { result: "failed", error_code: "op_reserve_failed" };
  if (op.status === "running") return { result: "in_progress" };
  if (op.status !== "succeeded" && !(await store.claimOp(key, op.attempts))) return { result: "in_progress" };
  try {
    if (cd.kind === "confirmed") await store.linkCustomer(cd.hubCustomerId, p.customer!, cd.source);
    const r = await store.createShell({ ttId: p.id, number: p.number, name: shellTitle(p.number, p.name), version: p.version ?? null, customerId: cd.hubCustomerId, start: p.startDate ?? null, end: p.endDate ?? null });
    await store.updateOp(key, { status: "succeeded", error_code: null });
    return { result: r.created ? "imported" : "already_linked", event_id: r.event_id, tripletex_id: p.id, closed: p.isClosed };
  } catch (e) {
    await store.updateOp(key, { status: "failed", error_code: e instanceof GuardError ? e.code : "hub_write_failed" });
    throw e;
  }
}

/** Tripletex Project.isClosed is canonical; anything but a boolean fails closed. endDate is never used. */
export function openStatus(isClosed: unknown): "open" | "closed" | "unknown" {
  return isClosed === false ? "open" : isClosed === true ? "closed" : "unknown";
}
