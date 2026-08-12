/**
 * Systemkontroll for funn: hva MCS faktisk vet fra egne registre.
 * Alle tall beregnes fra kravmotoren og registrene – aldri fra AI.
 */
import { useMemo } from "react";
import { useCompetenceTypes, useComplianceAudits, useComplianceEmployees, useOrgRoles, useRegulations } from "@/hooks/useCompliance";
import { useRequirementStatus } from "@/hooks/useComplianceRequirements";
import { useEvidenceCoverage } from "@/hooks/useEvidenceCoverage";
import { systemCheckForFinding, type SystemCheckResult } from "@/lib/finding-workflow";
import { findingSearchText } from "@/lib/inspection-report";
import type { Finding } from "@/hooks/useInspections";

export function useFindingSystemCheck() {
  const competenceTypes = useCompetenceTypes();
  const orgRoles = useOrgRoles();
  const regulations = useRegulations();
  const audits = useComplianceAudits();
  const employees = useComplianceEmployees();
  const requirements = useRequirementStatus();
  const { coverageFor } = useEvidenceCoverage();

  const nameByPerson = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees.data ?? []) m.set(e.person_id, e.full_name);
    return m;
  }, [employees.data]);

  const sources = useMemo(
    () => ({
      competenceTypes: (competenceTypes.data ?? []).map((c) => ({ id: c.id, key: c.key, name: c.name })),
      orgRoles: (orgRoles.data ?? []).map((r) => ({
        id: r.id, title: r.title, role_type: r.role_type, person_id: r.person_id,
        deputy_person_id: r.deputy_person_id, valid_from: r.valid_from, valid_to: r.valid_to,
      })),
      regulations: (regulations.data ?? []).map((r) => ({ id: r.id, name: r.name, short_name: r.short_name })),
      audits: (audits.data ?? []).map((a) => ({ id: a.id, title: a.title, performed_at: a.performed_at, status: a.status })),
      coverageFor,
      requirementRows: (requirements.data ?? []).map((r) => ({ person_id: r.person_id, status: r.status, required: r.required })),
      personName: (id: string | null) => (id ? nameByPerson.get(id) ?? null : null),
    }),
    [competenceTypes.data, orgRoles.data, regulations.data, audits.data, requirements.data, coverageFor, nameByPerson],
  );

  const checkFor = (finding: Finding): SystemCheckResult => {
    const text = [findingSearchText(finding), (finding.match_keywords ?? []).join(" ")].join(" ");
    return systemCheckForFinding(text, sources);
  };

  const loading = competenceTypes.isLoading || requirements.isLoading || orgRoles.isLoading;

  return { checkFor, loading };
}
