import { describe, it, expect } from "vitest";
import { findingDisplayStatus } from "@/lib/inspections";

const done = {
  responsible_person_id: "p1",
  response_approved_at: "2026-10-27T10:00:00Z",
  condition_corrected_at: "2026-10-27T10:00:00Z",
  documentation_complete_at: "2026-10-27T10:00:00Z",
  documentation_status: "complete",
};

describe("findingDisplayStatus", () => {
  it("new + complete internal handling shows Klar for oversendelse, not Ny", () => {
    const d = findingDisplayStatus({ status: "new", ...done });
    expect(d.label).toBe("Klar for oversendelse");
    expect(d.missing).toEqual([]);
  });
  it("untouched new finding is Åpen and lists what is missing", () => {
    const d = findingDisplayStatus({ status: "new", documentation_status: "none" });
    expect(d.label).toBe("Åpen");
    expect(d.missing).toContain("Ansvarlig ikke satt");
    expect(d.missing).toContain("Mangler dokumentasjon");
  });
  it("actions_in_progress is Under arbeid", () => {
    const d = findingDisplayStatus({ status: "actions_in_progress", responsible_person_id: "p1", documentation_status: "incomplete" });
    expect(d.label).toBe("Under arbeid");
    expect(d.missing).toContain("Mangler dokumentasjon");
  });
  it("documentation_ready never shows missing docs", () => {
    const d = findingDisplayStatus({ status: "documentation_ready", ...done, documentation_status: "incomplete" }, "incomplete");
    expect(d.label).toBe("Klar for oversendelse");
    expect(d.missing).toEqual([]);
  });
  it("submitted is Oversendt", () => {
    expect(findingDisplayStatus({ status: "submitted" }).label).toBe("Oversendt");
  });
  it("approved is Lukket", () => {
    expect(findingDisplayStatus({ status: "approved" }).label).toBe("Lukket");
  });
});
