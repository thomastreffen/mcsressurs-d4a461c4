import { describe, expect, it } from "vitest";
import { resourceBlocksForDay } from "@/lib/mobile-resource-day";
import type { ScheduleBlock } from "@/hooks/useScheduleBlocks";
const day = new Date(2026, 9, 20, 12);
const block = (id: string, start: number, end: number, patch = {}): ScheduleBlock => ({ id, technician_id: "tech", job_id: "job", project_id: "parent", start_at: new Date(2026, 9, 20, start), end_at: new Date(2026, 9, 20, end), ...patch } as ScheduleBlock);
describe("mobile schedule presentation", () => {
  it("sorts actual booking times chronologically", () => {
    expect(resourceBlocksForDay([block("late", 13, 15), block("early", 8, 10)], day, "tech").map(b => b.id)).toEqual(["early", "late"]);
  });
  it("keeps only the selected technician", () => {
    expect(resourceBlocksForDay([block("mine", 8, 10), block("other", 8, 10, { technician_id: "other" })], day, "tech").map(b => b.id)).toEqual(["mine"]);
  });
  it("includes overnight overlap, excludes next day and boundary endings", () => {
    const overnight = block("night", 8, 10, { start_at: new Date(2026, 9, 19, 22), end_at: new Date(2026, 9, 20, 6) });
    expect(resourceBlocksForDay([overnight, block("tomorrow", 24, 26), block("finished", -2, 0)], day, "tech").map(b => b.id)).toEqual(["night"]);
  });
  it("drops deleted blocks", () => {
    expect(resourceBlocksForDay([block("deleted", 8, 10, { deleted_at: "2026-10-20" })], day, "tech")).toEqual([]);
  });
  it("dedupes stable assignments and preserves richer parent relation", () => {
    expect(resourceBlocksForDay([block("thin", 8, 10, { project_id: null }), block("rich", 8, 10)], day, "tech").map(b => b.id)).toEqual(["rich"]);
  });
});