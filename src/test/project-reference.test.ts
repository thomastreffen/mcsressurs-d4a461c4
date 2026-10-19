import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: any[]) => rpc(...a), from: (...a: any[]) => from(...a) } }));

import { resolveFinancialProjectNumber, formatProjectLabel, formatHubId, fetchFinancialProjectNumbers } from "@/lib/project-reference";

const C = "company-a";
const linked = { id: "fp-1", entity_type: "financial_project", project_number: "60488", company_id: C, has_active_link: true };
const unlinked = { ...linked, id: "fp-2", has_active_link: false };

describe("TPX-F4.1a project reference", () => {
  it("linked financial project shows its number; JOB code is secondary", () => {
    expect(resolveFinancialProjectNumber(linked)).toBe("60488");
    expect(formatHubId("JOB-000318", null)).toBe("JOB-000318");
  });

  it("child under linked parent inherits number", () => {
    expect(resolveFinancialProjectNumber({ id: "j1", entity_type: "job", parent_project_id: "fp-1", company_id: C }, linked)).toBe("60488");
  });

  it("two children share number without sharing identity", () => {
    const a = { id: "j1", entity_type: "job", parent_project_id: "fp-1", company_id: C };
    const b = { id: "j2", entity_type: "service", parent_project_id: "fp-1", company_id: C };
    expect(resolveFinancialProjectNumber(a, linked)).toBe(resolveFinancialProjectNumber(b, linked));
    expect(a.id).not.toBe(b.id);
  });

  it("unlinked legacy financial project with project_number gets no Tripletex display", () => {
    expect(resolveFinancialProjectNumber(unlinked)).toBeNull();
  });

  it("child under unlinked parent inherits nothing", () => {
    expect(resolveFinancialProjectNumber({ id: "j", entity_type: "job", parent_project_id: "fp-2", company_id: C }, unlinked)).toBeNull();
  });

  it("inactive link is treated as unlinked", () => {
    expect(resolveFinancialProjectNumber({ ...linked, has_active_link: false })).toBeNull();
  });

  it("cross-company parent is blocked", () => {
    expect(resolveFinancialProjectNumber({ id: "j", entity_type: "job", parent_project_id: "fp-1", company_id: "company-b" }, linked)).toBeNull();
  });

  it("legacy job without financial parent keeps fallback", () => {
    expect(resolveFinancialProjectNumber({ id: "x", entity_type: "job", project_number: "P-1", parent_project_id: null })).toBeNull();
    expect(formatProjectLabel(null, "Gammel jobb")).toBe("Gammel jobb");
  });

  it("resource-plan label is '<nr> · <title>' without duplication", () => {
    expect(formatProjectLabel("60488", "Montere 800A bryter")).toBe("60488 · Montere 800A bryter");
    expect(formatProjectLabel("60488", "60488 Montere 800A bryter")).toBe("60488 Montere 800A bryter");
  });

  it("regular users resolve via secure RPC, never reading tripletex_links directly", async () => {
    rpc.mockResolvedValueOnce({ data: [{ event_id: "j1", project_number: "60488" }], error: null });
    const m = await fetchFinancialProjectNumbers(["j1", "legacy"]);
    expect(rpc).toHaveBeenCalledWith("get_visible_project_numbers", { _event_ids: ["j1", "legacy"] });
    expect(from).not.toHaveBeenCalled();
    expect(m.get("j1")).toBe("60488");
    expect(m.has("legacy")).toBe(false);
  });

  it("resolver error fails closed to fallback", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect((await fetchFinancialProjectNumbers(["j1"])).size).toBe(0);
  });

  it("child job creation never calls Tripletex project create", () => {
    const src = readFileSync("src/pages/ProjectNewPage.tsx", "utf8");
    expect(src).toContain("parent_project_id");
    expect(src).not.toMatch(/tripletex-project|tripletex-import/);
  });
});
