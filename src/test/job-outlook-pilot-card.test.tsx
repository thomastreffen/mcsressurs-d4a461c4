import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JobOutlookPilotScopeCard } from "@/components/admin/JobOutlookPilotScopeCard";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/invoke-session", () => ({ invokeWithSession: mocks.invoke }));
const target = { id: "target", work_date: "2026-11-19", technician_name: "Mats", job: { title: "Majorstua" }, expires_at: "2099-01-01", revoked_at: null };
beforeEach(() => { vi.clearAllMocks(); mocks.invoke.mockImplementation(async (_name, { body }) => ({ error: null, data: body.action === "status" ? { targets: [target], held_queue: [{ id: "old", job: { title: "60570" }, technician_name: "Mats" }], settings: { enabled: false, dry_run: true, pilot_mailboxes: [], scope_verified: false } } : { result: { pass: true, http: 200 } } })); });
afterEach(cleanup);
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><JobOutlookPilotScopeCard /></QueryClientProvider>);
describe("pilot actions remain read-only preparation", () => {
  it("never creates a target or releases old queue on mount", async () => {
    mount(); await screen.findByRole("button", { name: "Lesetest kalender" });
    expect(mocks.invoke.mock.calls.every(c => c[1].body.action === "status")).toBe(true);
  });
  it("blocks simulation until target-specific mailbox test succeeds", async () => {
    mount(); expect(await screen.findByRole("button", { name: "Simuler" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Lesetest kalender" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("job-outlook-app-pilot", { body: { action: "probe_mailbox", target_id: "target" } }));
    expect(mocks.invoke.mock.calls.some(c => c[1].body.action === "simulate" || c[1].body.action === "release_queue" || c[1].body.action === "add_target")).toBe(false);
  });
});