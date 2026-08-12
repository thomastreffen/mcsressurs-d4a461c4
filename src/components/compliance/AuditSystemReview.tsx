/**
 * «Systemet viser» for internrevisjon – kun faktiske data fra MCS.
 * Ingen AI-tekst. Hvert faktum kan åpne riktig sted for korrigering.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { ChevronDown, ChevronUp, Database, ExternalLink } from "lucide-react";
import { SYSTEM_FACT_AREAS, type AuditSystemFact } from "@/lib/internal-control";

export function AuditSystemReview({ facts, loading }: { facts: AuditSystemFact[]; loading?: boolean }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const attention = useMemo(() => facts.filter((f) => f.attention), [facts]);
  const visible = expanded ? facts : attention.length ? attention : facts.slice(0, 4);

  const labelFor = (area: AuditSystemFact["area"]) =>
    SYSTEM_FACT_AREAS.find((a) => a.area === area)?.label ?? area;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Database className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Systemstøttet gjennomgang</p>
        <Badge variant="outline" className="text-[10px]">Systemfakta</Badge>
        {!loading && (
          <span className="text-xs text-muted-foreground">
            {attention.length ? `${attention.length} forhold krever oppmerksomhet` : "Ingen avvik funnet i registrerte data"}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Kontrollerer mot registrerte data…</p>
      ) : (
        <div className="space-y-1.5">
          {visible.map((f) => (
            <div
              key={f.id}
              className={
                "flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 " +
                (f.tone === "alert" ? "border-destructive/30" : f.tone === "warn" ? "border-amber-500/30" : "")
              }
            >
              <div className="min-w-[220px] flex-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{labelFor(f.area)}</p>
                <p className="text-sm">{f.message}</p>
              </div>
              <div className="flex items-center gap-2">
                <ComplianceStatusBadge
                  label={f.tone === "ok" ? "I orden" : f.tone === "warn" ? "Følg opp" : f.tone === "alert" ? "Mangel" : "Info"}
                  tone={f.tone}
                />
                <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(f.route)}>
                  {f.actionLabel} <ExternalLink className="ml-1.5 h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {facts.length > visible.length || expanded ? (
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <><ChevronUp className="mr-1 h-3 w-3" /> Vis bare forhold som krever oppmerksomhet</> : <><ChevronDown className="mr-1 h-3 w-3" /> Vis alle systemfakta ({facts.length})</>}
        </Button>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Tallene er beregnet fra kravmotoren, ansattregisteret, organisasjon og ansvar, regelverksregisteret og HMS-avvik/tiltak.
        Forholdet rettes der det hører hjemme i systemet.
      </p>
    </div>
  );
}
