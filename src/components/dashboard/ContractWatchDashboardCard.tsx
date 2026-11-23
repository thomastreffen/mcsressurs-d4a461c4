// Superadmin-only Avtalevakt summary on the leader overview. Reads via existing superadmin RLS; no notifications.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveAppRole } from "@/hooks/usePreviewMode";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { summarizeContractWatch, needsAttention, type CwRow } from "@/lib/contract-watch-summary";
import { QueryErrorNotice } from "@/components/admin/QueryErrorNotice";

export function ContractWatchDashboardCard() {
  const { isSuperAdmin } = useEffectiveAppRole();
  const q = useQuery({ queryKey: ["cw-dashboard"], enabled: isSuperAdmin, staleTime: 60_000, queryFn: async () => {
    const [items, runs] = await Promise.all([
      supabase.from("contract_watch_commitments").select("id, action_status, status, is_test, created_at, source_sent_at").eq("status", "open").eq("pilot_version", 2).limit(500),
      supabase.from("contract_watch_scan_runs").select("status, started_at").eq("pilot_version", 2).eq("mode", "historical_test").order("started_at", { ascending: false }).limit(1),
    ]);
    if (items.error) throw items.error; if (runs.error) throw runs.error;
    return { s: summarizeContractWatch((items.data ?? []) as CwRow[]), lastRun: runs.data?.[0] ?? null };
  } });
  if (!isSuperAdmin) return null;
  const s = q.data?.s; const attn = s ? needsAttention(s) : false;
  const to = s?.topId ? `/admin/avtalevakt?sak=${s.topId}` : "/admin/avtalevakt";
  return <section aria-label="AI Avtalevakt" className="rounded-xl border border-border bg-card p-4 space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <ShieldCheck className="h-4 w-4 text-primary" />
      <h2 className="font-semibold text-sm">AI Avtalevakt</h2>
      {attn && <span className="h-2 w-2 rounded-full bg-destructive" aria-label="Funn som bør sjekkes" />}
      <Badge variant="outline">Kun manuell test / ikke løpende overvåking</Badge>
    </div>
    {q.isLoading && <p className="text-sm text-muted-foreground">Henter…</p>}
    {q.isError && <QueryErrorNotice what="Avtalevakt-funn" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />}
    {s && (s.total === 0
      ? <p className="text-sm text-muted-foreground">{q.data?.lastRun ? "Ingen uløste funn." : "Ingen funn – ingen testkjøring (v2) ennå."} <Link className="underline" to="/admin/avtalevakt">Åpne Avtalevakt</Link></p>
      : <Link to={to} className="flex flex-wrap gap-2 text-sm hover:underline">
          <Badge variant={s.actionRequired ? "destructive" : "outline"}>Krever handling: {s.actionRequired}</Badge>
          <Badge variant="outline">Avtales: {s.scheduling}</Badge>
          <Badge variant="outline">Ukjent: {s.unknown}</Badge>
          {s.testCount > 0 && <Badge variant="secondary">TEST v2{s.allTest ? "" : `: ${s.testCount}`}</Badge>}
        </Link>)}
  </section>;
}
