import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReadinessEvaluator, useUpcomingRiskJobs } from "@/hooks/useWorkReadiness";
import { useTechnicians } from "@/hooks/useTechnicians";

/** HMS-dashboardkort: "Klar for arbeid" for planlagte risikojobber neste 14 dager. */
export function WorkReadinessCard() {
  const { data: jobs = [] } = useUpcomingRiskJobs(14);
  const { evaluate } = useReadinessEvaluator();
  const { technicians } = useTechnicians();

  const stats = useMemo(() => {
    const techById = new Map(technicians.map((t) => [t.id, t]));
    let withGaps = 0;
    let chemMissing = 0;
    let hbMissing = 0;
    let sjaMissing = 0;
    let competenceMissing = 0;

    for (const job of jobs) {
      for (const techId of job.technician_ids) {
        const t = techById.get(techId);
        const { readiness } = evaluate(job.risk_tags, {
          user_id: techId,
          full_name: t?.name ?? null,
          email: t?.email ?? null,
        }, job.id);
        const missing = [...readiness.missingCritical, ...readiness.missingWarning];
        if (missing.length > 0) withGaps += 1;
        for (const m of missing) {
          if (m.requirement.kind === "chemical") chemMissing += 1;
          else if (m.requirement.kind === "handbook") hbMissing += 1;
          else if (m.requirement.kind === "competence") competenceMissing += 1;
          else if (m.requirement.key.startsWith("sja")) sjaMissing += 1;
        }
      }
    }
    return { jobs: jobs.length, withGaps, chemMissing, hbMissing, sjaMissing, competenceMissing };
  }, [jobs, technicians, evaluate]);

  const rows = [
    { label: "Planlagte risikojobber (14 dager)", value: stats.jobs },
    { label: "Planlagte ansatte med mangler", value: stats.withGaps },
    { label: "Manglende kjemikalie-/SDS-bekreftelser", value: stats.chemMissing },
    { label: "Manglende HMS-kapittelbekreftelser", value: stats.hbMissing },
    { label: "Aktiviteter som mangler SJA", value: stats.sjaMissing },
    { label: "Utløpt/manglende FSE eller opplæring", value: stats.competenceMissing },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Klar for arbeid
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={`font-semibold ${r.value > 0 && r.label !== rows[0].label ? "text-amber-700" : ""}`}>
              {r.value}
            </span>
          </div>
        ))}
        <Link to="/ressursplan" className="mt-2 block text-xs text-primary hover:underline">
          Åpne Ressursplan for oppfølging
        </Link>
      </CardContent>
    </Card>
  );
}
