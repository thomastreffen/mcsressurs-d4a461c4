// A separate exact, create-only exception. Never enables sync or releases queue work.
import { buildDayPayload, jobDayDedupKey } from "./job-outlook-app-days.ts";
import type { HubJob } from "./job-outlook-app-core.ts";
import { isJobEnded } from "./assignment-lifecycle.ts";

export const ONE_SHOT = Object.freeze({
  event_id: "0ecc7c59-c231-4102-8f0c-91d2091172e8",
  technician_id: "b0716dc3-ddf7-4501-92af-2397a5180085",
  company_id: "a0000000-0000-0000-0000-000000000001",
  mailbox: "mats.lien.hansen@mcselektrotavler.no",
  work_date: "2026-11-19",
  start: "2026-11-19T07:00:00.000Z", end: "2026-11-19T15:00:00.000Z",
  key: "3d5f38ae-63a7-4d23-8179-863e169a88f5",
  phrase: "OPPRETT MATS 19.11.2026 08–16",
});
export interface OneShotContext {
  job: HubJob; target: { id: string; event_id: string; technician_id: string; company_id: string; mailbox: string; work_date: string; expires_at: string; revoked_at: string | null };
  assigned: boolean; identityActive: boolean; mailbox: string; approval: string;
  blocks: { technician_id: string; company_id: string; start_at: string; end_at: string }[];
  probe: { created_at: string; result: { http?: number; pass?: boolean; tid_match?: boolean; appid_match?: boolean } } | null;
  settings: { enabled: boolean; dry_run: boolean; pilot_mailboxes: string[]; scope_verified_at: string | null };
}
export function oneShotGate(c: OneShotContext, now: Date): string | null {
  const x = ONE_SHOT, t = c.target;
  if (c.job.id !== x.event_id || c.job.company_id !== x.company_id || t.event_id !== x.event_id || t.technician_id !== x.technician_id || t.company_id !== x.company_id || t.work_date !== x.work_date || t.mailbox !== x.mailbox || c.mailbox !== x.mailbox) return "exact_scope_mismatch";
  if (isJobEnded(c.job)) return "job_ended";
  if (!c.assigned || !c.identityActive) return "inactive_assignment_or_identity";
  if (!["pending", "approved"].includes(c.approval)) return "individual_response_blocks_pilot";
  if (t.revoked_at || !Number.isFinite(Date.parse(t.expires_at)) || Date.parse(t.expires_at) <= now.getTime()) return "pilot_expired";
  if (now.getTime() >= Date.parse(x.start)) return "future_day_required";
  const age = c.probe ? now.getTime() - Date.parse(c.probe.created_at) : NaN;
  if (!c.probe || !(age >= 0 && age < 24 * 3600_000) || c.probe.result.http !== 200 || c.probe.result.pass !== true || c.probe.result.tid_match !== true || c.probe.result.appid_match !== true) return "fresh_200_required";
  const day = c.blocks.filter(b => b.start_at.slice(0, 10) === x.work_date);
  if (day.length !== 1 || day[0].company_id !== x.company_id || day[0].technician_id !== x.technician_id || Date.parse(day[0].start_at) !== Date.parse(x.start) || Date.parse(day[0].end_at) !== Date.parse(x.end)) return "schedule_changed";
  if (c.settings.enabled !== false || c.settings.dry_run !== true || c.settings.pilot_mailboxes.length || c.settings.scope_verified_at !== null) return "global_settings_changed";
  return null;
}
export function oneShotPayload(job: HubJob): Record<string, unknown> {
  const x = ONE_SHOT;
  return { ...buildDayPayload(job, { technicianId: x.technician_id, workDate: x.work_date, startAt: x.start, endAt: x.end, operationKey: x.key }, x.key), isReminderOn: false, isOnlineMeeting: false };
}
export const oneShotDedupKey = () => jobDayDedupKey(ONE_SHOT.event_id, ONE_SHOT.technician_id, ONE_SHOT.work_date, ONE_SHOT.mailbox);
export const oneShotBase = () => `/v1.0/users/${encodeURIComponent(ONE_SHOT.mailbox)}/calendar/events`;
export const oneShotView = () => `/v1.0/users/${encodeURIComponent(ONE_SHOT.mailbox)}/calendarView?startDateTime=2026-11-18T23:00:00Z&endDateTime=2026-11-19T23:00:00Z&$select=id,transactionId,start,end,body,changeKey&$top=100`;
export function assertOneShotRequest(method: string, path: string) {
  if ((method === "POST" && path === oneShotBase()) || (method === "GET" && path === oneShotView())) return;
  throw new Error("one_shot_transport_denied");
}
export interface OneShotEvent { id?: string; transactionId?: string; start?: { dateTime?: string; timeZone?: string }; end?: { dateTime?: string; timeZone?: string }; body?: { content?: string }; changeKey?: string }
const instant = (d?: { dateTime?: string; timeZone?: string }) => {
  if (!d?.dateTime || d.timeZone !== "UTC") return NaN;
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(d.dateTime) ? d.dateTime : `${d.dateTime}Z`);
};
export function inspectOneShotEvents(events: OneShotEvent[]) {
  const x = ONE_SHOT;
  const own = events.filter(e => e.transactionId === x.key && e.id && instant(e.start) === Date.parse(x.start) && instant(e.end) === Date.parse(x.end) && e.body?.content?.includes(`MCS_EVENT_ID:${x.event_id}`) && e.body.content.includes(`MCS_TECHNICIAN_ID:${x.technician_id}`) && e.body.content.includes(`MCS_WORK_DATE:${x.work_date}`));
  // Any other overlapping appointment (or unreadable time) requires human reconciliation, never auto-adoption.
  const collision = events.some(e => !Number.isFinite(instant(e.start)) || !Number.isFinite(instant(e.end)) || instant(e.start) < Date.parse(x.end) && instant(e.end) > Date.parse(x.start));
  return { own: own.length === 1 ? own[0] : null, blocked: collision || own.length > 1 };
}
export type OneShotGraph = (method: "GET" | "POST", path: string, payload?: unknown) => Promise<{ status: number; data: any }>;
export async function inspectMailbox(graph: OneShotGraph) {
  const r = await graph("GET", oneShotView());
  if (r.status !== 200 || !Array.isArray(r.data?.value) || r.data["@odata.nextLink"]) throw new Error("mailbox_lookup_incomplete");
  return inspectOneShotEvents(r.data.value);
}
/** claim() durably consumes the one permit BEFORE POST. Any failure afterwards is terminal/held. */
export async function createOneShot(graph: OneShotGraph, payload: Record<string, unknown>, claim: () => Promise<boolean>, receipt: (state: "succeeded" | "uncertain" | "failed", id: string | null, http: number | null, changeKey?: string) => Promise<void>) {
  const seen = await inspectMailbox(graph);
  if (seen.blocked || seen.own) return { state: "duplicate_or_conflict" };
  if (!await claim()) return { state: "already_claimed" };
  let r;
  try { r = await graph("POST", oneShotBase(), payload); }
  catch { await receipt("uncertain", null, null); return { state: "uncertain" }; }
  if (r.status === 201 && typeof r.data?.id === "string" && r.data.id.length > 0) {
    await receipt("succeeded", r.data.id, 201, r.data.changeKey);
    return { state: "succeeded" };
  }
  const state = r.status >= 500 || r.status === 408 || r.status >= 200 && r.status < 300 ? "uncertain" : "failed";
  await receipt(state, null, r.status);
  return { state, http: r.status };
}