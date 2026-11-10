/** Outlook appointments are never project jobs: label them as "Avtale". */
export function outlookAppointmentLabel(
  block: { source: string; is_private?: boolean; outlook_response_status?: string | null },
  title: string,
): string {
  if (block.source !== "outlook") return title;
  if (block.is_private) return "Opptatt";
  const r = block.outlook_response_status;
  const unconfirmed = r === "notResponded" || r === "tentativelyAccepted" || r === "none";
  return `Avtale · ${title}${unconfirmed ? " (ikke bekreftet)" : ""}`;
}
