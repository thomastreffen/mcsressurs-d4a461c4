import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invokeWithSession } from "@/lib/invoke-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ONE_SHOT } from "../../../supabase/functions/_shared/job-calendar-one-shot";

type Preview = { run_id: string; payload_hash: string; expires_at: string; mailbox: string; local_time: string; approval: string; payload: { subject: string; body: { content: string }; location?: { displayName: string } }; request_method: string; request_path: string };
type Result = { preview?: Preview; state?: string; consumed?: boolean; runs?: { id: string; state: string; consumed_at: string | null; event_id_persisted: boolean; http_status: number | null }[] };
async function call(body: Record<string, unknown>): Promise<Result> {
  const r = await invokeWithSession<Result>("job-calendar-one-shot", { body });
  if (r.error) {
    let code = r.error.message;
    const ctx = (r.error as any).context;
    if (ctx?.json) { const details = await ctx.json().catch(() => null); code = details?.error ?? code; }
    throw new Error(code);
  }
  return r.data ?? {};
}
const messages: Record<string, string> = {
  diagnostic_too_old: "Le kontroll av kalenderappens avgrensning er eldre enn 24 timer. Kjør tilkoblingskontrollen over på nytt.",
  fresh_200_required: "Kjør Mats’ kalenderlesetest på nytt før forhåndskontrollen.",
  pilot_expired: "Pilotdagen er utløpt. Bekreft samme dag på nytt i pilotutvalget.",
  existing_mapping_requires_reconciliation: "En kalenderkobling finnes allerede. Ingen ny avtale opprettes.",
  duplicate_or_calendar_conflict: "En avtale eller konflikt finnes allerede i denne perioden. Ingen ny avtale opprettes.",
  stopped_requires_status_check: "Stoppet. Kontroller forsøksstatus; et ukjent resultat må lesekontrolleres, aldri sendes på nytt.",
  preflight_expired_or_consumed: "Forhåndskontrollen er utløpt eller allerede brukt.",
  preview_changed: "Jobben eller planen har endret seg. Ny forhåndskontroll kreves.",
  individual_response_blocks_pilot: "Mats’ eget svar sperrer denne piloten.",
};
const outcomes: Record<string, string> = {
  succeeded: "Avtalen er bekreftet i Microsoft, og nøyaktig kalender-ID er lagret. Dette bekrefter ikke at Mats har lest den.",
  uncertain: "Microsoft-resultatet er ukjent. Tillatelsen er brukt; bare lesekontroll er tilgjengelig.",
  failed: "Microsoft avviste forsøket. Tillatelsen er brukt; ingen automatisk gjentakelse.",
  already_claimed: "Tillatelsen er allerede brukt eller dagens vilkår er endret. Ingenting sendes på nytt.",
  duplicate_or_conflict: "En eksisterende avtale sperrer opprettelsen.",
  unresolved_no_repost: "Lesekontrollen kunne ikke bekrefte avtalen. Ingen ny opprettelse er tillatt.",
};
export function JobCalendarOneShot() {
  const status = useQuery({ queryKey: ["job-calendar-one-shot"], queryFn: () => call({ action: "status" }), retry: false });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busyAccepted, setBusyAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const perform = async (body: Record<string, unknown>) => {
    setBusy(true); setMessage("");
    try {
      const r = await call(body);
      if (r.preview) { setPreview(r.preview); setConfirm(""); setBusyAccepted(false); }
      else { setPreview(null); setMessage(outcomes[r.state ?? ""] ?? "Kontroll fullført uten ny utsending."); }
    } catch (e) { setPreview(null); const code = e instanceof Error ? e.message : "stopped_requires_status_check"; setMessage(messages[code] ?? `Sperret: ${code}`); }
    finally { await status.refetch(); setBusy(false); }
  };
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Engangspilot Mats">
    <h3 className="font-semibold">Engangspilot · Mats · 60570 Majorstua stasjon</h3>
    <p className="break-all">{ONE_SHOT.mailbox}</p>
    <p>19. november 2026 · 08:00–16:00 · Europe/Oslo</p>
    <p className="text-muted-foreground">Ventende godkjenning beholdes. Ingen e-post, invitasjon, påminnelse eller endring av 20. november.</p>
    {status.error && <p role="alert" className="text-destructive">Kunne ikke hente forsøksstatus. Skriving sperret.</p>}
    <Button variant="outline" disabled={busy || status.isLoading || !!status.error || !!status.data?.consumed} onClick={() => perform({ action: "preflight" })}>Lesekontroll og forhåndsvisning</Button>
    {preview && <div className="space-y-3 border-l-2 border-border pl-3">
      <p className="font-medium">{preview.payload.subject}</p>
      <p>{preview.local_time} · {preview.payload.location?.displayName}</p>
      <p>Gjelder kun {preview.mailbox} · svar: {preview.approval === "pending" ? "venter" : "godkjent"}</p>
      <iframe title="Avtaletekst i Outlook" sandbox="" srcDoc={preview.payload.body.content} className="h-80 w-full border border-border bg-background" />
      <details><summary className="cursor-pointer">Eksakte forespørselsdata</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ method: preview.request_method, path: preview.request_path, payload: preview.payload, payload_hash: preview.payload_hash }, null, 2)}</pre></details>
      <p className="text-muted-foreground">Bekreftelsen utløper {new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(preview.expires_at))}. Globale brytere og ventende kø forblir stengt.</p>
      <label className="flex items-start gap-2"><Checkbox checked={busyAccepted} onCheckedChange={v => setBusyAccepted(v === true)} /><span>Jeg godkjenner «Opptatt» for Mats selv om hans svar fortsatt venter.</span></label>
      <Input aria-label="Engangsbekreftelse" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={ONE_SHOT.phrase} />
      <Button disabled={busy || !busyAccepted || confirm !== ONE_SHOT.phrase || Date.parse(preview.expires_at) <= Date.now() || !!status.data?.consumed} onClick={() => perform({ action: "create", run_id: preview.run_id, payload_hash: preview.payload_hash, confirm, pending_busy_confirmed: true })}>Opprett én avtale for Mats 19. november</Button>
    </div>}
    {(status.data?.runs ?? []).filter(r => !!r.consumed_at).map(r => <div key={r.id} className="space-y-2">
      <p>Forsøk: {r.state === "posting" ? "Påbegynt – resultat må kontrolleres" : outcomes[r.state] ?? r.state}{r.http_status ? ` · HTTP ${r.http_status}` : ""}</p>
      {r.state !== "succeeded" && <Button variant="outline" disabled={busy} onClick={() => perform({ action: "reconcile", run_id: r.id })}>Lesekontroller utfallet – ingen ny opprettelse</Button>}
    </div>)}
    {message && <p role="status">{message}</p>}
  </section>;
}