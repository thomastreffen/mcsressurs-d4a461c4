// One-click isolated central calendar system test for ONE activated mailbox. Proves the app-only
// Graph write path (create, exact readback, change, delete). It does NOT prove the Ressursplan trigger.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeWithSession } from "@/lib/invoke-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { osloToUtcISO } from "@/lib/work-days";
import { smokePhrase } from "../../../supabase/functions/_shared/central-smoke-test";
import { QueryErrorNotice } from "./QueryErrorNotice";

type P = { id: string; name: string; mailbox: string };
type Step = { step: string; http: number | null; ok: boolean };
const STEP: Record<string, string> = { slot_free_get: "Ledig tid sjekket", create_post: "Avtale opprettet", create_reconcile_get: "Ukjent svar – oppslag", verify_get: "Lest tilbake og kontrollert", update_patch: "Avtale endret", verify_update_get: "Endring kontrollert", delete: "Avtale slettet", verify_deleted: "Bekreftet borte" };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const r = await invokeWithSession<T>("job-outlook-app-pilot", { body });
  if (r.error) { const ctx = (r.error as any)?.context; const p = ctx?.json ? await ctx.json().catch(() => null) : null; throw new Error(p?.error ?? r.error.message); }
  return r.data as T;
}

export function CentralSmokeTest({ companyId, active }: { companyId: string; active: P[] }) {
  const qc = useQueryClient();
  const [tech, setTech] = useState(active[0]?.id ?? "");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("07:00");
  const [ack, setAck] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ pass: boolean; failed_step: string | null; steps: Step[]; stranded: boolean; graph_event_id: string | null; transaction_id: string } | null>(null);
  const [err, setErr] = useState("");
  const status = useQuery({ queryKey: ["central-smoke-status", companyId], queryFn: () => call<{ stranded: { run_id: string; mailbox: string; created_at: string }[] }>({ action: "central_smoke_status", company_id: companyId }) });
  const person = active.find(p => p.id === tech);
  const stranded = status.data?.stranded ?? [];
  const start = day && time ? osloToUtcISO(day, time) : "";
  const end = start ? new Date(Date.parse(start) + 30 * 60_000).toISOString() : "";
  const can = !!person && !!start && ack && phrase === smokePhrase(person.mailbox) && stranded.length === 0 && status.isSuccess;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["central-smoke-status"] }); qc.invalidateQueries({ queryKey: ["calendar-rollout-overview"] }); };
  const run = async () => { setBusy(true); setErr(""); setOut(null); try { setOut(await call({ action: "central_smoke_test", company_id: companyId, technician_id: tech, start, end, phrase })); setPhrase(""); setAck(false); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); refresh(); } };
  const clean = async (run_id: string) => { setBusy(true); setErr(""); try { const r = await call<{ ok: boolean; reason?: string }>({ action: "central_smoke_cleanup", company_id: companyId, run_id }); if (!r.ok) setErr(`Opprydding feilet: ${r.reason ?? "ukjent"}`); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); refresh(); } };

  if (active.length === 0) return null;
  return <div className="space-y-2 rounded-md border border-border p-3" aria-label="Systemtest kalender">
    <h4 className="font-medium">Systemtest av Outlook-kalender (ett klikk)</h4>
    <p className="text-sm text-muted-foreground">Lager én nøytral avtale «MCS Hub systemtest – ikke en jobb» (vist som ledig, 30 min, ingen deltakere, ingen e-post) i én aktivert montørs kalender, leser den tilbake, endrer den, sletter den og bekrefter at den er borte. Beviser kalenderforbindelsen – <strong>ikke</strong> at vanlige Ressursplan-tildelinger trigges.</p>
    {status.isError && <QueryErrorNotice what="status for tidligere systemtester (testen er sperret til dette er kjent)" error={status.error} onRetry={() => status.refetch()} retrying={status.isFetching} />}
    {stranded.length > 0 && <div className="rounded-md border border-destructive p-2 text-sm text-destructive">
      {stranded.map(s => <div key={s.run_id} className="flex items-center gap-2">Testavtale ble ikke bekreftet slettet i {s.mailbox}. <Button size="sm" variant="destructive" disabled={busy} onClick={() => clean(s.run_id)}>Rydd opp testavtalen</Button></div>)}
    </div>}
    <div className="flex flex-wrap items-center gap-2">
      <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Montør for systemtest" value={tech} onChange={e => { setTech(e.target.value); setPhrase(""); }}>
        {active.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <Input type="date" className="w-40" aria-label="Dato for systemtest" value={day} onChange={e => setDay(e.target.value)} />
      <Input type="time" className="w-28" aria-label="Starttid for systemtest" value={time} onChange={e => setTime(e.target.value)} />
      <span className="text-xs text-muted-foreground">30 min, norsk tid. Må være ledig og minst 1 time frem.</span>
    </div>
    <label className="flex items-start gap-2 text-sm"><Checkbox checked={ack} onCheckedChange={v => setAck(v === true)} /><span>Jeg godkjenner at Hub oppretter, endrer og sletter én testavtale i nøyaktig denne kalenderen nå.</span></label>
    {person && <p className="text-sm">Skriv nøyaktig: <code>{smokePhrase(person.mailbox)}</code></p>}
    <Input value={phrase} onChange={e => setPhrase(e.target.value)} aria-label="Bekreftelsesfrase for systemtest" />
    <Button disabled={!can || busy} onClick={run}>{busy ? "Kjører…" : "Kjør systemtest"}</Button>
    {err && <p className="text-sm text-destructive" role="alert">Avvist: {err}</p>}
    {out && <div role="status" className="space-y-1 text-sm">
      <p className={out.pass ? "font-medium" : "font-medium text-destructive"}>{out.pass ? "BESTÅTT – opprettet, kontrollert, endret og slettet." : `FEILET ved «${STEP[out.failed_step ?? ""] ?? out.failed_step}»${out.stranded ? " – testavtalen kan ligge igjen, bruk «Rydd opp»." : ""}`}</p>
      <ul className="pl-4">{out.steps.map((s, i) => <li key={i}>{s.ok ? "✓" : "✗"} {STEP[s.step] ?? s.step} {s.http ? `(${s.http})` : ""}</li>)}</ul>
      <p className="text-xs text-muted-foreground">Referanse: {out.transaction_id}{out.graph_event_id ? ` · Outlook-ID lagret i revisjonslogg` : ""}</p>
    </div>}
  </div>;
}
