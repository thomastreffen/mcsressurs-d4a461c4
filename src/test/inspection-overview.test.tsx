import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import InspectionsPage from "@/pages/compliance/InspectionsPage";
import { summarizeInspection } from "@/lib/inspection-summary";

const state = vi.hoisted(() => ({ summary: {} as Record<string, unknown>, isLoading: false }));
const inspection = { id: "case", title: "Revisjon av virksomheten", company_id: "company", inspection_type: "dle", status: "actions_in_progress", case_number: "63210", responsible_person_id: null, response_deadline: "2026-11-08" };
vi.mock("@/hooks/useInspections", () => ({
  useInspections: () => ({ data: [inspection], isLoading: false }),
  useInspectionSummaries: () => ({ data: state.summary, isLoading: state.isLoading, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/useCompliance", () => ({ useComplianceEmployees: () => ({ data: [] }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: false, isSuperAdmin: false }) }));
vi.mock("@/components/LocalExportMenu", () => ({ LocalExportMenu: () => null }));
afterEach(cleanup);

describe("overview consumes shared summaries", () => {
  it("keeps a mixed case active and uses the same finding counts as the shared projection", () => {
    state.isLoading = false;
    const findings = [{ id: "r", inspection_id: "case", status: "documentation_ready" }, { id: "o", inspection_id: "case", status: "new" }];
    state.summary = { case: summarizeInspection(inspection, findings, [], [{ id: "e", finding_id: "r", inspection_id: "case" }]) };
    render(<MemoryRouter><InspectionsPage /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /Revisjon av virksomheten/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Historikk" }));
    expect(screen.queryByRole("button", { name: /Revisjon av virksomheten/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aktive" }));
    expect(screen.getByRole("button", { name: /Revisjon av virksomheten/ })).toBeEnabled();
  });
  it("moves a fully submitted case to history despite stale case raw status", () => {
    state.summary = { case: summarizeInspection(inspection, [{ id: "s", inspection_id: "case", status: "submitted" }], [], []) };
    render(<MemoryRouter><InspectionsPage /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /Revisjon av virksomheten/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Historikk" }));
    expect(screen.getByRole("button", { name: /Revisjon av virksomheten/ })).toBeEnabled();
  });
  it("does not present uncalculated source data as zero findings", () => {
    state.isLoading = true;
    state.summary = {};
    render(<MemoryRouter><InspectionsPage /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /Revisjon av virksomheten/ })).toBeNull();
    state.isLoading = false;
  });
});