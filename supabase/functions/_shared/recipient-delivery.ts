// Per-recipient delivery status for technician calendar invites and job emails.
// Never stores tokens or message bodies – only outcome, reason code and Graph status.

export type DeliveryChannel = "calendar" | "email";
export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped";

export interface DeliveryRecord {
  eventId: string;
  technicianId: string;
  technicianUserId?: string | null;
  recipientEmail?: string | null;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  reasonCode?: string | null;
  graphStatus?: number | null;
  detail?: string | null;
  attemptedBy?: string | null;
  state?: "pending" | "accepted_by_graph" | "verified" | "failed" | "awaiting" | "not_required";
  verificationSignal?: string | null;
  operationKey?: string | null;
}

/** Map a calendar-write-sync per-technician result to a delivery record status. */
export function calendarResultToDelivery(status: string): { status: DeliveryStatus; reason: string | null } {
  switch (status) {
    case "created":
    case "updated":
    case "deleted":
      return { status: "sent", reason: null };
    case "already_exists":
      return { status: "pending", reason: "awaiting_verification" };
    case "in_progress":
      return { status: "pending", reason: "in_progress" };
    case "no_link":
      // Eksplisitt «Oppdater Outlook» uten eksisterende kalenderkobling:
      // ingenting opprettes (ingen duplikat), status vises som ventende.
      return { status: "pending", reason: "no_calendar_link" };
    case "missing_days":
      // Multi-day: some planned workdays have no Outlook event yet – never "sent".
      return { status: "pending", reason: "missing_calendar_days" };
    case "not_applicable":
      return { status: "skipped", reason: "not_applicable" };
    case "no_token":
      return { status: "failed", reason: "no_ms_connection" };
    case "no_user_id":
      return { status: "failed", reason: "no_login_link" };
    case "no_email":
      return { status: "failed", reason: "no_email" };
    case "conflict":
      return { status: "failed", reason: "graph_conflict" };
    default:
      return { status: "failed", reason: status || "error" };
  }
}

/** Aggregate evidence, not HTTP acceptance. Legacy object existence remains unverified. */
export function syncEvidenceStatus(results: { status: string; state?: string; signal?: string | null }[]): "synced" | "partial" | "failed" | null {
  if (!results.length) return null;
  if (results.every(r => r.state === "verified" && !!r.signal)) return "synced";
  if (results.every(r => r.state === "failed" || (!r.state && calendarResultToDelivery(r.status).status === "failed"))) return "failed";
  return "partial";
}

/**
 * Overall Outlook status for an event: "synced" only when every recipient succeeded,
 * "partial" when some failed, "failed" when none succeeded. Null when nothing applies.
 */
export function overallSyncStatus(statuses: DeliveryStatus[]): "synced" | "partial" | "failed" | null {
  if (statuses.length === 0) return null;
  const sent = statuses.filter((s) => s === "sent").length;
  const pending = statuses.filter((s) => s === "pending").length;
  if (sent === statuses.length) return "synced";
  if (sent === 0 && pending === 0) return "failed";
  return "partial";
}

const REASON_TEXT: Record<string, string> = {
  no_ms_connection: "mangler gyldig Microsoft-pålogging i Hub (må logge inn på nytt med Microsoft)",
  no_login_link: "har ingen Hub-bruker koblet",
  no_email: "mangler e-postadresse",
  graph_conflict: "kalenderkonflikt i Outlook",
  sender_no_ms_connection: "avsender mangler Microsoft-pålogging",
};

/**
 * Standing conditions: the cause is the person's missing setup, not the individual job.
 * For these, one unread planner alert per person+reason per 24h is enough – the per-job
 * status stays visible in the job card (event_recipient_delivery) either way.
 */
export const STANDING_DELIVERY_REASONS = ["no_ms_connection", "no_login_link", "no_email"] as const;
export const STANDING_ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isStandingDeliveryReason(reason?: string | null): boolean {
  return !!reason && (STANDING_DELIVERY_REASONS as readonly string[]).includes(reason);
}

/** True when an unread alert within the window already names this person+reason line. */
export function hasRecentStandingAlert(
  alerts: { message?: string | null; created_at?: string | null }[],
  line: string,
  now: Date,
): boolean {
  const cutoff = now.getTime() - STANDING_ALERT_WINDOW_MS;
  return alerts.some((a) => {
    if (!a.message || !a.message.includes(line)) return false;
    if (!a.created_at) return true; // no timestamp → treat as recent, stay quiet
    const t = new Date(a.created_at).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function failureLine(person: string, channel: string, reason?: string | null): string {
  const what = channel === "calendar" ? "Outlook-kalender" : "e-post";
  return `• ${person}: ${what} ikke oppdatert – ${REASON_TEXT[reason ?? ""] ?? reason ?? "ukjent feil"}`;
}

/** Planner alert text: Hub save is OK; only the named person's Outlook/e-mail failed. */
export function deliveryFailureMessage(title: string, person: string, channel: string, reason?: string | null): string {
  return `${title}: Jobben er lagret og planlagt i Hub og vises i Ressursplan. Ingen automatisk ny utsending; kalenderen sendes på nytt for personen først når Microsoft-tilgangen er ordnet.\n${failureLine(person, channel, reason)}`;
}

export async function recordDelivery(supabaseAdmin: any, r: DeliveryRecord): Promise<void> {
  try {
    const state = r.state ?? (r.status === "sent" ? "accepted_by_graph" : r.status === "skipped" && r.reasonCode === "self_assigned" ? "not_required" : r.status === "skipped" ? "awaiting" : r.status);
    const { error } = await supabaseAdmin.rpc("record_event_delivery", {
      _event: r.eventId, _technician: r.technicianId, _channel: r.channel, _status: r.status, _state: state,
      _user: r.technicianUserId ?? null, _email: r.recipientEmail ?? null, _reason: r.reasonCode ?? null,
      _graph: r.graphStatus ?? null, _actor: r.attemptedBy ?? null, _signal: r.verificationSignal ?? null, _operation: r.operationKey ?? null,
    });
    if (error) throw new Error(`Delivery recording failed: ${error.message}`);
    if (state === "failed" && r.attemptedBy) {
      const { data: event } = await supabaseAdmin.from("events").select("company_id,title").eq("id", r.eventId).maybeSingle();
      const { data: techRow } = await supabaseAdmin.from("technicians").select("name").eq("id", r.technicianId).maybeSingle();
      const person = techRow?.name ?? r.recipientEmail ?? "ukjent montør";
      const line = failureLine(person, r.channel, r.reasonCode);
      // Standing conditions (e.g. missing Microsoft login) would otherwise alert on every
      // new job for the same person. One unread alert per person+reason per 24h across jobs;
      // the per-job status remains visible in the job card.
      if (isStandingDeliveryReason(r.reasonCode)) {
        const since = new Date(Date.now() - STANDING_ALERT_WINDOW_MS).toISOString();
        const { data: recentAlerts } = await supabaseAdmin.from("notifications")
          .select("message,created_at")
          .eq("user_id", r.attemptedBy).eq("type", "m365_delivery_failed").eq("read", false)
          .gte("created_at", since);
        if (hasRecentStandingAlert(recentAlerts ?? [], line, new Date())) return;
      }
      const { data: existingAlert } = await supabaseAdmin.from("notifications").select("id,message").eq("user_id", r.attemptedBy).eq("entity_id", r.eventId).eq("type", "m365_delivery_failed").eq("read", false).limit(1).maybeSingle();
      if (existingAlert) {
        // One alert per job; append further affected people instead of hiding them.
        const line = failureLine(person, r.channel, r.reasonCode);
        if (!String(existingAlert.message ?? "").includes(line)) {
          await supabaseAdmin.from("notifications").update({ message: `${existingAlert.message}\n${line}` }).eq("id", existingAlert.id);
        }
        return;
      }
      const { error: alertError } = await supabaseAdmin.from("notifications").insert({
        user_id: r.attemptedBy, company_id: event?.company_id, type: "m365_delivery_failed", priority: "important",
        title: "Outlook ikke oppdatert – jobben er lagret i Hub",
        message: deliveryFailureMessage(event?.title ?? "Oppdrag", person, r.channel, r.reasonCode),
        link_url: `/jobs/${r.eventId}`, entity_type: "event", entity_id: r.eventId, actor_name: "MCS Hub · Postkontoret",
      });
      if (alertError) throw new Error(`Planner alert failed: ${alertError.message}`);
    }
  } catch (e) {
    console.error("[recipient-delivery] exception:", e);
    throw e;
  }
}
