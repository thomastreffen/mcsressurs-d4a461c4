import { osloDayKey } from "./multi-day-calendar.ts";

export type DeleteJob = { id: string; event_id: string; technician_id: string; technician_name: string | null;
  technician_user_id?: string | null; mailbox: string | null; candidate_event_ids: unknown;
  start_at: string | null; end_at: string | null; attempts: number };

/** Exact Hub provenance only. Never search a mailbox by title or another job's marker. */
export async function processUnplanDeletes(db: any, jobs: DeleteJob[], getToken: (uid: string) => Promise<string | null>, fetchImpl: typeof fetch = fetch) {
  const results: Record<string, unknown>[] = [];
  for (const job of jobs) {
    let error: string | null = null;
    const attempts: { source: string; status: number; code: string | null }[] = [];
    try {
      const { data: claim, error: claimError } = await db.from("calendar_delete_retry_queue")
        .update({ status: "processing" }).eq("id", job.id).in("status", ["pending", "failed"]).select("id").maybeSingle();
      if (claimError || !claim) {
        results.push({ technician_id: job.technician_id, status: "queued", error: "delete_claim_unavailable", retry_requires_confirmation: true });
        continue;
      }
      const { data: links, error: linkError } = await db.from("job_calendar_day_links")
        .select("work_date,outlook_event_id").eq("event_id", job.event_id).eq("technician_id", job.technician_id);
      if (linkError) throw new Error("day_link_lookup_failed");
      const { data: active, error: activeError } = await db.from("schedule_blocks")
        .select("start_at").or(`job_id.eq.${job.event_id},project_id.eq.${job.event_id}`).eq("technician_id", job.technician_id).is("deleted_at", null);
      if (activeError) throw new Error("live_plan_lookup_failed");
      const activeDays = new Set((active ?? []).map((b: any) => osloDayKey(b.start_at)));
      const removed = (links ?? []).filter((l: any) => !activeDays.has(l.work_date));
      if ((links ?? []).length && !removed.length) throw new Error("job_replanned_delete_blocked");
      // Central links require the dedicated app's exact pilot gate; never borrow AZURE mail identity.
      const { data: central, error: centralError } = await db.from("job_outlook_app_links")
        .select("outlook_event_id").eq("event_id", job.event_id).eq("technician_id", job.technician_id);
      if (centralError) throw new Error("calendar_provenance_lookup_failed");
      if (central?.some((l: any) => l.outlook_event_id)) throw new Error("central_delete_requires_gated_reconciliation");
      const { data: organizers, error: organizerError } = await db.from("m365_organizer_links")
        .select("graph_event_id,state").eq("event_id", job.event_id).eq("technician_id", job.technician_id);
      if (organizerError) throw new Error("calendar_provenance_lookup_failed");
      if (organizers?.some((l: any) => l.graph_event_id && l.state !== "deleted")) throw new Error("organizer_delete_requires_gated_reconciliation");
      const ids: string[] = [...new Set<string>(removed.map((l: any) => l.outlook_event_id).filter((id: unknown): id is string => typeof id === "string" && !id.startsWith("pending:")))];
      if (!ids.length && !(links ?? []).length && !activeDays.size && Array.isArray(job.candidate_event_ids)) {
        ids.push(...new Set<string>(job.candidate_event_ids.filter((id: unknown): id is string => typeof id === "string" && !!id && !id.startsWith("pending:"))));
      }
      if (!ids.length) throw new Error("no_exact_outlook_id_reconciliation_required");
      const snapshot = await db.from("calendar_delete_retry_queue").update({ candidate_event_ids: ids }).eq("id", job.id);
      if (snapshot.error) throw new Error("delete_candidate_snapshot_failed");
      const { data: tech, error: techError } = await db.from("technicians").select("user_id,email").eq("id", job.technician_id).maybeSingle();
      if (techError || !tech?.user_id || !tech.email || tech.email.toLowerCase() !== job.mailbox?.toLowerCase()) throw new Error("recipient_identity_mismatch");
      const token = await getToken(tech.user_id);
      if (!token) throw new Error("delegated_token_unavailable_reconnect_required");
      for (const id of ids) {
        const response = await fetchImpl(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(tech.email)}/events/${encodeURIComponent(id)}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        });
        let code: string | null = null;
        if (!response.ok && response.status !== 404) {
          const body = await response.json().catch(() => null);
          code = typeof body?.error?.code === "string" ? body.error.code.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 80) : null;
        }
        attempts.push({ source: "exact_link", status: response.status, code });
        if (!response.ok && response.status !== 404) throw new Error(`graph_delete_${response.status}${code ? `_${code}` : ""}`);
        // Delete only the confirmed object's mapping, not other workdays, Hub job or approvals.
        const cleaned = await db.from("job_calendar_day_links").delete().eq("event_id", job.event_id)
          .eq("technician_id", job.technician_id).eq("outlook_event_id", id);
        if (cleaned.error) throw new Error("outlook_removed_local_reconciliation_required");
        const legacy = await db.from("job_calendar_links").update({ sync_status: "unlinked", calendar_event_id: null, calendar_event_url: null })
          .eq("job_id", job.event_id).eq("technician_id", job.technician_id).eq("calendar_event_id", id);
        if (legacy.error) throw new Error("outlook_removed_local_reconciliation_required");
      }
    } catch (e) { error = e instanceof Error ? e.message : "unknown_delete_outcome_reconciliation_required"; }
    const next = new Date(Date.now() + Math.min(360, 5 * 2 ** Math.min(job.attempts, 6)) * 60000).toISOString();
    const recorded = await db.from("calendar_delete_retry_queue").update({ status: error ? "failed" : "resolved",
      attempts: job.attempts + 1, last_attempt_at: new Date().toISOString(), next_attempt_at: next,
      resolved_at: error ? null : new Date().toISOString(), last_error: error }).eq("id", job.id);
    if (recorded.error) error = "delete_receipt_persistence_failed_reconciliation_required";
    results.push({ technician_id: job.technician_id, technician_name: job.technician_name,
      status: error ? "queued" : "deleted", error, attempts, retry_requires_confirmation: !!error });
  }
  return results;
}