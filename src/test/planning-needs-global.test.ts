import { describe, it, expect } from "vitest";
import { prioritizeNeeds, type GlobalNeed } from "@/components/resource-plan/PlanningNeedsGlobal";

const n = (id: string, day: number, assigned: number, needed: number): GlobalNeed => ({
  eventId: id, projectName: "P", wpName: "W", start: new Date(2026, 10, day), department: null, assigned, needed,
});

describe("prioritizeNeeds", () => {
  it("hides fully staffed needs", () => {
    expect(prioritizeNeeds([n("full", 1, 2, 2)])).toHaveLength(0);
  });
  it("puts unstaffed before partially staffed", () => {
    expect(prioritizeNeeds([n("partial", 1, 1, 3), n("none", 20, 0, 2)]).map((x) => x.eventId)).toEqual(["none", "partial"]);
  });
  it("orders by nearest start within the same group", () => {
    expect(prioritizeNeeds([n("late", 20, 0, 2), n("early", 5, 0, 2)]).map((x) => x.eventId)).toEqual(["early", "late"]);
  });
});
