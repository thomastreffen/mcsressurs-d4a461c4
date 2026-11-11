// Pure, import-free core for Hub appointment/task -> Outlook sync (and inbound change prep).
// Imported by the edge function (Deno) and by vitest (Node). No network, no DB.

export type SyncFlags = { enabled: boolean; dryRun: boolean; pilotMailboxes: string[] };

export type HubAppointment = {
  id: string;
  company_id: string | null;
  title: string;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  updated_at: string;
};

export type Mapping = {
  hub_version: string | null; // fingerprint last pushed
  outlook_event_id: string | null;
  outlook_change_key: string | null; // last seen Outlook changeKey
  state: string;
};

export type OutboundAction =
  | { kind: "skip"; reason: string }
  | { kind: "create" | "update" | "delete"; fingerprint: string; payload: Record<string, unknown> | null };

/** Deterministic fingerprint of the fields we push; same content => no write (idempotent dedup). */
export function hubFingerprint(a: HubAppointment): string {
  const s = [a.title, a.description ?? "", a.start_at ?? "", a.end_at ?? "", a.status ?? ""].join("\u241F");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return "v1-" + (h >>> 0).toString(16);
}

/** Stable per (appointment, mailbox) key used as Outlook transactionId and DB unique key. */
export function dedupKey(appointmentId: string, mailbox: string): string {
  return `mcs-appt-${appointmentId}-${mailbox.trim().toLowerCase()}`;
}

export function gate(flags: SyncFlags, mailbox: string): string | null {
  if (!flags.enabled) return "flag_off";
  const m = mailbox.trim().toLowerCase();
  if (!flags.pilotMailboxes.map((x) => x.toLowerCase()).includes(m)) return "mailbox_not_in_pilot";
  return null;
}

/** Hub never creates project jobs from this path; only appointments/tasks. Attendees are never added
 * (no invitations); event is written directly into the person's own calendar. */
export function buildEventPayload(a: HubAppointment, key: string): Record<string, unknown> {
  return {
    subject: a.title,
    body: { contentType: "Text", content: a.description ?? "" },
    start: { dateTime: a.start_at, timeZone: "UTC" },
    end: { dateTime: a.end_at, timeZone: "UTC" },
    transactionId: key,
    attendees: [],
    responseRequested: false,
    isReminderOn: false,
    categories: ["MCS Hub · Avtale"],
    singleValueExtendedProperties: [
      { id: "String {66f5a359-4659-4830-9070-00047ec6ac6e} Name MCS_APPT_ID", value: a.id },
    ],
  };
}

export function planOutbound(a: HubAppointment, mapping: Mapping | null, mailbox: string): OutboundAction {
  if (!a.company_id) return { kind: "skip", reason: "no_company_scope" };
  const fp = hubFingerprint(a);
  const cancelled = a.status === "cancelled" || a.status === "deleted";
  if (cancelled) {
    if (!mapping?.outlook_event_id) return { kind: "skip", reason: "nothing_to_delete" };
    return { kind: "delete", fingerprint: fp, payload: null };
  }
  if (!a.start_at || !a.end_at) return { kind: "skip", reason: "no_schedule" };
  if (new Date(a.end_at) <= new Date(a.start_at)) return { kind: "skip", reason: "invalid_range" };
  if (mapping?.state === "conflict") return { kind: "skip", reason: "unresolved_conflict" };
  if (mapping?.hub_version === fp && mapping.outlook_event_id) return { kind: "skip", reason: "unchanged" };
  const payload = buildEventPayload(a, dedupKey(a.id, mailbox));
  return { kind: mapping?.outlook_event_id ? "update" : "create", fingerprint: fp, payload };
}

export type InboundChange = { outlook_change_key: string; subject: string; start: string; end: string; isCancelled: boolean };

export type InboundDecision =
  | { kind: "noop" }
  | { kind: "apply_to_hub"; fields: { title: string; start_at: string; end_at: string } }
  | { kind: "mark_cancelled" }
  | { kind: "conflict"; reason: string };

/** Explicit conflict detection: if both Hub (fingerprint moved since last push) and Outlook (changeKey moved)
 * changed, never auto-merge. Inbound never creates or alters project jobs. */
export function decideInbound(current: HubAppointment, mapping: Mapping, change: InboundChange): InboundDecision {
  if (change.outlook_change_key === mapping.outlook_change_key) return { kind: "noop" };
  const hubChanged = mapping.hub_version !== hubFingerprint(current);
  if (hubChanged) return { kind: "conflict", reason: "both_sides_changed" };
  if (change.isCancelled) return { kind: "mark_cancelled" };
  return { kind: "apply_to_hub", fields: { title: change.subject, start_at: change.start, end_at: change.end } };
}

// ---- Inbound classification (conservative: block unsupported variants instead of losing data) ----

/** Graph returns dateTime without offset when Prefer: outlook.timezone="UTC" is used; treat as UTC instant. */
export function parseGraphInstant(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw + "Z";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type GraphEventShape = {
  id: string;
  changeKey?: string | null;
  subject?: string | null;
  start?: { dateTime?: string } | null;
  end?: { dateTime?: string } | null;
  isCancelled?: boolean;
  isAllDay?: boolean;
  type?: string | null; // singleInstance | occurrence | exception | seriesMaster
  seriesMasterId?: string | null;
};

export type InboundClassification =
  | { kind: "change"; change: InboundChange }
  | { kind: "blocked"; reason: string };

/** Maps a Graph event to a safe inbound change. Recurring series and all-day events are explicitly
 * blocked (never silently truncated); cancellations pass through; missing/invalid times are blocked. */
export function classifyGraphEvent(ev: GraphEventShape): InboundClassification {
  if (!ev.changeKey) return { kind: "blocked", reason: "missing_change_key" };
  if (ev.isCancelled) {
    return { kind: "change", change: { outlook_change_key: ev.changeKey, subject: ev.subject ?? "", start: "", end: "", isCancelled: true } };
  }
  if (ev.type && ev.type !== "singleInstance") return { kind: "blocked", reason: "recurring_unsupported" };
  if (ev.seriesMasterId) return { kind: "blocked", reason: "recurring_unsupported" };
  if (ev.isAllDay) return { kind: "blocked", reason: "all_day_unsupported" };
  const start = parseGraphInstant(ev.start?.dateTime ?? null);
  const end = parseGraphInstant(ev.end?.dateTime ?? null);
  if (!start || !end) return { kind: "blocked", reason: "invalid_time" };
  if (new Date(end) <= new Date(start)) return { kind: "blocked", reason: "invalid_range" };
  return { kind: "change", change: { outlook_change_key: ev.changeKey, subject: ev.subject ?? "", start, end, isCancelled: false } };
}

// ---- Conflict resolution ----

export type ConflictResolution = "keep_hub" | "keep_outlook";

/** Snapshot stored on the link when a conflict is detected; fingerprint lets keep_outlook mark the link
 * synced without a redundant re-push. */
export type OutlookSnapshot = { title: string; start_at: string; end_at: string; change_key: string; hub_fingerprint: string };

export function buildSnapshot(change: InboundChange, current: HubAppointment): OutlookSnapshot {
  return {
    title: change.subject,
    start_at: change.start,
    end_at: change.end,
    change_key: change.outlook_change_key,
    hub_fingerprint: hubFingerprint({ ...current, title: change.subject, start_at: change.start, end_at: change.end }),
  };
}

/** Pure resolution decision; the RPC performs the writes. keep_hub re-queues an outbound push;
 * keep_outlook adopts the snapshot into Hub and marks the link synced. */
export function planResolution(resolution: ConflictResolution, snapshot: OutlookSnapshot | null):
  | { kind: "keep_hub"; nextState: "pending" }
  | { kind: "keep_outlook"; nextState: "synced"; fields: { title: string; start_at: string; end_at: string }; hub_version: string }
  | { kind: "invalid"; reason: string } {
  if (resolution === "keep_hub") return { kind: "keep_hub", nextState: "pending" };
  if (resolution === "keep_outlook") {
    if (!snapshot) return { kind: "invalid", reason: "missing_snapshot" };
    return { kind: "keep_outlook", nextState: "synced", fields: { title: snapshot.title, start_at: snapshot.start_at, end_at: snapshot.end_at }, hub_version: snapshot.hub_fingerprint };
  }
  return { kind: "invalid", reason: "unknown_resolution" };
}
