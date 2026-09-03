import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Beaker, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAllChemicalRecipients, useChemicals } from "@/hooks/useChemicals";
import { sdsState } from "@/lib/hms/chemicals";

export function ChemicalStatusCard() {
  const { activeCompanyId: cid } = useCompanyContext();
  const { data: chemicals = [] } = useChemicals();
  const { data: recipients = [] } = useAllChemicalRecipients();

  const { data: incidentCount = 0 } = useQuery({
    queryKey: ["hms-chemical-incidents-12m", cid],
    enabled: !!cid,
    queryFn: async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 12);
      const { count, error } = await (supabase as any)
        .from("hms_incidents")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid)
        .not("chemical_id", "is", null)
        .gte("created_at", since.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });

  const active = chemicals.filter((c) => c.status === "active");
  const missingSds = chemicals.filter((c) => sdsState(c) === "missing");
  const highRisk = active.filter((c) => c.is_high_risk);
  const highRiskIds = new Set(highRisk.map((c) => c.id));

  const ackedKeys = new Set(
    recipients.filter((r) => r.acknowledged_at).map((r) => `${r.chemical_id}:${r.person_id ?? r.user_id}`)
  );
  const missingAck = recipients.filter(
    (r) => !ackedKeys.has(`${r.chemical_id}:${r.person_id ?? r.user_id}`)
  ).length;
  const missingHighRiskAck = recipients.filter(
    (r) => highRiskIds.has(r.chemical_id) && !ackedKeys.has(`${r.chemical_id}:${r.person_id ?? r.user_id}`)
  ).length;

  const stats: { label: string; value: number; tone?: "danger" | "warn" }[] = [
    { label: "Aktive kjemikalier", value: active.length },
    { label: "Uten sikkerhetsdatablad", value: missingSds.length, tone: missingSds.length ? "danger" : undefined },
    { label: "Høyrisiko", value: highRisk.length, tone: highRisk.length ? "warn" : undefined },
    { label: "Mangler bekreftelse", value: missingAck, tone: missingAck ? "warn" : undefined },
    { label: "Epoxy/høyrisiko uten bekreftelse", value: missingHighRiskAck, tone: missingHighRiskAck ? "danger" : undefined },
    { label: "Avvik siste 12 mnd", value: incidentCount },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Beaker className="h-4 w-4 text-muted-foreground" /> Stoffkartotek og kjemikalier
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/hms/kjemikalier">Åpne <ChevronRight className="h-4 w-4 ml-1" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-3">
            <div
              className={`text-xl font-semibold ${
                s.tone === "danger" ? "text-destructive" : s.tone === "warn" ? "text-amber-600" : ""
              }`}
            >
              {s.value}
            </div>
            <div className="text-[11px] text-muted-foreground leading-tight">{s.label}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
