import { useMemo } from "react";
import { useRequirementStatus } from "@/hooks/useComplianceRequirements";
import { useComplianceEmployees } from "@/hooks/useCompliance";
import type { FindingEvidence } from "@/hooks/useInspections";
import type { DocumentationStatus } from "@/lib/inspections";
import { activeOrganizationRoles } from "@/lib/organization-evidence";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useOrgRoles } from "@/hooks/useCompliance";
import { summarizeRequirements } from "@/lib/requirement-relevance";

export interface CoverageResult {
  /** Antall ansatte kravet gjelder for */
  total: number;
  /** Antall med gyldig dokumentert kompetanse */
  ok: number;
  /** Ansatte som utløper snart */
  warn: number;
  /** Ansatte med mangler (mangler kompetanse, dokumentasjon eller utløpt) */
  gaps: number;
  gapNames: string[];
  warnNames: string[];
  notRelevant?: number;
}

/**
 * Kravmotoren brukes til å kontrollere om dokumentasjonen faktisk holder:
 * hvilke ansatte kravet gjelder for, status per ansatt og hvem som mangler bevis.
 */
export function useEvidenceCoverage() {
  const { activeCompanyId } = useCompanyContext();
  const orgRoles = useOrgRoles();
  const organizationFor = (companyId: string | null) => {
    if (!companyId || companyId !== activeCompanyId || orgRoles.isLoading || orgRoles.isError) return null;
    return activeOrganizationRoles(orgRoles.data ?? []).length;
  };
  const statuses = useRequirementStatus();
  const employees = useComplianceEmployees();

  const nameByPerson = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees.data ?? []) m.set(e.person_id, e.full_name);
    return m;
  }, [employees.data]);

  const coverageFor = (competenceTypeId: string | null): CoverageResult | null => {
    if (!competenceTypeId) return null;
    const rows = (statuses.data ?? []).filter((r) => r.competence_type_id === competenceTypeId && r.required);
    const gapRows = rows.filter((r) => ["missing", "missing_document", "expired"].includes(r.status));
    const warnRows = rows.filter((r) => r.status === "expiring_soon");
    return {
      ...summarizeRequirements(rows),
      gapNames: gapRows.map((r) => nameByPerson.get(r.person_id) ?? "Ukjent ansatt"),
      warnNames: warnRows.map((r) => nameByPerson.get(r.person_id) ?? "Ukjent ansatt"),
    };
  };

  return { loading: statuses.isLoading || employees.isLoading, coverageFor, organizationFor, rows: statuses.data ?? [] };
}

/** Dokumentasjonsstatus for et funn beregnes fra koblet dokumentasjon + kravmotoren */
export function deriveDocumentationStatus(
  evidence: FindingEvidence[],
  coverageFor: (id: string | null) => CoverageResult | null,
  organizationFor: (companyId: string | null) => number | null = () => null,
): DocumentationStatus {
  if (!evidence.length) return "none";
  let warn = false;
  for (const e of evidence) {
    if (e.source_kind === "organization_overview") {
      const count = organizationFor(e.ref_id);
      if (count === null || count === 0) return "gaps";
    }
    if (e.source_kind === "competence_requirement") {
      const c = coverageFor(e.competence_type_id);
      if (!c || (c.total === 0 && !c.notRelevant)) {
        warn = true;
        continue;
      }
      if (c.gaps > 0) return "gaps";
      if (c.warn > 0) warn = true;
    }
    if (e.source_kind === "other" && !e.note) warn = true;
  }
  return warn ? "incomplete" : "complete";
}
