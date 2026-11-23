// Avtalevakt read-only connection test. Superadmin page only. Never shows secrets, tokens or mail content.
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { invokeWithSession } from "@/lib/invoke-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, HelpCircle, Loader2, ShieldCheck } from "lucide-react";

type R = "pass" | "fail" | "inconclusive";
interface Check { id: string; label: string; result: R; httpStatus?: number; explanation: string }
interface Status {
  configured: boolean; secrets: Record<string, boolean>; pilot_mailbox: string;
  settings: { enabled: boolean; allowed_mailboxes: string[]; scope_verified_at: string | null; consent_at: string | null } | null;
  runs: { run_at: string; overall: R; checks: Check[] }[]; error?: string;
}
async function call(action: "status" | "run"): Promise<Status> {
  const { data, error } = await invokeWithSession<Status>("contract-watch-diagnostics", { body: { action } });
  if (error) {
    const ctx = (error as any)?.context;
    const parsed = ctx?.json ? await ctx.json().catch(() => null) : null;
    if (parsed?.secrets) return parsed as Status;
    throw new Error(parsed?.error ?? error.message);
  }
  return data as Status;
}
const Icon = ({ r }: { r: R }) => r === "pass" ? <CheckCircle2 className="h-4 w-4 text-primary" aria-label="Bestått" /> : r === "fail" ? <XCircle className="h-4 w-4 text-destructive" aria-label="Feilet" /> : <HelpCircle className="h-4 w-4 text-muted-foreground" aria-label="Uavklart" />;

export function ContractWatchDiagnosticsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["contract-watch-diag"], queryFn: () => call("status") });
  const run = useMutation({ mutationFn: () => call("run"), onSuccess: (d) => qc.setQueryData(["contract-watch-diag"], d) });
  const s = q.data; const last = s?.runs?.[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />AI Avtalevakt – tilkoblingstest</CardTitle>
        <CardDescription>Bare lesing. Exchange RBAC for Applications: Application Mail.Read avgrenset til {s?.pilot_mailbox ?? "pilotpostkassen"}, ingen Graph-e-posttillatelser i Entra. Testen henter bare mappeinfo – ingen e-post leses eller lagres.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {q.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {q.isError && <div role="alert" className="space-y-2"><p className="text-destructive">Kunne ikke hente status for tilkoblingstesten: {(q.error as Error)?.message ?? "ukjent feil"}</p><Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Prøv igjen</Button></div>}
        {s && <>
          <div className="flex flex-wrap gap-2">
            {Object.entries(s.secrets).map(([k, v]) => <Badge key={k} variant={v ? "default" : "outline"}>{k}: {v ? "satt" : "mangler"}</Badge>)}
          </div>
          <p>Avtalevakt: <strong>{s.settings?.enabled ? "på" : "av"}</strong> · Samtykke: {s.settings?.consent_at ? "gitt" : "ikke gitt"} · Tilgang bekreftet: {s.settings?.scope_verified_at ? "ja" : "nei"} · Postkasser: {s.settings?.allowed_mailboxes?.length ? s.settings.allowed_mailboxes.join(", ") : "ingen"}</p>
          {!s.configured && <p className="text-muted-foreground">Simen må opprette appen «MCS Hub Avtalevakt» uten Graph-e-posttillatelser i Entra, gi Application Mail.Read via Exchange RBAC kun for Thomas sin postkasse, og de tre verdiene legges inn i sikre hemmeligheter (aldri på e-post).</p>}
          <Button size="sm" disabled={!s.configured || run.isPending} onClick={() => run.mutate()}>{run.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Kjør tilkoblingstest</Button>
          {run.error && <p className="text-destructive">{(run.error as Error).message}</p>}
          {last && <ul className="space-y-1">{last.checks.map((c) => <li key={c.id} className="flex items-start gap-2"><Icon r={c.result} /><span>{c.label}{c.httpStatus ? ` (${c.httpStatus})` : ""} – <span className="text-muted-foreground">{c.explanation}</span></span></li>)}</ul>}
        </>}
      </CardContent>
    </Card>
  );
}
