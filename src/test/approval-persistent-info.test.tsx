import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: { user: { id: "isolated" } }, loading: false }) }));
vi.mock("@/lib/invoke-session", () => ({ invokeWithSession: invoke }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: async () => ({ data: { message: "Jobben er godkjent!" }, error: null }) } } }));
import ApprovalPage from "@/pages/ApprovalPage";
afterEach(() => { cleanup(); invoke.mockReset(); });
describe("Approval does not remove authenticated job entry", () => {
  it("keeps the same job target before and after approval", async () => {
    invoke.mockResolvedValue({ data: { path: "/job-info/isolated-job" }, error: null });
    render(<MemoryRouter initialEntries={["/approval/isolated?action=approve"]}><Routes><Route path="/approval/:token" element={<ApprovalPage />} /></Routes></MemoryRouter>);
    const link = await screen.findByRole("link", { name: "Åpne jobbinfo og vedlegg" });
    await vi.waitFor(() => expect(link).toHaveAttribute("href", "/job-info/isolated-job"));
    fireEvent.click(screen.getByRole("button", { name: "Bekreft godkjenning" }));
    await screen.findByText("Jobben er godkjent!");
    expect(screen.getByRole("link", { name: "Åpne jobbinfo og vedlegg" })).toHaveAttribute("href", "/job-info/isolated-job");
  });
  it("failed resolution never silently routes job-info action to Min dag", async () => {
    invoke.mockRejectedValueOnce(new Error("Failed to fetch"));
    invoke.mockResolvedValueOnce({ data: { path: "/job-info/isolated-job" }, error: null });
    render(<MemoryRouter initialEntries={["/approval/isolated?action=approve"]}><Routes><Route path="/approval/:token" element={<ApprovalPage />} /></Routes></MemoryRouter>);
    await screen.findByRole("alert");
    expect(screen.queryAllByRole("link").some(link => link.getAttribute("href") === "/my-day")).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Hent jobbinfo på nytt" }));
    await screen.findByRole("link", { name: "Åpne jobbinfo og vedlegg" });
    expect(invoke.mock.calls[1]).toEqual(["job-access", { body: { action: "resolve", token: "isolated" } }]);
  });
});