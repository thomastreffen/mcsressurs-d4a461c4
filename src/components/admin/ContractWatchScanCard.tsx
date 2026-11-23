// Manual historical test (phase 1). Read-only toward Microsoft; nothing is sent, created or notified.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invokeWithSession } from "@/lib/invoke-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Loader2 } from "lucide-react";
import { QueryErrorNotice } from "./QueryErrorNotice";

interface Run { id: string; started_at: string; finished_at: string | null; status: string; counts: Record<string, number>; error_code: string | null; error_detail: string | null }
const ERR: Record<string, string> = {
  gates_not_met: "Avtalevakt er ikke slått på, eller samtykke/tilgang mangler.",
  not_configured: "Appens nøkler mangler i sikre hemmeligheter.",
  diagnostic_stale: "Kjør tilkoblingstesten på nytt først (må være bestått siste 7 dager).",
  cooldown: "Vent 15 minutter mellom hver historisk test.",
  already_running: "En test kjører allerede.",
  rbac_only_check_failed: "Stoppet: appen har fått brede Entra-tillatelser eller feil identitet. Ingenting ble lest.",
  token_failed: "Microsoft ga ikke tilgang (sjekk hemmeligheten).",
  graph_throttled: "Microsoft ber oss vente. Prøv igjen senere.",
  graph_read_failed: "Lesing fra Microsoft feilet.",
  ai_failed: "AI-analysen feilet. Ingenting nytt er lagret fra den delen.",
  unexpected: "Uventet feil.",
};
const STATUS: Record<string, string> = { running: "Kjører", done: "Fullført", failed: "Feilet", blocked: "Stoppet" };
const COUNT: Record<string, string> = { read_inbox: "Lest innboks", read_sentitems: "Lest sendt", prefiltered_out: "Filtrert bort", threads_analyzed: "Tråder analysert", ai_found: "Mulige løfter", ai_rejected_ungrounded: "Avvist (ikke ordrett i e-post)", stored: "Lagret" };

async function call(action: "status" | "run_historical_test"): Promise<{ runs: Run[] }> {
  const { data, error } = await invokeWithSession<{ runs: Run[] }>("contract-watch-scan", { body: { action } });
  if (error) { const ctx = (error as { context?: Response }).context; const p = await ctx?.json?.().catch(() => null); throw new Error(ERR[p?.error] ?? p?.error ?? error.message); }
  return data as { runs: Run[] };
}

export function ContractWatchScanCard({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["cw-scan"], queryFn: () => call("status") });
  const run = useMutation({ mutationFn: () => call("run_historical_test"), onSettled: () => { qc.invalidateQueries({ queryKey: ["cw-scan"] }); qc.invalidateQueries({ queryKey: ["cw-items"] }); qc.invalidateQueries({ queryKey: ["cw-audit"] }); } });
  const last = q.data?.runs?.[0];
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Historisk test – siste 30 dager</CardTitle>
      <CardDescription>Kun når du klikker. Leser emne, avsender/mottaker og et kort utdrag (maks 255 tegn) fra innboks og sendt i Thomas sin postkasse. Ingen vedlegg eller hele e-poster hentes. Ingenting sendes, ingen jobber eller kalenderavtaler lages, ingen varsles. Funn merkes «Test».</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3 text-sm">
      {q.isError && <QueryErrorNotice what="status for historisk test" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />}
      <Button size="sm" disabled={!enabled || run.isPending || last?.status === "running"} onClick={() => run.mutate()}>{run.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Kjør historisk test</Button>
      {!enabled && <p className="text-muted-foreground">Slå på Avtalevakt først.</p>}
      {run.isPending && <p className="text-muted-foreground">Leser og analyserer – kan ta et par minutter.</p>}
      {run.error && <p role="alert" className="text-destructive">{(run.error as Error).message}</p>}
      {last && <div className="space-y-1">
        <p><Badge variant={last.status === "done" ? "default" : last.status === "running" ? "outline" : "destructive"}>{STATUS[last.status] ?? last.status}</Badge> {new Date(last.started_at).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}{last.error_code ? ` – ${ERR[last.error_code] ?? last.error_code}${last.error_detail ? ` (${last.error_detail})` : ""}` : ""}</p>
        <ul className="flex flex-wrap gap-2">{Object.entries(last.counts ?? {}).map(([k, v]) => <li key={k}><Badge variant="outline">{COUNT[k] ?? k}: {v}</Badge></li>)}</ul>
      </div>}
    </CardContent>
  </Card>;
}
