/**
 * Foreslåtte koblinger fra funn til eksisterende registre (regelverk, kompetansetyper,
 * kompetansekrav, ansvarsroller og internkontroll). Forslag blir aldri koblet automatisk –
 * brukeren må godkjenne hvert forslag før det blir operative data.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Sparkles, X } from "lucide-react";
import { useCompetenceTypes, useComplianceAudits, useOrgRoles, useRegulations } from "@/hooks/useCompliance";
import { useCompetenceRequirements } from "@/hooks/useComplianceRequirements";
import { useEvidenceMutations, useFindingRegulationMutations, type Finding, type FindingEvidence, type FindingRegulationLink } from "@/hooks/useInspections";
import { findingSearchText, suggestFindingLinks, type LinkSuggestion } from "@/lib/inspection-report";

interface Props {
  inspectionId: string;
  findings: Finding[];
  evidence: FindingEvidence[];
  regulationLinks: FindingRegulationLink[];
  canEdit: boolean;
}

export function FindingLinkSuggestions({ inspectionId, findings, evidence, regulationLinks, canEdit }: Props) {
  const regulations = useRegulations();
  const competenceTypes = useCompetenceTypes();
  const requirements = useCompetenceRequirements(false);
  const orgRoles = useOrgRoles();
  const audits = useComplianceAudits();
  const { add: addEvidence } = useEvidenceMutations();
  const { add: addRegulation } = useFindingRegulationMutations();
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  const perFinding = useMemo(() => {
    const sources = {
      regulations: (regulations.data ?? []).map((r) => ({ id: r.id, name: r.name, short_name: r.short_name })),
      competenceTypes: (competenceTypes.data ?? []).map((c) => ({ id: c.id, name: c.name, key: c.key })),
      requirements: (requirements.data ?? []).map((r) => ({
        id: r.id, competence_type_id: r.competence_type_id, scope_type: r.scope_type, description: r.description,
      })),
      orgRoles: (orgRoles.data ?? []).map((r) => ({ id: r.id, title: r.title, responsibilities: r.responsibilities })),
      audits: (audits.data ?? []).map((a) => ({ id: a.id, title: a.title, audit_type: a.audit_type })),
    };
    return findings.map((f) => {
      const existingRegs = new Set(regulationLinks.filter((r) => r.finding_id === f.id).map((r) => r.regulation_id));
      const existingEv = new Set(
        evidence.filter((e) => e.finding_id === f.id).map((e) => `${e.source_kind}:${e.competence_type_id ?? e.ref_id}`),
      );
      const list = suggestFindingLinks(findingSearchText(f), sources).filter((s) => {
        if (dismissed[`${f.id}:${s.kind}:${s.id}`]) return false;
        if (s.kind === "regulation") return !existingRegs.has(s.id);
        if (s.kind === "competence_type") return !existingEv.has(`competence:${s.id}`);
        if (s.kind === "competence_requirement") return !existingEv.has(`competence_requirement:${s.id}`);
        if (s.kind === "org_role") return !existingEv.has(`org_role:${s.id}`);
        return !existingEv.has(`internal_audit:${s.id}`);
      });
      return { finding: f, suggestions: list };
    }).filter((x) => x.suggestions.length > 0);
  }, [findings, regulations.data, competenceTypes.data, requirements.data, orgRoles.data, audits.data, regulationLinks, evidence, dismissed]);

  const accept = (f: Finding, s: LinkSuggestion) => {
    if (s.kind === "regulation") {
      addRegulation.mutate({ finding_id: f.id, regulation_id: s.id, note: "Foreslått kobling godkjent" });
      return;
    }
    const ctype = (competenceTypes.data ?? []).find((c) =>
      s.kind === "competence_type" ? c.id === s.id
        : c.id === (requirements.data ?? []).find((r) => r.id === s.id)?.competence_type_id);
    addEvidence.mutate({
      inspection_id: inspectionId,
      finding_id: f.id,
      source_kind: s.kind === "competence_type" ? "competence" : (s.kind as any),
      competence_type_id: s.kind === "competence_type" || s.kind === "competence_requirement" ? (ctype?.id ?? null) : null,
      ref_id: s.kind === "competence_type" ? null : s.id,
      label: s.label,
      note: "Foreslått kobling godkjent",
    } as any);
  };

  if (!perFinding.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Foreslåtte koblinger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Systemet har funnet mulige koblinger mot regelverk, kompetanse, ansvar og internkontroll.
          Forslagene blir først aktive når du godkjenner dem.
        </p>
        {perFinding.map(({ finding, suggestions }) => (
          <div key={finding.id} className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">Funn {finding.finding_number}: {finding.title}</p>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div key={`${s.kind}:${s.id}`} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="min-w-[160px] flex-1">
                    Mulig kobling: {s.label}
                    <span className="block text-[11px] text-muted-foreground">{s.reason}</span>
                  </span>
                  <Badge variant="outline">Forslag</Badge>
                  {canEdit && (
                    <>
                      <Button size="sm" onClick={() => accept(finding, s)}>Godkjenn kobling</Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => setDismissed((d) => ({ ...d, [`${finding.id}:${s.kind}:${s.id}`]: true }))}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
