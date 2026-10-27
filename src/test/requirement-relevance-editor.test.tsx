import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequirementRelevanceEditor } from "@/components/compliance/RequirementRelevanceEditor";
import type { RequirementStatusRow } from "@/hooks/useComplianceRequirements";
const mock = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/hooks/useComplianceRequirements", () => ({ useAssessPersonRequirement: () => ({ mutateAsync: mock.save, isPending: false }) }));
const row = { person_id: "isolated-person", requirement_id: "existing-requirement", required: true, status: "missing" } as RequirementStatusRow;
beforeEach(() => { vi.clearAllMocks(); mock.save.mockResolvedValue("assessment"); });
afterEach(cleanup);
describe("Relevance assessment admin action", () => {
  it("requires a reason and writes only a person assessment with an idempotency key", async () => {
    render(<RequirementRelevanceEditor row={row} history={[]} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Vurder som ikke relevant" }));
    expect(screen.getByRole("button", { name: "Lagre vurdering" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Dokumentert rolle-/risikovurdering"), { target: { value: "Kontorrolle uten eksponering" } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre vurdering" }));
    await screen.findByRole("status");
    expect(mock.save).toHaveBeenCalledWith({ personId: "isolated-person", requirementId: "existing-requirement", reason: "Kontorrolle uten eksponering", validUntil: null, revokeId: undefined, clientRequestId: expect.any(String) });
  });
  it("revokes the assessment rather than deleting or changing the global requirement", async () => {
    render(<RequirementRelevanceEditor row={{ ...row, status: "not_relevant", assessment_id: "assessment" }} history={[]} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Opphev vurdering" }));
    fireEvent.change(screen.getByLabelText("Begrunnelse for oppheving"), { target: { value: "Rollen er endret" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Opphev vurdering" })[0]);
    await screen.findByRole("status");
    expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({ revokeId: "assessment", reason: "Rollen er endret" }));
  });
  it("retains the form after an error for retry", async () => {
    mock.save.mockRejectedValueOnce(new Error("Tilgang avvist"));
    render(<RequirementRelevanceEditor row={row} history={[]} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Vurder som ikke relevant" }));
    fireEvent.change(screen.getByLabelText("Dokumentert rolle-/risikovurdering"), { target: { value: "Vurdering" } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre vurdering" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Lagre vurdering" }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledTimes(2));
    expect(mock.save.mock.calls[0][0].clientRequestId).toBe(mock.save.mock.calls[1][0].clientRequestId);
  });
  it("does not offer assessment controls to technicians/read-only users", () => {
    render(<RequirementRelevanceEditor row={row} history={[]} canManage={false} />);
    expect(screen.queryByRole("button", { name: "Vurder som ikke relevant" })).toBeNull();
    expect(mock.save).not.toHaveBeenCalled();
  });
});