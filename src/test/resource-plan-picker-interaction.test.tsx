import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke } } }));
import { UnifiedProjectPicker } from "@/components/resource-plan/UnifiedProjectPicker";

beforeEach(() => { rpc.mockReset(); invoke.mockReset(); });
afterEach(cleanup);
const hub = { event_id: "60374-parent", project_number: "60374", title: "Hmv30", customer: "Eda", tripletex_project_id: null };

describe("Project picker user selections", () => {
  it("separates Test1 linked, Test2 import and matching Hub-only rows without rendering internal IDs", async () => {
    rpc.mockResolvedValue({ data: [
      { event_id: "linked", project_number: "1", title: "Test1", customer: "Kunde", tripletex_project_id: 98123456 },
      { ...hub, project_number: "2", title: "Test 2" },
    ], error: null });
    invoke.mockResolvedValue({ data: { results: [
      { id: 98123456, number: "1", name: "Test1", isClosed: false, linked_event_id: "linked" },
      { id: 98765432, number: "2", name: "Test 2", isClosed: false },
    ] }, error: null });
    render(<UnifiedProjectPicker companyId="service" canUseTripletex onSelected={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Søk prosjektnr., navn, kunde eller org.nr."), { target: { value: "test" } });
    const economic = await screen.findByRole("region", { name: "Økonomiske prosjekter" });
    const other = screen.getByRole("region", { name: "Andre Hub-prosjekter" });
    expect(within(economic).getAllByRole("button")).toHaveLength(2);
    expect(within(economic).getByRole("button", { name: /Prosjektnr. 1 · Test1.*Koblet til Tripletex/ })).toBeEnabled();
    expect(within(economic).getByRole("button", { name: /Prosjektnr. 2 · Test 2.*Tripletex TEST · hent inn/ })).toBeEnabled();
    expect(within(other).getByRole("button", { name: /2 · Test 2.*Hub-only · ikke koblet/ })).toBeEnabled();
    expect(economic.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/98123456|98765432/)).not.toBeInTheDocument();
  });
  it("Hub-only JOB reference remains selectable and explicitly unlinked", async () => {
    rpc.mockResolvedValue({ data: [{ ...hub, project_number: null, internal_number: "JOB-000001", title: "Arbeid" }], error: null });
    render(<UnifiedProjectPicker companyId="busbar" canUseTripletex={false} onSelected={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /JOB-000001 · Arbeid.*Hub-only · ikke koblet/ })).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Økonomiske prosjekter" })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
  it("closed linked project is visibly blocked while its save guard remains independent", async () => {
    rpc.mockResolvedValue({ data: [{ ...hub, tripletex_project_id: 777 }], error: null });
    invoke.mockResolvedValue({ data: { results: [{ id: 777, number: "60374", name: "Hmv30", isClosed: true }] }, error: null });
    const select = vi.fn();
    render(<UnifiedProjectPicker companyId="service" canUseTripletex onSelected={select} />);
    fireEvent.change(screen.getByPlaceholderText("Søk prosjektnr., navn, kunde eller org.nr."), { target: { value: "60374" } });
    const row = await screen.findByRole("button", { name: /Avsluttet i Tripletex/ });
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(select).not.toHaveBeenCalled();
  });
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