import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, HelpCircle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useMyRiskJobs, useReadinessEvaluator } from "@/hooks/useWorkReadiness";
import { READINESS_STYLES, REQ_STATE_LABEL, RISK_TAG_LABEL } from "@/lib/hms/workReadiness";

/** Mobilvisning: montørens egne HMS-krav for kommende risikojobber. */
export default function HmsMyReadinessPage() {
  const { user } = useAuth();
  const { jobs, isLoading } = useMyRiskJobs(21);
  const { evaluate } = useReadinessEvaluator();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          Klar for arbeid
        </h1>
        <p className="text-sm text-muted-foreground">
          Krav som gjelder for dine kommende oppdrag med risiko. Bekreft det som mangler før oppstart.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Laster …</p>}
      {!isLoading && jobs.length === 0 && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Du har ingen kommende oppdrag med registrerte risikotagger.
          </CardContent>
        </Card>
      )}

      {jobs.map((job) => {
        const { readiness } = evaluate(
          job.risk_tags,
          { user_id: user?.id ?? null, email: user?.email ?? null },
          job.id
        );
        return (
          <Card key={job.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{job.title}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {job.start_time ? new Date(job.start_time).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" }) : "Ikke satt"}
                {job.project_number && <span>· {job.project_number}</span>}
                <Badge variant="outline" className={`ml-auto ${READINESS_STYLES[readiness.level]}`}>
                  {readiness.label}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {job.risk_tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">{RISK_TAG_LABEL[t] ?? t}</Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {readiness.requirements.map((r) => (
                <div key={r.requirement.key} className="flex gap-2 text-xs">
                  {r.state === "ok" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : r.state === "unknown" ? (
                    <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  ) : (
                    <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${r.requirement.severity === "critical" ? "text-red-600" : "text-amber-600"}`} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-medium text-foreground">{r.requirement.label}</span>
                      <Badge variant="outline" className="text-[10px]">{REQ_STATE_LABEL[r.state]}</Badge>
                    </div>
                    <p className="text-muted-foreground">{r.detail}</p>
                    {(r.chemicals ?? []).map((c) => (
                      <Link key={c.chemical.id} to="/hms/mine-kjemikalier" className="block text-primary hover:underline">
                        Åpne kjemikalieinfo og SDS: {c.chemical.product_name}
                      </Link>
                    ))}
                    {(r.sections ?? []).length > 0 && (
                      <Link to="/hms/handbok" className="block text-primary hover:underline">
                        Åpne HMS-håndbok
                      </Link>
                    )}
                  </div>
                </div>
              ))}
              {readiness.requirements.length === 0 && (
                <p className="text-xs text-muted-foreground">Ingen spesifikke krav registrert.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
