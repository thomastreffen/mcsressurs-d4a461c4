// Superadmin pilot control for the central job calendar. Never enables sync or writes to Outlook.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeWithSession } from "@/lib/invoke-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck } from "lucide-react";
import { DECISION_LABELS } from "../../../supabase/functions/_shared/job-outlook-app-days";

type Any = Record<string, any>;
async function call(body: Any): Promise<Any> {
  const { data, error } = await invokeWithSession<Any>("job-outlook-app-pilot", { body });
  if (error) {
    const ctx = (error as any)?.context;
    const p = ctx?.json ? await ctx.json().catch(() => null) : null;
    throw new Error(p?.error ?? error.message);
  }
  return data as Any;
}
const jobLabel = (x: Any) => x.job ? `${x.job.project_number ?? ""} ${x.job.title ?? ""}`.trim() : "Ukjent jobb";
const fmtDate = (d: string) => new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));
const fmtTime = (iso: string | null) => iso ? new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "–";

export function JobOutlookPilotScopeCard() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["job-outlook-pilot"], queryFn: () => call({ action: "status" }) });
  const [form, setForm] = useState({ event_id: "", technician_id: "", work_date: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sim, setSim] = useState<Any[] | null>(null);

  const run = async (key: string, body: Any, after?: (r: Any) => void) => {
    setBusy(key); setMsg(null);
    try { const r = await call(body); after?.(r); await qc.invalidateQueries({ queryKey: ["job-outlook-pilot"] }); }
    catch (e) { setMsg(`Avvist: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const s = data?.settings;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />Sentral jobbkalender – pilotavgrensning</CardTitle>
        <CardDescription>Én montør, én jobb og én dag om gangen. Ingenting skrives til Outlook herfra, og synken slås ikke på.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {error && <p className="text-destructive">{(error as Error).message}</p>}
        {s && (
          <div className="flex flex-wrap gap-2">
            <Badge variant={s.enabled ? "destructive" : "outline"}>Synk {s.enabled ? "PÅ" : "av"}</Badge>
            <Badge variant="outline">Testmodus {s.dry_run ? "på" : "AV"}</Badge>
            <Badge variant="outline">Pilotpostkasser: {s.pilot_mailboxes.length}</Badge>
            <Badge variant="outline">Tilgang bekreftet: {s.scope_verified ? "ja" : "nei"}</Badge>
          </div>
        )}

        <div className="space-y-2">
          <p className="font-medium">Legg til pilotdag</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="Jobb-ID" value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value.trim() })} />
            <Input placeholder="Montør-ID" value={form.technician_id} onChange={(e) => setForm({ ...form, technician_id: e.target.value.trim() })} />
            <Input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} />
          </div>
          <Button size="sm" disabled={!!busy || !form.event_id || !form.technician_id || !form.work_date}
            onClick={() => run("add", { action: "add_target", ...form, expires_hours: 24 }, () => { setForm({ event_id: "", technician_id: "", work_date: "" }); setMsg("Pilotdag lagt til (utløper om 24 timer)."); })}>
            Legg til
          </Button>
        </div>

        <div className="space-y-2">
          <p className="font-medium">Pilotdager</p>
          {(data?.targets ?? []).length === 0 && <p className="text-muted-foreground">Ingen. Alt er stengt.</p>}
          {(data?.targets ?? []).map((t: Any) => {
            const active = !t.revoked_at && Date.parse(t.expires_at) > Date.now();
            return (
              <div key={t.id} className="rounded-md border p-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.technician_name ?? "Montør"}</span>
                  <span>{jobLabel(t)}</span><span>· {fmtDate(t.work_date)}</span>
                  <Badge variant={active ? "default" : "outline"}>{t.revoked_at ? "Trukket tilbake" : active ? "Aktiv" : "Utløpt"}</Badge>
                </div>
                {active && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`p${t.id}`, { action: "probe_mailbox", target_id: t.id }, (r) => setMsg(r.result.pass ? "Lesetest bestått (200): appen når kalenderen." : `Lesetest feilet: ${r.result.http}${r.result.graph_code ? ` ${r.result.graph_code}` : ""}`))}>Lesetest kalender</Button>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`s${t.id}`, { action: "simulate", target_id: t.id }, (r) => setSim(r.days))}>Simuler</Button>
                    <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run(`r${t.id}`, { action: "revoke_target", target_id: t.id })}>Trekk tilbake</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {sim && (
          <div className="rounded-md border p-2 space-y-1">
            <p className="font-medium">Simulering (testmodus, ingen skriving)</p>
            {sim.map((d, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <span>{fmtDate(d.work_date)} {fmtTime(d.start_at)}–{fmtTime(d.end_at)}</span>
                <Badge variant={d.in_pilot ? "default" : "outline"}>{d.in_pilot ? "I pilot" : "Stengt"}</Badge>
                <span className="text-muted-foreground">{d.in_pilot ? DECISION_LABELS[d.decision] : "Ikke berørt"}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="font-medium">Ventende kø – holdt tilbake ({(data?.held_queue ?? []).length})</p>
          <p className="text-muted-foreground">Gamle forsøk sendes aldri automatisk. Frigi kun enkeltrader med aktiv pilotdag.</p>
          {(data?.held_queue ?? []).map((q: Any) => (
            <div key={q.id} className="flex flex-wrap items-center gap-2">
              <span>{q.technician_name ?? "Montør"} · {jobLabel(q)}</span>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`q${q.id}`, { action: "release_queue", queue_id: q.id, idempotency_key: crypto.randomUUID() }, () => setMsg("Raden er frigitt. Den behandles først når synken er slått på."))}>Frigi</Button>
            </div>
          ))}
        </div>
        {msg && <p role="status">{msg}</p>}
      </CardContent>
    </Card>
  );
}
