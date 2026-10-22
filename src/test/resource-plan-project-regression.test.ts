import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke } } }));
import { searchHubPlanningProjects, fetchTripletexPlanningContext, canCreateHubRoot, preparePlanningCreation, requiresPlanningParent } from "@/lib/resource-plan-projects";
import { mergeProjectResults, rowLabel } from "@/lib/project-picker";
vi.mock("@/lib/invoke-session", () => ({ invokeWithSession: (...args: any[]) => invoke(...args) }));
import { checkParentOpenForNewJob } from "@/lib/parent-open-gate";

beforeEach(() => { rpc.mockReset(); invoke.mockReset(); });
const creationInput = { title: "  Ny jobb  ", date: "2026-11-09", techIds: ["emil", "marcus", "mats"], repeatEnabled: true, repeatDates: [new Date(2026, 10, 10), new Date(2026, 10, 11)] };

describe("Canonical planning creation state", () => {
  it("accepts 9 November plus 10/11 November and all three selected technicians", () => {
    expect(preparePlanningCreation(creationInput, true, true)).toEqual({ title: "Ny jobb", date: "2026-11-09", techIds: ["emil", "marcus", "mats"], dates: ["2026-11-09", "2026-11-10", "2026-11-11"], missingField: null });
  });
  it("identifies only the missing title when dates and technicians are selected", () => {
    expect(preparePlanningCreation({ ...creationInput, title: "  " }, true, true).missingField).toBe("title");
  });
  it("requires the primary date even when repeat dates exist", () => {
    expect(preparePlanningCreation({ ...creationInput, date: "" }, true, true).missingField).toBe("date");
  });
  it("requires a technician for projects", () => {
    expect(preparePlanningCreation({ ...creationInput, techIds: [] }, true, true).missingField).toBe("technicians");
  });
  it("preserves optional technicians for internal tasks", () => {
    expect(preparePlanningCreation({ ...creationInput, techIds: [] }, true, false).missingField).toBeNull();
  });
  it("ignores disabled repeats and deduplicates selected dates and technicians", () => {
    expect(preparePlanningCreation({ ...creationInput, repeatEnabled: false }, true, true).dates).toEqual(["2026-11-09"]);
    const result = preparePlanningCreation({ ...creationInput, techIds: ["emil", "emil", "marcus", "mats"], repeatDates: [...creationInput.repeatDates, new Date(2026, 10, 9)] }, true, true);
    expect(result.techIds).toEqual(["emil", "marcus", "mats"]);
    expect(result.dates).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
  });
});
const legacy = { event_id: "hub-60374", project_number: "60374", title: "Hmv30", customer: "Kunde", tripletex_project_id: null };

describe("Additive Tripletex resource planning", () => {
  it("60374 is returned from the company-scoped base search and remains selectable Hub-only", async () => {
    rpc.mockResolvedValueOnce({ data: [legacy], error: null });
    const rows = mergeProjectResults(await searchHubPlanningProjects("service", "60374"), []);
    expect(rpc).toHaveBeenCalledWith("search_resource_plan_projects", { _company_id: "service", _q: "60374" });
    expect(rows[0]).toMatchObject({ source: "hub", eventId: "hub-60374", linked: false });
    expect(rowLabel(rows[0])).toBe("60374 · Hmv30");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("unlinked parent is approved for child work without a Tripletex call", async () => {
    rpc.mockResolvedValueOnce({ data: [{ event_id: "hub-60374", linked: false }], error: null });
    expect(await checkParentOpenForNewJob("hub-60374", "service")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("resource_plan_parent_context", { _event_id: "hub-60374", _company_id: "service" });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("linked parent without a visible project number still requires a fresh open status", async () => {
    rpc.mockResolvedValueOnce({ data: [{ event_id: "linked", linked: true }], error: null });
    invoke.mockResolvedValueOnce({ data: { status: "open" }, error: null });
    expect((await checkParentOpenForNewJob("linked", "service")).ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith("tripletex-import", { body: { action: "project_open_status", company_id: "service", event_id: "linked" } });
  });
  it("linked read errors fail closed", async () => {
    rpc.mockResolvedValueOnce({ data: [{ event_id: "linked", linked: true }], error: null });
    invoke.mockResolvedValueOnce({ error: new Error("read error") });
    expect((await checkParentOpenForNewJob("linked", "service")).ok).toBe(false);
  });
  it("cross-company or invisible parents are blocked before Tripletex", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect((await checkParentOpenForNewJob("hub-60374", "busbar")).ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("link lookup errors cannot be misinterpreted as Hub-only", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error("denied") });
    expect((await checkParentOpenForNewJob("linked", "service")).ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("same name and number keep unlinked Hub and Tripletex projects independent", () => {
    const rows = mergeProjectResults([legacy], [{ id: 74, number: "60374", name: "Hmv30", isClosed: false }]);
    expect(rows.map((r) => r.key)).toEqual(["hub:hub-60374", "tt:74"]);
    expect(rows[0]).toMatchObject({ linked: false });
  });
  it("linked rows dedupe only on stable Tripletex ID", () => {
    const rows = mergeProjectResults([{ ...legacy, tripletex_project_id: 74 }], [{ id: 74, number: "60374", name: "Hmv30", isClosed: false }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ linked: true });
    expect(rowLabel(rows[0])).toBe("Prosjektnr. 60374 · Hmv30");
  });
  it("BusBar without integration can search and create Hub roots", async () => {
    rpc.mockResolvedValueOnce({ data: [{ economic_project_master: false, test_search_enabled: false }], error: null });
    const context = await fetchTripletexPlanningContext("busbar");
    expect(canCreateHubRoot(context)).toBe(true);
    expect(context.test_search_enabled).toBe(false);
    rpc.mockResolvedValueOnce({ data: [legacy], error: null });
    expect(await searchHubPlanningProjects("busbar", "60374")).toEqual([legacy]);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("demo/test search remains optional and never blocks Hub root creation", async () => {
    rpc.mockResolvedValueOnce({ data: [{ economic_project_master: false, test_search_enabled: true }], error: null });
    const context = await fetchTripletexPlanningContext("service");
    expect(canCreateHubRoot(context)).toBe(true);
    expect(context.test_search_enabled).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("active production economic integration blocks Hub-only root creation", () => {
    expect(canCreateHubRoot({ economic_project_master: true, test_search_enabled: true })).toBe(false);
  });
  it("existing mode without a selected project blocks before root creation", () => {
    expect(requiresPlanningParent(false, "existing", null)).toBe(true);
    expect(requiresPlanningParent(false, "existing", "project")).toBe(false);
    expect(requiresPlanningParent(false, "new", null)).toBe(false);
    expect(requiresPlanningParent(true, "existing", null)).toBe(false);
  });
  it("unknown company configuration cannot authorize root creation", () => {
    expect(canCreateHubRoot(null)).toBe(false);
  });
});