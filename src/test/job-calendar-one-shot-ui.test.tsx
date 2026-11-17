import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JobCalendarOneShot } from "@/components/admin/JobCalendarOneShot";
import { ONE_SHOT } from "../../supabase/functions/_shared/job-calendar-one-shot";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoke-session", () => ({ invokeWithSession: invoke }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("mount and preflight never create; final explicit phrase and busy consent send exact frozen run", async () => {
  let consumed = false;
  invoke.mockImplementation(async (_name, { body }) => ({ error: null, data: body.action === "status" ? { consumed, runs: [] } : body.action === "preflight" ? { preview: { run_id: "frozen-run", payload_hash: "frozen-hash", expires_at: "2099-01-01", mailbox: ONE_SHOT.mailbox, local_time: "08:00–16:00 Europe/Oslo", approval: "pending", payload: { subject: "60570", body: { content: "Jobbinfo" } } } } : (consumed = true, { state: "succeeded" }) }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><JobCalendarOneShot /></QueryClientProvider>);
  const preflight = await screen.findByRole("button", { name: "Lesekontroll og forhåndsvisning" }); await waitFor(() => expect(preflight).not.toBeDisabled());
  expect(invoke.mock.calls.every(c => c[1].body.action === "status")).toBe(true);
  fireEvent.click(preflight); const create = await screen.findByRole("button", { name: "Opprett én avtale for Mats 19. november" }); expect(create).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Engangsbekreftelse" }), { target: { value: ONE_SHOT.phrase } }); expect(create).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox")); await waitFor(() => expect(create).not.toBeDisabled()); fireEvent.click(create);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("job-calendar-one-shot", { body: { action: "create", run_id: "frozen-run", payload_hash: "frozen-hash", confirm: ONE_SHOT.phrase, pending_busy_confirmed: true } }));
  expect(invoke.mock.calls.filter(c => c[1].body.action === "create")).toHaveLength(1);
});
it("read-only diagnosis never requests preflight, create or reconcile", async () => {
  invoke.mockImplementation(async (_name, { body }) => ({ error: null, data: body.action === "status" ? { consumed: false, runs: [] } : { diagnosis: { checked_count: 1, blocking_count: 1, same_hub_count: 0, non_busy_count: 1, policy: "all_overlaps_block_unchanged", conflicts: [{ classification: "free_overlap", local_overlap: "08:00–16:00", show_as: "free", event_type: "singleInstance", all_day: false, cancelled: false }] } } }));
  render(<QueryClientProvider client={new QueryClient()}><JobCalendarOneShot /></QueryClientProvider>);
  const button = await screen.findByRole("button", { name: "Undersøk kalenderkonflikt – kun lesing" });
  await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("job-calendar-one-shot", { body: { action: "diagnose" } }));
  expect(invoke.mock.calls.every(c => ["status", "diagnose"].includes(c[1].body.action))).toBe(true);
  expect(screen.queryByRole("button", { name: "Opprett én avtale for Mats 19. november" })).not.toBeInTheDocument();
});