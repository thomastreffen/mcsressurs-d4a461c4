import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { invokeWithSession } from "@/lib/invoke-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Pending = { event_id: string; technician_id: string; mailbox: string; title: string; job_number: string | null; start_time: string; reason_code: string; phrase: string };

/** One exact, audited retry per activated technician/job that is still missing in Outlook. Never touches other recipients. */
export function CentralCalendarRetry() {
  const { activeCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [phrases, setPhrases] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const { data } = useQuery({ queryKey: ["central-calendar-pending", activeCompanyId], enabled: !!activeCompanyId,
    queryFn: async () => { const r = await invokeWithSession<{ pending: Pending[] }>("job-outlook-app-pilot", { body: { action: "central_pending", company_id: activeCompanyId } }); if (r.error) throw r.error; return Array.isArray(r.data?.pending) ? r.data!.pending : []; } });
  const rows = Array.isArray(data) ? data : [];
  const run = async (p: Pending) => {
    const k = `${p.event_id}:${p.technician_id}`; setBusy(k); setMsg("");
    const r = await invokeWithSession<{ status?: string; error?: string }>("job-outlook-app-pilot", { body: { action: "retry_central_assignment", company_id: activeCompanyId, event_id: p.event_id, technician_id: p.technician_id, phrase: phrases[k] ?? "" } });
    setBusy("");
    setMsg(r.error ? `Ikke kjørt: ${String((r.error as Error).message ?? r.error)}` : `Resultat: ${r.data?.status ?? r.data?.error}`);
    qc.invalidateQueries({ queryKey: ["central-calendar-pending"] });
  };
  return <section className="space-y-2 border-t border-border pt-4" aria-label="Mangler i Outlook">
    <h3 className="font-semibold">Mangler i Outlook – kjør på nytt for én montør</h3>
    {rows.length === 0 ? <p className="text-muted-foreground">Ingen aktiverte montører mangler avtale.</p> :
      <ul className="space-y-3">{rows.map(p => { const k = `${p.event_id}:${p.technician_id}`; return <li key={k} className="space-y-1">
        <p>{p.job_number ?? ""} {p.title} · {p.mailbox} · {new Date(p.start_time).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })} · {p.reason_code}</p>
        <p className="text-sm">Skriv nøyaktig: <code>{p.phrase}</code></p>
        <Input aria-label="Bekreftelsesfrase for ny kjøring" value={phrases[k] ?? ""} onChange={e => setPhrases(s => ({ ...s, [k]: e.target.value }))} />
        <Button disabled={busy === k || phrases[k] !== p.phrase} onClick={() => run(p)}>Opprett kun denne avtalen i Outlook</Button>
      </li>; })}</ul>}
    {msg && <p role="status">{msg}</p>}
  </section>;
}
