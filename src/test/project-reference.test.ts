import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveFinancialProjectNumber, formatProjectLabel, formatHubId } from "@/lib/project-reference";

const parent = { id: "fp-1", entity_type: "financial_project", project_number: "60488" };

describe("TPX-F4.1 project reference", () => {
  it("financial project uses its own Tripletex number as primary ref, not JOB code", () => {
    expect(resolveFinancialProjectNumber({ ...parent, parent_project_id: null })).toBe("60488");
    expect(formatHubId("JOB-000318", null)).toBe("JOB-000318");
  });

  it("child job resolves parent project number", () => {
    const child = { id: "j1", entity_type: "job", project_number: null, parent_project_id: "fp-1" };
    expect(resolveFinancialProjectNumber(child, parent)).toBe("60488");
  });

  it("two child jobs share the number without sharing identity", () => {
    const a = { id: "j1", entity_type: "job", parent_project_id: "fp-1" };
    const b = { id: "j2", entity_type: "service", parent_project_id: "fp-1" };
    expect(resolveFinancialProjectNumber(a, parent)).toBe("60488");
    expect(resolveFinancialProjectNumber(b, parent)).toBe("60488");
    expect(a.id).not.toBe(b.id);
  });

  it("resource-plan label is '<nr> · <title>' and does not duplicate", () => {
    expect(formatProjectLabel("60488", "Montere 800A bryter Østre Aker Vei 80"))
      .toBe("60488 · Montere 800A bryter Østre Aker Vei 80");
    expect(formatProjectLabel("60488", "60488 Montere 800A bryter")).toBe("60488 Montere 800A bryter");
  });

  it("legacy job without financial parent gets no invented number", () => {
    expect(resolveFinancialProjectNumber({ id: "x", entity_type: "job", project_number: "P-1", parent_project_id: null })).toBeNull();
    expect(resolveFinancialProjectNumber({ id: "x", entity_type: "job", parent_project_id: "p" },
      { id: "p", entity_type: "service", project_number: "999" })).toBeNull();
    expect(formatProjectLabel(null, "Gammel jobb")).toBe("Gammel jobb");
  });

  it("child job creation never calls Tripletex project create", () => {
    const src = readFileSync("src/pages/ProjectNewPage.tsx", "utf8");
    expect(src).toContain("parent_project_id");
    expect(src).not.toMatch(/tripletex-project|tripletex-import/);
  });
});
