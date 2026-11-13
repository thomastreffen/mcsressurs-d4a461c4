// Pure per-day planner + pilot gate for the CENTRAL app-only job calendar sync.
// One Outlook event per (job, technician, Oslo work date). No network, no DB.
// Default deny: a day is only writable when the global flags allow it AND an exact,
// unexpired, unrevoked pilot target matches mailbox + job + technician + work date + company.
import { buildPerDayPlan, type DayPlanItem } from "./multi-day-calendar.ts";
import { jobGate, type AppFlags, type HubJob } from "./job-outlook-app-core.ts";

export interface PilotTarget {
  id: string; company_id: string; event_id: string; technician_id: string; mailbox: string;
  work_date: string; expires_at: string; revoked_at: string | null;
}
export interface AppDayLink {
  id?: string; technician_id: string; work_date: string | null; mailbox: string; dedup_key: string;
  outlook_event_id: string | null; outlook_change_key: string | null; hub_version: string | null; state: string;
  adopted_from_day_link_id?: string | null;
}
export interface LegacyDayLink {
  id: string; technician_id: string; work_date: string; start_at: string; end_at: string;
  outlook_event_id: string | null; status: string;
}
export interface Assignee { technician_id: string; email: string | null }

export type DayDecision =
  | { kind: "skip"; reason: string }
  | { kind: "adopt"; legacyId: string; outlookEventId: string; fingerprint: string | null }
  | { kind: "create" | "update"; fingerprint: string; payload: Record<string, unknown> }
  | { kind: "delete"; outlookEventId: string };

export interface DayRow {
  technicianId: string; mailbox: string | null; workDate: string; startAt: string | null; endAt: string | null;
  dedupKey: string | null; gate: string | null; decision: DayDecision; link: AppDayLink | null;
}

const norm = (m: string | null | undefined) => (m ?? "").trim().toLowerCase();
const CANCELLED = new Set(["cancelled", "archived", "rejected"]);

export function jobDayDedupKey(eventId: string, technicianId: string, workDate: string, mailbox: string): string {
  return `mcs-jobday-${eventId}-${technicianId}-${workDate}-${norm(mailbox)}`;
}

export function dayFingerprint(j: HubJob, d: { technicianId: string; workDate: string; startAt: string; endAt: string }): string {
  const s = [j.title, j.address ?? "", d.startAt, d.endAt, d.workDate, j.status ?? "", d.technicianId].join("\u241F");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return "d1-" + (h >>> 0).toString(16);
}

/** Exact pilot match. Returns null when allowed, otherwise a deny reason. */
export function pilotTargetGate(
  targets: PilotTarget[], q: { companyId: string | null; eventId: string; technicianId: string; mailbox: string | null; workDate: string }, now: Date,
): string | null {
  if (!q.companyId) return "no_company_scope";
  if (!norm(q.mailbox)) return "no_mailbox";
  const hit = targets.find((t) =>
    !t.revoked_at && t.event_id === q.eventId && t.technician_id === q.technicianId &&
    t.work_date === q.workDate && norm(t.mailbox) === norm(q.mailbox) && t.company_id === q.companyId);
  if (!hit) return "not_pilot_target";
  if (Date.parse(hit.expires_at) <= now.getTime()) return "pilot_target_expired";
  return null;
}

/** Combined gate: global flags (enabled, verified scope, mailbox allow-list) AND exact pilot target. */
export function dayGate(flags: AppFlags, targets: PilotTarget[], q: Parameters<typeof pilotTargetGate>[1], now: Date): string | null {
  return jobGate(flags, q.mailbox) ?? pilotTargetGate(targets, q, now);
}

export function buildDayPayload(j: HubJob, d: DayPlanItem, key: string): Record<string, unknown> {
  return {
    subject: j.title,
    body: { contentType: "HTML", content: `<p>Planlagt i MCS Hub. Åpne jobben i Hub for detaljer.</p><!-- MCS_SOURCE:true MCS_EVENT_ID:${j.id} MCS_TECHNICIAN_ID:${d.technicianId} MCS_WORK_DATE:${d.workDate} -->` },
    start: { dateTime: d.startAt, timeZone: "UTC" },
    end: { dateTime: d.endAt, timeZone: "UTC" },
    location: j.address ? { displayName: j.address } : undefined,
    transactionId: key, attendees: [], responseRequested: false, showAs: "busy", categories: ["MCS"],
  };
}

function decideOne(j: HubJob, d: DayPlanItem | null, link: AppDayLink | null, legacy: LegacyDayLink | null, mailbox: string): DayDecision {
  const ended = !!j.deleted_at || CANCELLED.has(j.status ?? "");
  if (!d || ended) {
    // Only events this app created are removed; adopted legacy events are never deleted by the app.
    if (link?.adopted_from_day_link_id && link.outlook_event_id && link.state !== "deleted") return { kind: "skip", reason: "adopted_legacy_not_deleted" };
    if (link?.outlook_event_id && link.state !== "deleted") return { kind: "delete", outlookEventId: link.outlook_event_id };
    return { kind: "skip", reason: "nothing_to_delete" };
  }
  const fp = dayFingerprint(j, d);
  if (link?.state === "conflict") return { kind: "skip", reason: "unresolved_conflict" };
  if (!link?.outlook_event_id && legacy?.outlook_event_id && legacy.status === "synced") {
    // Rehydrate existing legacy per-day event instead of creating a duplicate. Times differ => fp null => later update.
    const same = legacy.start_at && Date.parse(legacy.start_at) === Date.parse(d.startAt) && Date.parse(legacy.end_at) === Date.parse(d.endAt);
    return { kind: "adopt", legacyId: legacy.id, outlookEventId: legacy.outlook_event_id, fingerprint: same ? fp : null };
  }
  if (link?.outlook_event_id && link.state === "synced" && link.hub_version === fp) return { kind: "skip", reason: "unchanged" };
  const key = jobDayDedupKey(j.id, d.technicianId, d.workDate, mailbox);
  return { kind: link?.outlook_event_id ? "update" : "create", fingerprint: fp, payload: buildDayPayload(j, d, key) };
}

/** Full per-day plan for a job: one row per desired (technician, day) plus rows for removed days that still have an app event. */
export function planJobDays(input: {
  job: HubJob; blocks: { technician_id: string; start_at: string; end_at: string }[]; assignees: Assignee[];
  appLinks: AppDayLink[]; legacyLinks: LegacyDayLink[]; targets: PilotTarget[]; flags: AppFlags; now: Date;
  onlyTechnicianId?: string;
}): DayRow[] {
  const { job } = input;
  const mail = new Map(input.assignees.map((a) => [a.technician_id, a.email ? norm(a.email) : null]));
  const assigned = new Set(input.assignees.map((a) => a.technician_id));
  const desired = buildPerDayPlan(job.id, input.blocks.filter((b) => assigned.has(b.technician_id)));
  const rows: DayRow[] = [];
  const seen = new Set<string>();
  for (const d of desired) {
    if (input.onlyTechnicianId && d.technicianId !== input.onlyTechnicianId) continue;
    const mailbox = mail.get(d.technicianId) ?? null;
    const key = mailbox ? jobDayDedupKey(job.id, d.technicianId, d.workDate, mailbox) : null;
    const link = input.appLinks.find((l) => l.technician_id === d.technicianId && l.work_date === d.workDate && l.state !== "deleted") ?? null;
    if (link) seen.add(link.dedup_key);
    const legacy = input.legacyLinks.find((l) => l.technician_id === d.technicianId && l.work_date === d.workDate) ?? null;
    const q = { companyId: job.company_id, eventId: job.id, technicianId: d.technicianId, mailbox, workDate: d.workDate };
    const gate = mailbox ? dayGate(input.flags, input.targets, q, input.now) : "no_mailbox";
    const decision = mailbox ? decideOne(job, d, link, legacy, mailbox) : { kind: "skip" as const, reason: "no_mailbox" };
    rows.push({ technicianId: d.technicianId, mailbox, workDate: d.workDate, startAt: d.startAt, endAt: d.endAt, dedupKey: key, gate, decision, link });
  }
  for (const l of input.appLinks) {
    if (!l.work_date || l.state === "deleted" || seen.has(l.dedup_key)) continue;
    if (input.onlyTechnicianId && l.technician_id !== input.onlyTechnicianId) continue;
    const q = { companyId: job.company_id, eventId: job.id, technicianId: l.technician_id, mailbox: l.mailbox, workDate: l.work_date };
    rows.push({ technicianId: l.technician_id, mailbox: l.mailbox, workDate: l.work_date, startAt: null, endAt: null, dedupKey: l.dedup_key,
      gate: dayGate(input.flags, input.targets, q, input.now), decision: decideOne(job, null, l, null, l.mailbox), link: l });
  }
  return rows;
}

/** Effective action: anything gated, or dry-run, never reaches Graph. */
export function effectiveAction(row: DayRow, dryRun: boolean): "graph" | "db_only" | "dry_run" | "blocked" | "none" {
  if (row.decision.kind === "skip") return "none";
  if (row.gate) return "blocked";
  if (dryRun) return "dry_run";
  return row.decision.kind === "adopt" ? "db_only" : "graph";
}

/** Queue intents are processable only after an explicit admin release; nothing is drained by configuration alone. */
export function isReleasedQueueItem(item: { status: string; attempts: number; max_attempts: number; released_at: string | null }): boolean {
  return item.status === "pending" && item.attempts < item.max_attempts && !!item.released_at;
}

export type ReleaseCheck = { ok: true } | { ok: false; reason: string };
/** Release requires a pending, never-released item that matches an active pilot target for the same job + technician. */
export function canReleaseQueueItem(
  item: { status: string; released_at: string | null; event_id: string; technician_id: string; company_id: string | null },
  targets: PilotTarget[], now: Date,
): ReleaseCheck {
  if (item.status !== "pending") return { ok: false, reason: "not_pending" };
  if (item.released_at) return { ok: false, reason: "already_released" };
  const t = targets.find((x) => !x.revoked_at && x.event_id === item.event_id && x.technician_id === item.technician_id &&
    x.company_id === item.company_id && Date.parse(x.expires_at) > now.getTime());
  return t ? { ok: true } : { ok: false, reason: "no_active_pilot_target" };
}

export const MAX_TARGET_HOURS = 72;
export function clampTargetHours(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 24;
  return Math.max(1, Math.min(MAX_TARGET_HOURS, v));
}

export const DECISION_LABELS: Record<string, string> = {
  create: "Ville opprettet", update: "Ville oppdatert", delete: "Ville slettet egen kopi", adopt: "Tar over eksisterende dag (ingen ny avtale)", skip: "Ingen endring",
};
