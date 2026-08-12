/**
 * Fullføring av internrevisjon: pre-flight kontroll og eksplisitt fullføring.
 * Revisjonen får status «Gjennomført» kun når brukeren selv fullfører den.
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, FileText, Info } from "lucide-react";
import type { AuditPreflightResult } from "@/lib/internal-control";

export function AuditCompletion({
  preflight, completed, completedAt, reportDocumentId, pending, onComplete, onOpenReport,
}: {
  preflight: AuditPreflightResult;
  completed: boolean;
  completedAt?: string | null;
  reportDocumentId?: string | null;
  pending?: boolean;
  onComplete: () => void;
  onOpenReport?: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fullføring</p>
        {completed ? (
          <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-600">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Gjennomført{completedAt ? ` ${completedAt.slice(0, 10)}` : ""}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">Ikke gjennomført</Badge>
        )}
      </div>

      {!completed && (
        <>
          {preflight.missing.length > 0 ? (
            <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Må håndteres før revisjonen kan fullføres
              </p>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                {preflight.missing.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Alle nødvendige punkter er behandlet. Du kan fullføre revisjonen.
            </p>
          )}

          {preflight.notes.length > 0 && (
            <div className="space-y-1 rounded-md border border-dashed p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Info className="h-3.5 w-3.5" /> Merknader
              </p>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                {preflight.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!completed && (
          <Button disabled={!preflight.ready || pending} onClick={onComplete}>
            {pending ? "Fullfører…" : "Fullfør internrevisjon"}
          </Button>
        )}
        {completed && reportDocumentId && onOpenReport && (
          <Button variant="outline" onClick={onOpenReport}>
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Åpne revisjonsreferat
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ved fullføring genereres et strukturert revisjonsreferat fra faktiske data og lagres som dokumentasjon på revisjonen.
      </p>
    </div>
  );
}
