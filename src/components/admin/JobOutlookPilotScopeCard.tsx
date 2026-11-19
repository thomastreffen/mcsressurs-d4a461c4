// Superadmin pilot control for the central job calendar. Never enables sync or writes to Outlook.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeWithSession } from "@/lib/invoke-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { freshMailboxProbe } from "../../../supabase/functions/_shared/job-outlook-pilot-selector";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck } from "lucide-react";
import { simOutcome, globalGateNotes } from "../../../supabase/functions/_shared/job-outlook-pilot-sim-view";
import { JobCalendarOneShot } from "./JobCalendarOneShot";
import { CentralCalendarReadiness } from "./CentralCalendarReadiness";
import { CalendarRolloutReadiness } from "./CalendarRolloutReadiness";
import { SystemSenderDiagnostics } from "./SystemSenderDiagnostics";
import { TechnicianMailboxTest } from "./TechnicianMailboxTest";
import { CentralCalendarActivation } from "./CentralCalendarActivation";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
  const [search, setSearch] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const { data: candidates } = useQuery({ queryKey: ["pilot-job-search", search], queryFn: () => call({ action: "candidates", search }), enabled: search.trim().length >= 2 });
  const { data: choice, isFetching: loadingChoice } = useQuery({ queryKey: ["pilot-job-choice", form.event_id], queryFn: () => call({ action: "candidates", event_id: form.event_id }), enabled: !!form.event_id });
  const technician = choice?.technicians?.find((t: Any) => t.id === form.technician_id);
  const day = technician?.days?.find((d: Any) => d.work_date === form.work_date);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sim, setSim] = useState<Any[] | null>(null);
  const [simGlobal, setSimGlobal] = useState<Any | null>(null);

  const run = async (key: string, body: Any, after?: (r: Any) => void) => {
    setBusy(key); setMsg(null);
    try { const r = await call(body); after?.(r); await qc.invalidateQueries({ queryKey: ["job-outlook-pilot"] }); }
    catch (e) { const m = (e as Error).message; setMsg(m === "active_target_exists" ? "Avvist: en aktiv pilotdag finnes allerede for denne personen og dagen – bruk den eller trekk den tilbake." : `Avvist: ${m}`); }
    finally { setBusy(null); }
  };

  const s = data?.settings;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />Sentral jobbkalender – pilotavgrensning</CardTitle>
        <CardDescription>Pilotutvalg og lesetester slår ikke synken på. Mats’ engangsopprettelse har egen bekreftelse nederst.</CardDescription>
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
          <Input aria-label="Søk jobb" placeholder="Søk jobbnummer eller navn, f.eks. 60570" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="min-w-0 space-y-1"><p>Jobb</p>
              <Select value={form.event_id} onValueChange={id => { setForm({ event_id: id, technician_id: "", work_date: "" }); setConfirmed(false); setSim(null); }}>
                <SelectTrigger aria-label="Jobb"><SelectValue placeholder="Velg jobb" /></SelectTrigger>
                <SelectContent>{(candidates?.jobs ?? []).map((j: Any) => <SelectItem key={j.id} value={j.id}>{j.project_number ? `${j.project_number} · ` : ""}{j.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1"><p>Montør</p>
              <Select value={form.technician_id} disabled={!form.event_id || loadingChoice} onValueChange={id => { setForm({ ...form, technician_id: id, work_date: "" }); setConfirmed(false); setSim(null); }}>
                <SelectTrigger aria-label="Montør"><SelectValue placeholder="Velg tildelt montør" /></SelectTrigger>
                <SelectContent>{(choice?.technicians ?? []).map((t: Any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1"><p>Arbeidsdag · Oslo</p>
              <Select value={form.work_date} disabled={!technician} onValueChange={date => { setForm({ ...form, work_date: date }); setConfirmed(false); }}>
                <SelectTrigger aria-label="Arbeidsdag"><SelectValue placeholder="Velg planlagt dag" /></SelectTrigger>
                <SelectContent>{(technician?.days ?? []).map((d: Any) => <SelectItem key={d.work_date} value={d.work_date} disabled={d.synced}>{fmtDate(d.work_date)} · {fmtTime(d.start_at)}–{fmtTime(d.end_at)} · {d.synced ? "Synket – urørt" : "I Hub"}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {day && <div className="space-y-2 border-l-2 border-border pl-3">
            <p className="break-words font-medium">{choice?.job?.title} · {technician.name}</p>
            <p>{fmtDate(day.work_date)} {fmtTime(day.start_at)}–{fmtTime(day.end_at)} Europe/Oslo</p>
            <p className="text-muted-foreground">Kun lesetest og simulering. Ingen kalenderskriving eller køfrigivelse er godkjent.</p>
            <Button size="sm" variant="outline" disabled={!!busy || day.synced} onClick={() => setConfirmed(true)}>Bekreft denne pilotdagen</Button>
          </div>}
          {confirmed && day && <Button size="sm" disabled={!!busy || day.synced}
            onClick={() => run("add", { action: "add_target", ...form, confirm_day: true, expires_hours: 24 }, () => { setConfirmed(false); setForm({ event_id: "", technician_id: "", work_date: "" }); setMsg("Pilotdag registrert for lesetest og simulering (24 timer). Outlook er urørt."); })}>
            Registrer bekreftet dag – ingen skriving
          </Button>}

        </div>

        <div className="space-y-2">
          <p className="font-medium">Pilotdager</p>
          {(data?.targets ?? []).length === 0 && <p className="text-muted-foreground">Ingen. Alt er stengt.</p>}
          {(data?.targets ?? []).map((t: Any) => {
            const active = !t.revoked_at && Date.parse(t.expires_at) > Date.now();
            const readPassed = freshMailboxProbe(t.probe ?? null, new Date());
            return (
              <div key={t.id} className="rounded-md border p-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.technician_name ?? "Montør"}</span>
                  <span>{jobLabel(t)}</span><span>· {fmtDate(t.work_date)}</span>
                  <Badge variant={active ? "default" : "outline"}>{t.revoked_at ? "Trukket tilbake" : active ? "Aktiv" : "Utløpt"}</Badge>
                </div>
                <p className="text-muted-foreground">{readPassed ? "Lesetest 200 bestått · Simulering tilgjengelig" : "Lesetest kreves før simulering"} · Skriving sperret</p>
                {active && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`p${t.id}`, { action: "probe_mailbox", target_id: t.id }, (r) => setMsg(r.result.pass ? "Lesetest bestått (200): appen når kalenderen." : `Lesetest feilet: ${r.result.http}${r.result.graph_code ? ` ${r.result.graph_code}` : ""}`))}>Lesetest kalender</Button>
                    <Button size="sm" variant="outline" disabled={!!busy || !readPassed} onClick={() => run(`s${t.id}`, { action: "simulate", target_id: t.id }, (r) => { setSim(r.days); setSimGlobal(r.global ?? null); })}>Simuler</Button>
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
            {simGlobal && globalGateNotes(simGlobal as any).length > 0 && (
              <p className="text-muted-foreground">Holdt igjen uansett: {globalGateNotes(simGlobal as any).join(", ")}. Simuleringen viser hva som ville skjedd om bare denne pilotdagen ble åpnet.</p>
            )}
            {sim.map((d, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <span>{d.technician_name ?? "Montør"}</span>
                <span>{fmtDate(d.work_date)} {fmtTime(d.start_at)}–{fmtTime(d.end_at)}</span>
                <Badge variant={d.in_pilot ? "default" : "outline"}>{d.in_pilot ? "Pilotdag" : "Utenfor pilot"}</Badge>
                <span className={simOutcome(d as any).tone === "blocked" ? "text-destructive" : "text-muted-foreground"}>{simOutcome(d as any).label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="font-medium">Ventende kø – holdt tilbake ({(data?.held_queue ?? []).length})</p>
          <p className="text-muted-foreground">Gamle forsøk er holdt tilbake. Ingen frigivelse i denne pilotfasen.</p>
          {(data?.held_queue ?? []).map((q: Any) => (
            <div key={q.id} className="flex flex-wrap items-center gap-2">
              <span>{q.technician_name ?? "Montør"} · {jobLabel(q)}</span>
              <Badge variant="outline">Holdt – separat skrivegodkjenning kreves</Badge>
            </div>
          ))}
        </div>
        {msg && <p role="status">{msg}</p>}
        <ErrorBoundary><TechnicianMailboxTest key={"mailbox-test"} /></ErrorBoundary>
        <ErrorBoundary><CentralCalendarActivation key={"central-activation"} /></ErrorBoundary>
        <ErrorBoundary><CentralCalendarReadiness /></ErrorBoundary>
        <ErrorBoundary><CalendarRolloutReadiness key={`${form.event_id}:${form.technician_id}:${form.work_date}`} selection={form} eligible={!!day} /></ErrorBoundary>
        <JobCalendarOneShot />
        <SystemSenderDiagnostics />
      </CardContent>
    </Card>
  );
}
