import { describe, expect, it } from "vitest";
import { summarizeInspection } from "@/lib/inspection-summary";
import type { SummaryFinding, SummaryAction } from "@/lib/inspection-summary";

const inspection = { id: "case", status: "actions_in_progress" };
const completed = {
  responsible_person_id: "person", response_approved_at: "2026-10-27",
  condition_corrected_at: "2026-10-27", documentation_complete_at: "2026-10-27",
  documentation_status: "complete",
};
const finding = (id: string, status = "new", patch: Partial<SummaryFinding> = {}): SummaryFinding => ({ id, inspection_id: "case", status, ...patch });
const action = (id: string, patch: Partial<SummaryAction> = {}): SummaryAction => ({ id, status: "open", compliance_inspection_id: "case", compliance_finding_id: null, ...patch });

describe("shared inspection summary (read-only)", () => {
  it("counts mixed ready, under-work and open findings from treatment rather than raw status", () => {
    const rows = [finding("r1", "new", completed), finding("r2", "documentation_ready"),
      finding("p1", "actions_in_progress"), finding("p2", "new", { responsible_person_id: "person" }),
      finding("p3", "under_review"), finding("o1"), finding("o2")];
    const evidence = ["r1", "r2", "p1", "p2"].map((id, n) => ({ id: `e${n}`, inspection_id: "case", finding_id: id }));
    const result = summarizeInspection(inspection, rows, [], evidence);
    expect(result.counts).toEqual({ ready: 2, in_progress: 3, open: 2, submitted: 0, closed: 0 });
    expect(result.internallyFinished).toBe(2);
    expect(result.status).toBe("in_progress");
    expect(result.evidenceCount).toBe(4);
    expect(result.documentedFindings).toBe(4);
  });
  it("uses live documentation to recognize complete treatment even if persisted documentation is none", () => {
    const result = summarizeInspection(inspection, [finding("r", "new", { ...completed, documentation_status: "none" })], [], [], { r: "complete" });
    expect(result.counts.ready).toBe(1);
    expect(result.status).toBe("ready");
  });
  it("live evidence gaps prevent inferred readiness for new findings", () => {
    const result = summarizeInspection(inspection, [finding("r", "new", completed)], [], [], { r: "gaps" });
    expect(result.counts.in_progress).toBe(1);
    expect(result.counts.ready).toBe(0);
  });
  it("does not call the whole case ready while any real finding remains open", () => {
    expect(summarizeInspection(inspection, [finding("r", "documentation_ready"), finding("o")], [], []).status).toBe("in_progress");
  });
  it("only counts real open actions linked to this case or active findings, once", () => {
    const a = action("direct");
    const result = summarizeInspection(inspection, [finding("f")], [a, a,
      action("finding-only", { compliance_inspection_id: null, compliance_finding_id: "f", status: "in_progress" }),
      action("completed", { status: "completed" }), action("stale-complete", { completed_at: "2026-10-27" }),
      action("cancelled", { status: "cancelled" }), action("deleted", { deleted_at: "2026-10-27" }),
      action("irrelevant", { compliance_finding_id: "other" }), action("other-case", { compliance_inspection_id: "other" }),
    ], []);
    expect(result.openActions).toBe(2);
  });
  it("does not fabricate readiness when an actual case-level action remains open", () => {
    const result = summarizeInspection(inspection, [finding("r", "documentation_ready")], [action("a")], []);
    expect(result.counts.ready).toBe(1);
    expect(result.status).toBe("in_progress");
  });
  it("counts case evidence without suggesting it covers every finding", () => {
    const e = { id: "e", inspection_id: "case", finding_id: "f" };
    const result = summarizeInspection(inspection, [finding("f"), finding("g")], [], [e, e,
      { id: "report", inspection_id: "case", finding_id: null },
      { id: "other", inspection_id: "other", finding_id: "f" },
      { id: "deleted-finding", inspection_id: "case", finding_id: "removed" }]);
    expect(result.evidenceCount).toBe(2);
    expect(result.documentedFindings).toBe(1);
    expect(result.counts.open).toBe(2); // documentation does not approve treatment
  });
  it("all submitted/approved findings show submitted without auto-closing", () => {
    const result = summarizeInspection(inspection, [finding("s", "submitted"), finding("c", "approved")], [], []);
    expect(result.internallyFinished).toBe(2);
    expect(result.status).toBe("submitted");
    expect(result.active).toBe(false);
    expect(result.deadlineRelevant).toBe(false);
    expect(inspection.status).toBe("actions_in_progress");
  });
  it("partial sending does not hide remaining work", () => {
    expect(summarizeInspection({ ...inspection, status: "submitted" }, [finding("s", "submitted"), finding("o")], [], []).status).toBe("in_progress");
  });
  it("formal closure is preserved but not invented by completed findings", () => {
    expect(summarizeInspection(inspection, [finding("c", "approved")], [], []).status).toBe("submitted");
    expect(summarizeInspection({ ...inspection, status: "closed" }, [finding("c", "approved")], [], []).status).toBe("closed");
  });
  it("keeps planned lifecycle for empty cases, not ready", () => {
    expect(summarizeInspection({ ...inspection, status: "planned" }, [], [], []).status).toBe("planned");
  });
  it("ignores deleted and other-case findings", () => {
    const result = summarizeInspection(inspection, [finding("f"), finding("removed", "documentation_ready", { deleted_at: "2026-10-27" }), finding("other", "documentation_ready", { inspection_id: "other" })], [], []);
    expect(result.findings).toBe(1);
    expect(result.counts.open).toBe(1);
  });
});