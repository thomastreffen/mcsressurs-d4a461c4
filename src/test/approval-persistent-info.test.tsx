import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: { user: { id: "isolated" } }, loading: false }) }));
vi.mock("@/lib/invoke-session", () => ({ invokeWithSession: async () => ({ data: { path: "/job-info/isolated-job" }, error: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: async () => ({ data: { message: "Jobben er godkjent!" }, error: null }) } } }));
import ApprovalPage from "@/pages/ApprovalPage";
describe("Approval does not remove authenticated job entry", () => {
  it("keeps the same job target before and after approval", async () => {
    render(<MemoryRouter initialEntries={["/approval/isolated?action=approve"]}><Routes><Route path="/approval/:token" element={<ApprovalPage />} /></Routes></MemoryRouter>);
    const link = await screen.findByRole("link", { name: "Åpne jobbinfo og vedlegg" });
    await vi.waitFor(() => expect(link).toHaveAttribute("href", "/job-info/isolated-job"));
    fireEvent.click(screen.getByRole("button", { name: "Bekreft godkjenning" }));
    await screen.findByText("Jobben er godkjent!");
    expect(screen.getByRole("link", { name: "Åpne jobbinfo og vedlegg" })).toHaveAttribute("href", "/job-info/isolated-job");
  });
});