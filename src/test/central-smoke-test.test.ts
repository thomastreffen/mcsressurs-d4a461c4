// @vitest-environment node
import { describe, it, expect } from "vitest";
import { runSmokeTest, cleanupSmokeEvent, validSmokeSlot, smokePhrase, SMOKE_SUBJECT } from "../../supabase/functions/_shared/central-smoke-test";
import { rolloutGoNoGo, nextRolloutStep } from "../../supabase/functions/_shared/central-rollout";

const start = "2026-12-01T06:00:00.000Z", end = "2026-12-01T06:30:00.000Z";
function fakeGraph(o: { busy?: boolean; postStatus?: number; deleteStatus?: number; stripBody?: boolean } = {}) {
  const calls: string[] = []; let ev: any = null;
  const graph = async (method: string, path: string, body?: any) => {
    calls.push(`${method} ${path.split("?")[0]}`);
    if (method === "GET" && path.includes("calendarView")) return { status: 200, data: { value: o.busy ? [{ start: { dateTime: start }, end: { dateTime: end }, isCancelled: false }] : ev ? [{ id: ev.id, transactionId: ev.transactionId }] : [] } };
    if (method === "POST") { ev = { ...body, id: "G1", changeKey: "c1", type: "singleInstance", isCancelled: false, isAllDay: false, body: o.stripBody ? { content: "<html/>" } : body.body, start: { dateTime: start.replace("Z", "0000"), timeZone: "UTC" }, end: { dateTime: end.replace("Z", "0000"), timeZone: "UTC" } }; return { status: o.postStatus ?? 201, data: o.postStatus && o.postStatus !== 201 ? null : ev }; }
    if (method === "GET") return ev ? { status: 200, data: ev } : { status: 404, data: null };
    if (method === "PATCH") { ev = { ...ev, ...body, changeKey: "c2" }; return { status: 200, data: ev }; }
    if (method === "DELETE") { if ((o.deleteStatus ?? 204) === 204) ev = null; return { status: o.deleteStatus ?? 204, data: null }; }
    return { status: 500, data: null };
  };
  return { graph: graph as any, calls };
}
const base = { runId: "r1", mailbox: "marcus@x.no", technicianId: "t", companyId: "c", start, end };

describe("central API smoke test (mock Graph, no live calls)", () => {
  it("full lifecycle passes: free slot, POST, exact GET (stripped markers ok), PATCH, DELETE, 404", async () => {
    const g = fakeGraph({ stripBody: true });
    const r = await runSmokeTest(g.graph, base);
    expect(r.pass).toBe(true);
    expect(r.stranded).toBe(false);
    expect(r.steps.map(s => s.step)).toEqual(["slot_free_get", "create_post", "verify_get", "update_patch", "verify_update_get", "delete", "verify_deleted"]);
    expect(g.calls.filter(c => c.startsWith("POST"))).toHaveLength(1);
  });
  it("busy slot stops before any write", async () => {
    const g = fakeGraph({ busy: true });
    const r = await runSmokeTest(g.graph, base);
    expect(r.pass).toBe(false); expect(r.failed_step).toBe("slot_free_get");
    expect(g.calls.some(c => !c.startsWith("GET"))).toBe(false);
  });
  it("uncertain POST is never retried; found event is flagged stranded", async () => {
    const g = fakeGraph({ postStatus: 504 });
    const r = await runSmokeTest(g.graph, base);
    expect(r.pass).toBe(false); expect(r.stranded).toBe(true); expect(r.graph_event_id).toBe("G1");
    expect(g.calls.filter(c => c.startsWith("POST"))).toHaveLength(1);
  });
  it("failed delete is reported as stranded and fails the test", async () => {
    const r = await runSmokeTest(fakeGraph({ deleteStatus: 500 }).graph, base);
    expect(r.pass).toBe(false); expect(r.stranded).toBe(true);
  });
  it("cleanup deletes only our own exact test event", async () => {
    const foreign = async (m: string) => m === "GET" ? { status: 200, data: { transactionId: "other", subject: "Kunde" } } : { status: 204, data: null };
    expect((await cleanupSmokeEvent(foreign as any, { runId: "r1", mailbox: "m", graphEventId: "G1" })).ok).toBe(false);
    let gone = false;
    const own = async (m: string) => m === "DELETE" ? (gone = true, { status: 204, data: null }) : gone ? { status: 404, data: null } : { status: 200, data: { transactionId: "mcs-smoke-r1", subject: SMOKE_SUBJECT, changeKey: "c" } };
    expect((await cleanupSmokeEvent(own as any, { runId: "r1", mailbox: "m", graphEventId: "G1" })).ok).toBe(true);
  });
  it("slot rules and phrase", () => {
    const now = new Date("2026-11-30T06:00:00Z");
    expect(validSmokeSlot(start, end, now)).toBeNull();
    expect(validSmokeSlot("2026-11-30T06:30:00Z", "2026-11-30T07:00:00Z", now)).toBe("slot_must_start_at_least_1h_ahead");
    expect(validSmokeSlot(start, "2026-12-01T08:00:00Z", now)).toBe("slot_15_to_60_minutes");
    expect(smokePhrase("Marcus.Bogen@x.no")).toBe("SYSTEMTEST KALENDER marcus.bogen@x.no");
  });
  it("API smoke unblocks batches but is labelled as not proving the ordinary trigger", () => {
    const d = rolloutGoNoGo({ apiSmokeProven: true, createProven: false, updateProven: false, deleteProven: false, unverifiedOperations: 0, legacyGlobalEnabled: false, heldQueue: 9, pendingConflicts: 0 });
    expect(d.go).toBe(true); expect(d.warnings).toContain("ordinary_trigger_not_proven");
    expect(rolloutGoNoGo({ createProven: false, updateProven: false, deleteProven: false, unverifiedOperations: 0, legacyGlobalEnabled: false, heldQueue: 9, pendingConflicts: 0 }).go).toBe(false);
    expect(nextRolloutStep({ anyActive: true, createProven: false, bootstrapUsed: true, bootstrapActive: true, anyReady: true, anyUnprobed: false, unverified: 0 })).toBe("smoke_test_click");
    expect(nextRolloutStep({ apiSmokeProven: true, anyActive: true, createProven: false, bootstrapUsed: true, bootstrapActive: true, anyReady: true, anyUnprobed: false, unverified: 0 })).toBe("batch_click");
  });
});
