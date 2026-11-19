import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { invokeWithSession } from "@/lib/invoke-session";
import { normalizeMailboxCandidates } from "@/lib/mailbox-candidates";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Technician = { id: string; name: string; email: string };
type Result = { pass: boolean; mailbox: string; http?: number; reason?: string; step: string; app_id?: string; tenant_id?: string; tid_match?: boolean; appid_match?: boolean; mailbox_match?: boolean };
export function TechnicianMailboxTest() {
  const { activeCompanyId } = useCompanyContext();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const { data, isLoading, error: loadError } = useQuery({ queryKey: ["calendar-mailbox-candidates", activeCompanyId], enabled: !!activeCompanyId,
    queryFn: async () => { const r = await invokeWithSession<{ technicians: Technician[] }>("job-outlook-app-pilot", { body: { action: "mailbox_candidates", company_id: activeCompanyId } }); if (r.error) throw r.error; return r.data; } });
  const candidates = normalizeMailboxCandidates(data);
  const person = candidates.find(t => t.id === selected);
  const run = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const r = await invokeWithSession<{ result: Result; audit_complete: boolean }>("job-outlook-app-pilot", { body: { action: "probe_technician_mailbox", company_id: activeCompanyId, technician_id: selected, confirm_read_only: true } });
      if (r.error) { const ctx = (r.error as { context?: Response }).context; const detail = await ctx?.json().catch(() => null); throw Error(detail?.error ?? "Lesetest feilet"); }
      setResult(r.data?.result ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : "Lesetest feilet"); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Test Outlook-tilgang til montør">
    <h3 className="font-semibold">Test Outlook-tilgang til montør</h3>
    <p className="text-muted-foreground">Separat, auditert lesetest. Ingen jobb eller arbeidsdag kreves. Kalenderinnhold hentes ikke. Synkaktivering er fortsatt sperret.</p>
    {!activeCompanyId && <p>Velg ett selskap øverst for å se aktive montører.</p>}
    <Select value={person ? selected : ""} disabled={busy || isLoading} onValueChange={id => { setSelected(id); setResult(null); setError(""); }}>
      <SelectTrigger aria-label="Montør for postkassetest"><SelectValue placeholder="Velg aktiv montør" /></SelectTrigger>
      <SelectContent>{candidates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
    </Select>
    {person && <p className="break-all">{person.email}</p>}
    <Button variant="outline" disabled={!person || busy} onClick={run}>{busy ? "Kontrollerer tilgang…" : "Test valgt postkasse – kun lesing"}</Button>
    {(error || loadError) && <p role="alert" className="text-destructive">{error || "Kunne ikke hente aktive montører."} Ingen kalender eller innstilling er endret.</p>}
    {result && <div role="status" className="space-y-1 border-l-2 border-border pl-3">
      <p className="break-all">{result.mailbox} · {result.http ? `HTTP ${result.http}` : result.reason} · {result.pass ? "Tilgang bekreftet" : "Ikke bekreftet"}</p>
      <p>Postkasse samsvarer: {result.mailbox_match ? "ja" : "ikke kontrollert"} · App samsvarer: {result.appid_match ? "ja" : "ikke bekreftet"} · Tenant samsvarer: {result.tid_match ? "ja" : "ikke bekreftet"}</p>
      {result.app_id && <p className="break-all">Kalenderapp: {result.app_id} · Tenant: {result.tenant_id}</p>}
      <p>Kontrolltrinn: {result.step}{result.reason ? ` · ${result.reason}` : ""}. Resultatet er auditert. Ingen pilotdag eller skrivegodkjenning er opprettet.</p>
    </div>}
  </section>;
}