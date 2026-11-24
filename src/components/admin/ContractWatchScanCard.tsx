// Manual historical test (phase 1). Read-only toward Microsoft; nothing is sent, created or notified.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invokeWithSession } from "@/lib/invoke-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Loader2 } from "lucide-react";
import { QueryErrorNotice } from "./QueryErrorNotice";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { KIND_LABEL, ACTION_LABEL, REASON_LABEL } from "@/lib/contract-watch-labels";

interface Run { id: string; stale?: boolean; heartbeat_at?: string | null; lease_until?: string | null; total_batches?: number | null; done_batches?: number; failed_batches?: number; mode?: string; pilot_version?: number; discard_reasons?: Record<string, number>; started_at: string; finished_at: string | null; status: string; counts: Record<string, number>; error_code: string | null; error_detail: string | null }
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
  ai_credits: "AI-kreditter er brukt opp. Testen er stoppet; fyll på og start en ny test.",
  ai_denied: "AI-tjenesten avviste forespørselen (arbeidsområdets innstillinger). Testen er stoppet.",
  ai_not_configured: "AI-tjenesten er ikke riktig satt opp. Testen er stoppet.",
  ai_rejected: "AI-tjenesten avviste forespørselen. Testen er stoppet.",
  partial_ai_failures: "Fullført, men noen deler kunne ikke analyseres etter tre forsøk (se antall under).",
  plan_store_failed: "Kunne ikke lagre arbeidslisten. Ingenting er analysert.",
  stale_timeout: "Markert som tidsavbrutt etter at testen sluttet å gi livstegn.",
  stale_running: "En tidligere test henger. Marker den som tidsavbrutt først.",
  not_stale: "Testen er fortsatt aktiv og kan ikke markeres som tidsavbrutt ennå.",
  run_not_found: "Fant ikke testen.",
  invalid_lookup: "Skriv dato og klokkeslett.",
};
const STATUS: Record<string, string> = { running: "Kjører", done: "Fullført", failed: "Feilet", blocked: "Stoppet", timeout: "Tidsavbrutt" };
const COUNT: Record<string, string> = { read_inbox: "Lest innboks", read_sentitems: "Lest sendt", prefiltered_out: "Filtrert bort", threads_analyzed: "Tråder analysert", threads_planned: "Tråder i arbeidslisten", ai_found: "Mulige løfter", ai_rejected_ungrounded: "Avvist (ikke ordrett i e-post)", stored: "Lagret", window_messages: "Meldinger i vinduet", ...Object.fromEntries(Object.entries(KIND_LABEL).map(([k, v]) => [`kind_${k}`, v])) };

interface Lookup { window: { from: string; to: string }; messages: { folder: string; sent_at: string; sender_domain: string; prefilter: string; text_chars: number; analyzed: boolean }[]; findings: { kind: string; action_status?: string; quote: string; folder: string; sent_at: string; customer?: string | null; refs?: string[] }[]; note: string }

async function call(action: "status" | "run_historical_test" | "lookup" | "continue" | "mark_timeout", extra: Record<string, string> = {}): Promise<any> {
  const { data, error } = await invokeWithSession<{ runs: Run[] }>("contract-watch-scan", { body: { action, ...extra } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const p = await ctx?.clone?.().json?.().catch(() => null);
    if (p?.error) throw new Error(`${ERR[p.error] ?? p.error}${p.detail ? ` (${p.detail})` : ""} [${p.error}]`);
    const st = ctx?.status;
    throw new Error(st ? `Funksjonen svarte HTTP ${st} uten forklaring${st >= 500 ? " – trolig avbrutt (tidsgrense/minne)" : ""}.` : `Fikk ikke kontakt med funksjonen (${error.message}).`);
  }
  return data;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ContractWatchScanCard({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["cw-scan"], queryFn: () => call("status") });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const [progress, setProgress] = useState<Run | null>(null);
  const [waitNote, setWaitNote] = useState<string | null>(null);
  // Drives the resumable test: one short request per step (max 3 AI calls), so no single request can hit the time limit.
  const drive = async (startId?: string) => {
    let r: Run = startId ? { id: startId } as Run : (await call("run_historical_test")).run;
    setProgress(r);
    while (alive.current && r.status !== "done" && r.status !== "failed" && r.status !== "blocked" && r.status !== "timeout") {
      const out = await call("continue", { run_id: r.id });
      r = out.run; setProgress(r);
      const until = out.next_attempt_at ? Date.parse(out.next_attempt_at) - Date.now() : 0;
      if (out.busy) { setWaitNote("Et annet steg pågår – venter litt."); await sleep(5000); }
      else if (until > 1000) { setWaitNote(`Venter ${Math.ceil(until / 1000)} s før nytt forsøk (AI/Microsoft ba om pause).`); await sleep(Math.min(until, 60000)); }
      else setWaitNote(null);
    }
    setWaitNote(null);
    return r;
  };
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["cw-scan"] }); qc.invalidateQueries({ queryKey: ["cw-items"] }); qc.invalidateQueries({ queryKey: ["cw-audit"] }); };
  const run = useMutation({ mutationFn: (resumeId?: string) => drive(resumeId), onSettled: invalidate });
  const markTimeout = useMutation({ mutationFn: (id: string) => call("mark_timeout", { run_id: id }), onSettled: invalidate });
  const listed = (q.data?.runs as Run[] | undefined)?.find((r) => r.mode !== "lookup");
  const last = run.isPending && progress?.started_at ? progress : listed;
  const [day, setDay] = useState(""); const [time, setTime] = useState("");
  const look = useMutation({ mutationFn: () => call("lookup", { date: day, time }) as Promise<Lookup>, onSettled: () => qc.invalidateQueries({ queryKey: ["cw-audit"] }) });
  const fmt = (iso: string) => new Date(iso).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" });
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Historisk test v3 – siste 30 dager <Badge variant="outline">Kun manuell test / ikke løpende overvåking</Badge></CardTitle>
      <CardDescription>Kun når du klikker. Leser emne, avsender/mottaker, tidspunkt og bare den nye delen av hver e-post (uten sitert tråd), renset for lenker og ID-numre og kuttet til 1200 tegn. Teksten holdes bare i minnet under kjøringen; vedlegg hentes aldri. Lagret blir bare kort kildesitat, type, status og kontrollsum. Ukjente kunder tas med og vises som «ukjent kunde». Interne e-poster (kolleger, montører) tas også med og vurderes som interne forespørsler, avvik, purringer eller dokumentasjonsbehov. Ingenting sendes, ingen jobber eller kalenderavtaler lages, ingen varsles. Funn merkes TEST v3, adskilt fra v1 og v2.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3 text-sm">
      {q.isError && <QueryErrorNotice what="status for historisk test" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!enabled || run.isPending || last?.status === "running"} onClick={() => run.mutate(undefined)}>{run.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Kjør historisk test</Button>
        {!run.isPending && last?.status === "running" && last.total_batches != null && <Button size="sm" variant="outline" disabled={!enabled} onClick={() => run.mutate(last.id)}>Fortsett testen</Button>}
        {!run.isPending && last?.status === "running" && last.stale && <Button size="sm" variant="outline" disabled={markTimeout.isPending} onClick={() => markTimeout.mutate(last.id)}>Marker som tidsavbrutt</Button>}
      </div>
      {!enabled && <p className="text-muted-foreground">Slå på Avtalevakt først.</p>}
      {!run.isPending && last?.status === "running" && <p className="text-muted-foreground">{last.stale ? "Denne testen har ikke gitt livstegn på over 10 minutter. Du kan fortsette den (om arbeidslisten finnes) eller markere den som tidsavbrutt. Funn som allerede er lagret beholdes; ingenting slettes." : "Testen er ikke ferdig. Den fortsetter bare mens denne siden er åpen – trykk «Fortsett testen»."}</p>}
      {run.isPending && <p className="text-muted-foreground" aria-live="polite">{progress?.total_batches != null ? `Analyserer del ${Math.min((progress.done_batches ?? 0) + (progress.failed_batches ?? 0) + 1, progress.total_batches)} av ${progress.total_batches}` : "Leser oversikt over e-poster…"} – la siden være åpen.{waitNote ? ` ${waitNote}` : ""}</p>}
      {run.error && <p role="alert" className="text-destructive">{(run.error as Error).message} Testen kan fortsettes – ferdige deler kjøres ikke på nytt.</p>}
      {markTimeout.error && <p role="alert" className="text-destructive">{(markTimeout.error as Error).message}</p>}
      {last && <div className="space-y-1">
        <p><Badge variant={last.status === "done" ? "default" : last.status === "running" ? "outline" : "destructive"}>{STATUS[last.status] ?? last.status}</Badge> {new Date(last.started_at).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}{last.error_code ? ` – ${ERR[last.error_code] ?? last.error_code}${last.error_detail ? ` (${last.error_detail})` : ""}` : ""}</p>
        <p className="text-xs text-muted-foreground">Versjon {last.pilot_version ?? 1}{last.total_batches != null ? ` · Deler ferdig ${last.done_batches ?? 0} av ${last.total_batches}${last.failed_batches ? `, ${last.failed_batches} feilet` : ""}` : ""}{last.heartbeat_at ? ` · Sist livstegn ${new Date(last.heartbeat_at).toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo" })}` : ""}</p>
        <ul className="flex flex-wrap gap-2">{Object.entries(last.counts ?? {}).map(([k, v]) => <li key={k}><Badge variant="outline">{COUNT[k] ?? k}: {v}</Badge></li>)}</ul>
        {Object.keys(last.discard_reasons ?? {}).length > 0 && <div><p className="font-medium">Hvorfor meldinger ble utelatt (antall)</p>
          <ul className="flex flex-wrap gap-2">{Object.entries(last.discard_reasons!).map(([k, v]) => <li key={k}><Badge variant="secondary">{REASON_LABEL[k] ?? k}: {v}</Badge></li>)}</ul></div>}
      </div>}
      <div className="space-y-2 border-t border-border pt-3">
        <p className="font-medium">Kontroller en bestemt e-post</p>
        <p className="text-muted-foreground">Sjekker meldinger ±10 minutter rundt tidspunktet (norsk tid) og viser hva analysen ville gjort. Ingenting lagres som funn.</p>
        <div className="flex flex-wrap items-end gap-2">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-auto" aria-label="Dato" />
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-auto" aria-label="Klokkeslett" />
          <Button size="sm" variant="outline" disabled={!enabled || !day || !time || look.isPending} onClick={() => look.mutate()}>{look.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Kontroller</Button>
        </div>
        {look.error && <p role="alert" className="text-destructive">{(look.error as Error).message}</p>}
        {look.data && <div className="space-y-2">
          <p>Vindu {fmt(look.data.window.from)} – {fmt(look.data.window.to)}: {look.data.messages.length === 0 ? "ingen meldinger funnet i Thomas sin innboks eller sendt-mappe." : `${look.data.messages.length} melding(er).`}</p>
          <ul className="space-y-1">{look.data.messages.map((m, n) => <li key={n}>{m.folder === "inbox" ? "Mottatt" : "Sendt"} {fmt(m.sent_at)} · fra {m.sender_domain || "ukjent domene"} · {m.prefilter === "kept" ? (m.analyzed ? "analysert" : "ikke analysert (trådgrense)") : `utelatt: ${REASON_LABEL[m.prefilter] ?? m.prefilter}`} · {m.text_chars} tegn lesbar tekst</li>)}</ul>
          {look.data.messages.some((m) => m.analyzed) && (look.data.findings.length === 0 ? <p className="text-muted-foreground">AI fant ingen oppfølgingspunkt i disse meldingene.</p> :
            <ul className="space-y-1">{look.data.findings.map((f, n) => <li key={n}><Badge variant="outline">{KIND_LABEL[f.kind] ?? f.kind}</Badge> {f.action_status && <Badge>{ACTION_LABEL[f.action_status]}</Badge>} «{f.quote}» · Kunde: {f.customer ?? "ukjent"}{f.refs?.length ? ` · ${f.refs.join(", ")}` : ""}</li>)}</ul>)}
        </div>}
      </div>
    </CardContent>
  </Card>;
}
