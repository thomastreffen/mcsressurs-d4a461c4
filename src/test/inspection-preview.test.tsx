import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InspectionResponsePreviewPage from "@/pages/compliance/InspectionResponsePreviewPage";
const m = vi.hoisted(() => ({ send: vi.fn(), finalize: vi.fn(), fail: vi.fn(), navigate: vi.fn() }));
vi.mock("react-router-dom", () => ({ useParams: () => ({ id: "case" }), useNavigate: () => m.navigate }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isSuperAdmin: true }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true }) }));
vi.mock("@/hooks/useCompanyContext", () => ({ useCompanyContext: () => ({ activeCompany: { id: "service", name: "MCS Service AS" } }) }));
vi.mock("@/components/compliance/DleExportPanel", () => ({ DleExportPanel: () => null }));
vi.mock("@/lib/invoke-session", () => ({ invokeWithSession: m.send }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useInspections", () => ({
  useInspection: () => ({ data: { title: "DLE 63210", case_number: "63210", contact_email: "dle@example.test" } }),
  useFindings: () => ({ data: [{ id: "f2", finding_number: 2, title: "Internrevisjon", response_text: "Rutine og revisjon gjennomført" }] }),
  useFindingEvidence: () => ({ data: [] }), useInspectionActions: () => ({ data: [] }),
}));
vi.mock("@/hooks/useResponsePackages", () => ({
  useAttachmentCandidates: () => ({ candidates: [{ key: "routine", finding_id: "f2", kind: "generated", title: "Rutine", generated: { rows: [["Kontrollpunkt"], ["Årlig gjennomgang"]] } }], loading: false }),
  useCompetenceCoverageDetails: () => ({ detailFor: () => null }),
  buildPreflight: () => [{ finding_id: "f2", overall: "ready", checks: [] }],
  useResponsePackageMutations: () => ({ finalize: { mutateAsync: m.finalize }, markSendFailed: { mutateAsync: m.fail } }),
}));
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  sessionStorage.setItem("mcs.response-draft.case", JSON.stringify({ finding_ids: ["f2"], attachment_keys: ["routine"], recipient_email: "dle@example.test", subject: "Sak 63210" }));
  m.finalize.mockResolvedValue({ id: "package" }); m.send.mockResolvedValue({ data: { ok: true }, error: null });
});
afterEach(cleanup);
describe("Inspection preview user flow (isolated, no email)", () => {
  it("renders the selected response and generated content without sending on load", async () => {
    render(<InspectionResponsePreviewPage />);
    await screen.findByText("Rutine og revisjon gjennomført");
    expect(screen.getByText(/Årlig gjennomgang/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send endelig svar" })).toBeDisabled();
    expect(m.send).not.toHaveBeenCalled(); expect(m.finalize).not.toHaveBeenCalled();
  });
  it("requires preview confirmation and re-confirmation after changing the recipient", async () => {
    render(<InspectionResponsePreviewPage />);
    const confirm = await screen.findByRole("checkbox");
    fireEvent.click(confirm);
    expect(screen.getByRole("button", { name: "Send endelig svar" })).toBeEnabled();
    fireEvent.change(screen.getByDisplayValue("dle@example.test"), { target: { value: "other@example.test" } });
    expect(screen.getByRole("button", { name: "Send endelig svar" })).toBeDisabled();
    expect(m.send).not.toHaveBeenCalled();
  });
  it("only explicitly clicked final sending invokes the sender, preserving the previewed content", async () => {
    render(<InspectionResponsePreviewPage />);
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send endelig svar" }));
    await waitFor(() => expect(m.send).toHaveBeenCalledTimes(1));
    expect(m.send.mock.calls[0][1].body).toMatchObject({ package_id: "package", confirm_send: true });
    expect(m.finalize.mock.calls[0][0].findings[0].response_text).toBe("Rutine og revisjon gjennomført");
  });
  it("reports failed sending and requires fresh confirmation before retry", async () => {
    m.send.mockResolvedValue({ data: { ok: false, message: "Avvist" }, error: null });
    render(<InspectionResponsePreviewPage />);
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send endelig svar" }));
    await waitFor(() => expect(m.fail).toHaveBeenCalledWith({ id: "package", error: "Avvist" }));
    expect(screen.getByRole("button", { name: "Send endelig svar" })).toBeDisabled();
  });
});