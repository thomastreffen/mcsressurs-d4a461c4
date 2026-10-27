import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { FindingEvidencePanel } from "@/components/compliance/FindingEvidencePanel";

const mock = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/hooks/useCompanyContext", () => ({ useCompanyContext: () => ({ activeCompany: { id: "service", name: "MCS Service AS" }, activeCompanyId: null }) }));
vi.mock("@/hooks/useInspections", () => ({
  useInspection: () => ({ data: { company_id: "service" } }),
  useInspectionActions: () => ({ data: [] }),
  useEvidenceMutations: () => ({ add: { mutateAsync: mock.save, isPending: false }, remove: { mutate: vi.fn() } }),
}));
vi.mock("@/hooks/useCompliance", () => ({
  useCompetenceTypes: () => ({ data: [] }), useRegulations: () => ({ data: [] }),
  useComplianceAudits: () => ({ data: [] }), useComplianceEmployees: () => ({ data: [] }), useCompetences: () => ({ data: [] }),
  useOrgRoles: () => ({ data: [{ id: "leader", title: "Daglig leder", is_active: true, sort_order: 0 }], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useEvidenceCoverage", () => ({ useEvidenceCoverage: () => ({ coverageFor: () => null }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const mount = () => render(<MemoryRouter><FindingEvidencePanel inspectionId="c3d2253a-70ef-481b-9384-5d26a3c20206" findingId="2c09b10f-947d-4bf1-b8fe-d4dc11f0105d" evidence={[]} canEdit /></MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); mock.save.mockResolvedValue(undefined); });
afterEach(cleanup);
describe("Link organization overview without writing production data", () => {
  it("links exactly one company-register reference on finding 1, without role copies", async () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Koble organisasjonsoversikt" }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledExactlyOnceWith({ inspection_id: "c3d2253a-70ef-481b-9384-5d26a3c20206", finding_id: "2c09b10f-947d-4bf1-b8fe-d4dc11f0105d", source_kind: "organization_overview", ref_id: "service", label: "Organisasjonsoversikt – MCS Service AS", note: null }));
    await waitFor(() => expect(screen.getByRole("status")).toBeVisible());
    expect(screen.getByRole("button", { name: "Organisasjonsoversikt koblet" })).toBeDisabled();
  });
  it("prevents duplicate clicks while saving", async () => {
    let finish: (() => void) | undefined;
    mock.save.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Koble organisasjonsoversikt" }));
    expect(screen.getByRole("button", { name: "Kobler organisasjonsoversikt…" })).toBeDisabled();
    await act(async () => finish?.());
    expect(mock.save).toHaveBeenCalledTimes(1);
  });
  it("shows a failed save and permits a retry without changing finding state", async () => {
    mock.save.mockRejectedValueOnce(new Error("Tilgang avvist"));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Koble organisasjonsoversikt" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Koble organisasjonsoversikt" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Koble organisasjonsoversikt" }));
    await screen.findByRole("status");
    expect(mock.save).toHaveBeenCalledTimes(2);
  });
});