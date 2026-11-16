import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { RecipientDeliveryStatus } from "@/components/RecipientDeliveryStatus";
const invoke = vi.hoisted(() => vi.fn(async () => ({ data: { blocked: true }, error: null })));
vi.mock("@/lib/invoke-session", () => ({ invokeWithSession: invoke }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isSuperAdmin: true }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => ({ select: () => ({ eq: async () => ({ data: table === "m365_communication_queue" ? [] : [
  { technician_id: "a", channel: "email", status: "sent", delivery_state: "accepted_by_graph" },
  { technician_id: "b", channel: "calendar", status: "failed", reason_code: "no_ms_connection" },
] }) }) }) } }));
describe("Planner delivery view with no real requests", () => {
  it("retains the old personal failure without invoking the mail/calendar dispatcher", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><RecipientDeliveryStatus eventId="isolated" technicians={[{ id: "a", name: "Isolert A" }, { id: "b", name: "Isolert B" }]} /></QueryClientProvider></MemoryRouter>);
    await screen.findByText("E-post overlevert til Microsoft");
    expect(screen.getByText("Tidligere personlig kalenderforsøk feilet – manglet Microsoft-kobling")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prøv igjen" })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.queryByText("Alle montører har fått avtalen")).not.toBeInTheDocument();
  });
});