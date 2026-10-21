import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Upload, RefreshCw, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

export default function HmsImportBatchesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompanyContext();

  const { data, isLoading } = useQuery({
    queryKey: ["hms-import-batches", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("worktime_import_batches")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const rerunMut = useMutation({
    mutationFn: async (batchId: string) => {
      await (supabase as any).functions.invoke("worktime-aml-evaluate", {
        body: { company_id: activeCompanyId, batch_id: batchId },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && (k.startsWith("hms-aml") || k === "employee-profiles" || k === "hms-import-batches");
      }});
      toast({ title: "AML-kontroll kjørt på nytt" });
    },
    onError: (e: any) => toast({ title: "Feil", description: String(e.message || e), variant: "destructive" }),
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <HmsMobileBack />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => nav("/hms")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Importbatcher</h1>
            <p className="text-sm text-muted-foreground">Historikk og konflikthåndtering for arbeidstid-import.</p>
          </div>
        </div>
        <Button onClick={() => nav("/hms/import")}><Upload className="h-4 w-4 mr-1" />Ny import</Button>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : !data?.length ? (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">Ingen importer enda.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.map((b: any) => {
            const conflicts = (b.skipped_rows || 0);
            return (
              <Card key={b.id} className="border-border/60">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">{b.filename || "(uten filnavn)"}</CardTitle>
                      <Badge variant={b.status === "done" ? "outline" : b.status === "processing" ? "default" : "destructive"}>{b.status}</Badge>
                      {conflicts > 0 && (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                          <AlertTriangle className="h-3 w-3 mr-1" />{conflicts} konflikt{conflicts === 1 ? "" : "er"}
                        </Badge>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => rerunMut.mutate(b.id)} disabled={rerunMut.isPending}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />Kjør AML
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <Stat label="Totalt" v={b.total_rows} />
                    <Stat label="Nye" v={b.new_rows} />
                    <Stat label="Oppdatert" v={b.updated_rows} />
                    <Stat label="Hoppet over" v={b.skipped_rows} tone={conflicts ? "warn" : undefined} />
                    <Stat label="Kilde" v={b.source_system} />
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Importert {new Date(b.created_at).toLocaleString("nb-NO")}
                    {b.finished_at && <> · Ferdig {new Date(b.finished_at).toLocaleString("nb-NO")}</>}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Hva er en konflikt?</summary>
                    <p className="text-xs text-muted-foreground mt-1">
                      En konflikt oppstår hvis ansatten ikke kan matches automatisk, hvis rad-data er uleselig,
                      eller hvis en eksisterende linje med annet innhold ble funnet. Du kan kjøre AML på nytt
                      etter at konflikter er løst i kilden, eller importere på nytt.
                    </p>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, v, tone }: { label: string; v: any; tone?: "warn" }) {
  return (
    <div className="rounded-md border border-border/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={"font-medium " + (tone === "warn" ? "text-amber-600" : "")}>{v ?? "—"}</div>
    </div>
  );
}
