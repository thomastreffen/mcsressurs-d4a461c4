// Per-day receipt for the explicit "Opprett manglende kalenderdager" action.
// Pure: built only from the server's per-technician/per-day results. Never claims
// "Synket" unless the server reported the day as synced (Graph returned an event id).

export interface ReceiptDayResult { workDate: string; state: string; error?: string; outcome?: string }
export interface ReceiptTechResult { techId: string; techName: string; status: string; dayResults?: ReceiptDayResult[] }
export interface ReceiptLine { techName: string; workDate: string | null; text: string; tone: "ok" | "wait" | "fail" }

const TECH_STATUS_TEXT: Record<string, string> = {
  no_token: "Mangler gyldig Microsoft-kobling – ingen kalenderdag opprettet",
  no_user_id: "Mangler Hub-brukerkobling – ingen kalenderdag opprettet",
  no_email: "Mangler e-postadresse – ingen kalenderdag opprettet",
};

export function buildMissingDaysReceipt(results: ReceiptTechResult[]): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  for (const r of results) {
    if (r.status === "not_applicable") continue; // single-day assignment, untouched
    if (!r.dayResults || r.dayResults.length === 0) {
      lines.push({ techName: r.techName, workDate: null, text: TECH_STATUS_TEXT[r.status] ?? `Ikke behandlet (${r.status})`, tone: "fail" });
      continue;
    }
    for (const d of r.dayResults) {
      // "Opprettet" ONLY when this run's Graph POST returned an event id.
      if (d.state === "synket" && d.outcome === "created") lines.push({ techName: r.techName, workDate: d.workDate, text: "Opprettet i Outlook (hendelses-ID mottatt)", tone: "ok" });
      else if (d.state === "synket") lines.push({ techName: r.techName, workDate: d.workDate, text: "Allerede synket – ingen endring", tone: "ok" });
      else if (d.state === "feilet") lines.push({ techName: r.techName, workDate: d.workDate, text: `Feilet${d.error ? ` (${d.error})` : ""} – kan prøves igjen`, tone: "fail" });
      else lines.push({ techName: r.techName, workDate: d.workDate, text: "Venter – ikke bekreftet av Outlook", tone: "wait" });
    }
  }
  return lines;
}
