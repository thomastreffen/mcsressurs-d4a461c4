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

/**
 * No status requires a manually written message. Mandatory e-mail ≠ mandatory free text:
 * «Venter kunde» sends a standard status e-mail; a personal message is optional and,
 * when added in the composer, is combined into one e-mail.
 */
export function statusRequiresCustomerMessage(_status: string): boolean {
  return false;
}

/** Statuses that may optionally be set together with a shared composer message (one combined e-mail). */
export function statusCanCombineWithMessage(status: string): boolean {
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

/**
 * Customer notification policy per status change.
 * mandatory: bestiller always gets e-mail (cannot be opted out).
 * default_on: e-mail is the default; staff must actively choose «Ikke varsle bestiller».
 * internal: purely internal status, never e-mails the customer.
 */
export type StatusNotifyPolicy = "mandatory" | "default_on" | "internal";

export function statusNotifyPolicy(status: string): StatusNotifyPolicy {
  switch (status) {
    case "new":
    case "task_created":
    case "ready_for_planning":
    case "closed":
    case "rejected":
    case "waiting_customer":
      return "mandatory";
    case "under_review":
    case "in_progress":
    case "missing_info":
      return "default_on";
    default:
      return "internal";
  }
}

/** Template key used by order-form-notify for a status change. */
export function statusEventKey(status: string): string {
  const map: Record<string, string> = {
    new: "received",
    under_review: "under_review",
    missing_info: "status_changed",
    waiting_customer: "waiting_customer",
    ready_for_planning: "task_created",
    task_created: "task_created",
    in_progress: "in_progress",
    closed: "closed",
    rejected: "rejected",
  };
  return map[status] || "status_changed";
}

/** Whether a status change sends a customer e-mail, given the staff's opt-out choice. */
export function shouldEmailOnStatusChange(status: string, requesterEmail: string | null | undefined, optOut: boolean): boolean {
  if (!requesterEmail) return false;
  const p = statusNotifyPolicy(status);
  if (p === "mandatory") return true;
  if (p === "default_on") return !optOut;
  return false;
}
