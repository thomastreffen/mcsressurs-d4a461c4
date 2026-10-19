import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const rpc = vi.fn();
const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: any[]) => rpc(...a), functions: { invoke: (...a: any[]) => invoke(...a) } },
}));

import { mergeProjectResults, canPlanNewJob, openStatus, tripletexSearchBy, rowLabel } from "@/lib/project-picker";
import { checkParentOpenForNewJob, gateFromStatus } from "@/lib/parent-open-gate";
import { formatProjectLabel } from "@/lib/project-reference";
import { openStatus as serverOpenStatus } from "../../supabase/functions/_shared/tripletex-import-core";

const drawer = readFileSync("src/components/EventDrawer.tsx", "utf8");
const picker = readFileSync("src/components/resource-plan/UnifiedProjectPicker.tsx", "utf8");
const fn = readFileSync("supabase/functions/tripletex-import/index.ts", "utf8");

const hub = [{ event_id: "ev-60488", project_number: "60488", title: "Montere 800A", customer: "CAVERION", tripletex_project_id: 210411444 }];

beforeEach(() => { rpc.mockReset(); invoke.mockReset(); });

describe("Unified financial project picker", () => {
  it("project number search finds linked Hub project and selects it without import", () => {
    const rows = mergeProjectResults(hub, []);
    expect(rows).toEqual([expect.objectContaining({ source: "hub", eventId: "ev-60488", projectNumber: "60488" })]);
    expect(rowLabel(rows[0] as any)).toBe("Prosjektnr. 60488 · Montere 800A");
    expect(picker).toMatch(/r\.source === "hub" \? onSelected/);
  });

  it("Tripletex-only project appears with Tripletex source", () => {
    const rows = mergeProjectResults([], [{ id: 777, number: "60521", name: "60521 Tavle", isClosed: false, customer: { name: "MCS ELEKTROTAVLER AS" } }]);
    expect(rows[0]).toMatchObject({ source: "tripletex", tripletexId: 777, name: "Tavle", status: "open" });
    expect(picker).toContain("Tripletex TEST · hent inn");
  });

  it("dedupes on stable Tripletex ID only – same number different ID is kept", () => {
    const rows = mergeProjectResults(hub, [
      { id: 210411444, number: "60488", name: "x", isClosed: false },
      { id: 999, number: "60488", name: "other", isClosed: false },
    ]);
    expect(rows.map((r) => r.key)).toEqual(["hub:ev-60488", "tt:999"]);
  });

  it("linked_event_id from Tripletex search reuses the same Hub shell", () => {
    const rows = mergeProjectResults([], [{ id: 5, number: "1", name: "Test1", isClosed: false, linked_event_id: "ev-1" }]);
    expect(rows).toEqual([expect.objectContaining({ source: "hub", eventId: "ev-1" })]);
  });

  it("number/name similarity never links a legacy Hub row (Hub list comes only from active-link resolver)", () => {
    expect(picker).toContain('"search_linked_financial_projects"');
    expect(drawer).not.toMatch(/\.ilike\("project_number"/);
  });

  it("Tripletex-only selection uses canonical F4 import with explicit customer confirmation", () => {
    expect(picker).toContain('tt("preview"');
    expect(picker).toContain('tt("import"');
    expect(picker).toContain("confirm_customer_id");
    expect(picker).toMatch(/disabled=\{!pv \|\| busy \|\| !chosenCustomer\}/);
    expect(picker).toContain("ambiguous");
  });

  it("closed and unknown projects cannot parent a new job", () => {
    expect(canPlanNewJob(openStatus(false))).toBe(true);
    expect(canPlanNewJob(openStatus(true))).toBe(false);
    expect(canPlanNewJob(openStatus(undefined))).toBe(false);
    expect(serverOpenStatus(null)).toBe("unknown");
    expect(gateFromStatus(true, "closed").ok).toBe(false);
    expect(gateFromStatus(true, "unknown").ok).toBe(false);
    expect(gateFromStatus(false, null).ok).toBe(true);
  });

  it("linked parent: Tripletex read failure fails closed", async () => {
    rpc.mockResolvedValueOnce({ data: [{ event_id: "p", project_number: "1" }], error: null });
    invoke.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    expect((await checkParentOpenForNewJob("p", "c")).ok).toBe(false);
  });

  it("linked open parent passes; cross-company/unseen event -> not_linked fails", async () => {
    rpc.mockResolvedValueOnce({ data: [{ event_id: "p", project_number: "1" }], error: null });
    invoke.mockResolvedValueOnce({ data: { status: "open" }, error: null });
    expect((await checkParentOpenForNewJob("p", "c")).ok).toBe(true);
    rpc.mockResolvedValueOnce({ data: [{ event_id: "p", project_number: "1" }], error: null });
    invoke.mockResolvedValueOnce({ data: { status: "not_linked" }, error: null });
    expect((await checkParentOpenForNewJob("p", "other")).ok).toBe(false);
    expect(fn).toMatch(/ev\.company_id !== companyId/);
  });

  it("server keeps Tripletex search/import super_admin-only and never creates Tripletex projects", () => {
    expect(fn).toContain('if (!isSuper && action !== "project_open_status")');
    expect(fn).not.toMatch(/"POST", `?\/project/);
  });

  it("child created via create_work_visits_on_project_batch with parent id; title not prefilled", () => {
    expect(drawer).toContain('"create_work_visits_on_project_batch"');
    expect(drawer).toContain("p_parent_id: selectedJobId");
    expect(drawer).toMatch(/setSelectedJobId\(eventId\);[\s\S]{0,300}setTitle\(""\)/);
    expect(formatProjectLabel("60521", "Montere tavle")).toBe("60521 · Montere tavle");
  });

  it("'Nytt prosjekt' cannot create a Hub root economic project", () => {
    expect(drawer).toMatch(/TabsTrigger value="new" disabled/);
    expect(drawer).toMatch(/eventType === "project" && mode === "new"\) \{\s*toast\.error\(ECONOMIC_PROJECT_HINT\)/);
  });

  it("search mode heuristic", () => {
    expect(tripletexSearchBy("60521")).toBe("number");
    expect(tripletexSearchBy("959069743")).toBe("customer");
    expect(tripletexSearchBy("Caverion")).toBe("name");
  });
});
