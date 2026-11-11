// Single source of customer-facing order status wording.
// Used by the tracking page (React) and order-form-notify (e-mail). Pure TS.

export type CustomerStatusKey =
  | "received" | "processing" | "waiting_customer" | "needs_info"
  | "planned" | "in_progress" | "completed" | "closed" | "rejected";

export type CustomerStep = "received" | "processing" | "planned" | "in_progress" | "completed";

export interface CustomerStatusView {
  key: CustomerStatusKey;
  label: string;        // badge
  headline: string;     // large text + e-mail heading
  body: string;         // explanation + e-mail body
  timeline: string;     // event line in the customer timeline
  step: CustomerStep;   // active main step in the stepper
  subLabel: string | null; // shown under the active step
  customerActionNeeded: boolean;
}

const V: Record<CustomerStatusKey, Omit<CustomerStatusView, "key">> = {
  received: { label: "Mottatt", headline: "Vi har mottatt bestillingen din", body: "Bestillingen er registrert hos MCS. Du trenger ikke gjøre noe nå.", timeline: "Bestilling mottatt", step: "received", subLabel: null, customerActionNeeded: false },
  processing: { label: "Under behandling", headline: "MCS har tatt tak i bestillingen", body: "Vi vurderer hva som trengs og planlegger neste steg. Du får beskjed når det skjer noe nytt.", timeline: "MCS har tatt tak i bestillingen", step: "processing", subLabel: null, customerActionNeeded: false },
  waiting_customer: { label: "Venter på kunde", headline: "Venter på tilbakemelding fra deg", body: "MCS har tatt tak i saken. Neste steg er en tilbakemelding fra deg. Se meldingen nedenfor og svar når det passer.", timeline: "Status: Venter på kunde", step: "processing", subLabel: "Venter på kunde", customerActionNeeded: true },
  needs_info: { label: "Trenger mer info", headline: "Vi trenger noen opplysninger fra deg", body: "For å gå videre trenger vi at du svarer på spørsmålene eller fyller inn opplysningene nedenfor.", timeline: "Vi ba om mer informasjon", step: "processing", subLabel: "Trenger mer info", customerActionNeeded: true },
  planned: { label: "Planlagt", headline: "Oppdraget er planlagt", body: "Oppdraget er satt opp. Vi gir beskjed når vi er på vei.", timeline: "Oppgaven er planlagt", step: "planned", subLabel: null, customerActionNeeded: false },
  in_progress: { label: "Utføres", headline: "Vi er i gang", body: "Arbeidet er under utførelse. Du får beskjed når vi er ferdige.", timeline: "Arbeidet er startet", step: "in_progress", subLabel: null, customerActionNeeded: false },
  completed: { label: "Ferdig", headline: "Saken er avsluttet", body: "Bestillingen er avsluttet hos MCS. Ta kontakt om du har spørsmål.", timeline: "Saken er avsluttet", step: "completed", subLabel: null, customerActionNeeded: false },
  closed: { label: "Avsluttet", headline: "Saken er avsluttet", body: "Denne bestillingen er avsluttet. Du kan fortsatt se historikken her.", timeline: "Saken er avsluttet", step: "completed", subLabel: null, customerActionNeeded: false },
  rejected: { label: "Avvist", headline: "Bestillingen er avvist", body: "Bestillingen er dessverre avvist. Ta gjerne kontakt for mer informasjon.", timeline: "Bestillingen er avvist", step: "completed", subLabel: null, customerActionNeeded: false },
};

/** Internal status (+ whether a formal info request is open) → customer view. */
export function customerStatusView(internalStatus: string | null | undefined, hasOpenInfoRequest = false): CustomerStatusView {
  let key: CustomerStatusKey;
  if (hasOpenInfoRequest && internalStatus !== "closed" && internalStatus !== "rejected") key = "needs_info";
  else switch (internalStatus) {
    case "new": key = "received"; break;
    case "under_review": case "waiting_internal": case "ready_for_planning": key = "processing"; break;
    case "waiting_customer": key = "waiting_customer"; break;
    case "missing_info": key = "needs_info"; break;
    case "task_created": key = "planned"; break;
    case "in_progress": key = "in_progress"; break;
    case "closed": key = "closed"; break;
    case "rejected": key = "rejected"; break;
    default: key = "received";
  }
  return { key, ...V[key] };
}

/** Timeline line for a status change to `to`, from the same mapping. */
export function customerTimelineLabel(to: string | null | undefined): string | null {
  if (!to || to === "new" || to === "waiting_internal") return null;
  return customerStatusView(to).timeline;
}

/**
 * Hide status changes that never took effect: a status_changed that was
 * reverted by an auto_status_change within 60 s, and repeats of the same
 * status. History is kept server-side; only the customer display collapses it.
 */
export function effectiveCustomerStatusEvents<T extends { event_type: string; created_at: string; payload?: any }>(events: T[]): T[] {
  const sorted = [...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const out: T[] = [];
  let lastShownTo: string | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.event_type === "auto_status_change") { lastShownTo = e.payload?.to ?? lastShownTo; continue; }
    if (e.event_type !== "status_changed") { out.push(e); continue; }
    const t = new Date(e.created_at).getTime();
    const reverted = sorted.slice(i + 1).some((n) =>
      n.event_type === "auto_status_change" && n.payload?.from === e.payload?.to &&
      new Date(n.created_at).getTime() - t <= 60_000);
    if (reverted) continue;
    if (e.payload?.to === lastShownTo) continue;
    lastShownTo = e.payload?.to ?? null;
    out.push(e);
  }
  return out;
}
