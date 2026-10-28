import { describe, expect, it } from "vitest";
import { evidenceForDocumentationNeed, isOrganizationDocumentationNeed } from "@/lib/finding-documentation-needs";
import { deriveDocumentationStatus } from "@/hooks/useEvidenceCoverage";
import { findingPreflight } from "@/lib/finding-workflow";
import type { FindingEvidence } from "@/hooks/useInspections";

const companyId = "mcs-service";
const need = "Organisasjonskart med ansvarsmatrise";
const evidence: FindingEvidence = {
  id: "linked-overview", inspection_id: "63210", finding_id: "finding-1",
  source_kind: "organization_overview", ref_id: companyId,
  label: "Organisasjonsoversikt – MCS Service AS",
  note: "7 aktive roller ved kobling. Dynamisk kilde: Organisasjon & ansvar.",
  document_id: null, competence_type_id: null, created_at: "2026-10-27",
};
const organizationFor = (id: string | null) => id === companyId ? 7 : null;

describe("Organization evidence covers document needs independently of finding treatment", () => {
  it("satisfies organization chart/responsibility matrix using the linked live source, not word equality", () => {
    expect(evidenceForDocumentationNeed(need, [evidence], companyId, organizationFor)).toEqual([evidence]);
    expect(evidenceForDocumentationNeed(need, [{ ...evidence, label: null, note: null }], companyId, organizationFor)).toHaveLength(1);
  });
  it("removing the evidence removes coverage even when seven active roles remain", () => {
    expect(evidenceForDocumentationNeed(need, [], companyId, organizationFor)).toEqual([]);
    expect(deriveDocumentationStatus([], () => null, organizationFor)).toBe("none");
  });
  it.each([0, null])("does not trust the historical seven-role note when live count is %s", count => {
    expect(evidenceForDocumentationNeed(need, [evidence], companyId, () => count)).toEqual([]);
  });
  it("never satisfies another company's need", () => {
    expect(evidenceForDocumentationNeed(need, [evidence], "busbar", () => 7)).toEqual([]);
  });
  it("does not treat organization evidence as unrelated documentation", () => {
    expect(evidenceForDocumentationNeed("FSE opplæring", [evidence], companyId, organizationFor)).toEqual([]);
    expect(isOrganizationDocumentationNeed("Organisasjonskart med ansvarsmatrise")).toBe(true);
    expect(isOrganizationDocumentationNeed("Ansvarsmatrise")).toBe(true);
  });
  it("leaves all empty treatment fields empty and preflight blocked despite covered documentation", () => {
    const finding = {
      internal_assessment: null, responsible_person_id: null, responsible_role_id: null,
      internal_deadline: null, response_text: null, response_approved_at: null,
      condition_corrected_at: null, documentation_complete_at: null, status: "new",
    };
    const before = structuredClone(finding);
    const docStatus = deriveDocumentationStatus([evidence], () => null, organizationFor);
    expect(docStatus).toBe("complete");
    expect(findingPreflight(finding, [], docStatus, 1).missing).toHaveLength(6);
    expect(findingPreflight(finding, [], docStatus, 1).ready).toBe(false);
    expect(finding).toEqual(before);
  });
  it("preserves ordinary linked document matching", () => {
    const document = { ...evidence, source_kind: "document" as const, document_id: "doc", ref_id: null, label: need };
    expect(evidenceForDocumentationNeed(need, [document], companyId, () => null)).toEqual([document]);
  });
});