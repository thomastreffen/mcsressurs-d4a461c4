// MCS AI Avtalevakt – superadmin module. Phase 1: settings, kill switch, consent, retention, diagnostics and
// the deviation/suggestion queue UI. No email is read and nothing is created or sent from this page.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldOff, Power, Lock } from "lucide-react";
import { toast } from "sonner";
import { ContractWatchDiagnosticsCard } from "@/components/admin/ContractWatchDiagnosticsCard";
import { ContractWatchDraftEditor, type Draft } from "@/components/admin/ContractWatchDraftEditor";

const CONSENT = "Jeg, Thomas Treffen, samtykker til at MCS AI Avtalevakt i fase 1 kun leser innkommende og sendt e-post i thomas.treffen@mcsservice.no, at korte utdrag behandles av Lovable AI for å finne kundeløfter, og at data lagres etter valgt lagringstid. Ingen e-post sendes og ingen jobber opprettes automatisk.";
const COVERAGE: Record<string, string> = { covered: "Dekket", partial: "Delvis", missing: "Mangler", conflict: "Konflikt" };
const CONF: Record<string, string> = { uncertain: "Usikker", check: "Bør sjekkes", likely: "Sannsynlig løfte" };

export default function ContractWatchPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["cw-settings"], queryFn: async () => (await supabase.from("contract_watch_settings").select("*").eq("id", true).maybeSingle()).data });
  const items = useQuery({ queryKey: ["cw-items"], queryFn: async () => (await supabase.from("contract_watch_commitments").select("id, excerpt, promised_date, promised_time, confidence_class, coverage, status, is_test, created_at").order("created_at", { ascending: false }).limit(100)).data ?? [] });
  const audit = useQuery({ queryKey: ["cw-audit"], queryFn: async () => (await supabase.from("contract_watch_audit").select("at, action").order("at", { ascending: false }).limit(10)).data ?? [] });
  const act = useMutation({
    mutationFn: async (a: { action: string; consent?: string; retention?: number; dismissed?: number }) => {
      const { error } = await supabase.rpc("contract_watch_update", { _action: a.action, _consent_text: a.consent ?? null, _retention: a.retention ?? null, _dismissed: a.dismissed ?? null });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cw-settings"] }); qc.invalidateQueries({ queryKey: ["cw-audit"] }); toast.success("Lagret"); },
    onError: (e: Error) => toast.error({ gates_not_met: "Kan ikke slås på: tilgang, postkasse og samtykke må være bekreftet først", diagnostic_not_passed: "Tilkoblingstesten må være bestått siste 24 timer", consent_text_required: "Samtykketekst mangler" }[e.message.match(/\w+$/)?.[0] ?? ""] ?? e.message),
  });
  const drafts = useQuery({ queryKey: ["cw-drafts"], queryFn: async () => ((await supabase.from("contract_watch_order_drafts").select("*").neq("status", "discarded").order("updated_at", { ascending: false })).data ?? []) as unknown as Draft[] });
  const [open, setOpen] = useState<Draft | null>(null);
  const prepare = async (commitmentId: string) => {
    const { data, error } = await supabase.rpc("cw_draft_prepare", { _commitment_id: commitmentId });
    if (error) { toast.error(error.message); return; }
    const r = await drafts.refetch(); setOpen((r.data ?? []).find((d) => d.id === data) ?? null);
  };
  const s = settings.data;
  const [consentOk, setConsentOk] = useState(false);
  const [ret, setRet] = useState<string>(""); const [dis, setDis] = useState<string>("");

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">MCS AI Avtalevakt</h1>
        <p className="text-sm text-muted-foreground">Finner kundeløfter i e-post og sammenligner med Ressursplan. Sender aldri e-post, oppretter aldri jobber og varsler aldri montører.</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Power className="h-5 w-5" />Status og hovedbryter</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant={s?.enabled ? "default" : "outline"}>{s?.enabled ? "På" : "Av"}</Badge>
            <Badge variant={s?.scope_verified_at ? "default" : "outline"}>Microsoft-tilgang {s?.scope_verified_at ? "bekreftet" : "ikke bekreftet"}</Badge>
            <Badge variant={s?.consent_at ? "default" : "outline"}>Samtykke {s?.consent_at ? "gitt" : "ikke gitt"}</Badge>
            <Badge variant="outline">Postkasser: {s?.allowed_mailboxes?.length ? s.allowed_mailboxes.join(", ") : "ingen"}</Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-1"><Lock className="h-4 w-4" />E-postlesing og AI-analyse er ikke bygget inn ennå. Selv når bryteren er på, leses ingenting før lesefunksjonen er godkjent separat.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ action: "verify_scope" })}>Bekreft tilgang fra bestått test</Button>
            <Button size="sm" disabled={act.isPending || !s?.scope_verified_at || !s?.consent_at || !!s?.enabled} onClick={() => act.mutate({ action: "enable" })}>Slå på</Button>
            <Button size="sm" variant="destructive" disabled={act.isPending || !s?.enabled} onClick={() => act.mutate({ action: "kill" })}><ShieldOff className="h-4 w-4 mr-1" />Slå av nå</Button>
          </div>
        </CardContent>
      </Card>

      <ContractWatchDiagnosticsCard />

      <Card>
        <CardHeader><CardTitle>Samtykke og lagring</CardTitle><CardDescription>Samtykket gjelder bare Thomas sin postkasse i fase 1.</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Textarea readOnly value={CONSENT} className="min-h-28" />
          {s?.consent_at ? (
            <div className="flex items-center gap-2"><span>Gitt {new Date(s.consent_at).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}</span>
              <Button size="sm" variant="outline" onClick={() => act.mutate({ action: "revoke_consent" })}>Trekk samtykke (slår også av)</Button></div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-2"><Checkbox checked={consentOk} onCheckedChange={(v) => setConsentOk(!!v)} />Jeg er Thomas Treffen og godtar teksten over</label>
              <Button size="sm" disabled={!consentOk || act.isPending} onClick={() => act.mutate({ action: "consent", consent: CONSENT })}>Registrer samtykke</Button>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
            <label className="space-y-1"><span>Lagringstid utdrag og løfter (dager)</span><Input type="number" min={7} max={365} placeholder={String(s?.retention_days ?? 90)} value={ret} onChange={(e) => setRet(e.target.value)} /></label>
            <label className="space-y-1"><span>Avviste saker (dager)</span><Input type="number" min={1} max={365} placeholder={String(s?.dismissed_retention_days ?? 30)} value={dis} onChange={(e) => setDis(e.target.value)} /></label>
            <Button size="sm" variant="outline" disabled={!ret && !dis} onClick={() => act.mutate({ action: "retention", retention: ret ? Number(ret) : undefined, dismissed: dis ? Number(dis) : undefined })}>Lagre</Button>
          </div>
          <p className="text-muted-foreground">Selve e-posten lagres aldri i Hub – bare utdrag på inntil 500 tegn og kontrollsum.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Avvik og forslag</CardTitle><CardDescription>Løfter som ikke er dekket i Ressursplan. «Lag jobb fra forslag» åpner vanlig jobbskjema uten montører og uten varsling.</CardDescription></CardHeader>
        <CardContent className="text-sm">
          {(items.data ?? []).length === 0 ? <p className="text-muted-foreground">Ingen funn. Listen fylles først når lesing er godkjent og den historiske testen er kjørt.</p> : (
            <ul className="divide-y divide-border">{items.data!.map((i) => (
              <li key={i.id} className="py-3 space-y-1">
                <div className="flex flex-wrap gap-2"><Badge variant="outline">{CONF[i.confidence_class] ?? i.confidence_class}</Badge>{i.coverage && <Badge variant={i.coverage === "covered" ? "secondary" : "destructive"}>{COVERAGE[i.coverage]}</Badge>}{i.is_test && <Badge variant="outline">Test</Badge>}<span className="text-muted-foreground">{i.promised_date ?? "Uklar dato"} {i.promised_time ?? ""}</span></div>
                <p className="italic">«{i.excerpt}»</p>
                <Button size="sm" variant="outline" onClick={() => prepare(i.id)}>Klargjør bestillingsutkast</Button>
              </li>))}</ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bestillingsutkast</CardTitle><CardDescription>Interne kladder – ikke bestillinger. Ingen varsler eller jobber.</CardDescription></CardHeader>
        <CardContent className="text-sm">{(drafts.data ?? []).length === 0 ? <p className="text-muted-foreground">Ingen utkast.</p> :
          <ul className="divide-y divide-border">{drafts.data!.map((d) => <li key={d.id} className="py-2 flex items-center justify-between gap-2"><span>{d.description?.slice(0, 80) || "Uten beskrivelse"} · {d.status === "ready" ? "Klar for kontroll" : "Kladd"}</span><Button size="sm" variant="outline" onClick={() => setOpen(d)}>Åpne</Button></li>)}</ul>}
        </CardContent>
      </Card>
      {open && <ContractWatchDraftEditor draft={open} onClose={() => setOpen(null)} onSaved={() => drafts.refetch()} />}

      <Card>
        <CardHeader><CardTitle>Revisjonslogg</CardTitle></CardHeader>
        <CardContent className="text-sm">{(audit.data ?? []).length === 0 ? <p className="text-muted-foreground">Ingen hendelser.</p> : <ul className="space-y-1">{audit.data!.map((a, n) => <li key={n}>{new Date(a.at).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })} – {a.action}</li>)}</ul>}</CardContent>
      </Card>
    </div>
  );
}
