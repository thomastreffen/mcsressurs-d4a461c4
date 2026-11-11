// Read-only connection test for the dedicated central calendar app. Superadmin page only.
// Shows only pass/fail per check – never tokens, secrets or calendar content.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeWithSession } from "@/lib/invoke-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, CheckCircle2, XCircle, HelpCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface Check { id: string; label: string; expected: string; result: "pass" | "fail" | "inconclusive"; httpStatus?: number; graphCode?: string; explanation: string }
interface Run { run_at: string; overall: string; checks: Check[]; app_roles: string[] }
interface Status {
  configured: boolean; secrets: Record<string, boolean>; test_mailbox: string;
  central_sync: { enabled: boolean; dry_run: boolean }; runs: Run[]; error?: string;
}

const OVERALL: Record<string, { text: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
  pass: { text: "Bestått", variant: "default" },
  fail: { text: "Feilet", variant: "destructive" },
  inconclusive: { text: "Uavklart", variant: "secondary" },
};

async function call(action: "status" | "run"): Promise<Status> {
  const { data, error } = await invokeWithSession<Status>("hub-calendar-diagnostics", { body: { action } });
  if (error) {
    const ctx = (error as any)?.context;
    const parsed = ctx?.json ? await ctx.json().catch(() => null) : null;
    if (parsed?.secrets) return parsed as Status;
    throw new Error(parsed?.error ?? error.message);
  }
  return data as Status;
}

function ResultIcon({ r }: { r: Check["result"] }) {
  if (r === "pass") return <CheckCircle2 className="h-4 w-4 text-primary shrink-0" aria-label="Bestått" />;
  if (r === "fail") return <XCircle className="h-4 w-4 text-destructive shrink-0" aria-label="Feilet" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" aria-label="Uavklart" />;
}

export function HubCalendarDiagnosticsCard() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["hub-calendar-diagnostics"], queryFn: () => call("status"), staleTime: 30_000 });

  const run = async () => {
    setRunning(true); setRunError(null);
    try {
      const res = await call("run");
      if (res.error === "cooldown") setRunError("Vent 30 sekunder mellom hver test.");
      else if (res.error === "not_configured") setRunError("Appens nøkler mangler i backend.");
      qc.setQueryData(["hub-calendar-diagnostics"], res);
    } catch (e: any) { setRunError(e?.message ?? "Testen kunne ikke kjøres."); }
    finally { setRunning(false); }
  };

  const last = data?.runs?.[0];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><CalendarCheck className="h-4 w-4" /> Sentral kalenderapp – tilkoblingstest</CardTitle>
        <CardDescription>
          Leser kun kalenderinformasjon (ingen avtaler) for {data?.test_mailbox ?? "testpostkassen"}, og bekrefter at appen nektes utenfor godkjent gruppe og til e-post.
          Testen oppretter, endrer eller sender aldri noe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Henter status…</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {data && (
          <>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.secrets).map(([name, ok]) => (
                <Badge key={name} variant={ok ? "outline" : "destructive"} className="font-mono text-xs">{name}: {ok ? "lagret" : "mangler"}</Badge>
              ))}
              <Badge variant="secondary">Kalenderskriving: {data.central_sync.enabled ? "PÅ" : "AV"}{data.central_sync.dry_run ? " · prøvemodus" : ""}</Badge>
            </div>
            {!data.configured && (
              <p className="text-sm text-muted-foreground">Testen er inaktiv til alle tre nøklene er lagret i backend-hemmeligheter.</p>
            )}
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={run} disabled={!data.configured || running}>
                {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Test tilkobling
              </Button>
              {runError && <span className="text-sm text-destructive">{runError}</span>}
            </div>
            {last && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Siste test {format(new Date(last.run_at), "d. MMM HH:mm", { locale: nb })}</span>
                  <Badge variant={OVERALL[last.overall]?.variant ?? "outline"}>{OVERALL[last.overall]?.text ?? last.overall}</Badge>
                </div>
                <ul className="space-y-2">
                  {last.checks.map((c) => (
                    <li key={c.id} className="flex gap-2 text-sm">
                      <ResultIcon r={c.result} />
                      <div className="min-w-0">
                        <div className="font-medium">{c.label} <span className="text-muted-foreground font-normal">· forventet {c.expected}{c.httpStatus ? ` · fikk ${c.httpStatus}` : ""}{c.graphCode ? ` ${c.graphCode}` : ""}</span></div>
                        <div className="text-muted-foreground">{c.explanation}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
