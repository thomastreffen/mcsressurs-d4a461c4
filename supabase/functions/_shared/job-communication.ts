// Pure operational communication shared by mail and both calendar adapters.
import { jobInfoUrl, jobInfoAction } from "./job-access-policy.ts";
import { buildOperationalJobBrief, escapeHtml } from "./job-brief.ts";
import { formatJobSchedule } from "./job-time.ts";
import { formatPlannedDays } from "./multi-day-calendar.ts";

export { jobInfoAction };

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
    line("Instruks for tildelingen", typeof event.assignment_notes === "string" ? event.assignment_notes : ""),
    typeof event.meeting_join_url === "string" && /^https:\/\/teams\.microsoft\.com\//i.test(event.meeting_join_url) ? `<p><a href="${escapeHtml(event.meeting_join_url)}">Bli med i Teams-møtet</a></p>` : "",
    "<p>Full jobbinfo, alle arbeidsdager og vedlegg finnes i Hub. Innlogging og gjeldende jobbtilgang kreves.</p>",
    `<p><a href="${jobInfoUrl(event.id)}">${jobInfoUrl(event.id)}</a></p>`,
  ].join("");
}