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
    case "already_exists":
    case "deleted":
      return { status: "sent", reason: null };
    case "in_progress":
      return { status: "pending", reason: "in_progress" };
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

export async function recordDelivery(supabaseAdmin: any, r: DeliveryRecord): Promise<void> {
  try {
    const now = new Date().toISOString();
    const state = r.state ?? (r.status === "sent" ? "accepted_by_graph" : r.status === "skipped" && r.reasonCode === "self_assigned" ? "not_required" : r.status === "skipped" ? "awaiting" : r.status);
    const { error } = await supabaseAdmin.rpc("record_event_delivery", {
      _event: r.eventId, _technician: r.technicianId, _channel: r.channel, _status: r.status, _state: state,
      _user: r.technicianUserId ?? null, _email: r.recipientEmail ?? null, _reason: r.reasonCode ?? null,
      _graph: r.graphStatus ?? null, _actor: r.attemptedBy ?? null, _signal: r.verificationSignal ?? null, _operation: r.operationKey ?? null,
    });
    if (error) throw new Error(`Delivery recording failed: ${error.message}`);
    if (state === "failed" && r.attemptedBy) {
      const { data: event } = await supabaseAdmin.from("events").select("company_id,title").eq("id", r.eventId).maybeSingle();
      const { error: alertError } = await supabaseAdmin.from("notifications").insert({
        user_id: r.attemptedBy, company_id: event?.company_id, type: "m365_delivery_failed", priority: "important",
        title: "Microsoft-utsending feilet", message: `${event?.title ?? "Oppdrag"}: ${r.channel} – ${r.reasonCode ?? "ukjent feil"}`,
        link_url: `/jobs/${r.eventId}`, entity_type: "event", entity_id: r.eventId, actor_name: "MCS Hub · Postkontoret",
      });
      if (alertError) throw new Error(`Planner alert failed: ${alertError.message}`);
    }
  } catch (e) {
    console.error("[recipient-delivery] exception:", e);
    throw e;
  }
}
