import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke } } }));
import { UnifiedProjectPicker } from "@/components/resource-plan/UnifiedProjectPicker";

beforeEach(() => { rpc.mockReset(); invoke.mockReset(); });
afterEach(cleanup);
const hub = { event_id: "60374-parent", project_number: "60374", title: "Hmv30", customer: "Eda", tripletex_project_id: null };

describe("Project picker user selections", () => {
  it("selects an unlinked Hub parent without an import or Tripletex call", async () => {
    rpc.mockResolvedValue({ data: [hub], error: null });
    const select = vi.fn();
    render(<UnifiedProjectPicker companyId="busbar" canUseTripletex={false} onSelected={select} />);
    fireEvent.change(screen.getByPlaceholderText("Søk prosjektnr., navn, kunde eller org.nr."), { target: { value: "60374" } });
    fireEvent.click(await screen.findByRole("button", { name: /60374 · Hmv30/ }));
    expect(select).toHaveBeenCalledWith({ eventId: "60374-parent", label: "60374 · Hmv30", customer: "Eda" });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("Tripletex-only selection uses canonical preview and import before choosing parent", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    invoke.mockImplementation(async (_name, { body }) => {
      if (body.action === "search") return { data: { results: [{ id: 777, number: "60521", name: "Tavle", isClosed: false, customer: { name: "Kunde" } }] }, error: null };
      if (body.action === "preview") return { data: { customer_decision: "linked", hub_customer: { id: "customer", name: "Kunde" }, project: { isClosed: false }, linked_event_id: null }, error: null };
      return { data: { result: "imported", event_id: "imported-parent" }, error: null };
    });
    const select = vi.fn();
    render(<UnifiedProjectPicker companyId="service" canUseTripletex={true} onSelected={select} />);
    fireEvent.change(screen.getByPlaceholderText("Søk prosjektnr., navn, kunde eller org.nr."), { target: { value: "60521" } });
    fireEvent.click(await screen.findByRole("button", { name: /60521 · Tavle/ }));
    const confirm = await screen.findByRole("button", { name: "Hent inn og velg" });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(select).toHaveBeenCalledWith({ eventId: "imported-parent", label: "Prosjektnr. 60521 · Tavle", customer: "Kunde" }));
    expect(invoke).toHaveBeenCalledWith("tripletex-import", { body: { action: "import", company_id: "service", tripletex_project_id: 777, confirm_customer_id: null } });
  });
});