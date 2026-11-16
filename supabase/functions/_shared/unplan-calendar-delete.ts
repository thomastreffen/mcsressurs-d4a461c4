import { osloDayKey } from "./multi-day-calendar.ts";

export type DeleteJob = { id: string; event_id: string; technician_id: string; technician_name: string | null;
  technician_user_id?: string | null; mailbox: string | null; candidate_event_ids: unknown;
  start_at: string | null; end_at: string | null; attempts: number };

/** Exact Hub provenance only. Never search a mailbox by title or another job's marker. */
export async function processUnplanDeletes(db: any, jobs: DeleteJob[], getToken: (uid: string) => Promise<string | null>, fetchImpl: typeof fetch = fetch) {
  const results: Record<string, unknown>[] = [];
  for (const job of jobs) {
    let error: string | null = null;
    let retryAfterMs = 0;
    let policy = "reconciliation_required";
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
      const requested = new Set(Array.isArray(job.candidate_event_ids) ? job.candidate_event_ids : []);
      const removed = (links ?? []).filter((l: any) => !activeDays.has(l.work_date) && (!requested.size || requested.has(l.outlook_event_id)));
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
      // Old candidate arrays may contain approvals, imported unrelated blocks or stale IDs.
      // Accept a fallback only while an exact stored legacy recipient link still proves it.
      if (!ids.length && !(links ?? []).length && !activeDays.size) {
        const legacy = await db.from("job_calendar_links").select("calendar_event_id,user_id")
          .eq("job_id", job.event_id).eq("technician_id", job.technician_id);
        if (legacy.error) throw new Error("legacy_link_lookup_failed");
        ids.push(...(legacy.data ?? []).map((l: any) => l.calendar_event_id).filter((id: unknown): id is string => typeof id === "string" && !!id && !id.startsWith("pending:") && (!requested.size || requested.has(id))));
      }
      if (!ids.length) throw new Error("no_exact_outlook_id_reconciliation_required");
      const snapshot = await db.from("calendar_delete_retry_queue").update({ candidate_event_ids: ids }).eq("id", job.id);
      if (snapshot.error) throw new Error("delete_candidate_snapshot_failed");
      const { data: tech, error: techError } = await db.from("technicians").select("user_id,email").eq("id", job.technician_id).maybeSingle();
      if (techError || !tech?.user_id || !tech.email || tech.email.toLowerCase() !== job.mailbox?.toLowerCase()) throw new Error("recipient_identity_mismatch");
      const token = await getToken(tech.user_id);
      if (!token) throw new Error("delegated_token_unavailable_reconnect_required");
      for (const id of ids) {
        // Recheck immediately before every write. A replan between days must halt deletion.
        const live = await db.from("schedule_blocks").select("start_at")
          .or(`job_id.eq.${job.event_id},project_id.eq.${job.event_id}`).eq("technician_id", job.technician_id).is("deleted_at", null);
        if (live.error) throw new Error("live_plan_lookup_failed");
        const mapped = removed.find((l: any) => l.outlook_event_id === id);
        if ((live.data ?? []).some((b: any) => !mapped || osloDayKey(b.start_at) === mapped.work_date)) throw new Error("job_replanned_delete_blocked");
        let response: Response;
        try { response = await fetchImpl(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(tech.email)}/events/${encodeURIComponent(id)}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        }); } catch { throw new Error("graph_network_unknown_outcome_reconciliation_required"); }
        let code: string | null = null;
        if (response.status !== 204 && response.status !== 404) {
          const body = await response.json().catch(() => null);
          code = typeof body?.error?.code === "string" ? body.error.code.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 80) : null;
        }
        attempts.push({ source: "exact_link", status: response.status, code });
        if (response.status !== 204 && response.status !== 404) {
          const seconds = Number(response.headers.get("Retry-After"));
          const until = Date.parse(response.headers.get("Retry-After") ?? "");
          retryAfterMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Number.isFinite(until) ? Math.max(0, until - Date.now()) : 0;
          policy = response.status === 401 ? "reconnect_required" : response.status === 403 ? "permission_review_required"
            : response.status === 429 ? "explicit_retry_after_backoff" : response.status >= 500 ? "explicit_retry_after_backoff" : "reconciliation_required";
          throw new Error(`graph_delete_${response.status}${code ? `_${code}` : ""}`);
        }
        // Delete only the confirmed object's mapping, not other workdays, Hub job or approvals.
        const cleaned = await db.from("job_calendar_day_links").delete().eq("event_id", job.event_id)
          .eq("technician_id", job.technician_id).eq("outlook_event_id", id);
        if (cleaned.error) throw new Error("outlook_removed_local_reconciliation_required");
        const legacy = await db.from("job_calendar_links").update({ sync_status: "unlinked", calendar_event_id: null, calendar_event_url: null })
          .eq("job_id", job.event_id).eq("technician_id", job.technician_id).eq("calendar_event_id", id);
        if (legacy.error) throw new Error("outlook_removed_local_reconciliation_required");
      }
    } catch (e) { error = e instanceof Error && /^[a-zA-Z0-9_]+$/.test(e.message) ? e.message : "unknown_delete_outcome_reconciliation_required"; }
    if (job.attempts >= 5) policy = "retry_limit_reconciliation_required";
    const next = new Date(Date.now() + Math.max(retryAfterMs, Math.min(360, 5 * 2 ** Math.min(job.attempts, 6)) * 60000)).toISOString();
    const recorded = await db.from("calendar_delete_retry_queue").update({ status: error ? "failed" : "resolved",
      attempts: job.attempts + 1, last_attempt_at: new Date().toISOString(), next_attempt_at: next,
      resolved_at: error ? null : new Date().toISOString(), last_error: error }).eq("id", job.id);
    if (recorded.error) error = "delete_receipt_persistence_failed_reconciliation_required";
    results.push({ technician_id: job.technician_id, technician_name: job.technician_name,
      status: error ? "queued" : "deleted", error, attempts, retry_policy: error ? policy : "none",
      receipt: !error && attempts.every(a => a.status === 404) ? "already_gone" : !error ? "deleted" : "unconfirmed",
      retry_requires_confirmation: !!error });
  }
  return results;
}