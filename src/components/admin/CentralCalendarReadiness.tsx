import { useState } from "react";
import { invokeWithSession } from "@/lib/invoke-session";
import { Button } from "@/components/ui/button";

type Row = { event_id: string; technician_name: string | null; mailbox: string; work_date: string; calendar: string; email: string; central: string; job: { title: string; project_number: string | null } | null };
const cal: Record<string, string> = { in_outlook: "I Outlook", needs_check: "Må kontrolleres", not_in_outlook: "Ikke i Outlook" };
const central: Record<string, string> = { not_selected: "Ikke valgt for sentral app", probe_required: "Lesetest kreves", probe_ok: "Lesetest OK (<24 t)", probe_failed: "Lesetest feilet" };
const mail: Record<string, string> = { accepted_by_microsoft: "Tatt imot av Microsoft (ikke bekreftet levert)", failed: "Feilet", none: "Ingen e-post registrert" };

/** Read-only overview: calendar and e-mail are separate outcomes per technician and work day. */
export function CentralCalendarReadiness() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [excluded, setExcluded] = useState(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true); setMsg("");
    const r = await invokeWithSession<{ rows: Row[]; excluded_inactive_or_former: number }>("job-outlook-app-pilot", { body: { action: "readiness" } });
    if (r.error || !r.data) setMsg("Kunne ikke hente oversikten. Ingenting er endret.");
    else { setRows(r.data.rows); setExcluded(r.data.excluded_inactive_or_former); }
    setBusy(false);
  };
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Kalenderstatus per montør og dag">
    <h3 className="font-semibold">Kalenderstatus per montør og arbeidsdag (neste 60 dager)</h3>
    <p className="text-muted-foreground">Kun lesing. Ingen kalenderavtale, e-post eller kø endres. Hver postkasse trenger egen lesetest – Mats’ godkjente test gjelder ikke andre.</p>
    <Button variant="outline" disabled={busy} onClick={load}>Vis status – kun lesing</Button>
    {msg && <p role="status">{msg}</p>}
    {rows && <>
      <p>{rows.length} planlagte arbeidsdager for aktive ansatte · {excluded} dager utelatt (tidligere ansatte eller inaktiv tilgang)</p>
      <ul className="space-y-2">{rows.map((r, i) => <li key={i} className="break-words border-l-2 border-border pl-3">
        <span className="font-medium">{r.work_date} · {r.technician_name ?? "Ukjent"}</span> · {r.job?.project_number ?? ""} {r.job?.title ?? ""}
        <span className="block text-muted-foreground">Kalender: {cal[r.calendar] ?? r.calendar} · Sentral app: {central[r.central] ?? r.central}</span>
        <span className="block text-muted-foreground">E-post: {mail[r.email] ?? r.email}</span>
      </li>)}</ul>
    </>}
  </section>;
}
