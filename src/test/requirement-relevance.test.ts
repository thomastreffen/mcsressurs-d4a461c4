import { describe, expect, it } from "vitest";
import { assessmentStatus, competenceOverviewRows, needsCompetenceNotification, summarizeRequirements } from "@/lib/requirement-relevance";
import { requirementOverallTone } from "@/lib/compliance";
import { deriveDocumentationStatus } from "@/hooks/useEvidenceCoverage";
import { buildPreflight, type CompetenceCoverageDetail } from "@/hooks/useResponsePackages";
import { systemCheckForFinding } from "@/lib/finding-workflow";
import type { Finding, FindingEvidence } from "@/hooks/useInspections";

const assessment = { reason: "Dokumentert kontorrolle uten aktuell eksponering", valid_until: "2026-10-27", revoked: false, contextMatches: true };
describe("Individual requirement relevance", () => {
  it("does not exempt Rune's FSE/first aid without an assessment", () => {
    expect(assessmentStatus("missing", null, "2026-10-27")).toBe("missing");
    expect(assessmentStatus("missing_document", null, "2026-10-27")).toBe("missing_document");
  });
  it("keeps a valid assessment distinct from fulfilled training", () => {
    expect(assessmentStatus("missing", assessment, "2026-10-27")).toBe("not_relevant");
    expect(requirementOverallTone(["not_relevant"])).toBe("neutral");
  });
  it("restores missing status when revoked", () => expect(assessmentStatus("missing", { ...assessment, revoked: true }, "2026-10-27")).toBe("missing"));
  it("restores missing status after expiry", () => expect(assessmentStatus("missing", assessment, "2026-10-28")).toBe("missing"));
  it("requires a fresh assessment after role or requirement changes", () => expect(assessmentStatus("missing", { ...assessment, contextMatches: false }, "2026-10-27")).toBe("missing"));
  it("does not notify for a valid non-relevant assessment but does after revocation", () => {
    expect(needsCompetenceNotification("not_relevant")).toBe(false);
    expect(needsCompetenceNotification(assessmentStatus("missing", { ...assessment, revoked: true }, "2026-10-27"))).toBe(true);
  });
  it("does not count individual exemptions as trained people or gaps", () => expect(summarizeRequirements([{ status: "fulfilled" }, { status: "not_relevant" }, { status: "missing" }])).toEqual({ total: 2, ok: 1, warn: 0, gaps: 1, notRelevant: 1 }));
  it("exports reason, assessor, timestamp and review date, never a course certificate", () => {
    const rows = competenceOverviewRows([{ name: "Person", status: "not_relevant", has_document: false, expires_at: "2025-01-01", assessment_reason: assessment.reason, assessor_name: "Leder", assessed_at: "2026-10-27T12:00:00Z", assessment_valid_until: "2026-10-27" }], () => "Ikke relevant");
    expect(rows[1]).toEqual(["Person", "Ikke relevant", "", "Individuell vurdering – ikke kursbevis", assessment.reason, "Leder", "2026-10-27T12:00:00Z", "2026-10-27"]);
  });
  it("accepts documented assessments in coverage and package preflight without invented training", () => {
    const evidence = { id: "e", finding_id: "f", source_kind: "competence_requirement", competence_type_id: "fse" } as FindingEvidence;
    const coverage = { total: 0, ok: 0, warn: 0, gaps: 0, notRelevant: 1, gapNames: [], warnNames: [] };
    expect(deriveDocumentationStatus([evidence], () => coverage)).toBe("complete");
    const detail: CompetenceCoverageDetail = { ...coverage, competence_type_id: "fse", competence_type_name: "FSE", people: [{ person_id: "p", name: "Person", status: "not_relevant", expires_at: null, has_document: false, document_id: null }] };
    const result = buildPreflight({ findings: [{ id: "f", response_text: "Dokumentert vurdering", internal_assessment: "Kontrollert", responsible_person_id: "reviewer", response_approved_at: "2026-10-27", condition_corrected_at: "2026-10-27", documentation_complete_at: "2026-10-27", documentation_status: "complete", status: "documentation_ready" } as Finding], evidence: [evidence], actions: [], candidates: [{ key: "c", finding_id: "f", kind: "generated" } as any], selectedAttachmentKeys: new Set(["c"]), detailFor: () => detail });
    expect(result[0].checks.filter(c => c.tone === "alert")).toEqual([]);
    expect(result[0].checks.some(c => c.label.includes("ikke opplæring"))).toBe(true);
    const check = systemCheckForFinding("FSE", { competenceTypes: [{ id: "fse", key: "fse", name: "FSE" }], coverageFor: () => coverage, orgRoles: [], regulations: [], audits: [], requirementRows: [], personName: () => null });
    expect(check.gaps.filter(g => g.kind === "competence")).toEqual([]);
    expect(check.facts.join(" ")).toContain("ikke opplæring");
  });
});