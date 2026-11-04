import { describe, expect, it } from "vitest";
import { overrideChanges, toggleEffectiveOverride, type OverrideRow } from "@/lib/permission-overrides";
describe("Marcus/Emil-like permission drafts without live changes", () => {
  const marcus: OverrideRow[] = [{permission_key:"leads.view",mode:"deny",scope_company_id:null},{permission_key:"regulation.review",mode:"allow",scope_company_id:null}];
  it("reproduces old payload collision with global rows", () => {
    const oldRows = [...marcus.map(r=>({...r,scope_company_id:"service"})),{permission_key:"resourceplan.view",mode:"allow",scope_company_id:"service"}];
    expect(oldRows.filter(r=>marcus.some(old=>old.permission_key===r.permission_key))).toHaveLength(2);
  });
  it.each([marcus,marcus.slice(0,1)])("sends only new view key for both technician baselines", rows => {
    const draft = Object.fromEntries(rows.map(r=>[r.permission_key,r.mode]));
    expect(overrideChanges(rows,"service",{...draft,"resourceplan.view":"allow"},"inherit")).toEqual([{permission_key:"resourceplan.view",mode:"allow",expected:null}]);
  });
  it("repeated unchanged save is empty and removal affects only selected key", () => {
    const row: OverrideRow = {permission_key:"resourceplan.view",mode:"allow",scope_company_id:"service"};
    expect(overrideChanges([row],"service",{"resourceplan.view":"allow"},"inherit")).toEqual([]);
    expect(overrideChanges([row],"service",{},"inherit")).toEqual([{permission_key:"resourceplan.view",mode:null,expected:row}]);
  });
  it("never moves global or other company scope", () => {
    expect(()=>overrideChanges(marcus,"service",{"leads.view":"allow","regulation.review":"allow"},"inherit")).toThrow("opprinnelig omfang");
  });
  it("scope selector and many keys emit unique permission keys", () => {
    const draft = Object.fromEntries(Array.from({length:60},(_,i)=>[`perm.${i}`,"allow" as const]));
    const changes=overrideChanges([],"service",{...draft,"scope.view.company":"allow"},"scope.view.company");
    expect(changes).toHaveLength(61);expect(new Set(changes.map(r=>r.permission_key)).size).toBe(61);
  });
  it("checkbox always toggles effective value and resets to role when appropriate", () => {
    expect(toggleEffectiveOverride(true,"allow")).toBe("deny");
    expect(toggleEffectiveOverride(false,"deny")).toBe("allow");
    expect(toggleEffectiveOverride(true,"deny")).toBeUndefined();
    expect(toggleEffectiveOverride(false,"allow")).toBeUndefined();
  });
});