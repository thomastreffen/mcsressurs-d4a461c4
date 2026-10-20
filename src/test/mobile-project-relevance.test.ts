import { describe, expect, it } from "vitest";
import { inheritProjectRelevance } from "@/lib/mobile-project-relevance";
describe("mobile Mine relevance", () => {
  const projects = [{ id: "root", companyId: "a", parentId: null }, { id: "child", companyId: "a", parentId: "root" }, { id: "other", companyId: "b", parentId: "root" }];
  it("shows assigned children and their same-company parent", () => {
    expect([...inheritProjectRelevance(projects, new Map([["child", ["Ressursbooket"]]])).keys()]).toEqual(["child", "root"]);
  });
  it("does not equate readable projects with Mine", () => {
    expect(inheritProjectRelevance(projects, new Map()).size).toBe(0);
  });
  it("does not inherit across companies", () => {
    expect(inheritProjectRelevance(projects, new Map([["other", ["Deltaker"]]])).has("root")).toBe(false);
  });
  it("does not include invisible IDs", () => {
    expect(inheritProjectRelevance(projects, new Map([["hidden", ["Prosjektleder"]]])).size).toBe(0);
  });
  it("retains actual roles without duplicates", () => {
    expect(inheritProjectRelevance(projects, new Map([["root", ["Deltaker", "Deltaker", "Prosjektleder"]]])).get("root")).toEqual(["Deltaker", "Prosjektleder"]);
  });
});