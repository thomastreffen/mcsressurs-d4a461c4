import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { Info, ShieldCheck } from "lucide-react";
import { useCompetenceTypes } from "@/hooks/useCompliance";
import {
  useRequirementStatus, useJobRoles, usePersonJobRole, useSetPersonJobRole,
} from "@/hooks/useComplianceRequirements";
import {
  REQUIREMENT_STATUS_META, formatDate, requirementOverallTone, scopeSourceLabel,
} from "@/lib/compliance";

/**
 * «Gjeldende kompetansekrav» på ansattkortet.
 * Viser hvilken kompetanse som er påkrevd, hvorfor, hvor kravet kommer fra og om det er oppfylt.
 */
export function PersonRequirementsSection({ personId, canManage }: { personId: string; canManage: boolean }) {
  const statuses = useRequirementStatus(personId);
  const types = useCompetenceTypes();
  const jobRoles = useJobRoles();
  const profile = usePersonJobRole(personId);
  const setRole = useSetPersonJobRole();
  const [expanded, setExpanded] = useState<string | null>(null);

  const typeById = useMemo(() => new Map((types.data ?? []).map((t) => [t.id, t])), [types.data]);

  const rows = useMemo(() => {
    return (statuses.data ?? [])
      .map((r) => ({ ...r, typeName: typeById.get(r.competence_type_id)?.name ?? "Kompetanse" }))
      .sort((a, b) => {
        const sev = (s: string) => (s === "not_required" ? 2 : s === "fulfilled" ? 1 : 0);
        if (sev(a.status) !== sev(b.status)) return sev(a.status) - sev(b.status);
        return a.typeName.localeCompare(b.typeName, "nb");
      });
  }, [statuses.data, typeById]);

  const overall = requirementOverallTone(rows.map((r) => r.status));

  if (statuses.isLoading || types.isLoading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>;
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Gjeldende kompetansekrav
          </p>
          <ComplianceStatusBadge
            label={overall === "alert" ? "Mangler noe" : overall === "warn" ? "Følg opp" : overall === "ok" ? "Alt i orden" : "Ingen krav"}
            tone={overall}
          />
        </div>

        {(() => {
          const roleName = (jobRoles.data ?? []).find((r) => r.id === profile.data?.job_role_id)?.name ?? null;
          return (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2.5">
              <span className="text-sm">
                <span className="text-muted-foreground">Stilling: </span>
                <span className="font-medium">{roleName ?? "Ikke registrert"}</span>
              </span>
              {canManage && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={goToEmployment}>
                  Rediger ansettelsesforhold
                </Button>
              )}
              {!roleName && (
                <p className="w-full text-xs text-amber-600">
                  Stilling ikke registrert. Stillingsspesifikke kompetansekrav kan ikke vurderes. Krav for virksomhet
                  og avdeling vurderes fortsatt.
                </p>
              )}
            </div>
          );
        })()}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ingen kompetansekrav gjelder for denne ansatte ennå. Krav settes opp under Elsikkerhet → Kompetansekrav.
          </p>
        ) : (

          <div className="divide-y rounded-lg border">
            {rows.map((r) => {
              const meta = REQUIREMENT_STATUS_META[r.status];
              const open = expanded === r.requirement_id + r.competence_type_id;
              return (
                <div key={r.requirement_id + r.competence_type_id} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{r.typeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.required ? "Påkrevd" : "Ikke påkrevd"} · Kilde: {scopeSourceLabel(r.source_scope)}
                        {r.source_label ? ` – ${r.source_label}` : ""}
                        {r.validity_months ? ` · Gyldighet ${r.validity_months} mnd` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.status === "missing"
                          ? "Ingen registrert kompetanse"
                          : r.status === "missing_document"
                            ? "Registrert, men dokumentasjon mangler"
                            : r.expires_at
                              ? `Gyldig til ${formatDate(r.expires_at)}`
                              : r.competence_id ? "Registrert – ingen utløpsdato" : "–"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ComplianceStatusBadge label={meta.label} tone={meta.tone} />
                      {r.reason && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setExpanded(open ? null : r.requirement_id + r.competence_type_id)}
                          title="Hvorfor gjelder dette kravet?"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {open && r.reason && <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs">{r.reason}</p>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
