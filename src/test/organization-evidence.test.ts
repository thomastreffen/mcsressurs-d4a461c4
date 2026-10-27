import { describe, expect, it } from "vitest";
import { activeOrganizationRoles, organizationOverviewCandidate } from "@/lib/organization-evidence";
import { deriveDocumentationStatus } from "@/hooks/useEvidenceCoverage";
import { buildPreflight } from "@/hooks/useResponsePackages";
import { findingPreflight } from "@/lib/finding-workflow";
import { buildExportNames, buildManifest } from "@/lib/response-package";
import { findingExportRecords } from "@/lib/documentation/inspection";
import type { Finding, FindingEvidence } from "@/hooks/useInspections";
import type { OrgRole } from "@/hooks/useCompliance";

const company = { id: "a0000000-0000-0000-0000-000000000001", name: "MCS Service AS" };
const evidence = { id: "local-evidence", finding_id: "2c09b10f-947d-4bf1-b8fe-d4dc11f0105d", inspection_id: "c3d2253a-70ef-481b-9384-5d26a3c20206", source_kind: "organization_overview", ref_id: company.id, document_id: null, competence_type_id: null, label: null, note: "7 aktive roller ved kobling", created_at: "2026-10-27" } satisfies FindingEvidence;
const role = { id: "leader", title: "Daglig leder", person_id: "rune", deputy_person_id: null, additional_person_ids: [], reports_to_id: null, responsibilities: "Vedlikeholde registeret", tasks: "Årlig gjennomgang", authority: "Daglig ledelse", valid_from: null, valid_to: null, is_active: true, sort_order: 0 } as OrgRole;
const people = [{ person_id: "rune", full_name: "Rune Ørbeck", department_name: "Service" }];
const candidate = () => organizationOverviewCandidate(evidence, company, [role], people, true);

describe("Combined organization evidence", () => {
  it("includes only currently active roles, including validity boundaries", () => {
    expect(activeOrganizationRoles([role, { ...role, id: "disabled", is_active: false }, { ...role, id: "future", valid_from: "2026-10-28" }, { ...role, id: "expired", valid_to: "2026-10-26" }, { ...role, id: "boundary", valid_from: "2026-10-27", valid_to: "2026-10-27" }], "2026-10-27").map(r => r.id)).toEqual(["leader", "boundary"]);
  });
  it("exports one company-scoped overview with people, responsibility and reporting lines", () => {
    const c = candidate();
    expect(c.kind).toBe("generated");
    expect(c.generated?.rows[1]).toEqual(["MCS Service AS", "Daglig leder", "Rune Ørbeck", "Service", "Ikke tildelt", "Øverste nivå", "Vedlikeholde registeret", "Årlig gjennomgang", "Daglig ledelse", "", ""]);
    expect(findingExportRecords([c], evidence.finding_id)).toHaveLength(1);
    expect(buildManifest([c], buildExportNames([c]))[0].reference_only).toBe(false);
  });
  it("resolves new register changes without using the old seven-role note as content", () => {
    const updated = organizationOverviewCandidate(evidence, company, [role, { ...role, id: "hms", title: "HMS ansvarlig", reports_to_id: role.id }], people, true);
    expect(candidate().generated?.rows).toHaveLength(2);
    expect(updated.generated?.rows).toHaveLength(3);
    expect(updated.generated?.rows[2][5]).toBe("Daglig leder");
  });
  it("never exports another company's register", () => {
    const c = organizationOverviewCandidate(evidence, { id: "other-company", name: "Annet selskap" }, [role], people, true);
    expect(c.generated).toBeUndefined();
    expect(c.status_tone).toBe("alert");
  });
  it.each([{ roles: [], available: true }, { roles: [role], available: false }])("blocks empty or unavailable sources", ({ roles, available }) => {
    const c = organizationOverviewCandidate(evidence, company, roles, people, available);
    expect(c.generated).toBeUndefined();
    expect(deriveDocumentationStatus([evidence], () => null, () => null)).toBe("gaps");
  });
  it("accepts one valid combined source as documentation without approving or closing the finding", () => {
    const docStatus = deriveDocumentationStatus([evidence], () => null, () => 7);
    expect(docStatus).toBe("complete");
    const finding = { internal_assessment: "Oversikten er etablert", responsible_person_id: "rune", responsible_role_id: null, internal_deadline: null, response_text: "Organisasjonsoversikten er vedlagt", response_approved_at: null, condition_corrected_at: null, documentation_complete_at: null, status: "new" };
    const result = findingPreflight(finding, [], docStatus, 1);
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("Svartekst er ikke godkjent");
    expect(finding.status).toBe("new");
    expect(findingPreflight({ ...finding, response_approved_at: "2026-10-27", condition_corrected_at: "2026-10-27", documentation_complete_at: "2026-10-27" }, [], docStatus, 1).ready).toBe(true);
  });
  it("package preflight rejects a selected missing organization source", () => {
    const c = organizationOverviewCandidate(evidence, company, [], people, true);
    const finding = { id: evidence.finding_id, finding_number: 1, title: "Manglende dokumentert organisasjonsoversikt", response_text: "Oversikt", internal_assessment: "Kontrollert", responsible_person_id: "rune", response_approved_at: "2026-10-27", condition_corrected_at: "2026-10-27", documentation_complete_at: "2026-10-27", documentation_status: "complete", status: "documentation_ready" } as Finding;
    const result = buildPreflight({ findings: [finding], evidence: [evidence], actions: [], candidates: [c], selectedAttachmentKeys: new Set([c.key]), detailFor: () => null });
    expect(result[0].overall).toBe("missing");
    const valid = candidate();
    expect(buildPreflight({ findings: [finding], evidence: [evidence], actions: [], candidates: [valid], selectedAttachmentKeys: new Set([valid.key]), detailFor: () => null })[0].checks.some(c => c.tone === "alert")).toBe(false);
  });
});