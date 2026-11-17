// Exact update/delete primitives for the single Mats one-shot Outlook copy.
// LOCKED: MUTATIONS_APPROVED=false means no PATCH/DELETE transport exists in production.
// Activating requires a separate written approval, a claim migration and a code change.
import { ONE_SHOT } from "./job-calendar-one-shot.ts";

export const MUTATIONS_APPROVED = false as const;
export const MUTATION_PHRASES = Object.freeze({
  update: "ENDRE MATS 19.11.2026 – NØYAKTIG AVTALE",
  delete: "SLETT MATS 19.11.2026 – AVPLANLAGT",
});
export type MutationKind = "update" | "delete";
export interface StoredCopy { graph_event_id: string; graph_change_key: string | null; mailbox: string; event_id: string; technician_id: string; work_date: string; company_id: string; state: string }
export type MutationGraph = (method: "GET" | "PATCH" | "DELETE", path: string, opts?: { body?: unknown; ifMatch?: string }) => Promise<{ status: number; data: any }>;

const SELECT = "$select=id,changeKey,transactionId,start,end,showAs,isCancelled,type,body,subject,attendees";
export const exactEventPath = (id: string) => `/v1.0/users/${encodeURIComponent(ONE_SHOT.mailbox)}/events/${encodeURIComponent(id)}`;
export const exactGetPath = (id: string) => `${exactEventPath(id)}?${SELECT}`;
/** Only GET/PATCH/DELETE on the one stored ID in Mats' mailbox. Any other path or method is refused. */
export function assertMutationRequest(method: string, path: string, storedId: string) {
  if (!storedId) throw new Error("mutation_transport_denied");
  if (method === "GET" && path === exactGetPath(storedId)) return;
  if ((method === "PATCH" || method === "DELETE") && path === exactEventPath(storedId)) {
    if (!MUTATIONS_APPROVED) throw new Error("mutation_not_approved");
    return;
  }
  throw new Error("mutation_transport_denied");
}
export function storedScopeOk(s: StoredCopy | null): string | null {
  const x = ONE_SHOT;
  if (!s || s.state !== "succeeded" || !s.graph_event_id) return "no_verified_copy";
  if (s.mailbox !== x.mailbox || s.event_id !== x.event_id || s.technician_id !== x.technician_id || s.work_date !== x.work_date || s.company_id !== x.company_id) return "exact_scope_mismatch";
  if (!s.graph_change_key) return "change_key_missing";
  return null;
}
const utc = (d?: { dateTime?: string; timeZone?: string }) => !d?.dateTime || d.timeZone !== "UTC" ? NaN : Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(d.dateTime) ? d.dateTime : `${d.dateTime}Z`);
export type Verification = "verified" | "changed_in_outlook" | "missing" | "identity_mismatch" | "unknown";
/** Classifies a GET of the exact stored ID. Only safe metadata leaves this function. */
export function verifyCopy(r: { status: number; data: any }, s: StoredCopy) {
  const x = ONE_SHOT;
  if (r.status === 404) return { verification: "missing" as Verification };
  if (r.status !== 200 || !r.data) return { verification: "unknown" as Verification, http: r.status };
  const e = r.data, body = typeof e.body?.content === "string" ? e.body.content : "";
  const markers = body.includes(`MCS_EVENT_ID:${x.event_id}`) && body.includes(`MCS_TECHNICIAN_ID:${x.technician_id}`) && body.includes(`MCS_WORK_DATE:${x.work_date}`);
  if (e.id !== s.graph_event_id || e.transactionId !== x.key || !markers || e.type !== "singleInstance") return { verification: "identity_mismatch" as Verification };
  const facts = { start_ok: utc(e.start) === Date.parse(x.start), end_ok: utc(e.end) === Date.parse(x.end), show_as: e.showAs ?? "unknown", cancelled: e.isCancelled === true, attendees: Array.isArray(e.attendees) ? e.attendees.length : -1, job_link: /https?:\/\//.test(body) };
  if (typeof e.changeKey !== "string" || e.changeKey !== s.graph_change_key) return { verification: "changed_in_outlook" as Verification, facts };
  return { verification: "verified" as Verification, facts, change_key: e.changeKey as string };
}
export interface MutationPlan { dayStillPlanned: boolean; specialDeletePermit: boolean; desired: Record<string, unknown>; current: Record<string, unknown> }
const PATCH_KEYS = ["subject", "body", "start", "end", "location", "showAs"] as const;
/** Allowed patch keys only; never attendees, recurrence, organizer, reminders or online-meeting changes. */
export function patchDiff(desired: Record<string, unknown>, current: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of PATCH_KEYS) if (k in desired && JSON.stringify(desired[k]) !== JSON.stringify(current[k])) out[k] = desired[k];
  return out;
}
export function mutationGate(kind: MutationKind, v: ReturnType<typeof verifyCopy>, p: MutationPlan): string | null {
  if (v.verification !== "verified") return `copy_${v.verification}`;
  if (v.facts?.attendees !== 0) return "attendees_present";
  if (kind === "delete" && p.dayStillPlanned && !p.specialDeletePermit) return "delete_requires_unplan";
  if (kind === "update" && !p.dayStillPlanned) return "update_requires_planned_day";
  if (kind === "update" && Object.keys(patchDiff(p.desired, p.current)).length === 0) return "no_change_needed";
  return null;
}
export type MutationOutcome = "succeeded" | "already_absent" | "changed_in_outlook" | "rejected" | "throttled_uncertain" | "uncertain" | "not_approved" | "already_claimed" | string;
/** One request after an atomic claim; ambiguous results are never retried, only reconciled by GET. */
export async function executeMutation(kind: MutationKind, graph: MutationGraph, s: StoredCopy, p: MutationPlan, claim: () => Promise<boolean>, receipt: (state: string, http: number | null, changeKey?: string | null) => Promise<void>): Promise<{ state: MutationOutcome; http?: number }> {
  const scope = storedScopeOk(s); if (scope) return { state: scope };
  const v = verifyCopy(await graph("GET", exactGetPath(s.graph_event_id)), s);
  const denied = mutationGate(kind, v, p); if (denied) return { state: denied };
  if (!MUTATIONS_APPROVED) return { state: "not_approved" };
  if (!await claim()) return { state: "already_claimed" };
  let r;
  try {
    r = kind === "update"
      ? await graph("PATCH", exactEventPath(s.graph_event_id), { body: patchDiff(p.desired, p.current), ifMatch: v.change_key })
      : await graph("DELETE", exactEventPath(s.graph_event_id), { ifMatch: v.change_key });
  } catch { await receipt("uncertain", null); return { state: "uncertain" }; }
  const st = classifyMutationStatus(kind, r.status);
  await receipt(st, r.status, kind === "update" && st === "succeeded" ? r.data?.changeKey ?? null : null);
  return { state: st, http: r.status };
}
export function classifyMutationStatus(kind: MutationKind, http: number): MutationOutcome {
  if (kind === "update" && http === 200) return "succeeded";
  if (kind === "delete" && http === 204) return "succeeded";
  if (kind === "delete" && http === 404) return "uncertain"; // must be proven absent by a later GET
  if (http === 409 || http === 412) return "changed_in_outlook";
  if (http === 401 || http === 403 || http === 400) return "rejected";
  if (http === 429) return "throttled_uncertain";
  return "uncertain";
}
/** Read-only follow-up for uncertain outcomes. Never repeats the write. */
export async function reconcileMutation(kind: MutationKind, graph: MutationGraph, s: StoredCopy, desired: Record<string, unknown>) {
  const r = await graph("GET", exactGetPath(s.graph_event_id));
  if (kind === "delete") return r.status === 404 ? "confirmed_absent" : r.status === 200 ? "still_present_no_retry" : "unresolved_no_retry";
  if (r.status !== 200) return "unresolved_no_retry";
  const e = r.data ?? {}, d = desired as any;
  const same = e.subject === d.subject && e.showAs === d.showAs && utc(e.start) === utc(d.start) && utc(e.end) === utc(d.end);
  return same ? "confirmed_updated" : "not_updated_no_retry";
}
