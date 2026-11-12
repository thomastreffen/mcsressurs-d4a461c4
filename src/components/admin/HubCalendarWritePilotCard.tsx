// Admin-only synthetic write pilot on the single test mailbox. Shows only step status codes – never ids, tokens or content.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeWithSession } from "@/lib/invoke-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FlaskConical, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

const CONFIRM = "KJØR TESTPILOT";
interface Step { id: string; label: string; method: string; expectStatus: number[]; httpStatus?: number; result: "pass" | "fail"; graphCode?: string; phase?: string; category?: string; reason?: string }
interface Run { started_at?: string; overall: string; cleanup_state: string; event_id_present: boolean; steps: Step[] }
interface Status { mailbox: string; runs: Run[]; run?: Run; error?: string }

const ERR: Record<string, string> = {
  no_diagnostic: "Kjør «Test tilkobling» først.", diagnostic_not_passed: "Siste tilkoblingstest er ikke bestått.",
  diagnostic_too_old: "Tilkoblingstesten er eldre enn 24 timer – kjør den på nytt.", diagnostic_incomplete: "Tilkoblingstesten mangler steg – kjør den på nytt.",
  already_running: "En pilot kjører allerede.", duplicate_run: "Denne kjøringen er allerede registrert.", app_identity_failed: "App-identiteten kunne ikke bekreftes. Ingenting ble skrevet.",
  foreign_pilot_mailbox_configured: "Andre postkasser står i pilotlisten – stoppet.", not_configured: "Appens nøkler mangler.",
};
const CLEAN: Record<string, string> = { deleted: "Testavtalen er slettet", pending: "Opprydding venter", failed: "Opprydding feilet – kontakt IT", none: "Ingen avtale opprettet" };

async function call(body: Record<string, unknown>): Promise<Status> {
  const { data, error } = await invokeWithSession<Status>("hub-calendar-write-pilot", { body });
  if (error) {
    const ctx = (error as any)?.context;
    const parsed = ctx?.json ? await ctx.json().catch(() => null) : null;
    throw new Error(ERR[parsed?.error] ?? parsed?.error ?? error.message);
  }
  return data as Status;
}

export function HubCalendarWritePilotCard() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["hub-calendar-write-pilot"], queryFn: () => call({ action: "status" }), staleTime: 30_000 });

  const run = async () => {
    setRunning(true); setErr(null);
    try {
      const res = await call({ action: "run", confirm, mailbox: data?.mailbox, idempotency_key: crypto.randomUUID() });
      qc.setQueryData(["hub-calendar-write-pilot"], res); setConfirm("");
    } catch (e: any) { setErr(e?.message ?? "Piloten kunne ikke kjøres."); }
    finally { setRunning(false); }
  };
  const last = data?.runs?.[0];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Skrivepilot i testkalender</CardTitle>
        <CardDescription>
          Oppretter, endrer og sletter én nøytral testavtale i <span className="font-medium">{data?.mailbox ?? "testpostkassen"}</span> – aldri i ansattes kalendere.
          Ingen deltakere, ingen e-post, ingen jobber. Krever bestått tilkoblingstest siste 24 timer. Kalendersynk for jobber forblir AV.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={`Skriv ${CONFIRM}`} className="sm:max-w-56" aria-label="Bekreftelse" />
          <Button size="sm" onClick={run} disabled={confirm !== CONFIRM || running || !data}>
            {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Kjør skrivepilot i testkalender
          </Button>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {last && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {last.started_at && <span className="text-muted-foreground">Siste pilot {format(new Date(last.started_at), "d. MMM HH:mm", { locale: nb })}</span>}
              <Badge variant={last.overall === "pass" ? "default" : "destructive"}>{last.overall === "pass" ? "Bestått" : last.overall === "running" ? "Pågår" : "Feilet"}</Badge>
              <Badge variant="outline">{CLEAN[last.cleanup_state] ?? last.cleanup_state}</Badge>
              <Badge variant="outline">Hendelses-ID: {last.event_id_present ? "mottatt" : "ingen"}</Badge>
            </div>
            <ul className="space-y-1">
              {last.steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  {s.result === "pass" ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                  <span>{s.label} <span className="text-muted-foreground">· {s.method} · forventet {s.expectStatus.join("/")} · fikk {s.httpStatus ?? "–"}{s.graphCode ? ` ${s.graphCode}` : ""}</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
