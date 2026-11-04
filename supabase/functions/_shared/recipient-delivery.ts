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
    const { data: existing } = await supabaseAdmin
      .from("event_recipient_delivery").select("attempt_count")
      .eq("event_id", r.eventId).eq("technician_id", r.technicianId).eq("channel", r.channel).maybeSingle();
    const row = {
      event_id: r.eventId, technician_id: r.technicianId,
      technician_user_id: r.technicianUserId ?? null, recipient_email: r.recipientEmail ?? null,
      channel: r.channel, status: r.status, reason_code: r.reasonCode ?? null,
      graph_status: r.graphStatus ?? null, detail: r.detail ? String(r.detail).slice(0, 500) : null,
      attempted_by: r.attemptedBy ?? null, last_attempt_at: now,
      sent_at: r.status === "sent" ? now : null, attempt_count: (existing?.attempt_count ?? 0) + 1,
    };
    const { error } = await supabaseAdmin.from("event_recipient_delivery")
      .upsert(row, { onConflict: "event_id,technician_id,channel" });
    if (error) console.error("[recipient-delivery] write failed:", error.message);
  } catch (e) {
    console.error("[recipient-delivery] exception:", e);
  }
}
