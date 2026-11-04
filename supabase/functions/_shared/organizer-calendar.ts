import { getAppToken, organizerEnabled, pilotAllows, SYSTEM_MAILBOX } from "./m365-sender.ts";

export interface OrganizerLink { id: string; transaction_id: string; graph_event_id: string | null; state: string; updated_at: string }
export interface OrganizerStore {
  reserve(): Promise<OrganizerLink>;
  claim(link: OrganizerLink): Promise<boolean>;
  save(link: OrganizerLink, values: Record<string, unknown>): Promise<void>;
}
export interface OrganizerInput {
  action: "create" | "update" | "force_update" | "delete" | "reconcile";
  email: string;
  body: Record<string, unknown>;
  legacyId?: string | null;
  store: OrganizerStore;
  fetchImpl?: typeof fetch;
}
/** New per-assignment organizer objects; no automatic conversion of existing individual calendars.
 * Unknown POST outcomes are reconciled, never blindly replayed. Attendee replies are not Hub approval. */
export async function syncOrganizer(input: OrganizerInput) {
  const f = input.fetchImpl ?? fetch;
  if (input.legacyId) return { status: "legacy", state: "awaiting" };
  if (!organizerEnabled() || !pilotAllows([input.email])) return { status: "pilot_blocked", state: "failed" };
  let token: string | null;
  try { token = await getAppToken(f); } catch { return { status: "system_sender_unavailable", state: "failed" }; }
  if (!token) return { status: "system_sender_unavailable", state: "failed" };
  const link = await input.store.reserve();
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SYSTEM_MAILBOX)}/events`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: 'IdType="ImmutableId"' };
  if (link.state === "deleted") return { status: "deleted", state: "verified", signal: "organizer_deleted" };
  if ((input.action === "create" && link.graph_event_id) || input.action === "reconcile") {
    if (!link.graph_event_id) return { status: "uncertain_create", state: "awaiting" };
    const res = await f(`${base}/${encodeURIComponent(link.graph_event_id)}`, { headers });
    if (!res.ok) { await res.text(); return { status: "graph_error", state: "failed", code: res.status }; }
    const current = await res.json();
    const attendee = current.attendees?.find((a: any) => a.emailAddress?.address?.toLowerCase() === input.email.toLowerCase());
    const response = attendee?.status?.response ?? "notResponded";
    await input.store.save(link, { response_status: response });
    // Organizer GET proves organizer existence only. Acceptance is explicitly an attendee response.
    return { status: "already_exists", state: response === "accepted" ? "verified" : "awaiting", signal: response === "accepted" ? "attendee_accepted" : null, response, calendarEventId: current.id };
  }
  if (link.state === "uncertain") return { status: "uncertain_operation", state: "awaiting" };
  if (!await input.store.claim(link)) return { status: "in_progress", state: "pending" };
  try {
    if (input.action === "delete" && !link.graph_event_id) {
      await input.store.save(link, { state: "deleted" });
      return { status: "deleted", state: "verified", signal: "no_organizer_object" };
    }
    const creating = !link.graph_event_id;
    const deleting = input.action === "delete";
    const method = deleting ? "DELETE" : creating ? "POST" : "PATCH";
    const payload = { ...input.body, attendees: [{ emailAddress: { address: input.email }, type: "required" }], responseRequested: true,
      ...(creating ? { transactionId: link.transaction_id } : {}) };
    const res = await f(creating ? base : `${base}/${encodeURIComponent(link.graph_event_id ?? "")}`, {
      method, headers, ...(deleting ? {} : { body: JSON.stringify(payload) }),
    });
    if (!res.ok && !(deleting && res.status === 404)) {
      await res.text();
      await input.store.save(link, { state: res.status >= 500 ? "uncertain" : "failed", last_error: `graph_${res.status}` });
      return { status: res.status === 403 ? "graph_forbidden" : "graph_error", state: "failed", code: res.status };
    }
    const data = res.status === 204 || res.status === 404 ? (await res.text(), {}) : await res.json();
    if (creating && !data.id) throw new Error("Missing organizer ID");
    await input.store.save(link, { state: deleting ? "deleted" : "active", graph_event_id: data.id ?? link.graph_event_id, last_error: null });
    return { status: deleting ? "deleted" : creating ? "created" : "updated", state: deleting ? "verified" : "accepted_by_graph", signal: deleting ? "organizer_deleted" : null, code: res.status, calendarEventId: data.id ?? link.graph_event_id };
  } catch {
    await input.store.save(link, { state: "uncertain", last_error: "unknown_graph_outcome" });
    return { status: "unknown_graph_outcome", state: "awaiting" };
  }
}

export function organizerStore(db: any, eventId: string, technicianId: string): OrganizerStore {
  return {
    async reserve() {
      const { error } = await db.from("m365_organizer_links").upsert({ event_id: eventId, technician_id: technicianId }, { onConflict: "event_id,technician_id", ignoreDuplicates: true });
      if (error) throw error;
      const result = await db.from("m365_organizer_links").select("*").eq("event_id", eventId).eq("technician_id", technicianId).single();
      if (result.error || !result.data) throw result.error ?? new Error("Missing organizer reservation");
      return result.data;
    },
    async claim(link) {
      const { data, error } = await db.from("m365_organizer_links").update({ state: "uncertain", updated_at: new Date().toISOString() }).eq("id", link.id).eq("updated_at", link.updated_at).neq("state", "uncertain").select("id").maybeSingle();
      if (error) throw error;
      return !!data;
    },
    async save(link, values) {
      const { error } = await db.from("m365_organizer_links").update({ ...values, updated_at: new Date().toISOString() }).eq("id", link.id);
      if (error) throw error;
    },
  };
}