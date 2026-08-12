/**
 * Tilbakekobling til internkontroll på et tilsynsfunn.
 *
 * Viser gjennomførte internrevisjoner som er startet fra funnet. Referatet kan
 * FORESLÅS som dokumentasjon, men kobling som formelt bevis krever brukerens
 * godkjenning. Funnet blir aldri automatisk lukket av en gjennomført revisjon.
 */
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ClipboardCheck, ExternalLink, FileText } from "lucide-react";
import { formatDate } from "@/lib/compliance";
import { useFindingAudits } from "@/hooks/useAuditReview";
import { useEvidenceMutations, type FindingEvidence } from "@/hooks/useInspections";

export function FindingInternalControl({
  inspectionId, findingId, evidence, canEdit,
}: {
  inspectionId: string;
  findingId: string;
  evidence: FindingEvidence[];
  canEdit?: boolean;
}) {
  const navigate = useNavigate();
  const audits = useFindingAudits(findingId);
  const { add } = useEvidenceMutations();

  if (!audits.data?.length) return null;

  return (
    <div className="space-y-2 rounded-md border bg-muted/10 p-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internkontroll fra dette funnet</p>
      </div>

      {audits.data.map((a) => {
        const linked = evidence.some((e) => e.ref_id === a.id || (a.report_document_id && e.document_id === a.report_document_id));
        return (
          <div key={a.id} className="space-y-1.5 rounded-md border bg-card px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{a.title}</span>
              {a.completed_at ? (
                <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-600">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Internkontroll gjennomført {formatDate(a.performed_at)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Ikke fullført</Badge>
              )}
              {a.report_document_id && <Badge variant="outline" className="text-[10px]">Revisjonsreferat tilgjengelig</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {a.openActions
                ? `${a.openActions} ${a.openActions === 1 ? "tiltak" : "tiltak"} fra gjennomgangen fortsatt åpne.`
                : "Ingen åpne tiltak fra gjennomgangen."}
              {" Gjennomført gjennomgang betyr ikke at underliggende forhold er ferdig rettet."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={() => navigate("/compliance/internkontroll")}>
                Åpne internkontroll <ExternalLink className="ml-1.5 h-3 w-3" />
              </Button>
              {a.completed_at && a.report_document_id && (
                <Button size="sm" variant={linked ? "ghost" : "outline"} className="h-8"
                  disabled={!canEdit || linked || add.isPending}
                  onClick={() =>
                    add.mutate({
                      inspection_id: inspectionId,
                      finding_id: findingId,
                      source_kind: "internal_audit",
                      ref_id: a.id,
                      document_id: a.report_document_id,
                      label: `Revisjonsreferat – ${a.title}`,
                      note: `Internkontroll gjennomført ${a.performed_at ?? ""}`.trim(),
                    })
                  }>
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  {linked ? "Koblet som dokumentasjon" : "Koble referatet som dokumentasjon"}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
