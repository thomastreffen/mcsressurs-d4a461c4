// Superadmin rollout overview: ready/not ready per technician, read-only probes, verified batches, stop all.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { invokeWithSession } from "@/lib/invoke-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { batchPhrase, STOP_ALL_PHRASE, ROLLOUT_BATCH_MAX } from "../../../supabase/functions/_shared/central-rollout";

type Person = { id: string; name: string; mailbox: string; status: string; reason: string | null; attention: string | null; last_probe_at: string | null; last_probe_http: number | null };
type Overview = { proof: { create: boolean; update: boolean; delete: boolean }; decision: { go: boolean; blockers: string[]; warnings: string[] }; summary: Record<string, number>; people: Person[]; held_queue: number };

export const ROLLOUT_TEXT: Record<string, string> = {
  automatic_create_not_proven: "Ingen avtale er ennå opprettet og bekreftet helt automatisk (manuell kjøring/kobling teller ikke).",
  unconfirmed_outlook_operations: "Det finnes avtaler sendt til Outlook som ikke er bekreftet – løs disse først.",
  legacy_global_sync_enabled: "Gammel global kalenderbryter er på – skal være av.",
  automatic_update_not_proven: "Automatisk endring av eksisterende avtale er ikke bevist ennå.",
  automatic_delete_not_proven: "Automatisk fjerning av avtale er ikke bevist ennå.",
  conflict_consent_pending: "Noen tildelinger venter på godkjenning fordi montøren har annen opptatt tid i Outlook.",
  held_queue_never_released: "Gamle ventende kalenderelementer holdes tilbake og frigjøres aldri.",
};
const STATUS: Record<string, string> = { active: "Aktiv", ready: "Klar", probe_required: "Trenger test", probe_failed: "Test feilet", excluded: "Utelatt" };
const REASON = (r: string) => r === "never_probed" ? "Aldri testet" : r === "probe_stale" ? "Test eldre enn 7 dager" : r.startsWith("graph_") ? `Microsoft svarte ${r.slice(6)} – sperret` : `Test feilet (${r})`;
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" }) : "–";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const r = await invokeWithSession<T>("job-outlook-app-pilot", { body });
  if (r.error) { const ctx = (r.error as any)?.context; const p = ctx?.json ? await ctx.json().catch(() => null) : null; throw new Error(p?.error ?? r.error.message); }
  return r.data as T;
}

export function CalendarRolloutOverview() {
  const { activeCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [sel, setSel] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [stop, setStop] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["calendar-rollout-overview", activeCompanyId], enabled: !!activeCompanyId,
    queryFn: () => call<Overview>({ action: "rollout_overview", company_id: activeCompanyId }) });
  const people = Array.isArray(data?.people) ? data!.people : [];
  const chosen = people.filter(p => sel.includes(p.id));
  const canProbe = chosen.length >= 1 && chosen.length <= ROLLOUT_BATCH_MAX && chosen.every(p => p.status !== "active");
  const canActivate = !!data?.decision?.go && chosen.length >= 1 && chosen.length <= ROLLOUT_BATCH_MAX && chosen.every(p => p.status === "ready") && ack && phrase === batchPhrase(chosen.length);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["calendar-rollout-overview"] }); qc.invalidateQueries({ queryKey: ["central-calendar-activations"] }); };
  const act = async (fn: () => Promise<string>) => { setBusy(true); setMsg(""); try { setMsg(await fn()); setSel([]); setPhrase(""); setAck(false); } catch (e) { setMsg(`Avvist: ${(e as Error).message}`); } finally { setBusy(false); refresh(); } };
  const probe = () => act(async () => { const r = await call<{ results: { pass: boolean }[] }>({ action: "probe_rollout_batch", company_id: activeCompanyId, technician_ids: sel, confirm_read_only: true }); const ok = (r.results ?? []).filter(x => x.pass).length; return `Kalendertilgang testet (kun lesing): ${ok} av ${(r.results ?? []).length} bestod.`; });
  const activate = () => act(async () => { const r = await supabase.rpc("activate_central_calendar_batch" as never, { _company: activeCompanyId, _techs: sel, _phrase: phrase } as never); if (r.error) throw new Error(r.error.message); return `Aktivert for ${r.data} montører. Gjelder kun nye eller endrede tildelinger fra nå.`; });
  const stopAll = () => act(async () => { const r = await supabase.rpc("revoke_all_central_calendar" as never, { _company: activeCompanyId, _phrase: stop } as never); if (r.error) throw new Error(r.error.message); setStop(""); return `Stoppet for ${r.data} montører. Eksisterende avtaler er ikke endret.`; });

  if (!activeCompanyId) return null;
  if (isLoading) return <p className="text-muted-foreground">Laster utrullingsoversikt…</p>;
  if (error || !data) return <p className="text-destructive">Utrullingsoversikten kunne ikke lastes: {(error as Error)?.message ?? "ukjent"}</p>;
  const d = data.decision ?? { go: false, blockers: [], warnings: [] };
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Utrullingsoversikt">
    <h3 className="font-semibold">Utrulling til alle aktive montører</h3>
    <div className="flex items-center gap-2"><Badge variant={d.go ? "default" : "destructive"}>{d.go ? "GO – neste pulje kan aktiveres" : "NO-GO"}</Badge>
      <span className="text-sm text-muted-foreground">«Alle aktive» er slått av – kun navngitte puljer på maks {ROLLOUT_BATCH_MAX}.</span></div>
    {d.blockers.length > 0 && <ul className="list-disc pl-5 text-sm text-destructive">{d.blockers.map(b => <li key={b}>{ROLLOUT_TEXT[b] ?? b}</li>)}</ul>}
    {d.warnings.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-foreground">{d.warnings.map(b => <li key={b}>{ROLLOUT_TEXT[b] ?? b}</li>)}</ul>}
    <p className="text-sm">Aktive ansatte med egen e-post: {data.summary?.eligible ?? 0} · aktiv: {data.summary?.active ?? 0} · klar: {data.summary?.ready ?? 0} · trenger test: {data.summary?.probe_required ?? 0} · test feilet: {data.summary?.probe_failed ?? 0} · tidligere ansatte utelatt: {data.summary?.former_excluded ?? 0}</p>
    <ul className="divide-y divide-border rounded-md border border-border">{people.map(p => <li key={p.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
      <Checkbox aria-label={`Velg ${p.name}`} disabled={p.status === "active"} checked={sel.includes(p.id)} onCheckedChange={v => setSel(s => v === true ? (s.length < ROLLOUT_BATCH_MAX ? [...s, p.id] : s) : s.filter(x => x !== p.id))} />
      <span className="font-medium">{p.name}</span><span className="text-muted-foreground">{p.mailbox}</span>
      <Badge variant={p.status === "active" || p.status === "ready" ? "secondary" : p.status === "probe_failed" ? "destructive" : "outline"}>{STATUS[p.status] ?? p.status}</Badge>
      {p.reason && <span className="text-muted-foreground">{REASON(p.reason)}</span>}
      {p.attention && <span className="text-destructive">{ROLLOUT_TEXT[p.attention === "outlook_unconfirmed" ? "unconfirmed_outlook_operations" : "conflict_consent_pending"]}</span>}
      <span className="ml-auto text-muted-foreground">Sist testet: {fmt(p.last_probe_at)}{p.last_probe_http ? ` (${p.last_probe_http})` : ""}</span>
    </li>)}</ul>
    <Button variant="outline" disabled={!canProbe || busy} onClick={probe}>Test kalendertilgang for valgte – kun lesing</Button>
    <div className="space-y-2">
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={ack} onCheckedChange={v => setAck(v === true)} /><span>Jeg godkjenner automatisk Outlook-kalender for nøyaktig de valgte montørene. Kun nye eller endrede tildelinger fra nå; ingen e-post, ingen invitasjoner, gamle køelementer frigjøres aldri.</span></label>
      {chosen.length > 0 && <p className="text-sm">Skriv nøyaktig: <code>{batchPhrase(chosen.length)}</code></p>}
      <Input value={phrase} onChange={e => setPhrase(e.target.value)} aria-label="Bekreftelsesfrase for pulje" />
      <Button disabled={!canActivate || busy} onClick={activate}>Aktiver valgt pulje</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <span className="text-sm">Stopp alle i dette selskapet – skriv <code>{STOP_ALL_PHRASE}</code>:</span>
      <Input className="max-w-48" value={stop} onChange={e => setStop(e.target.value)} aria-label="Stoppfrase" />
      <Button variant="destructive" disabled={stop !== STOP_ALL_PHRASE || busy} onClick={stopAll}>Stopp alle</Button>
    </div>
    {msg && <p role="status" className="text-sm">{msg}</p>}
  </section>;
}
