/** Never classify an old event by its title. Explicit no-response is informational. */
export function requiresApproval(event: { entity_type?: string | null }, requested?: boolean) {
  return event.entity_type !== "internal" && requested !== false;
}

export type EvidenceState = "pending" | "accepted_by_graph" | "verified" | "failed" | "awaiting" | "not_required";
export type ChannelEvidence = { technician_id: string; channel?: string; status: string; delivery_state?: string | null; verification_signal?: string | null; reason_code?: string | null };
export function evidenceState(row: ChannelEvidence): EvidenceState {
  if (row.delivery_state === "verified" && row.verification_signal) return "verified";
  if (row.delivery_state === "verified") return "awaiting";
  if (row.delivery_state) return row.delivery_state as EvidenceState;
  if (row.status === "sent") return "accepted_by_graph"; // legacy is NOT proof of receipt
  if (row.status === "skipped" && row.reason_code === "self_assigned") return "not_required";
  if (row.status === "failed" || row.status === "skipped") return "failed";
  return "pending";
}
export function communicationLight(ids: string[], rows: ChannelEvidence[], channels = ["email", "calendar"]): "green" | "yellow" | "red" {
  if (!ids.length) return "yellow";
  let awaiting = false;
  for (const id of ids) for (const channel of channels) {
    const row = rows.find(r => r.technician_id === id && r.channel === channel);
    if (!row) { awaiting = true; continue; }
    const state = evidenceState(row);
    if (state === "failed") return "red";
    if (state !== "verified" && state !== "not_required") awaiting = true;
  }
  return awaiting ? "yellow" : "green";
}