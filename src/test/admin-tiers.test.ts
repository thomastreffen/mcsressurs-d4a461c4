import { describe, it, expect } from "vitest";
import { isGlobalSuperadmin, isCompanyAdmin, canManageAccess } from "@/lib/admin-tiers";

const SERVICE = "service", BUSBAR = "busbar";

describe("admin tiers", () => {
  it("superadmin manages access in every company", () => {
    const thomas = { appRoles: ["super_admin"], activeCompanyIds: [SERVICE] };
    expect(canManageAccess(thomas)).toBe(true);
    expect(isCompanyAdmin(thomas, BUSBAR)).toBe(true);
  });
  it("legacy admin is company admin only where member, never access manager", () => {
    const john = { appRoles: ["admin"], activeCompanyIds: [SERVICE] };
    expect(isCompanyAdmin(john, SERVICE)).toBe(true);
    expect(isCompanyAdmin(john, BUSBAR)).toBe(false);
    expect(canManageAccess(john)).toBe(false);
    expect(isGlobalSuperadmin(john)).toBe(false);
  });
  it("unknown company never grants company admin", () => {
    expect(isCompanyAdmin({ appRoles: ["admin"], activeCompanyIds: [SERVICE] }, null)).toBe(false);
  });
  it("planner/montør without app admin gets no admin tier", () => {
    const lars = { appRoles: ["montør"], activeCompanyIds: [BUSBAR] };
    expect(isCompanyAdmin(lars, BUSBAR)).toBe(false);
    expect(canManageAccess(lars)).toBe(false);
  });
});
