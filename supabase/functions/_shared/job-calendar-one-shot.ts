// A separate exact, create-only exception. Never enables sync or releases queue work.
import { buildDayPayload, jobDayDedupKey } from "./job-outlook-app-days.ts";
import type { HubJob } from "./job-outlook-app-core.ts";
import { isJobEnded } from "./assignment-lifecycle.ts";

export interface OneShotPermit { id: string; event_id: string; technician_id: string; company_id: string; mailbox: string; work_date: string; start: string; end: string; key: string; phrase: string; overridePhrase: string; label: string }
// Each permit is an exact, separately approved (job, technician, mailbox, Oslo day) tuple, mirrored by
// job_calendar_one_shot_permits in the DB claim. Adding a permit never enables sync or releases queue work.
export const ONE_SHOT: OneShotPermit = Object.freeze({
  id: "mats_60570", label: "Mats · JOB 60570 Majorstua · 19.11.2026 08–16",
  event_id: "0ecc7c59-c231-4102-8f0c-91d2091172e8",
  technician_id: "b0716dc3-ddf7-4501-92af-2397a5180085",
  company_id: "a0000000-0000-0000-0000-000000000001",
  mailbox: "mats.lien.hansen@mcselektrotavler.no",
  work_date: "2026-11-19",
  start: "2026-11-19T07:00:00.000Z", end: "2026-11-19T15:00:00.000Z",
  key: "3d5f38ae-63a7-4d23-8179-863e169a88f5",
  phrase: "OPPRETT MATS 19.11.2026 08–16",
  overridePhrase: "OPPRETT LIKEVEL MATS 19.11.2026 08–16 – TIDSKONFLIKT KJENT",
});
export const ONE_SHOT_60576: OneShotPermit = Object.freeze({
  id: "mats_60576", label: "Mats · JOB 60576 Ullevaal Stadion · 26.11.2026 08–16",
  event_id: "1be4a135-c18d-43e8-8290-93eda534cca2",
  technician_id: "b0716dc3-ddf7-4501-92af-2397a5180085",
  company_id: "a0000000-0000-0000-0000-000000000001",
  mailbox: "mats.lien.hansen@mcselektrotavler.no",
  work_date: "2026-11-26",
  start: "2026-11-26T07:00:00.000Z", end: "2026-11-26T15:00:00.000Z",
  key: "8c0e2f6a-5b7d-4f4e-9a61-2d3c60576026",
  phrase: "OPPRETT MATS 26.11.2026 08–16",
  overridePhrase: "OPPRETT LIKEVEL MATS 26.11.2026 08–16 – TIDSKONFLIKT KJENT",
});
export const PERMITS: Readonly<Record<string, OneShotPermit>> = Object.freeze({ [ONE_SHOT.id]: ONE_SHOT, [ONE_SHOT_60576.id]: ONE_SHOT_60576 });
/** Oslo-day calendarView window [00:00, 24:00) Europe/Oslo in UTC. */
export function osloDayWindow(workDate: string): { start: string; end: string } {
  const off = (d: Date) => { const p = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Oslo", timeZoneName: "shortOffset" }).formatToParts(d).find(x => x.type === "timeZoneName")?.value ?? "GMT+1"; const m = p.match(/GMT([+-]\d+)/); return m ? Number(m[1]) : 1; };
  const noon = new Date(`${workDate}T12:00:00Z`);
  const startMs = Date.parse(`${workDate}T00:00:00Z`) - off(noon) * 3600_000;
  const next = new Date(Date.parse(`${workDate}T00:00:00Z`) + 86_400_000 + 12 * 3600_000);
  const endMs = Date.parse(`${workDate}T00:00:00Z`) + 86_400_000 - off(next) * 3600_000;
  const iso = (n: number) => new Date(n).toISOString().replace(".000Z", "Z");
  return { start: iso(startMs), end: iso(endMs) };
}
export interface OneShotContext {
  job: HubJob; target: { id: string; event_id: string; technician_id: string; company_id: string; mailbox: string; work_date: string; expires_at: string; revoked_at: string | null };
  assigned: boolean; identityActive: boolean; mailbox: string; approval: string;
  blocks: { technician_id: string; company_id: string; start_at: string; end_at: string }[];
  probe: { created_at: string; result: { http?: number; pass?: boolean; tid_match?: boolean; appid_match?: boolean } } | null;
  settings: { enabled: boolean; dry_run: boolean; pilot_mailboxes: string[]; scope_verified_at: string | null };
}
export function oneShotGate(c: OneShotContext, now: Date, x: OneShotPermit = ONE_SHOT): string | null {
  const t = c.target;
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
export function oneShotPayload(job: HubJob, x: OneShotPermit = ONE_SHOT): Record<string, unknown> {
  return { ...buildDayPayload(job, { technicianId: x.technician_id, workDate: x.work_date, startAt: x.start, endAt: x.end, operationKey: x.key }, x.key), isReminderOn: false, isOnlineMeeting: false };
}
export const oneShotDedupKey = (x: OneShotPermit = ONE_SHOT) => jobDayDedupKey(x.event_id, x.technician_id, x.work_date, x.mailbox);
export const oneShotBase = (x: OneShotPermit = ONE_SHOT) => `/v1.0/users/${encodeURIComponent(x.mailbox)}/calendar/events`;
export const oneShotView = (x: OneShotPermit = ONE_SHOT) => { const w = osloDayWindow(x.work_date); return `/v1.0/users/${encodeURIComponent(x.mailbox)}/calendarView?startDateTime=${w.start}&endDateTime=${w.end}&$select=id,transactionId,start,end,body,changeKey,showAs,isCancelled,type,isAllDay,subject&$top=100`; };
export function assertOneShotRequest(method: string, path: string, x: OneShotPermit = ONE_SHOT) {
  if ((method === "POST" && path === oneShotBase(x)) || (method === "GET" && path === oneShotView(x))) return;
  throw new Error("one_shot_transport_denied");
}
export interface OneShotEvent { id?: string; transactionId?: string; start?: { dateTime?: string; timeZone?: string }; end?: { dateTime?: string; timeZone?: string }; body?: { content?: string }; changeKey?: string; showAs?: string; isCancelled?: boolean; type?: string; isAllDay?: boolean; subject?: string }
const instant = (d?: { dateTime?: string; timeZone?: string }) => {
  if (!d?.dateTime || d.timeZone !== "UTC") return NaN;
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(d.dateTime) ? d.dateTime : `${d.dateTime}Z`);
};
export function inspectOneShotEvents(events: OneShotEvent[], x: OneShotPermit = ONE_SHOT) {
  const own = events.filter(e => e.transactionId === x.key && e.id && instant(e.start) === Date.parse(x.start) && instant(e.end) === Date.parse(x.end) && e.body?.content?.includes(`MCS_EVENT_ID:${x.event_id}`) && e.body.content.includes(`MCS_TECHNICIAN_ID:${x.technician_id}`) && e.body.content.includes(`MCS_WORK_DATE:${x.work_date}`));
  // Any other overlapping appointment (or unreadable time) requires human reconciliation, never auto-adoption.
  const collision = events.some(e => !Number.isFinite(instant(e.start)) || !Number.isFinite(instant(e.end)) || instant(e.start) < Date.parse(x.end) && instant(e.end) > Date.parse(x.start));
  return { own: own.length === 1 ? own[0] : null, blocked: collision || own.length > 1 };
}
export type OneShotConflictClass = "same_one_shot" | "same_hub_day" | "related_hub_job" | "same_title_unverified" | "other_busy" | "free_overlap" | "cancelled_overlap" | "unreadable_time" | "unknown_availability";
export interface OneShotDiagnosis {
  checked_count: number; blocking_count: number; same_hub_count: number; non_busy_count: number;
  policy: "hub_authoritative_explicit_override";
  category: "duplicate" | "unknown" | "other" | "clear";
  conflicts: { classification: OneShotConflictClass; local_overlap: string | null; show_as: string; event_type: string; all_day: boolean; cancelled: boolean }[];
}
/** Strong identity and complete metadata precede any availability override. No private content leaves this projection. */
export function diagnoseOneShotEvents(events: OneShotEvent[], jobTitle: string, x: OneShotPermit = ONE_SHOT): OneShotDiagnosis {
  const start = Date.parse(x.start), end = Date.parse(x.end);
  const normalize = (s: string) => s.trim().toLocaleLowerCase("nb-NO").replace(/\s+/g, " ");
  const clock = (n: number) => new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(n));
  const own = inspectOneShotEvents(events, x).own;
  const conflicts: OneShotDiagnosis["conflicts"] = [];
  for (const e of events) {
    const a = instant(e.start), b = instant(e.end), readable = Number.isFinite(a) && Number.isFinite(b) && b > a;
    const body = e.body?.content ?? "";
    const tagged = (name: string, value: string) => new RegExp(`${name}:${value}(?=\\s|-->|$)`).test(body);
    const sameJob = tagged("MCS_EVENT_ID", x.event_id);
    const sameDay = sameJob && tagged("MCS_TECHNICIAN_ID", x.technician_id) && tagged("MCS_WORK_DATE", x.work_date);
    const complete = !!e.id && typeof e.subject === "string" && typeof e.body?.content === "string" && typeof e.isCancelled === "boolean" && typeof e.isAllDay === "boolean" && ["singleInstance", "occurrence", "exception"].includes(e.type ?? "") && ["free", "tentative", "busy", "oof", "workingElsewhere"].includes(e.showAs ?? "");
    // A same-job copy anywhere on this Oslo day is not an unrelated free-time slot.
    if (readable && complete && !sameJob && e.transactionId !== x.key && !(a < end && b > start)) continue;
    const showAs = ["free", "tentative", "busy", "oof", "workingElsewhere", "unknown"].includes(e.showAs ?? "") ? e.showAs ?? "unknown" : "unknown";
    let classification: OneShotConflictClass;
    if (!readable) classification = "unreadable_time";
    else if (own === e) classification = "same_one_shot";
    else if (sameDay) classification = "same_hub_day";
    else if (sameJob) classification = "related_hub_job";
    else if (e.transactionId === x.key || /MCS_(?:SOURCE|EVENT_ID|TECHNICIAN_ID|WORK_DATE):/.test(body) && !sameJob || !complete) classification = "unknown_availability";
    else if (jobTitle.trim() && normalize(e.subject ?? "") === normalize(jobTitle)) classification = "same_title_unverified";
    else if (e.isCancelled === true) classification = "cancelled_overlap";
    else if (showAs === "free") classification = "free_overlap";
    else if (["busy", "tentative", "oof", "workingElsewhere"].includes(showAs)) classification = "other_busy";
    else classification = "unknown_availability";
    conflicts.push({ classification, local_overlap: readable && a < end && b > start ? `${clock(Math.max(a, start))}–${clock(Math.min(b, end))}` : null, show_as: showAs, event_type: ["singleInstance", "occurrence", "exception", "seriesMaster"].includes(e.type ?? "") ? e.type ?? "unknown" : "unknown", all_day: e.isAllDay === true, cancelled: e.isCancelled === true });
  }
  const same = conflicts.filter(c => ["same_one_shot", "same_hub_day", "related_hub_job"].includes(c.classification)).length;
  const unknown = conflicts.some(c => ["same_title_unverified", "unreadable_time", "unknown_availability"].includes(c.classification));
  return { checked_count: events.length, blocking_count: conflicts.length, same_hub_count: same, non_busy_count: conflicts.filter(c => c.cancelled || c.show_as === "free").length, policy: "hub_authoritative_explicit_override", category: same ? "duplicate" : unknown ? "unknown" : conflicts.length ? "other" : "clear", conflicts };
}
export function oneShotConflictGuard(d: OneShotDiagnosis, override: boolean): string | null {
  if (d.category === "duplicate") return "same_hub_job_exists";
  if (d.category === "unknown") return "calendar_identity_unresolved";
  if (d.category === "other" && !override) return "conflict_override_required";
  return null;
}
export type OneShotGraph = (method: "GET" | "POST", path: string, payload?: unknown) => Promise<{ status: number; data: any }>;
export async function inspectMailbox(graph: OneShotGraph, jobTitle = "", x: OneShotPermit = ONE_SHOT) {
  const r = await graph("GET", oneShotView(x));
  if (r.status !== 200 || !Array.isArray(r.data?.value) || r.data["@odata.nextLink"]) throw new Error("mailbox_lookup_incomplete");
  const diagnosis = diagnoseOneShotEvents(r.data.value, jobTitle, x);
  // Hash full read transiently; never persist/expose raw event IDs, titles or bodies.
  const canonical = r.data.value.map((e: OneShotEvent) => JSON.stringify(e)).sort().join("\n");
  const signature = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)))).map(b => b.toString(16).padStart(2, "0")).join("");
  return { ...inspectOneShotEvents(r.data.value, x), blocked: ["duplicate", "unknown"].includes(diagnosis.category), diagnosis, signature };
}
/** claim() durably consumes the one permit BEFORE POST. Any failure afterwards is terminal/held. */
export async function createOneShot(graph: OneShotGraph, payload: Record<string, unknown>, claim: () => Promise<boolean>, receipt: (state: "succeeded" | "uncertain" | "failed", id: string | null, http: number | null, changeKey?: string) => Promise<void>, consent?: { override: boolean; signature: string }, x: OneShotPermit = ONE_SHOT) {
  const seen = await inspectMailbox(graph, typeof payload.subject === "string" ? payload.subject : "", x);
  const denied = oneShotConflictGuard(seen.diagnosis, consent?.override === true);
  if (denied) return { state: denied, diagnosis: seen.diagnosis };
  if (consent && consent.signature !== seen.signature) return { state: "calendar_changed_requires_preflight", diagnosis: seen.diagnosis };
  if (!await claim()) return { state: "already_claimed" };
  let r;
  try { r = await graph("POST", oneShotBase(x), payload); }
  catch { await receipt("uncertain", null, null); return { state: "uncertain" }; }
  if (r.status === 201 && typeof r.data?.id === "string" && r.data.id.length > 0) {
    await receipt("succeeded", r.data.id, 201, r.data.changeKey);
    return { state: "succeeded" };
  }
  const state = r.status >= 500 || r.status === 408 || r.status >= 200 && r.status < 300 ? "uncertain" : "failed";
  await receipt(state, null, r.status);
  return { state, http: r.status };
}