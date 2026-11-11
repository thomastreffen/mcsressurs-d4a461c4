// Pure rules for the order message composer and status changes.
// Kept free of React/Supabase so they can be unit tested.

export type ComposerVisibility = "internal" | "shared";

export interface ParticipantLike {
  id: string;
  participant_type?: string | null;
}

/** Customer-side participants (bestiller, customer contacts). */
export function isCustomerParticipant(p: ParticipantLike | null | undefined): boolean {
  return !!p && (p.participant_type === "customer" || p.participant_type === "external");
}

/** Participants that may be picked as addressee for the given visibility. */
export function allowedAddressees<T extends ParticipantLike>(participants: T[], visibility: ComposerVisibility): T[] {
  return visibility === "internal" ? participants.filter((p) => !isCustomerParticipant(p)) : participants;
}

/** Returns an error message, or null when the message may be saved. */
export function validateOutgoingMessage(input: {
  visibility: ComposerVisibility;
  addressee: ParticipantLike | null | undefined;
  body: string;
  hasFiles: boolean;
  requireCustomerMessage?: boolean;
}): string | null {
  if (!input.body.trim() && !input.hasFiles) return "Meldingen er tom.";
  if (input.visibility === "internal" && isCustomerParticipant(input.addressee)) {
    return "Et internt notat kan ikke adresseres til kunden. Velg «Delt med kunde» eller en intern mottaker.";
  }
  if (input.requireCustomerMessage && input.visibility !== "shared") {
    return "«Venter kunde» krever en melding som er delt med kunden.";
  }
  if (input.requireCustomerMessage && !input.body.trim()) {
    return "Skriv hva kunden må svare på før status settes til «Venter kunde».";
  }
  return null;
}

/** Statuses that require an explicit customer-facing message (and mandatory e-mail). */
export function statusRequiresCustomerMessage(status: string): boolean {
  return status === "waiting_customer";
}

/** Whether the bestiller should get an e-mail for this shared message. Default: yes. */
export function shouldEmailRequester(visibility: ComposerVisibility, requesterEmail: string | null | undefined, optOut: boolean): boolean {
  return visibility === "shared" && !!requesterEmail && !optOut;
}

/** Messages the customer tracking page may show: shared only, never internal notes. */
export function customerVisibleMessages<T extends { is_visible_to_customer?: boolean | null; visibility?: string | null }>(messages: T[]): T[] {
  return messages.filter((m) => !!m.is_visible_to_customer && m.visibility !== "internal");
}
