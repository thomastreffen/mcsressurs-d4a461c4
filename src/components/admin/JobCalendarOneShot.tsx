import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invokeWithSession } from "@/lib/invoke-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ONE_SHOT, PERMITS, type OneShotPermit, type OneShotDiagnosis, type OneShotConflictClass } from "../../../supabase/functions/_shared/job-calendar-one-shot";

type Preview = { run_id: string; payload_hash: string; calendar_signature: string; conflict_override_required: boolean; expires_at: string; mailbox: string; local_time: string; approval: string; payload: { subject: string; body: { content: string }; location?: { displayName: string } }; request_method: string; request_path: string };
type Result = { preview?: Preview; diagnosis?: OneShotDiagnosis; existing_mapping?: boolean; state?: string; consumed?: boolean; runs?: { id: string; state: string; consumed_at: string | null; event_id_persisted: boolean; http_status: number | null }[] };
class CalendarCheckError extends Error { constructor(code: string, public diagnosis?: OneShotDiagnosis, public stage?: string) { super(code); } }
async function callRaw(body: Record<string, unknown>): Promise<Result> {
  const r = await invokeWithSession<Result>("job-calendar-one-shot", { body });
  if (r.error) {
    let code = r.error.message;
    let diagnosis: OneShotDiagnosis | undefined;
    let stage: string | undefined;
    const ctx = (r.error as any).context;
    if (ctx?.json) { const details = await ctx.json().catch(() => null); code = details?.error ?? code; diagnosis = details?.diagnosis; stage = details?.stage; }
    throw new CalendarCheckError(code, diagnosis, stage);
  }
  return r.data ?? {};
}
const messages: Record<string, string> = {
  diagnostic_too_old: "Lesekontrollen av kalenderappens avgrensning er eldre enn 24 timer. Kjør tilkoblingskontrollen over på nytt.",
  fresh_200_required: "Kjør Mats’ kalenderlesetest på nytt før forhåndskontrollen.",
  pilot_expired: "Pilotdagen er utløpt. Bekreft samme dag på nytt i pilotutvalget.",
  existing_mapping_requires_reconciliation: "En kalenderkobling finnes allerede. Ingen ny avtale opprettes.",
  duplicate_or_calendar_conflict: "En avtale eller konflikt finnes allerede i denne perioden. Ingen ny avtale opprettes.",
  preview_scope_constraint_failed: "Forhåndskontrollen kunne ikke lagres: tillatelsen samsvarer ikke med databasens regler. Ingen kalenderopprettelse forsøkt.",
  database_schema_mismatch: "Forhåndskontrollen stoppet på en databaseversjon som ikke samsvarer. Ingen kalenderopprettelse forsøkt.",
  authoritative_row_count_invalid: "Forhåndskontrollen fant ikke én entydig oppføring. Ingen kalenderopprettelse forsøkt.",
  authoritative_database_failed: "Forhåndskontrollen stoppet ved databasekontroll. Ingen kalenderopprettelse forsøkt.",
  graph_calendar_read_failed: "Microsoft-kalenderen kunne ikke lesekontrolleres fullstendig. Ingen kalenderopprettelse forsøkt.",
  calendar_token_read_failed: "Kalenderappens innlogging kunne ikke kontrolleres. Ingen kalenderopprettelse forsøkt.",
  preflight_runtime_failed: "Forhåndskontrollen stoppet på en teknisk feil. Ingen kalenderopprettelse forsøkt.",
  stopped_requires_status_check: "Stoppet. Kontroller forsøksstatus; et ukjent resultat må lesekontrolleres, aldri sendes på nytt.",
  preflight_expired_or_consumed: "Forhåndskontrollen er utløpt eller allerede brukt.",
  preview_changed: "Jobben eller planen har endret seg. Ny forhåndskontroll kreves.",
  individual_response_blocks_pilot: "Mats’ eget svar sperrer denne piloten.",
  same_hub_job_exists: "Samme Hub-oppdrag finnes allerede. Koblingen må avklares; opprettelse kan ikke overstyres.",
  calendar_identity_unresolved: "Kalenderidentiteten eller nødvendige opplysninger er uavklart. Opprettelse kan ikke overstyres.",
  conflict_confirmation_required: "Bekreft korrekt ressursplan, kjent tidskonflikt og den særskilte engangsteksten.",
};
const outcomes: Record<string, string> = {
  succeeded: "Avtalen er bekreftet i Microsoft, og nøyaktig kalender-ID er lagret. Dette bekrefter ikke at Mats har lest den.",
  uncertain: "Microsoft-resultatet er ukjent. Tillatelsen er brukt; bare lesekontroll er tilgjengelig.",
  failed: "Microsoft avviste forsøket. Tillatelsen er brukt; ingen automatisk gjentakelse.",
  already_claimed: "Tillatelsen er allerede brukt eller dagens vilkår er endret. Ingenting sendes på nytt.",
  duplicate_or_conflict: "En eksisterende avtale sperrer opprettelsen.",
  unresolved_no_repost: "Lesekontrollen kunne ikke bekrefte avtalen. Ingen ny opprettelse er tillatt.",
  same_hub_job_exists: messages.same_hub_job_exists,
  calendar_identity_unresolved: messages.calendar_identity_unresolved,
  conflict_override_required: "Tidskonflikten må bekreftes eksplisitt før opprettelse.",
  calendar_changed_requires_preflight: "Kalenderen er endret siden forhåndsvisningen. Ny lesekontroll og bekreftelse kreves; ingenting er opprettet.",
};
const conflictLabels: Record<OneShotConflictClass, string> = {
  same_one_shot: "Samme engangspilot finnes allerede", same_hub_day: "Samme Hub-oppdrag og dag finnes allerede",
  related_hub_job: "Samme Hub-oppdrag – dag eller mottaker må kontrolleres", same_title_unverified: "Samme tittel, men Hub-kobling er ikke bekreftet",
  other_busy: "Annen opptatt avtale", free_overlap: "Overlapp merket Ledig", cancelled_overlap: "Avlyst overlapp",
  unreadable_time: "Klokkeslett kunne ikke bekreftes", unknown_availability: "Ukjent opptattstatus",
};
type MutationCheck = { kind: "update" | "delete"; verification: string; facts: { start_ok: boolean; end_ok: boolean; show_as: string; attendees: number; job_link: boolean } | null; day_still_planned: boolean; changed_fields: string[]; blocked_by: string; writes_enabled: boolean };
const blockers: Record<string, string> = {
  delete_requires_unplan: "Sletting er sperret: Mats er fortsatt planlagt 19. november. Avplanlegg først i Ressursplan.",
  no_change_needed: "Ingen endring i ressursplanen; ingenting å oppdatere.",
  update_requires_planned_day: "Dagen er ikke lenger planlagt; endring er ikke aktuelt.",
  attendees_present: "Avtalen har deltakere og kan ikke endres herfra.",
  copy_changed_in_outlook: "Avtalen er endret i Outlook etter opprettelsen. Avklares manuelt; Hub overskriver ikke.",
  copy_missing: "Avtalen finnes ikke lenger i Mats’ kalender.",
  copy_identity_mismatch: "Kalender-ID-en peker ikke på Hub-avtalen. Stoppet.",
  copy_unknown: "Microsoft svarte ikke entydig. Stoppet.",
  mutation_not_approved: "Kontrollen er godkjent, men endring/sletting er ikke aktivert. Krever separat skriftlig sluttgodkjenning.",
};
function MutationPanel() {
  const [check, setCheck] = useState<MutationCheck | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (kind: "update" | "delete") => {
    setBusy(true); setErr(""); setCheck(null);
    try { setCheck(await callRaw({ action: "mutation_preview", kind, permit: ONE_SHOT.id }) as unknown as MutationCheck); }
    catch (e) { const c = e instanceof Error ? e.message : "stopped"; setErr(blockers[c] ?? messages[c] ?? `Sperret: ${c}`); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2 border-t border-border pt-3" aria-label="Endre eller slette Mats-avtalen">
    <h4 className="font-medium">Endre eller slette den opprettede avtalen</h4>
    <p className="text-muted-foreground">Leser kun den ene lagrede avtalen i Mats’ kalender. Andre avtaler, deltakere og dager berøres aldri.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => run("update")}>Kontroller endring – kun lesing</Button>
      <Button variant="outline" disabled={busy} onClick={() => run("delete")}>Kontroller sletting – kun lesing</Button>
    </div>
    {err && <p role="alert">{err}</p>}
    {check && <div className="space-y-1 border-l-2 border-border pl-3">
      <p>{check.verification === "verified" ? "Microsoft bekrefter samme avtale (ID og versjon)." : blockers[`copy_${check.verification}`] ?? check.verification}</p>
      {check.facts && <p>{check.facts.start_ok && check.facts.end_ok ? "08:00–16:00 Oslo" : "Tid avviker"} · {check.facts.show_as} · {check.facts.attendees} deltakere · {check.facts.job_link ? "jobblenke finnes" : "jobblenke mangler"}</p>}
      <p>Ressursplan: {check.day_still_planned ? "Mats er planlagt 19. november" : "ikke planlagt"}{check.kind === "update" ? ` · endrede felt: ${check.changed_fields.join(", ") || "ingen"}` : ""}</p>
      <p className="font-medium">{blockers[check.blocked_by] ?? check.blocked_by}</p>
      <Button disabled aria-label={check.kind === "update" ? "Endre avtalen" : "Slett avtalen"}>{check.kind === "update" ? "Endre avtalen" : "Slett avtalen"} – ikke aktivert</Button>
    </div>}
  </div>;
}
const dayLabel = (d: string) => new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
export function JobCalendarOneShot() {
  return <>{Object.values(PERMITS).map(p => <OneShotPermitPanel key={p.id} permit={p} />)}</>;
}
export function OneShotPermitPanel({ permit: x }: { permit: OneShotPermit }) {
  const call = (body: Record<string, unknown>) => callRaw({ ...body, permit: x.id });
  const status = useQuery({ queryKey: ["job-calendar-one-shot", x.id], queryFn: () => call({ action: "status" }), retry: false });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busyAccepted, setBusyAccepted] = useState(false);
  const [planAccepted, setPlanAccepted] = useState(false);
  const [conflictAccepted, setConflictAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [diagnosis, setDiagnosis] = useState<OneShotDiagnosis | null>(null);
  const perform = async (body: Record<string, unknown>) => {
    setBusy(true); setMessage(""); setDiagnosis(null);
    try {
      const r = await call(body);
      if (r.diagnosis) setDiagnosis(r.diagnosis);
      if (r.preview) { setPreview(r.preview); setConfirm(""); setBusyAccepted(false); setPlanAccepted(false); setConflictAccepted(false); }
      else { setPreview(null); setMessage(r.diagnosis ? (r.existing_mapping ? messages.existing_mapping_requires_reconciliation : "Lesediagnose fullført. Ingen engangstillatelse opprettet eller brukt.") : outcomes[r.state ?? ""] ?? "Kontroll fullført uten ny utsending."); }
    } catch (e) { setPreview(null); if (e instanceof CalendarCheckError && e.diagnosis) setDiagnosis(e.diagnosis); const code = e instanceof Error ? e.message : "request_outcome_unavailable"; setMessage(`${messages[code] ?? `Sperret: ${code}`}${e instanceof CalendarCheckError && e.stage ? ` [${code} · ${e.stage}]` : ""}`); }
    finally { await status.refetch(); setBusy(false); }
  };
  return <section className="space-y-3 border-t border-border pt-4" aria-label={`Engangspilot ${x.label}`}>
    <h3 className="font-semibold">Engangspilot · {x.label}</h3>
    <p className="break-all">{x.mailbox}</p>
    <p>{dayLabel(x.work_date)} · 08:00–16:00 · Europe/Oslo</p>
    <p className="text-muted-foreground">Ventende godkjenning beholdes. Ingen e-post, invitasjon, påminnelse eller endring av andre dager. Bare denne ene dagen.</p>
    {status.error && <p role="alert" className="text-destructive">Kunne ikke hente forsøksstatus. Skriving sperret.</p>}
    <Button variant="outline" disabled={busy || status.isLoading || !!status.error || !!status.data?.consumed} onClick={() => perform({ action: "preflight" })}>Lesekontroll og forhåndsvisning</Button>
    <Button variant="outline" disabled={busy || status.isLoading || !!status.error} onClick={() => perform({ action: "diagnose" })}>Undersøk kalenderkonflikt – kun lesing</Button>
    {diagnosis && <div className="space-y-2 border-l-2 border-border pl-3" aria-label="Kalenderkonfliktdiagnose">
      <p>{diagnosis.checked_count} avtaler kontrollert · {diagnosis.blocking_count} treff · {diagnosis.same_hub_count} med samme Hub-oppdrag · {diagnosis.non_busy_count} ledige eller avlyste</p>
      <ul className="space-y-2">{diagnosis.conflicts.map((c, i) => <li key={i} className="break-words">{conflictLabels[c.classification]} · {c.local_overlap ?? "Ukjent tid"} Europe/Oslo · {c.show_as}{c.all_day ? " · Heldag" : ""}{["occurrence", "exception"].includes(c.event_type) ? " · Gjentakende avtale" : ""}{c.cancelled ? " · Avlyst" : ""}</li>)}</ul>
      <p className="text-muted-foreground">{diagnosis.category === "other" ? "Annen Outlook-tid endrer ikke ressursplanen. Opprettelse krever eksplisitt bekreftelse på kjent tidskonflikt." : diagnosis.category === "clear" ? "Ingen tidskonflikt funnet." : "Samme oppdrag eller uavklart identitet kan ikke overstyres."} Ingen ny avtale opprettes fra lesekontrollen.</p>
    </div>}
    {preview && <div className="space-y-3 border-l-2 border-border pl-3">
      <p className="font-medium">{preview.payload.subject}</p>
      <p>{preview.local_time} · {preview.payload.location?.displayName}</p>
      <p>Gjelder kun {preview.mailbox} · svar: {preview.approval === "pending" ? "venter" : "godkjent"}</p>
      <iframe title="Avtaletekst i Outlook" sandbox="" srcDoc={preview.payload.body.content} className="h-80 w-full border border-border bg-background" />
      <details><summary className="cursor-pointer">Eksakte forespørselsdata</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ method: preview.request_method, path: preview.request_path, payload: preview.payload, payload_hash: preview.payload_hash }, null, 2)}</pre></details>
      <p className="text-muted-foreground">Bekreftelsen utløper {new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(preview.expires_at))}. Globale brytere og ventende kø forblir stengt.</p>
      <label className="flex items-start gap-2"><Checkbox checked={busyAccepted} onCheckedChange={v => setBusyAccepted(v === true)} /><span>Jeg godkjenner «Opptatt» for Mats selv om hans svar fortsatt venter.</span></label>
      <label className="flex items-start gap-2"><Checkbox aria-label="Ressursplanen er korrekt" checked={planAccepted} onCheckedChange={v => setPlanAccepted(v === true)} /><span>Jeg bekrefter at ressursplanen er korrekt: {x.label}.</span></label>
      {preview.conflict_override_required && <label className="flex items-start gap-2"><Checkbox aria-label="Tidskonflikt kjent" checked={conflictAccepted} onCheckedChange={v => setConflictAccepted(v === true)} /><span>Opprett likevel, tidskonflikt kjent. Jeg har kontrollert treffene; andre Outlook-avtaler skal ikke endres.</span></label>}
      <Input aria-label="Engangsbekreftelse" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={preview.conflict_override_required ? x.overridePhrase : x.phrase} />
      <Button className="h-auto min-h-11 whitespace-normal" disabled={busy || !busyAccepted || !planAccepted || preview.conflict_override_required && !conflictAccepted || confirm !== (preview.conflict_override_required ? x.overridePhrase : x.phrase) || Date.parse(preview.expires_at) <= Date.now() || !!status.data?.consumed} onClick={() => perform({ action: "create", run_id: preview.run_id, payload_hash: preview.payload_hash, calendar_signature: preview.calendar_signature, confirm, pending_busy_confirmed: true, resource_plan_confirmed: true, conflict_override: preview.conflict_override_required && conflictAccepted })}>{preview.conflict_override_required ? "Opprett likevel for Mats – tidskonflikt kjent" : `Opprett én avtale for Mats ${dayLabel(x.work_date)}`}</Button>
    </div>}
    {(status.data?.runs ?? []).filter(r => !!r.consumed_at).map(r => <div key={r.id} className="space-y-2">
      <p>Forsøk: {r.state === "posting" ? "Påbegynt – resultat må kontrolleres" : outcomes[r.state] ?? r.state}{r.http_status ? ` · HTTP ${r.http_status}` : ""}</p>
      {r.state !== "succeeded" && <Button variant="outline" disabled={busy} onClick={() => perform({ action: "reconcile", run_id: r.id })}>Lesekontroller utfallet – ingen ny opprettelse</Button>}
    </div>)}
    {message && <p role="status">{message}</p>}
  {x.id === ONE_SHOT.id && <MutationPanel />}
  </section>;
}