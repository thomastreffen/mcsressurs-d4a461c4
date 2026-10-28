import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InspectionResponsePreviewPage from "@/pages/compliance/InspectionResponsePreviewPage";
const m = vi.hoisted(() => ({ send: vi.fn(), finalize: vi.fn(), fail: vi.fn(), navigate: vi.fn(), pdf:vi.fn(), download:vi.fn() }));
vi.mock('@/lib/documentation/combined-pdf',async(importOriginal)=>({...await importOriginal<any>(),buildCombinedPdf:m.pdf}));
vi.mock('@/lib/dle/export',async(importOriginal)=>({...await importOriginal<any>(),deliverDleBlob:m.download}));
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
  URL.createObjectURL=vi.fn(()=> 'blob:pdf-preview');URL.revokeObjectURL=vi.fn();
  m.pdf.mockResolvedValue({name:'Svarpakke_63210.pdf',blob:new Blob(['PDF'],{type:'application/pdf'}),pageCount:4,chapters:[{title:'Funn 2 - Internrevisjon',page:3}],documents:[],warnings:[]});
  sessionStorage.setItem("mcs.response-draft.case", JSON.stringify({ finding_ids: ["f2"], attachment_keys: ["routine"], recipient_email: "dle@example.test", subject: "Sak 63210" }));
  m.finalize.mockResolvedValue({ id: "package" }); m.send.mockImplementation(async (_n: string, o: any) => ({ data: o?.body?.mode === "test_recipient" ? { ok: true, recipient: "thomas@mcsservice.no" } : { ok: true }, error: null }));
});
afterEach(cleanup);
const sends = () => m.send.mock.calls.filter((c: any[]) => c[1]?.body?.mode !== "test_recipient");
describe("Inspection preview user flow (isolated, no email)", () => {
  it('preview and default PDF download never finalize, send or change DLE status',async()=>{
    render(<InspectionResponsePreviewPage/>);fireEvent.click(await screen.findByRole('button',{name:'Forhåndsvis samlet PDF'}));await screen.findByText(/Svarpakke_63210.pdf/);
    fireEvent.click(screen.getByRole('button',{name:'Last ned svarpakke'}));await waitFor(()=>expect(m.download).toHaveBeenCalledTimes(1));
    expect(sends()).toHaveLength(0);expect(m.finalize).not.toHaveBeenCalled();expect(m.fail).not.toHaveBeenCalled();expect(m.pdf.mock.calls[0][0].caseNumber).toBe('63210');
  });
  it("renders the selected response and generated content without sending on load", async () => {
    render(<InspectionResponsePreviewPage />);
    await screen.findByText("Rutine og revisjon gjennomført");
    expect(screen.getByText(/Årlig gjennomgang/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send endelig svar" })).toBeDisabled();
    expect(sends()).toHaveLength(0); expect(m.finalize).not.toHaveBeenCalled();
  });
  it("requires preview confirmation and re-confirmation after changing the recipient", async () => {
    render(<InspectionResponsePreviewPage />);
    const confirm = await screen.findByRole("checkbox");
    fireEvent.click(confirm);
    expect(screen.getByRole("button", { name: "Send endelig svar" })).toBeEnabled();
    fireEvent.change(screen.getByDisplayValue("dle@example.test"), { target: { value: "other@example.test" } });
    expect(screen.getByRole("button", { name: "Send endelig svar" })).toBeDisabled();
    expect(sends()).toHaveLength(0);
  });
  it("only explicitly clicked final sending invokes the sender, preserving the previewed content", async () => {
    render(<InspectionResponsePreviewPage />);
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send endelig svar" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0][1].body).toMatchObject({ package_id: "package", confirm_send: true });
    expect(m.finalize.mock.calls[0][0].findings[0].response_text).toBe("Rutine og revisjon gjennomført");
  });
  it("reports failed sending and requires fresh confirmation before retry", async () => {
    m.send.mockImplementation(async (_n: string, o: any) => ({ data: o?.body?.mode === "test_recipient" ? { ok: true, recipient: "thomas@mcsservice.no" } : { ok: false, message: "Avvist" }, error: null }));
    render(<InspectionResponsePreviewPage />);
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send endelig svar" }));
    await waitFor(() => expect(m.fail).toHaveBeenCalledWith({ id: "package", error: "Avvist" }));
    expect(screen.getByRole("button", { name: "Send endelig svar" })).toBeDisabled();
  });
  it("test to me shows own address, sends test mode only, and never finalizes or confirms a package", async () => {
    render(<InspectionResponsePreviewPage />);
    expect(await screen.findByText("thomas@mcsservice.no")).toBeInTheDocument();
    expect(sends()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Send test til meg" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    const body = sends()[0][1].body;
    expect(body.mode).toBe("test"); expect(body.package_id).toBeUndefined(); expect(body.confirm_send).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("dle@example.test");
    expect(body.html).toContain("Rutine og revisjon gjennomført");
    expect(m.finalize).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send endelig svar" })).toBeDisabled();
  });
});
