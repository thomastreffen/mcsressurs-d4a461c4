import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { RecipientDeliveryStatus } from "@/components/RecipientDeliveryStatus";
const invoke = vi.hoisted(() => vi.fn(async () => ({ data: { blocked: true }, error: null })));
vi.mock("@/lib/invoke-session", () => ({ invokeWithSession: invoke }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => ({ select: () => ({ eq: async () => ({ data: table === "m365_communication_queue" ? [] : [
  { technician_id: "a", channel: "email", status: "sent", delivery_state: "accepted_by_graph" },
  { technician_id: "b", channel: "calendar", status: "failed", reason_code: "no_ms_connection" },
] }) }) }) } }));
describe("Planner delivery view with no real requests", () => {
  it("shows partial failure and a blocked retry without claiming receipt", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><RecipientDeliveryStatus eventId="isolated" technicians={[{ id: "a", name: "Isolert A" }, { id: "b", name: "Isolert B" }]} /></QueryClientProvider>);
    await screen.findByText("E-post overlevert til Microsoft");
    expect(screen.getByText("Utsending feilet for én eller flere montører")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("m365-dispatch", { body: { event_id: "isolated" } }));
    expect(screen.queryByText("Alle montører har fått avtalen")).not.toBeInTheDocument();
  });
});