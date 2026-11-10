// Pure, import-free core for CENTRAL app-only project-job -> Outlook calendar writes.
// No network, no DB. Imported by the edge function (Deno) and vitest (Node).
// Contract: Hub is the only source of project jobs; Outlook never creates jobs.
// No attendees => no invitations; the event is written straight into each person's calendar.

export type AppFlags = { enabled: boolean; dryRun: boolean; pilotMailboxes: string[]; scopeVerified: boolean };

export type HubJob = {
  id: string;
  company_id: string | null;
  title: string;
  address: string | null;
  start_at: string | null; // UTC instant
  end_at: string | null;
  status: string | null;
  deleted_at: string | null;
};

export type JobLink = {
  hub_version: string | null;
  outlook_event_id: string | null;
  outlook_change_key: string | null;
  state: string;
};

export type JobOutbound =
  | { kind: "skip"; reason: string }
  | { kind: "create" | "update" | "delete"; fingerprint: string; payload: Record<string, unknown> | null };

const CANCELLED = new Set(["cancelled", "archived", "rejected"]);

export function jobFingerprint(j: HubJob, technicianId: string): string {
  const s = [j.title, j.address ?? "", j.start_at ?? "", j.end_at ?? "", j.status ?? "", j.deleted_at ? "del" : "", technicianId].join("\u241F");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return "j1-" + (h >>> 0).toString(16);
}

/** Stable per (job, technician, mailbox) key – Graph transactionId and DB unique key. */
export function jobDedupKey(eventId: string, technicianId: string, mailbox: string): string {
  return `mcs-job-${eventId}-${technicianId}-${mailbox.trim().toLowerCase()}`;
}

/** Fail-closed gate. Activation requires flag ON, verified calendar-only scope and pilot mailbox. */
export function jobGate(f: AppFlags, mailbox: string | null | undefined): string | null {
  if (!f.enabled) return "flag_off";
  if (!f.scopeVerified) return "scope_not_verified";
  const m = (mailbox ?? "").trim().toLowerCase();
  if (!m) return "no_mailbox";
  if (!f.pilotMailboxes.map((x) => x.trim().toLowerCase()).includes(m)) return "mailbox_not_in_pilot";
  return null;
}

export function buildJobPayload(j: HubJob, technicianId: string, key: string): Record<string, unknown> {
  return {
    subject: j.title,
    body: {
      contentType: "HTML",
      // Hidden marker: outlook-schedule-sync skips MCS-created events, so this never round-trips into a job.
      content: `<p>Planlagt i MCS Hub. Åpne jobben i Hub for detaljer.</p><!-- MCS_SOURCE:true MCS_EVENT_ID:${j.id} MCS_TECHNICIAN_ID:${technicianId} -->`,
    },
    start: { dateTime: j.start_at, timeZone: "UTC" },
    end: { dateTime: j.end_at, timeZone: "UTC" },
    location: j.address ? { displayName: j.address } : undefined,
    transactionId: key,
    attendees: [],
    responseRequested: false,
    showAs: "busy",
    categories: ["MCS"],
  };
}

export function planJobOutbound(j: HubJob, link: JobLink | null, technicianId: string, mailbox: string, assigned: boolean): JobOutbound {
  if (!j.company_id) return { kind: "skip", reason: "no_company_scope" };
  const fp = jobFingerprint(j, technicianId);
  if (j.deleted_at || !assigned || CANCELLED.has(j.status ?? "")) {
    if (!link?.outlook_event_id || link.state === "deleted") return { kind: "skip", reason: "nothing_to_delete" };
    return { kind: "delete", fingerprint: fp, payload: null };
  }
  if (!j.start_at || !j.end_at) return { kind: "skip", reason: "no_schedule" };
  if (new Date(j.end_at) <= new Date(j.start_at)) return { kind: "skip", reason: "invalid_range" };
  if (link?.state === "conflict") return { kind: "skip", reason: "unresolved_conflict" };
  if (link?.hub_version === fp && link.outlook_event_id && link.state === "synced") return { kind: "skip", reason: "unchanged" };
  return { kind: link?.outlook_event_id ? "update" : "create", fingerprint: fp, payload: buildJobPayload(j, technicianId, jobDedupKey(j.id, technicianId, mailbox)) };
}

/** Only delegated-login failures are queued, once per (job, technician). Never other errors. */
export function shouldQueueFallback(reasonCode: string | null | undefined): boolean {
  return reasonCode === "no_ms_connection";
}

/** Queue item may be processed only once; anything already attempted is finished. */
export function canProcessQueueItem(item: { status: string; attempts: number; max_attempts: number }): boolean {
  return item.status === "pending" && item.attempts < item.max_attempts;
}

export const MAX_DRAIN_BATCH = 5;
export function clampBatch(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 1;
  return Math.max(1, Math.min(MAX_DRAIN_BATCH, v));
}

export type OutlookSide = { change_key: string; start: string; end: string; isCancelled: boolean; missing: boolean };
export type JobInbound =
  | { kind: "noop" }
  | { kind: "conflict"; reason: string }
  | { kind: "reissue" };

/** Inbound for project jobs: Hub is master. Outlook edits/cancellations/deletions are never applied to the
 * job; they are flagged as conflict for a planner to resolve (or re-issued when Outlook copy vanished). */
export function decideJobInbound(link: JobLink, side: OutlookSide): JobInbound {
  if (side.missing) return { kind: "reissue" };
  if (side.change_key === link.outlook_change_key) return { kind: "noop" };
  if (side.isCancelled) return { kind: "conflict", reason: "cancelled_in_outlook" };
  return { kind: "conflict", reason: "edited_in_outlook" };
}
