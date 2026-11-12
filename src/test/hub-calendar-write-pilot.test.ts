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

import { runPilot, PILOT_SUBJECT_UPDATED, type GraphTransport } from "../../supabase/functions/_shared/hub-calendar-write-pilot-core";

const ID = "AAMkAGI2TG93AAA=";
const NOW = new Date("2026-11-12T11:55:00Z");
function fakeGraph(over: Partial<Record<string, (p: string) => { status: number; data: any }>> = {}) {
  const calls: string[] = []; let deleted = false;
  const t: GraphTransport = async (m, p, body: any) => {
    calls.push(`${m} ${p.includes("?") ? "q" : ""}`.trim());
    const k = `${m}${calls.filter((c) => c.startsWith(m)).length}`;
    if (over[k]) return over[k]!(p);
    if (m === "POST") return { status: 201, data: { id: ID } };
    if (m === "PATCH") return { status: 200, data: { id: ID } };
    if (m === "DELETE") { deleted = true; return { status: 204, data: null }; }
    if (deleted) return { status: 404, data: { error: { code: "ErrorItemNotFound" } } };
    const patched = calls.some((c) => c.startsWith("PATCH"));
    return { status: 200, data: { id: ID, subject: patched ? PILOT_SUBJECT_UPDATED : "x", start: { dateTime: "2026-11-13T07:00:00.0000000" }, end: { dateTime: patched ? "2026-11-13T07:45:00.0000000" : "2026-11-13T07:30:00.0000000" } } };
  };
  return { t, calls };
}

describe("runPilot full flow", () => {
  it("passes create→GET→PATCH→GET→DELETE→GET 404 with expected codes", async () => {
    const { t } = fakeGraph();
    const o = await runPilot(t, "11111111-2222-4333-8444-555555555555", NOW);
    expect(o.steps.map((s) => s.httpStatus)).toEqual([201, 200, 200, 200, 204, 404]);
    expect(o.overall).toBe("pass"); expect(o.cleanup).toBe("deleted");
  });
  it("regression: GET with $select passes the guard (was write_path_not_allowed)", async () => {
    const { t } = fakeGraph();
    const o = await runPilot(t, "11111111-2222-4333-8444-555555555555", NOW);
    expect(o.steps.find((s) => s.id === "error")).toBeUndefined();
  });
  it("records a sanitised error step and cleans up own event when Graph returns no id", async () => {
    const { t, calls } = fakeGraph({ POST1: () => ({ status: 201, data: {} }) });
    const o = await runPilot(t, "11111111-2222-4333-8444-555555555555", NOW);
    const err = o.steps.find((s) => s.id === "error")!;
    expect(err).toMatchObject({ phase: "create", category: "unexpected_response", reason: "create_missing_id" });
    expect(calls.some((c) => c.startsWith("DELETE"))).toBe(false); // nothing to delete
  });
  it("cleans up own event after a network exception mid-flow and never leaks messages", async () => {
    const { t, calls } = fakeGraph({ PATCH1: () => { throw new TypeError(`secret ${ID}`); } });
    const o = await runPilot(t, "11111111-2222-4333-8444-555555555555", NOW);
    const err = o.steps.find((s) => s.id === "error")!;
    expect(err).toMatchObject({ phase: "update", category: "network", reason: "fetch_failed" });
    expect(JSON.stringify(o.steps)).not.toContain(ID);
    expect(o.cleanup).toBe("deleted"); expect(calls.filter((c) => c.startsWith("DELETE"))).toHaveLength(1);
  });
  it("flags content mismatch when Graph returns UTC instead of Oslo time", async () => {
    const { t } = fakeGraph({ GET1: () => ({ status: 200, data: { id: ID, start: { dateTime: "2026-11-13T06:00:00.0000000" } } }) });
    const o = await runPilot(t, "11111111-2222-4333-8444-555555555555", NOW);
    expect(o.steps[1]).toMatchObject({ result: "fail", reason: "start_time_mismatch" });
    expect(o.cleanup).toBe("deleted");
  });
  it("rejects query strings on writes", () => {
    expect(() => assertPilotRequest("PATCH", `${base}/OWN_EVENT_1234?$select=id`, "OWN_EVENT_1234")).toThrow("query_not_allowed");
    expect(() => assertPilotRequest("GET", `${base}/OWN_EVENT_1234?$filter=x`, "OWN_EVENT_1234")).toThrow("query_not_allowed");
  });
});
