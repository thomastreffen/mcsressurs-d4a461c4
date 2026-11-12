// Pure core for the ADMIN-ONLY synthetic write pilot on the single test mailbox (no imports, unit-testable).
// Hard allowlist: exactly one mailbox. Every Graph write path is asserted before use.
import { TEST_MAILBOX } from "./hub-calendar-diagnostics-core.ts";

export const PILOT_MAILBOX = TEST_MAILBOX;
export const PILOT_ALLOWLIST: readonly string[] = Object.freeze([PILOT_MAILBOX]);
export const PILOT_SUBJECT = "MCS Hub kalenderintegrasjon – test";
export const PILOT_SUBJECT_UPDATED = "MCS Hub kalenderintegrasjon – test (endret)";
export const CONFIRM_PHRASE = "KJØR TESTPILOT";
export const DIAG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type StepId = "create" | "read_created" | "update" | "read_updated" | "delete" | "verify_deleted" | "cleanup";
export interface PilotStep { id: StepId; label: string; method: string; expectStatus: number[]; httpStatus?: number; result: "pass" | "fail"; graphCode?: string }

export function assertPilotMailbox(mailbox: string): void {
  const m = mailbox.trim().toLowerCase();
  if (!PILOT_ALLOWLIST.includes(m) || m !== PILOT_MAILBOX) throw new Error("mailbox_not_allowlisted");
}

const EVENT_ID = /^[A-Za-z0-9_\-=+/]{10,400}$/;

/** Only these paths are permitted. Event-specific paths require an id this run created. */
export function pilotPath(mailbox: string, kind: "events" | "event", eventId?: string): string {
  assertPilotMailbox(mailbox);
  const base = `/v1.0/users/${encodeURIComponent(PILOT_MAILBOX)}/calendar/events`;
  if (kind === "events") return base;
  if (!eventId || !EVENT_ID.test(eventId)) throw new Error("invalid_event_id");
  return `${base}/${encodeURIComponent(eventId)}`;
}

export function assertPilotRequest(method: string, path: string, ownEventId: string | null): void {
  const base = `/v1.0/users/${encodeURIComponent(PILOT_MAILBOX)}/calendar/events`;
  if (method === "POST") { if (path !== base) throw new Error("write_path_not_allowed"); return; }
  if (!ownEventId) throw new Error("no_own_event");
  if (path !== `${base}/${encodeURIComponent(ownEventId)}`) throw new Error("write_path_not_allowed");
  if (!["GET", "PATCH", "DELETE"].includes(method)) throw new Error("method_not_allowed");
}

/** Full-hour slot in Europe/Oslo local wall time, next day, given hour. Graph handles DST via timeZone. */
export function osloSlot(now: Date, hour: number, durationMin = 30): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const day = new Date(Date.UTC(g("year"), g("month") - 1, g("day") + 1)).toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  const endMin = hour * 60 + durationMin;
  return { start: `${day}T${pad(hour)}:00:00`, end: `${day}T${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}:00` };
}

/** Neutral, attendee-free, reminder-free, non-meeting event body. */
export function pilotEventBody(slot: { start: string; end: string }, key: string, subject = PILOT_SUBJECT) {
  return {
    subject,
    body: { contentType: "text", content: `Syntetisk test fra MCS Hub. Ref ${key.slice(0, 8)}. Slettes automatisk.` },
    start: { dateTime: slot.start, timeZone: "Europe/Oslo" },
    end: { dateTime: slot.end, timeZone: "Europe/Oslo" },
    attendees: [], isReminderOn: false, isOnlineMeeting: false, showAs: "free", responseRequested: false,
    transactionId: key,
  };
}

/** Prior read-only diagnostic must be a full pass and recent. */
export function diagnosticGate(run: { overall?: string; run_at?: string; checks?: { id: string; result: string }[] } | null, now: Date): string | null {
  if (!run) return "no_diagnostic";
  if (run.overall !== "pass") return "diagnostic_not_passed";
  if (!run.run_at || now.getTime() - Date.parse(run.run_at) > DIAG_MAX_AGE_MS) return "diagnostic_too_old";
  const need = ["token", "app_identity", "app_roles", "test_calendar", "out_of_scope_calendar", "mail_blocked"];
  if (!need.every((id) => run.checks?.some((c) => c.id === id && c.result === "pass"))) return "diagnostic_incomplete";
  return null;
}

export function maskEventId(id: string | null): string { return id ? `…${id.slice(-6)}` : "–"; }
