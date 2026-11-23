import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { invokeWithSession } from "@/lib/invoke-session";
import { normalizeMailboxCandidates } from "@/lib/mailbox-candidates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryErrorNotice } from "./QueryErrorNotice";

type Technician = { id: string; name: string; email: string };
export const ALL_PHRASE = "AKTIVER KALENDER FOR ALLE AKTIVE MONTØRER";
export const singlePhrase = (mailbox: string) => `AKTIVER KALENDER ${mailbox.trim().toLowerCase()}`;
const EFFECTS = [
  "Kun nye eller endrede tildelinger fra nå av får Outlook-avtale – ingen eksisterende jobber sendes",
  "De ventende gamle køelementene frigjøres aldri",
  "Ingen e-post sendes; system-e-post er uendret",
  "Annen opptatt Outlook-tid må godkjennes av ressursplanansvarlig; samme Hub-oppdrag eller ukjent stopper",
];

/** Superadmin-only, audited activation. The server re-checks identity, fresh mailbox test and exact phrase. */
export function CentralCalendarActivation() {
  const { activeCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [tech, setTech] = useState("");
  const [checks, setChecks] = useState<boolean[]>(EFFECTS.map(() => false));
  const [phrase, setPhrase] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: rawTechs, error: techErr, refetch: refetchTechs, isFetching: fT } = useQuery({ queryKey: ["calendar-mailbox-candidates", activeCompanyId], enabled: !!activeCompanyId,
    queryFn: async () => { const r = await invokeWithSession<{ technicians: Technician[] }>("job-outlook-app-pilot", { body: { action: "mailbox_candidates", company_id: activeCompanyId } }); if (r.error) throw r.error; return r.data; } });
  const techs = normalizeMailboxCandidates(rawTechs);
  const { data: active, error: actErr, refetch: refetchAct, isFetching: fA } = useQuery({ queryKey: ["central-calendar-activations", activeCompanyId], enabled: !!activeCompanyId,
    queryFn: async () => { const r = await supabase.from("central_calendar_activations").select("id,scope,mailbox,effective_from").eq("company_id", activeCompanyId!).is("revoked_at", null); if (r.error) throw r.error; return r.data; } });
  const { data: status } = useQuery({ queryKey: ["central-calendar-status", activeCompanyId], enabled: !!activeCompanyId,
    queryFn: async () => { const r = await supabase.rpc("central_calendar_status", { _company: activeCompanyId! }); if (r.error) throw r.error; return r.data; } });
  const all = tech === "__all__";
  const person = techs?.find(t => t.id === tech);
  const expected = all ? ALL_PHRASE : person ? singlePhrase(person.email) : "";
  const ready = !!expected && checks.every(Boolean) && phrase === expected;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["central-calendar-activations"] }); };
  const activate = async () => {
    setBusy(true); setMsg("");
    const r = await supabase.rpc("activate_central_calendar", { _company: activeCompanyId!, _tech: all ? null : tech, _phrase: phrase } as never);
    setBusy(false);
    if (r.error) { setMsg(`Ikke aktivert: ${r.error.message}`); return; }
    setMsg("Aktivert. Gjelder kun nye eller endrede tildelinger fra nå."); setPhrase(""); refresh();
  };
  const revoke = async (id: string) => { const r = await supabase.rpc("revoke_central_calendar", { _id: id }); setMsg(r.error ? `Stopp feilet: ${r.error.message}` : "Stoppet. Eksisterende avtaler er ikke endret."); refresh(); };
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Automatisk Outlook-kalender">
    <h3 className="font-semibold">Automatisk Outlook-kalender fra Ressursplan</h3>
    {actErr && <QueryErrorNotice what="hvem som er aktivert" error={actErr} onRetry={() => refetchAct()} retrying={fA} />}
    {techErr && <QueryErrorNotice what="montørlisten" error={techErr} onRetry={() => refetchTechs()} retrying={fT} />}
    {actErr ? null : Array.isArray(active) && active.length ? <ul className="space-y-1">{active.map(a => <li key={a.id} className="flex items-center gap-2">
      <span>{a.scope === "all_active" ? "Alle aktive montører" : a.mailbox} · aktiv fra {new Date(a.effective_from).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}</span>
      <Button size="sm" variant="destructive" onClick={() => revoke(a.id)}>Stopp</Button></li>)}</ul>
      : <p className="text-muted-foreground">Ikke aktivert for noen montør.</p>}
    <Select value={tech} onValueChange={v => { setTech(v); setPhrase(""); }}>
      <SelectTrigger aria-label="Velg montør"><SelectValue placeholder="Velg montør" /></SelectTrigger>
      <SelectContent>{techs?.map(t => <SelectItem key={t.id} value={t.id}>{t.name} · {t.email}</SelectItem>)}</SelectContent>
    </Select>
    {expected && <div className="space-y-2">
      {EFFECTS.map((e, i) => <label key={i} className="flex items-start gap-2"><Checkbox checked={checks[i]} onCheckedChange={v => setChecks(c => c.map((x, j) => j === i ? v === true : x))} /><span>{e}</span></label>)}
      <p>Skriv nøyaktig: <code>{expected}</code></p>
      <Input value={phrase} onChange={e => setPhrase(e.target.value)} aria-label="Bekreftelsesfrase" />
      <Button disabled={!ready || busy} onClick={activate}>Aktiver automatisk kalender</Button>
    </div>}
    {msg && <p role="status">{msg}</p>}
    {Array.isArray(status) && status.length > 0 && <div><h4 className="font-medium">Status per montør/dag</h4><ul className="text-sm">{status.map((s, i) => <li key={i}>{s.work_date} · {s.mailbox} · {s.has_outlook_copy ? "I Outlook" : "Ikke i Outlook"} · {s.last_operation ?? s.link_state}</li>)}</ul></div>}
  </section>;
}
