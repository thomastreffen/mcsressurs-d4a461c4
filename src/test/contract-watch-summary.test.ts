import { describe, it, expect } from "vitest";
import { summarizeContractWatch, needsAttention } from "@/lib/contract-watch-summary";
const r = (id: string, coverage: string | null, o: Partial<{ status: string; is_test: boolean; created_at: string }> = {}) => ({ id, coverage, status: "open", is_test: true, confidence_class: "check", created_at: "2026-11-20", ...o });
describe("Avtalevakt dashboard summary", () => {
  it("empty means no findings and no indicator", () => {
    const s = summarizeContractWatch([]); expect(s.total).toBe(0); expect(needsAttention(s)).toBe(false); expect(s.topId).toBeNull();
  });
  it("counts missing, partial+conflict and unclear; ignores covered and closed", () => {
    const s = summarizeContractWatch([r("1", "missing"), r("2", "partial"), r("3", "conflict"), r("4", "unclear"), r("5", null), r("6", "covered"), r("7", "missing", { status: "dismissed" })]);
    expect([s.missing, s.partialOrConflict, s.unclear, s.total]).toEqual([1, 2, 2, 5]);
  });
  it("test findings are flagged and top case is the missing one", () => {
    const s = summarizeContractWatch([r("a", "unclear"), r("b", "missing", { is_test: false })]);
    expect(s.topId).toBe("b"); expect(s.testCount).toBe(1); expect(s.allTest).toBe(false);
  });
  it("unclear alone never raises the indicator", () => {
    expect(needsAttention(summarizeContractWatch([r("x", "unclear")]))).toBe(false);
  });
});
