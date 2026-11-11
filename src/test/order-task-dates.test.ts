import { describe, it, expect } from "vitest";
import { orderPlanningDates, buildOrderScheduleBlocks, dayWindow } from "@/lib/order-task-dates";

describe("order task multi-date", () => {
  it("dedupes primary + chosen dates and keeps specific days (no weekly expansion)", () => {
    const d = orderPlanningDates(new Date(2026, 10, 19), [new Date(2026, 10, 24), new Date(2026, 10, 19), new Date(2026, 10, 20)]);
    expect(d).toEqual(["2026-11-19", "2026-11-20", "2026-11-24"]);
  });
  it("one block per technician × day on the same single event, same clock time", () => {
    const rows = buildOrderScheduleBlocks({ companyId: "c", eventId: "e1", title: "T", techIds: ["a", "b"],
      dates: ["2026-11-19", "2026-11-20", "2026-11-24"], startTime: "08:00", endTime: "16:00" });
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.project_id))).toEqual(new Set(["e1"]));
    const w = dayWindow("2026-11-24", "08:00", "16:00");
    expect(new Date(w.startISO).getHours()).toBe(8);
    expect(new Date(w.endISO).getHours()).toBe(16);
  });
});
