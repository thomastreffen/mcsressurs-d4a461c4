import { useState } from "react";
import { invokeWithSession } from "@/lib/invoke-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { TEST_SEND_PHRASE, type SenderCheck } from "../../../supabase/functions/_shared/system-sender-diagnostics-core";

type Diag = { checks: SenderCheck[]; ready_for_test: boolean; mode_on: boolean; mailbox: string; roles: string[] };
const icon: Record<SenderCheck["state"], string> = { ok: "OK", missing: "Mangler", warning: "Merk", manual: "Må bekreftes" };
async function call(body: Record<string, unknown>) {
  const r = await invokeWithSession<any>("system-sender-diagnostics", { body });
  if (r.error) { const ctx = (r.error as any).context; const d = ctx?.json ? await ctx.json().catch(() => null) : null; throw new Error(d?.error ?? r.error.message); }
  return r.data;
}
const errors: Record<string, string> = {
  sender_not_ready: "Avsenderen er ikke klar. Fullfør punktene over først.",
  recipient_must_be_caller_and_only_pilot: "Testen går bare til deg, og du må være eneste pilotmottaker.",
  confirmation_required: "Skriv bekreftelsesteksten nøyaktig.",
  test_already_in_progress: "En test pågår allerede. Ingenting sendes på nytt.",
};
export function SystemSenderDiagnostics() {
  const [d, setD] = useState<Diag | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [phrase, setPhrase] = useState("");
  const run = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg("");
    try { const r = await call(body); if (r.checks && !r.outcome) setD(r); if (r.outcome) setMsg(r.outcome === "accepted" ? "Microsoft har tatt imot meldingen (ikke bekreftet levert). Sjekk innboksen din." : `Resultat: ${r.outcome}. Ingen ny sending.`); }
    catch (e) { const c = e instanceof Error ? e.message : "stopped"; setMsg(errors[c] ?? `Stoppet: ${c}`); }
    finally { setBusy(false); setOk(false); setPhrase(""); }
  };
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Systemavsender postkontoret">
    <h3 className="font-semibold">Systemavsender · postkontoret@mcsservice.no</h3>
    <p className="text-muted-foreground">Kontrollen henter bare en tilgangsbekreftelse fra Microsoft. Ingen e-post sendes, ingen innstilling endres.</p>
    <Button variant="outline" disabled={busy} onClick={() => run({ action: "diagnose" })}>Kontroller avsender – kun lesing</Button>
    {d && <ul className="space-y-2">{d.checks.map(c => <li key={c.key} className="break-words"><span className="font-medium">{icon[c.state]}</span> · {c.label}{c.action && <span className="block text-muted-foreground">{c.action}</span>}</li>)}</ul>}
    {d?.ready_for_test && <div className="space-y-2 border-l-2 border-border pl-3">
      <label className="flex items-start gap-2"><Checkbox aria-label="Send én testmelding" checked={ok} onCheckedChange={v => setOk(v === true)} /><span>Send én testmelding bare til min egen jobbadresse.</span></label>
      <Input aria-label="Bekreftelsestekst" placeholder={TEST_SEND_PHRASE} value={phrase} onChange={e => setPhrase(e.target.value)} />
      <Button disabled={busy || !ok || phrase !== TEST_SEND_PHRASE} onClick={() => run({ action: "test_send", confirm: phrase })}>Send én testmelding til meg</Button>
    </div>}
    {d && !d.ready_for_test && <p>Testutsending er ikke tilgjengelig før alle punkter er OK.</p>}
    {msg && <p role="status">{msg}</p>}
  </section>;
}
