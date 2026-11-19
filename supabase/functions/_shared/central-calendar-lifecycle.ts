import { diagnoseOneShotEvents, type OneShotEvent, type OneShotPermit } from "./job-calendar-one-shot.ts";

// Shipping this module cannot authorize production writes. Separate activation review is mandatory.
export const CENTRAL_LIFECYCLE_APPROVED = false;
export type DailyScope = { eventId: string; technicianId: string; companyId: string; mailbox: string; workDate: string; start: string; end: string; key: string };
export type DailyCopy = { id: string; changeKey: string; transactionId?: string; source: "central" | "delegated" };
export type DailyOperation = { id: string; state: string; kind: "create" | "update" | "delete"; payload: Record<string, any>; graphId: string | null };
export type DailyGraph = (method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, ifMatch?: string) => Promise<{ status: number; data: any }>;
export interface DailyStore {
  unresolved(): Promise<DailyOperation | null>;
  // Must re-read scope/assignment/schedule/identity/rollout immediately before claim.
  live(kind: DailyOperation["kind"]): Promise<boolean>;
  claim(kind: DailyOperation["kind"], key: string, payload: Record<string, any>, copy: DailyCopy | null): Promise<string | null>;
  receipt(id: string, state: string, http: number | null, graphId: string | null, changeKey: string | null): Promise<void>;
  saveCopy(copy: DailyCopy | null, deleted: boolean): Promise<void>;
}
const fields = "id,changeKey,transactionId,start,end,showAs,isCancelled,type,isAllDay,body,subject,attendees";
export const dailyCollection = (s: DailyScope) => `/v1.0/users/${encodeURIComponent(s.mailbox)}/events`;
export const dailyGet = (s: DailyScope, id: string) => `${dailyCollection(s)}/${encodeURIComponent(id)}?$select=${fields}`;
const utc = (d: any) => d?.timeZone === "UTC" && typeof d.dateTime === "string" ? Date.parse(/Z$|[+-]\d\d:\d\d$/.test(d.dateTime) ? d.dateTime : `${d.dateTime}Z`) : NaN;
export function dailyIdentity(e: any, s: DailyScope, copy?: DailyCopy | null): boolean {
  const body = e?.body?.content;
  return !!e?.id && (!copy || e.id === copy.id) && typeof e.changeKey === "string" && !!e.changeKey &&
    typeof body === "string" && [`MCS_EVENT_ID:${s.eventId}`, `MCS_TECHNICIAN_ID:${s.technicianId}`, `MCS_WORK_DATE:${s.workDate}`].every(m => body.includes(m)) &&
    e.type === "singleInstance" && e.isCancelled === false && e.isAllDay === false && Array.isArray(e.attendees) && e.attendees.length === 0 && Number.isFinite(utc(e.start)) && Number.isFinite(utc(e.end));
}
export function dailyMatches(e: any, payload: Record<string, any>): boolean {
  return e?.subject === payload.subject && e?.showAs === payload.showAs && utc(e?.start) === utc(payload.start) && utc(e?.end) === utc(payload.end) && e?.body?.content === payload.body?.content && (e?.location?.displayName ?? "") === (payload.location?.displayName ?? "");
}
export function dailyCalendarDiagnosis(events: OneShotEvent[], s: DailyScope, title: string, copy: DailyCopy | null) {
  const permit: OneShotPermit = { id: "generic-read", event_id: s.eventId, technician_id: s.technicianId, company_id: s.companyId, mailbox: s.mailbox, work_date: s.workDate, start: s.start, end: s.end, key: s.key, phrase: "", overridePhrase: "", label: "" };
  // Only an exact, identity-verified stored copy is excluded from time warnings.
  const remaining = events.filter(e => !(copy && e.id === copy.id && dailyIdentity(e, s, copy)));
  return diagnoseOneShotEvents(remaining, title, permit);
}
const patchFields = (p: Record<string, any>) => Object.fromEntries(["subject", "body", "start", "end", "location", "showAs"].filter(k => k in p).map(k => [k, p[k]]));

/** GET-only preflight. Known other commitments require audited consent; unknown/duplicates never override. */
export async function previewDaily(graph: DailyGraph, scope: DailyScope, viewPath: string, payload: Record<string, any>, copy: DailyCopy | null) {
  if (copy) {
    const r = await graph("GET", dailyGet(scope, copy.id));
    if (r.status !== 200 || !dailyIdentity(r.data, scope, copy)) return { blocked: r.status === 404 ? "stored_copy_missing" : "stored_copy_unverified" };
    if (r.data.changeKey !== copy.changeKey) return { blocked: "copy_changed_in_outlook" };
  }
  const r = await graph("GET", viewPath);
  if (r.status !== 200 || !Array.isArray(r.data?.value) || r.data["@odata.nextLink"]) return { blocked: "calendar_read_incomplete" };
  const diagnosis = dailyCalendarDiagnosis(r.data.value, scope, payload.subject ?? "", copy);
  return { blocked: diagnosis.category === "duplicate" ? "same_hub_job_exists" : diagnosis.category === "unknown" ? "calendar_identity_unresolved" : null, diagnosis };
}

/** One durable claim per day/version, one transport attempt; no blind retry of any ambiguous outcome. */
export async function syncDaily(p: { scope: DailyScope; kind: DailyOperation["kind"]; payload: Record<string, any>; copy: DailyCopy | null; viewPath: string; graph: DailyGraph; store: DailyStore; authorized: boolean; conflictConsent: boolean; operationKey: string }) {
  const { scope: s, graph, store } = p;
  const open = await store.unresolved();
  if (open) return reconcileDaily(s, open, graph, store);
  if (!p.authorized) return { state: "activation_required" };
  if (!await store.live(p.kind)) return { state: "live_scope_blocked" };
  if (p.copy?.source === "delegated") return { state: "delegated_copy_requires_verified_adoption" };
  if (p.kind !== "create" && !p.copy) return { state: "exact_copy_required" };
  let before;
  try { before = p.copy ? await graph("GET", dailyGet(s, p.copy.id)) : null; }
  catch { return { state: "calendar_read_failed_no_write" }; }
  if (before && (before.status !== 200 || !dailyIdentity(before.data, s, p.copy))) return { state: "stored_copy_unverified" };
  if (before && before.data.changeKey !== p.copy?.changeKey) return { state: "copy_changed_in_outlook" };
  if (p.kind !== "delete") {
    let preview;
    try { preview = await previewDaily(graph, s, p.viewPath, p.payload, p.copy); }
    catch { return { state: "calendar_read_failed_no_write" }; }
    if (preview.blocked) return { state: preview.blocked, diagnosis: preview.diagnosis };
    if (preview.diagnosis?.category === "other" && !p.conflictConsent) return { state: "known_conflict_consent_required", diagnosis: preview.diagnosis };
    if (p.kind === "update" && before && dailyMatches(before.data, p.payload)) return { state: "verified", graphId: p.copy?.id };
  }
  if (!await store.live(p.kind)) return { state: "live_scope_changed" };
  const claim = await store.claim(p.kind, p.operationKey, p.payload, p.copy);
  if (!claim) return { state: "claim_unavailable_no_replay" };
  let r;
  try { r = await graph(p.kind === "create" ? "POST" : p.kind === "update" ? "PATCH" : "DELETE", p.kind === "create" ? dailyCollection(s) : `${dailyCollection(s)}/${encodeURIComponent(p.copy?.id ?? "")}`, p.kind === "create" ? p.payload : p.kind === "update" ? patchFields(p.payload) : undefined, p.kind !== "create" ? p.copy?.changeKey : undefined); }
  catch { await store.receipt(claim, "uncertain", null, p.copy?.id ?? null, null); return { state: "uncertain_no_retry" }; }
  const accepted = p.kind === "create" ? r.status === 201 && typeof r.data?.id === "string" && !!r.data.id : p.kind === "update" ? r.status === 200 && r.data?.id === p.copy?.id : r.status === 204;
  const graphId = p.kind === "create" ? r.data?.id ?? null : p.copy?.id ?? null;
  const state = accepted ? "accepted" : [401, 403, 400].includes(r.status) ? "rejected" : [409, 412].includes(r.status) ? "conflict" : "uncertain";
  await store.receipt(claim, state, r.status, graphId, r.data?.changeKey ?? null);
  if (!accepted) return { state: `${state}_no_retry`, http: r.status };
  return reconcileDaily(s, { id: claim, state, kind: p.kind, payload: p.payload, graphId }, graph, store);
}

/** Uses GET only. Missing or mismatched identities never turn into a replacement create. */
export async function reconcileDaily(s: DailyScope, op: DailyOperation, graph: DailyGraph, store: DailyStore) {
  if (!op.graphId) return { state: "uncertain_no_id_manual_reconciliation" };
  let r;
  try { r = await graph("GET", dailyGet(s, op.graphId)); } catch { return { state: "reconciliation_read_failed" }; }
  if (op.kind === "delete" && r.status === 404) {
    if (!await store.live("delete")) return { state: "replanned_reconciliation_required" };
    await store.saveCopy(null, true); await store.receipt(op.id, "verified", 404, op.graphId, null); return { state: "verified_absent" };
  }
  if (r.status !== 200 || !dailyIdentity(r.data, s) || r.data.id !== op.graphId) return { state: "unresolved_no_retry" };
  if (op.kind === "delete" || !dailyMatches(r.data, op.payload)) return { state: "unresolved_no_retry" };
  await store.saveCopy({ id: r.data.id, changeKey: r.data.changeKey, transactionId: r.data.transactionId, source: "central" }, false);
  await store.receipt(op.id, "verified", 200, r.data.id, r.data.changeKey);
  return { state: "verified", graphId: r.data.id };
}