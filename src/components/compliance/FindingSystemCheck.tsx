/**
 * SYSTEMKONTROLL – «Systemet viser».
 *
 * Viser kun faktiske data fra MCS (kravmotoren, Organisasjon og ansvar,
 * regelverksregisteret og internkontroll). Ingen AI-tekst og ingen tall
 * som ikke er beregnet fra databasen.
 */
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { Database, ExternalLink, ShieldAlert, Users } from "lucide-react";
import { formatDate } from "@/lib/compliance";
import type { SystemCheckResult } from "@/lib/finding-workflow";

export function FindingSystemCheck({
  check, onGapAction,
}: {
  check: SystemCheckResult;
  /** Kalles før navigering – kan forberede et utkast på målsiden */
  onGapAction?: (gap: SystemCheckResult["gaps"][number]) => void;
}) {
  const navigate = useNavigate();
  const empty =
    !check.competence.length && !check.orgRoles.length && !check.orgRoleGap && !check.gaps.length &&
    !check.regulations.length && !check.audits.length && !check.qualificationNote;

  return (
    <div className="space-y-3 rounded-md border bg-muted/10 p-3">
      <div className="flex items-center gap-2">
        <Database className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Systemet viser</p>
        <Badge variant="outline" className="text-[10px]">Systemfakta</Badge>
      </div>

      {empty && (
        <p className="text-xs text-muted-foreground">
          Systemet finner ingen registrerte data som treffer dette funnet. Koble regelverk, kompetanse eller ansvar
          manuelt for å få kontrollberegning.
        </p>
      )}

      {/* Handlingsorienterte gap – peker alltid til eksisterende sted i systemet */}
      {check.gaps.length > 0 && (
        <div className="space-y-2">
          {check.gaps.map((g) => (
            <div
              key={g.id}
              className={
                "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 " +
                (g.blocking ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5")
              }
            >
              <p className="flex min-w-[200px] flex-1 items-start gap-1.5 text-xs">
                <ShieldAlert className={"mt-0.5 h-3.5 w-3.5 shrink-0 " + (g.blocking ? "text-destructive" : "text-amber-600")} />
                <span>{g.message}</span>
              </p>
              <Button size="sm" variant={g.blocking ? "default" : "outline"} onClick={() => { onGapAction?.(g); navigate(g.route); }}>
                {g.actionLabel} <ExternalLink className="ml-1.5 h-3 w-3" />
              </Button>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Forholdet rettes der det hører hjemme i systemet – ikke inne i tilsynssaken.
          </p>
        </div>
      )}


      {/* Kompetanse – tall fra kravmotoren */}
      {check.competence.map((c) => (
        <div key={c.typeId} className="rounded-md border bg-card px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">{c.name}</span>
            {c.coverage && c.coverage.gaps > 0 && <ComplianceStatusBadge label={`${c.coverage.gaps} mangler`} tone="alert" />}
            {c.coverage && c.coverage.warn > 0 && <ComplianceStatusBadge label={`${c.coverage.warn} utløper snart`} tone="warn" />}
          </div>
          {c.coverage && c.coverage.total > 0 ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.coverage.total} aktive ansatte omfattes av kravet. {c.coverage.ok} har gyldig dokumentert kompetanse.
                {c.coverage.warn > 0 ? ` ${c.coverage.warn} utløper snart.` : ""}
                {c.coverage.gaps > 0 ? ` ${c.coverage.gaps} mangler dokumentasjon.` : ""}
              </p>
              {(c.coverage.gapNames.length > 0 || c.coverage.warnNames.length > 0) && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {[...c.coverage.gapNames, ...c.coverage.warnNames].slice(0, 6).join(", ")}
                  {c.coverage.gapNames.length + c.coverage.warnNames.length > 6 ? " m.fl." : ""}
                </p>
              )}
              <Button size="sm" variant="outline" className="mt-2"
                onClick={() => navigate(`/compliance/kompetanse?type=${encodeURIComponent(c.typeKey)}${c.coverage!.gaps ? "&status=missing_document" : ""}`)}>
                Åpne berørte ansatte <ExternalLink className="ml-1.5 h-3 w-3" />
              </Button>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Ingen aktive ansatte er omfattet av et registrert krav om {c.name}.
            </p>
          )}
        </div>
      ))}

      {/* Organisasjon og ansvar */}
      {(check.orgRoles.length > 0 || check.orgRoleGap) && (
        <div className="rounded-md border bg-card px-3 py-2">
          <p className="text-sm font-medium">Organisasjon og ansvar</p>
          {check.orgRoleGap && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {check.orgRoleGap}
            </p>
          )}
          {check.orgRoles.map((r) => (
            <p key={r.id} className="mt-1 text-xs text-muted-foreground">
              {r.title}: {r.personName ?? "ingen person tilordnet"}
              {r.valid_from ? ` · Gyldig fra ${formatDate(r.valid_from)}` : ""}
              {r.valid_to ? ` · Gyldig til ${formatDate(r.valid_to)}` : ""}
              {r.deputyName ? ` · Stedfortreder: ${r.deputyName}` : ""}
            </p>
          ))}
          <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate("/compliance/organisasjon")}>
            Åpne Organisasjon og ansvar <ExternalLink className="ml-1.5 h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Regelverk systemet kjenner igjen */}
      {check.regulations.length > 0 && (
        <div className="rounded-md border bg-card px-3 py-2">
          <p className="text-sm font-medium">Regelverk i registeret</p>
          <p className="mt-1 text-xs text-muted-foreground">{check.regulations.map((r) => r.label).join(" · ")}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate("/compliance/regelverk")}>
            Åpne regelverksregisteret <ExternalLink className="ml-1.5 h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Internkontroll */}
      {check.audits.length > 0 && (
        <div className="rounded-md border bg-card px-3 py-2">
          <p className="text-sm font-medium">Internkontroll</p>
          {check.audits.map((a) => (
            <p key={a.id} className="mt-1 text-xs text-muted-foreground">
              {a.title}{a.performed_at ? ` · gjennomført ${formatDate(a.performed_at)}` : " · ikke gjennomført"}
            </p>
          ))}
          <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate("/compliance/internkontroll")}>
            Åpne internkontroll <ExternalLink className="ml-1.5 h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Kvalifikasjoner – ingen konklusjon om enkeltpersoner */}
      {check.qualificationNote && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {check.qualificationNote}
        </p>
      )}
    </div>
  );
}
