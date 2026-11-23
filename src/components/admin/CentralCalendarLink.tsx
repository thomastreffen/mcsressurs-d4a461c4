import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { invokeWithSession } from "@/lib/invoke-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QueryErrorNotice } from "./QueryErrorNotice";

type Op = { id: string; mailbox: string; work_date: string; state: string; http_status: number | null; created_at: string };
type Report = { status?: string; error?: string; http_status?: number; checks?: Record<string, boolean>; phrase?: string | null; latency_ms?: number };

/** Accepted but unverified Outlook copies: GET-only check, then an explicit click links the existing copy. Never creates. */
export function CentralCalendarLink() {
  const { activeCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [phrases, setPhrases] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const { data, error, refetch, isFetching } = useQuery({ queryKey: ["central-unverified", activeCompanyId], enabled: !!activeCompanyId,
    queryFn: async () => { const r = await invokeWithSession<{ operations: Op[] }>("job-outlook-app-pilot", { body: { action: "central_unverified", company_id: activeCompanyId } }); if (r.error) throw r.error; return Array.isArray(r.data?.operations) ? r.data!.operations : []; } });
  const ops = Array.isArray(data) ? data : [];
  const call = async (op: Op, action: "inspect_central_operation" | "link_central_operation") => {
    setBusy(op.id);
    const r = await invokeWithSession<Report>("job-outlook-app-pilot", { body: { action, operation_id: op.id, phrase: phrases[op.id] ?? "" } });
    setBusy("");
    setReports(s => ({ ...s, [op.id]: r.error ? { error: String((r.error as Error).message ?? r.error) } : (r.data ?? {}) }));
    if (action === "link_central_operation") qc.invalidateQueries({ queryKey: ["central-unverified"] });
  };
  if (error) return <section className="border-t border-border pt-4"><QueryErrorNotice what="Outlook-avtaler som ikke er bekreftet" error={error} onRetry={() => refetch()} retrying={isFetching} /></section>;
  if (ops.length === 0) return null;
  return <section className="space-y-2 border-t border-border pt-4" aria-label="Opprettet, ikke bekreftet">
    <h3 className="font-semibold">Opprettet i Outlook, ikke bekreftet</h3>
    <p className="text-sm text-muted-foreground">Microsoft har godtatt avtalen. Ikke opprett på nytt – kontroller og koble den eksisterende.</p>
    <ul className="space-y-3">{ops.map(op => { const rep = reports[op.id]; return <li key={op.id} className="space-y-1">
      <p>{op.mailbox} · {op.work_date} · {op.state}{op.http_status ? ` (${op.http_status})` : ""}</p>
      <Button variant="outline" disabled={busy === op.id} onClick={() => call(op, "inspect_central_operation")}>Kontroller eksisterende Outlook-avtale – kun lesing</Button>
      {rep && <div className="text-sm" role="status">
        <p>Resultat: {rep.status ?? rep.error}{rep.http_status ? ` · HTTP ${rep.http_status}` : ""}{rep.latency_ms ? ` · ${rep.latency_ms} ms` : ""}</p>
        {rep.checks && <ul>{Object.entries(rep.checks).map(([k, ok]) => <li key={k}>{ok ? "✓" : "✗"} {k}</li>)}</ul>}
      </div>}
      {rep?.phrase && <div className="space-y-1">
        <p className="text-sm">Skriv nøyaktig: <code>{rep.phrase}</code></p>
        <Input aria-label="Bekreftelsesfrase for kobling" value={phrases[op.id] ?? ""} onChange={e => setPhrases(s => ({ ...s, [op.id]: e.target.value }))} />
        <Button disabled={busy === op.id || phrases[op.id] !== rep.phrase} onClick={() => call(op, "link_central_operation")}>Koble eksisterende Outlook-avtale</Button>
      </div>}
    </li>; })}</ul>
  </section>;
}
