export const PLANNING_CHANNELS = ["internal", "supplier", "customer", "all"] as const;
export type PlanningChannel = typeof PLANNING_CHANNELS[number];
export type ExternalType = "customer" | "supplier";
export const CHANNEL_LABELS: Record<PlanningChannel, string> = {
  internal: "Intern plan", supplier: "Leverandør", customer: "Kunde", all: "Alle",
};
export interface ChannelPerson {
  id: string; kind: "internal" | "external"; name: string; company_name: string; participant_type?: ExternalType;
}
export interface ChannelMessage {
  id: string; body: string; author_name: string | null; created_at: string; reply_to_id: string | null;
  recipient_snapshot: ChannelPerson[];
}
export interface ExternalParticipant {
  id: string; name: string; email: string; company_name: string; participant_type: ExternalType; status: string;
}
export function canReadChannel(type: ExternalType, channel: PlanningChannel) {
  return channel === "all" || channel === type;
}
export function chosenRecipients(audience: ChannelPerson[], externalIds: string[]) {
  return audience.filter(person => person.kind === "internal" || externalIds.includes(person.id));
}
export function excludedRecipients(audience: ChannelPerson[], externalIds: string[]) {
  return audience.filter(person => person.kind === "external" && !externalIds.includes(person.id));
}
export function invitationSummary(name: string, project: string, type: ExternalType) {
  return `${name || "Mottakeren"} får tilgang til «${project}», samtalene ${CHANNEL_LABELS[type]} og Alle, og filer, oppgaver og arbeidspakker som deles med ${CHANNEL_LABELS[type].toLowerCase()} eller alle. Ingen andre prosjekter, Ressursplan, kunder, ansatte, HMS eller intern økonomi.`;
}
export interface ExternalProjectView {
  project: { id: string; name: string; status: string; expected_start: string | null; expected_end: string | null };
  participant: { id: string; name: string; participant_type: ExternalType };
  channels: PlanningChannel[];
  work_packages: { id: string; name: string; description: string | null; status: string; planned_start: string | null; planned_end: string | null }[];
  tasks: { id: string; title: string; description: string | null; status: string; due_date: string | null; assigned_to_me: boolean }[];
  files: { id: string; display_name: string; shared_visibility: PlanningChannel; category: string }[];
}