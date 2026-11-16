// Pure operational communication shared by mail and both calendar adapters.
import { jobInfoUrl } from "./job-access-policy.ts";
import { buildOperationalJobBrief, escapeHtml } from "./job-brief.ts";
import { formatJobSchedule } from "./job-time.ts";
import { formatPlannedDays } from "./multi-day-calendar.ts";

export function jobInfoAction(id: string): string {
  return `<p style="margin:16px 0;"><a href="${jobInfoUrl(id)}" style="display:block;padding:14px 18px;min-height:20px;background:#2563b0;color:#fff;text-align:center;text-decoration:none;font-size:16px;font-weight:600;border-radius:6px;">Åpne jobbinfo</a></p>`;
}

export function recipientPlannedDays(blocks: { technician_id: string; start_at: string; end_at: string }[], technicianId: string): string[] {
  return formatPlannedDays(blocks.filter(b => b.technician_id === technicianId));
}

export function plannedDaysHtml(days: string[]): string {
  return days.length ? `<p><strong>Arbeidsdager:</strong></p><ul>${days.map(d => `<li>${escapeHtml(d)}</li>`).join("")}</ul>` : "";
}

/** No file URLs, approval tokens, billing fields or network calls. Times are Oslo/DST. */
export function jobCalendarHtml(event: Record<string, unknown> & { id: string }, start: string, end: string): string {
  const b = buildOperationalJobBrief({ event });
  const when = formatJobSchedule(start, end);
  const line = (label: string, value: string) => value ? `<p><strong>${label}:</strong> ${escapeHtml(value).replace(/\n/g, "<br>")}</p>` : "";
  return [
    jobInfoAction(event.id),
    line("Jobb", [b.jobNumber, b.title].filter(Boolean).join(" · ")),
    line("Dato/tid", `${when.startDate} ${when.startTime}–${when.endTime}`),
    line("Adresse", b.address),
    line("Kontaktperson", [b.contactName, b.contactPhone, b.contactEmail].filter(Boolean).join(" · ")),
    line("Arbeidsbeskrivelse", b.workDescription.length > 600 ? `${b.workDescription.slice(0, 600)}…` : b.workDescription),
    "<p>Full jobbinfo, alle arbeidsdager og vedlegg finnes i Hub. Innlogging og gjeldende jobbtilgang kreves.</p>",
    `<p><a href="${jobInfoUrl(event.id)}">${jobInfoUrl(event.id)}</a></p>`,
  ].join("");
}