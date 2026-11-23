import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { QueryErrorNotice } from "./QueryErrorNotice";
import { healthState, MONITOR_HEALTH_LABEL, type MonitorHealth } from "@/lib/contract-watch-monitor";

export function useContractWatchMonitor(enabled = true) {
  return useQuery({ queryKey: ["cw-monitor"], enabled, staleTime: 30_000, queryFn: async () => {
    const { data, error } = await supabase.rpc("cw_monitor_status");
    if (error) throw error;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Ugyldig overvåkingsstatus");
    return data as unknown as MonitorHealth;
  } });
}
export function ContractWatchMonitorCard() {
  const q = useContractWatchMonitor(); const qc = useQueryClient();
  const stop = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("cw_monitor_stop"); if (error) throw error; }, onSuccess: () => qc.invalidateQueries({ queryKey: ["cw-monitor"] }) });
  const h = q.data; const state = h ? healthState(h) : null;
  return <section aria-label="Automatisk Avtalevakt" className="space-y-3 border border-border rounded-md p-4 bg-card">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Automatisk Avtalevakt</h2><Switch aria-label="Automatisk overvåking" checked={!!h?.auto_enabled} disabled /></div>
    {q.isLoading && <p className="text-sm text-muted-foreground">Henter overvåkingsstatus…</p>}
    {q.isError && <QueryErrorNotice what="overvåkingsstatus" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />}
    {h && <>
      <Badge variant={state === "ok" ? "secondary" : "outline"}>{state && MONITOR_HEALTH_LABEL[state]}</Badge>
      <ul className="text-sm space-y-1">
        <li>Full historisk test v3: {h.baseline_ok ? "bestått" : "mangler eller er ufullstendig"}</li>
        <li>Automatisk analyse og Hub-varsel: ikke ferdigstilt</li>
        <li>Sist vellykket synk: {h.last_ok_at ? new Date(h.last_ok_at).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" }) : "aldri – drift er ikke verifisert"}</li>
        {h.last_error && <li className="text-destructive" role="alert">Feil: {h.last_error}</li>}
        {h.pending > 0 && <li>Venter på analyse: {h.pending}</li>}
      </ul>
      <p className="text-sm text-muted-foreground">Aktivering er sperret til analyse, personlige varsler og sikker drift er kontrollert. Ingen automatisk e-postlesing kjører. Hovedbryteren over gir bare tillatelse til manuelle tester.</p>
      {h.auto_enabled && <Button variant="destructive" size="sm" disabled={stop.isPending} onClick={() => stop.mutate()}>Stopp overvåking</Button>}
    </>}
    {stop.isError && <p role="alert" className="text-sm text-destructive">Kunne ikke stoppe: {stop.error.message}</p>}
  </section>;
}