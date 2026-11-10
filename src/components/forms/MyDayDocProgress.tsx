import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, Circle, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ctaLabel, docErrorMessage, docRpc, nextStep, STEP_STATUS_LABEL, type DocProgress, type DocStep } from "@/lib/doc-requirements";

/**
 * Read-only technician progress for a job's snapshotted documentation requirements.
 * Shows nothing unless requirements are actually configured on the job; never blocks work.
 */
export function MyDayDocProgress({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<DocProgress | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await docRpc("get_job_doc_progress", { _job_id: projectId });
    if (!error) setProgress(data as DocProgress);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  if (!progress || progress.state !== "active" || progress.total === 0) return null;

  const open = async (step: DocStep) => {
    if (step.instance_id) { navigate(`/forms/${step.instance_id}`); return; }
    setOpening(step.requirement_id);
    const { data, error } = await docRpc("start_requirement_form", { _requirement_id: step.requirement_id });
    setOpening(null);
    if (error) { toast.error("Kunne ikke åpne skjema", { description: docErrorMessage(error) }); return; }
    navigate(`/forms/${data}`);
  };

  const next = nextStep(progress);
  const pct = Math.round((progress.done / progress.total) * 100);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dokumentasjon</h3>
          </div>
          <span className="text-[11px] text-muted-foreground">{progress.done}/{progress.total} levert</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <ol className="space-y-1.5">
          {progress.steps.map((s) => {
            const done = s.status === "delivered" || s.status === "waived";
            return (
              <li key={s.requirement_id}>
                <button
                  type="button"
                  onClick={() => open(s)}
                  disabled={opening === s.requirement_id || s.status === "waived"}
                  className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-muted/50"
                >
                  {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className={cn("flex-1 text-sm", done && "text-muted-foreground")}>{s.label}</span>
                  <span className={cn("text-[10px]", s.status === "needs_review" ? "text-destructive" : "text-muted-foreground")}>
                    {s.exception_requested ? "Unntak forespurt" : STEP_STATUS_LABEL[s.status]}
                  </span>
                  {opening === s.requirement_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </li>
            );
          })}
        </ol>
        {next ? (
          <Button className="h-11 w-full rounded-xl" onClick={() => open(next)} disabled={!!opening}>
            {ctaLabel(next)}
          </Button>
        ) : (
          <p className="text-xs text-success">Dokumentasjon levert. Venter på kontroll.</p>
        )}
        <p className="text-[10px] text-muted-foreground">Arbeid utført og dokumentasjon levert registreres hver for seg.</p>
      </CardContent>
    </Card>
  );
}
