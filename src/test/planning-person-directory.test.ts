import { describe, it, expect } from "vitest";
import { groupDirectory, suggestedEmployment, type DirectoryEntry } from "@/hooks/useMyPlanningTasks";

const row = (p: Partial<DirectoryEntry>): DirectoryEntry => ({
  person_id: "p1", full_name: "Lars Erik", company_id: "busbar", company_name: "BusBar AS",
  department_id: null, department_name: null, is_primary: false, can_notify: true, ...p,
});

describe("personvelger på tvers av MCS", () => {
  it("én ansettelse foreslår den ansettelsen", () => {
    const [p] = groupDirectory([row({})]);
    expect(suggestedEmployment(p)?.company_id).toBe("busbar");
  });
  it("flere ansettelser foreslår primær og beholder alle valg", () => {
    const [p] = groupDirectory([row({ company_id: "service" }), row({ company_id: "busbar", is_primary: true })]);
    expect(p.employments).toHaveLength(2);
    expect(suggestedEmployment(p)?.company_id).toBe("busbar");
  });
  it("person uten bekreftet innlogging kan velges, men merkes som ikke varslbar", () => {
    const [p] = groupDirectory([row({ can_notify: false })]);
    expect(p.canNotify).toBe(false);
  });
});
