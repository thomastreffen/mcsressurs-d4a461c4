import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Finding } from "@/hooks/useInspections";
import { FindingResponseSection } from "@/components/compliance/FindingResponseSection";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), mutateAsync: vi.fn(), mutate: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "reviewer" } }) }));
vi.mock("@/hooks/useInspections", () => ({ useFindingMutations: () => ({ save: { mutateAsync: mocks.mutateAsync, mutate: mocks.mutate, isPending: false } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const finding = { id: "finding-2", inspection_id: "inspection", response_text: "Tidligere svar", response_approved_at: null } as Finding;
const suggestion = "Internkontrollen er gjennomgått. Referatet er vedlagt.";
const mount = () => render(<FindingResponseSection finding={finding} inspectionId="inspection" inspectionTitle={null} authorityName={null} actions={[]} evidence={[]} systemFacts={[]} canEdit />);
const generate = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Foreslå svartekst" }));
  await screen.findByRole("button", { name: "Bruk som svartekst" });
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.invoke.mockResolvedValue({ data: { ok: true, response_text: suggestion, missing_information: [] }, error: null });
  mocks.mutateAsync.mockResolvedValue(finding.id);
});
afterEach(cleanup);

describe("Applying an inspection response suggestion", () => {
  it("saves the full suggestion on the existing finding and clears approval only after success", async () => {
    mount(); await generate();
    fireEvent.click(screen.getByRole("button", { name: "Bruk som svartekst" }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(suggestion));
    expect(mocks.mutateAsync).toHaveBeenCalledExactlyOnceWith({ id: "finding-2", inspection_id: "inspection", response_text: suggestion, response_approved_at: null, response_approved_by: null });
    expect(screen.getByRole("status")).toBeVisible();
  });
  it("retains the original answer and suggestion while pending, preventing repeated saves", async () => {
    let finish: ((value: string) => void) | undefined;
    mocks.mutateAsync.mockImplementation(() => new Promise<string>((resolve) => { finish = resolve; }));
    mount(); await generate();
    fireEvent.click(screen.getByRole("button", { name: "Bruk som svartekst" }));
    expect(screen.getByRole("textbox")).toHaveValue("Tidligere svar");
    expect(screen.getByRole("button", { name: "Setter inn…" })).toBeDisabled();
    await act(async () => { finish?.(finding.id); });
    expect(screen.getByRole("textbox")).toHaveValue(suggestion);
  });
  it("keeps the suggestion and original answer on error and permits retry", async () => {
    mocks.mutateAsync.mockRejectedValueOnce(new Error("Lagringen feilet"));
    mount(); await generate();
    fireEvent.click(screen.getByRole("button", { name: "Bruk som svartekst" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toHaveValue("Tidligere svar");
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Bruk som svartekst" }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(suggestion));
  });
  it("does not offer an empty AI response for insertion", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, response_text: " " }, error: null });
    mount(); fireEvent.click(screen.getByRole("button", { name: "Foreslå svartekst" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Bruk som svartekst" })).toBeNull();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});