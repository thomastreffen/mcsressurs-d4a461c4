// @vitest-environment node
import { it, expect, vi, describe } from "vitest";
import { syncDaily, dailyVerification, type DailyScope, type DailyStore, type DailyGraph } from "../../supabase/functions/_shared/central-calendar-lifecycle";
import { readFileSync } from "node:fs";
const s: DailyScope = { eventId: "d4089119", technicianId: "rune", companyId: "c", mailbox: "rune@x.no", workDate: "2026-11-24", start: "2026-11-24T11:00:00Z", end: "2026-11-24T12:00:00Z", key: "k" };
const markers = `<!-- MCS_SOURCE:true MCS_EVENT_ID:${s.eventId} MCS_TECHNICIAN_ID:${s.technicianId} MCS_WORK_DATE:${s.workDate} -->`;
const payload = { subject: "2 gangs intervju", showAs: "busy", start: { dateTime: "2026-11-24T11:00:00+00:00", timeZone: "UTC" }, end: { dateTime: "2026-11-24T12:00:00+00:00", timeZone: "UTC" }, body: { contentType: "HTML", content: `<p>Info</p>${markers}` }, transactionId: "mcs-jobday-x" };
// What Graph returns: body rewrapped into a full HTML document, dateTime without offset.
const graphCopy = { id: "AAk", changeKey: "ck1", transactionId: "mcs-jobday-x", type: "singleInstance", isCancelled: false, isAllDay: false, attendees: [], subject: payload.subject, showAs: "busy",
  start: { dateTime: "2026-11-24T11:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-11-24T12:00:00.0000000", timeZone: "UTC" },
  body: { contentType: "html", content: `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body><p>Info</p>${markers}</body></html>` } };
const store = (open: any = null): DailyStore => ({ unresolved: vi.fn(async () => open), live: vi.fn(async () => true), claim: vi.fn(async () => "claim"), receipt: vi.fn(async () => {}), saveCopy: vi.fn(async () => {}) });
const run = (st: DailyStore, graph: DailyGraph) => syncDaily({ scope: s, kind: "create", payload, copy: null, viewPath: "/calendarView", graph, store: st, authorized: true, conflictConsent: false, operationKey: "op" });

describe("POST201 then GET verification (JOB-000452 regression)", () => {
  it("verifies a Graph-rewrapped HTML body instead of leaving it unresolved", async () => {
    const st = store();
    const graph = vi.fn<DailyGraph>(async (m, p) => m === "POST" ? { status: 201, data: { id: "AAk", changeKey: "ck1" } } : p.includes("calendarView") ? { status: 200, data: { value: [] } } : { status: 200, data: graphCopy });
    expect((await run(st, graph)).state).toBe("verified");
    expect(graph.mock.calls.filter(c => c[0] === "POST")).toHaveLength(1);
    expect(st.saveCopy).toHaveBeenCalledWith(expect.objectContaining({ id: "AAk" }), false);
  });
  it("accepts transactionId identity when Exchange strips the marker comment", () => {
    expect(dailyVerification({ ...graphCopy, body: { content: "<html><body><p>Info</p></body></html>" } }, s, { graphId: "AAk", payload }).ok).toBe(true);
  });
  it("rejects a mismatch (other id, time, subject or attendees)", () => {
    for (const bad of [{ id: "other" }, { start: { dateTime: "2026-11-24T10:00:00", timeZone: "UTC" } }, { subject: "x" }, { attendees: [{}] }, { transactionId: "x", body: { content: "" } }])
      expect(dailyVerification({ ...graphCopy, ...bad }, s, { graphId: "AAk", payload }).ok).toBe(false);
  });
  it("an existing accepted operation never triggers a second POST, and pre-fix rows require manual linking", async () => {
    const graph = vi.fn<DailyGraph>(async () => ({ status: 200, data: graphCopy }));
    expect((await run(store({ id: "op", state: "accepted", kind: "create", payload, graphId: "AAk", manualOnly: true }), graph)).state).toBe("manual_link_required_no_retry");
    expect(graph).not.toHaveBeenCalled();
    const auto = await run(store({ id: "op", state: "accepted", kind: "create", payload, graphId: "AAk" }), graph);
    expect(auto.state).toBe("verified"); expect(graph.mock.calls.every(c => c[0] === "GET")).toBe(true);
  });
  it("404 on the stored id stays unresolved without POST", async () => {
    const graph = vi.fn<DailyGraph>(async () => ({ status: 404, data: null }));
    expect((await run(store({ id: "op", state: "accepted", kind: "create", payload, graphId: "AAk" }), graph)).state).toBe("unresolved_no_retry");
    expect(graph.mock.calls.some(c => c[0] !== "GET")).toBe(false);
  });
  it("link action is GET-only, phrase-gated and only advances an accepted row once", () => {
    const src = readFileSync("supabase/functions/job-outlook-app-pilot/index.ts", "utf8");
    const block = src.slice(src.indexOf('action === "inspect_central_operation"'), src.indexOf('action === "central_unverified"'));
    expect(block).toContain("exact_phrase_required");
    expect(block).toContain('.eq("state", "accepted")');
    expect(block.match(/fetch\(`https:\/\/graph\.microsoft\.com[^\n]*/g)?.every(l => l.includes('method: "GET"'))).toBe(true);
    expect(src).toContain("openOp?.length) continue");
  });
});
