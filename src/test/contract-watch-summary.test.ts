import { describe, it, expect } from "vitest";
import { summarizeContractWatch, needsAttention } from "@/lib/contract-watch-summary";
const r = (id: string, action_status: string | null, o: Partial<{ status: string; is_test: boolean; source_sent_at: string }> = {}) => ({ id, action_status, status: "open", is_test: true, created_at: "2026-11-20", ...o });
describe("Avtalevakt dashboard summary (v2)", () => {
  it("empty means no findings and no indicator", () => { const s = summarizeContractWatch([]); expect(s.total).toBe(0); expect(needsAttention(s)).toBe(false); expect(s.topId).toBeNull(); });
  it("counts action/scheduling/unknown; ignores handled and closed", () => {
    const s = summarizeContractWatch([r("1", "action_required"), r("2", "scheduling"), r("3", "unknown"), r("4", null), r("5", "handled"), r("6", "action_required", { status: "dismissed" })]);
    expect([s.actionRequired, s.scheduling, s.unknown, s.total]).toEqual([1, 1, 2, 4]);
  });
  it("top case is the newest that requires action", () => {
    const s = summarizeContractWatch([r("a", "unknown"), r("b", "action_required", { source_sent_at: "2026-11-01" }), r("c", "action_required", { source_sent_at: "2026-11-23", is_test: false })]);
    expect(s.topId).toBe("c"); expect(s.allTest).toBe(false);
  });
  it("only action required raises the indicator", () => { expect(needsAttention(summarizeContractWatch([r("x", "scheduling"), r("y", "unknown")]))).toBe(false); });
});

describe("v3 statuses", () => {
  it("awaiting_me counts as action, answered/info do not", () => {
    const base = { status: "open", is_test: true, created_at: "2026-11-23" };
    const s = summarizeContractWatch([{ id: "a", action_status: "awaiting_me", ...base }, { id: "b", action_status: "answered", ...base }, { id: "c", action_status: "info", ...base }]);
    expect(s.actionRequired).toBe(1); expect(s.total).toBe(1);
  });
});
