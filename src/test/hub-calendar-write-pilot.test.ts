import { describe, it, expect } from "vitest";
import { assertPilotMailbox, assertPilotRequest, pilotPath, osloSlot, pilotEventBody, diagnosticGate, PILOT_MAILBOX } from "../../supabase/functions/_shared/hub-calendar-write-pilot-core";

const base = `/v1.0/users/${encodeURIComponent(PILOT_MAILBOX)}/calendar/events`;
const okChecks = ["token", "app_identity", "app_roles", "test_calendar", "out_of_scope_calendar", "mail_blocked"].map((id) => ({ id, result: "pass" }));

describe("write pilot allowlist", () => {
  it("accepts only the test mailbox", () => {
    expect(() => assertPilotMailbox("test-kalender@mcsservice.no")).not.toThrow();
    expect(() => assertPilotMailbox("mats.hansen@mcsservice.no")).toThrow("mailbox_not_allowlisted");
    expect(() => pilotPath("rune.orbeck@mcsservice.no", "events")).toThrow();
  });
  it("rejects writes to other paths or foreign event ids", () => {
    expect(() => assertPilotRequest("POST", base, null)).not.toThrow();
    expect(() => assertPilotRequest("POST", "/v1.0/users/x/calendar/events", null)).toThrow();
    expect(() => assertPilotRequest("PATCH", `${base}/OTHER_EVENT_1234`, "OWN_EVENT_1234")).toThrow();
    expect(() => assertPilotRequest("DELETE", `${base}/OWN_EVENT_1234`, null)).toThrow("no_own_event");
    expect(() => assertPilotRequest("DELETE", `${base}/OWN_EVENT_1234`, "OWN_EVENT_1234")).not.toThrow();
  });
});

describe("event body", () => {
  it("has no attendees, reminders or meeting and uses Oslo full hour", () => {
    const s = osloSlot(new Date("2026-11-12T11:00:00Z"), 7);
    expect(s).toEqual({ start: "2026-11-13T07:00:00", end: "2026-11-13T07:30:00" });
    const b = pilotEventBody(s, "11111111-2222-4333-8444-555555555555");
    expect(b.attendees).toEqual([]); expect(b.isReminderOn).toBe(false); expect(b.start.timeZone).toBe("Europe/Oslo");
  });
  it("picks Oslo date across DST change", () => {
    expect(osloSlot(new Date("2026-10-24T22:30:00Z"), 7).start).toBe("2026-10-26T07:00:00");
  });
});

describe("diagnostic gate", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  it("requires a recent full pass", () => {
    expect(diagnosticGate(null, now)).toBe("no_diagnostic");
    expect(diagnosticGate({ overall: "fail", run_at: now.toISOString(), checks: okChecks }, now)).toBe("diagnostic_not_passed");
    expect(diagnosticGate({ overall: "pass", run_at: "2026-11-10T00:00:00Z", checks: okChecks }, now)).toBe("diagnostic_too_old");
    expect(diagnosticGate({ overall: "pass", run_at: now.toISOString(), checks: okChecks.slice(1) }, now)).toBe("diagnostic_incomplete");
    expect(diagnosticGate({ overall: "pass", run_at: "2026-11-12T11:46:00Z", checks: okChecks }, now)).toBeNull();
  });
});
