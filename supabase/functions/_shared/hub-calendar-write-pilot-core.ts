// Pure core for the ADMIN-ONLY synthetic write pilot on the single test mailbox (no imports, unit-testable).
// Hard allowlist: exactly one mailbox. Every Graph write path is asserted before use.
import { TEST_MAILBOX } from "./hub-calendar-diagnostics-core.ts";

export const PILOT_MAILBOX = TEST_MAILBOX;
export const PILOT_ALLOWLIST: readonly string[] = Object.freeze([PILOT_MAILBOX]);
export const PILOT_SUBJECT = "MCS Hub kalenderintegrasjon – test";
export const PILOT_SUBJECT_UPDATED = "MCS Hub kalenderintegrasjon – test (endret)";
export const CONFIRM_PHRASE = "KJØR TESTPILOT";
export const DIAG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type StepId = "create" | "read_created" | "update" | "read_updated" | "delete" | "verify_deleted" | "cleanup" | "error";
export type ErrorCategory = "guard_rejected" | "network" | "unexpected_response" | "content_mismatch" | "internal";
export interface PilotStep { id: StepId; label: string; method: string; expectStatus: number[]; httpStatus?: number; result: "pass" | "fail"; graphCode?: string; phase?: StepId; category?: ErrorCategory; reason?: string }

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

const ALLOWED_QUERY = /^\?\$select=[A-Za-z,]{1,80}$/;

export function assertPilotRequest(method: string, fullPath: string, ownEventId: string | null): void {
  const q = fullPath.indexOf("?");
  const path = q === -1 ? fullPath : fullPath.slice(0, q);
  const query = q === -1 ? "" : fullPath.slice(q);
  if (query && (method !== "GET" || !ALLOWED_QUERY.test(query))) throw new Error("query_not_allowed");
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

// ---------- Orchestration (transport injected; unit-testable) ----------
export type GraphTransport = (method: string, path: string, payload?: unknown) => Promise<{ status: number; data: any }>;
export interface PilotOutcome { overall: "pass" | "fail"; cleanup: "none" | "deleted" | "pending" | "failed"; eventId: string | null; steps: PilotStep[] }

const SAFE_REASONS = new Set(["mailbox_not_allowlisted", "invalid_event_id", "write_path_not_allowed", "no_own_event", "method_not_allowed", "query_not_allowed"]);
class StepError extends Error { constructor(public category: ErrorCategory, public reason: string) { super(reason); } }

/** Sanitised reason: only known codes, never message text from Graph or runtime (may contain ids). */
export function sanitiseError(e: unknown): { category: ErrorCategory; reason: string } {
  if (e instanceof StepError) return { category: e.category, reason: e.reason };
  const m = e instanceof Error ? e.message : "";
  if (SAFE_REASONS.has(m)) return { category: "guard_rejected", reason: m };
  if (e instanceof TypeError) return { category: "network", reason: "fetch_failed" };
  return { category: "internal", reason: "unexpected_exception" };
}

export async function runPilot(graph: GraphTransport, key: string, now: Date, onProgress?: (o: PilotOutcome) => Promise<void> | void): Promise<PilotOutcome> {
  const o: PilotOutcome = { overall: "pass", cleanup: "none", eventId: null, steps: [] };
  const slot = osloSlot(now, 7);
  const slot2 = osloSlot(now, 7, 45);
  let phase: StepId = "create";
  const step = async (id: StepId, label: string, method: string, path: string, expect: number[], payload?: unknown) => {
    phase = id;
    assertPilotRequest(method, path, method === "POST" ? null : o.eventId);
    const r = await graph(method, path, payload);
    const ok = expect.includes(r.status);
    const code = !ok && typeof r.data?.error?.code === "string" ? r.data.error.code.slice(0, 80) : undefined;
    o.steps.push({ id, label, method, expectStatus: expect, httpStatus: r.status, result: ok ? "pass" : "fail", graphCode: code });
    if (!ok) o.overall = "fail";
    return { ok, data: r.data };
  };
  const mismatch = (reason: string) => { const s = o.steps[o.steps.length - 1]; s.result = "fail"; s.category = "content_mismatch"; s.reason = reason; o.overall = "fail"; };
  const ev = () => pilotPath(PILOT_MAILBOX, "event", o.eventId!);

  try {
    const c = await step("create", "Opprett testavtale", "POST", pilotPath(PILOT_MAILBOX, "events"), [201], pilotEventBody(slot, key));
    if (c.ok) {
      const id = c.data?.id;
      if (typeof id !== "string" || !id) throw new StepError("unexpected_response", "create_missing_id");
      o.eventId = id;
      try { pilotPath(PILOT_MAILBOX, "event", id); } catch { throw new StepError("unexpected_response", "create_id_format"); }
      await onProgress?.(o);
      const r1 = await step("read_created", "Les opprettet avtale", "GET", `${ev()}?$select=id,subject,start,end`, [200]);
      if (r1.ok && String(r1.data?.start?.dateTime ?? "").slice(0, 16) !== slot.start.slice(0, 16)) mismatch("start_time_mismatch");
      const u = await step("update", "Endre tid og tittel", "PATCH", ev(), [200], { subject: PILOT_SUBJECT_UPDATED, end: { dateTime: slot2.end, timeZone: "Europe/Oslo" } });
      if (u.ok) {
        const r2 = await step("read_updated", "Les endret avtale", "GET", `${ev()}?$select=id,subject,end`, [200]);
        if (r2.ok && (r2.data?.subject !== PILOT_SUBJECT_UPDATED || String(r2.data?.end?.dateTime ?? "").slice(0, 16) !== slot2.end.slice(0, 16))) mismatch("update_not_applied");
      }
      const d = await step("delete", "Slett testavtale", "DELETE", ev(), [204]);
      if (d.ok) { o.cleanup = "deleted"; await step("verify_deleted", "Bekreft at avtalen er borte", "GET", `${ev()}?$select=id`, [404]); }
      else o.cleanup = "pending";
    }
  } catch (e) {
    const { category, reason } = sanitiseError(e);
    o.overall = "fail";
    o.steps.push({ id: "error", label: "Stoppet før neste steg", method: "-", expectStatus: [], result: "fail", phase, category, reason });
    if (o.eventId && o.cleanup !== "deleted") o.cleanup = "pending";
  }

  if (o.eventId && o.cleanup === "pending") {
    try {
      const d = await step("cleanup", "Opprydding av egen testavtale", "DELETE", ev(), [204, 404]);
      o.cleanup = d.ok ? "deleted" : "failed";
    } catch (e) {
      const { category, reason } = sanitiseError(e);
      o.steps.push({ id: "error", label: "Opprydding stoppet", method: "-", expectStatus: [], result: "fail", phase: "cleanup", category, reason });
      o.cleanup = "failed";
    }
  }
  return o;
}
