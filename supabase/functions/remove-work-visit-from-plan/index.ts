import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isTrustedOutlookBlock } from "../_shared/outlook-match-policy.ts";

import { processUnplanDeletes, type DeleteJob } from "../_shared/unplan-calendar-delete.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function processJobs(db: any, jobs: DeleteJob[]) {
  return processUnplanDeletes(db, jobs, async uid => {
    const { data, error } = await db.auth.admin.getUserById(uid);
    const meta = data?.user?.user_metadata;
    if (error || typeof meta?.ms_access_token !== "string" || !meta.ms_expires_at ||
      new Date(meta.ms_expires_at).getTime() <= Date.now() + 60000) return null;
    return meta.ms_access_token;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) return json({ error: "Backend configuration missing" }, 500);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const bearer = authHeader.slice("Bearer ".length);
    const isInternalCall = bearer === serviceKey;
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: authData } = isInternalCall ? { data: { user: null } } : await authClient.auth.getUser();
    if (!isInternalCall && !authData.user) return json({ error: "Unauthorized" }, 401);

    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: canDelete } = isInternalCall ? { data: true } : await db.rpc("check_permission_v2", {
      _auth_user_id: authData.user?.id,
      _perm: "calendar.delete_events",
    });
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "remove_assignment";
    if (!canDelete) return json({ error: "Mangler rettighet: calendar.delete_events" }, 403);
    if (isInternalCall) return json({ blocked: true, reason: "interactive_delete_required", processed: 0 }, 403);
    if (!["scan_ghosts", "repair_ghosts", "retry_outlook", "remove_assignment", "remove_event"].includes(action)) return json({ error: "invalid_action" }, 400);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const field of ["event_id", "technician_id", "schedule_block_id"]) {
      if (body[field] != null && (typeof body[field] !== "string" || !uuid.test(body[field]))) return json({ error: `invalid_${field}` }, 400);
    }

    if (action === "scan_ghosts") {
      const { data, error } = await db.rpc("scan_resource_plan_ghosts");
      return error ? json({ error: error.message }, 500) : json(data);
    }
    if (action === "repair_ghosts") {
      const { data, error } = await db.rpc("repair_resource_plan_ghosts");
      return error ? json({ error: error.message }, 500) : json(data);
    }
    if (action === "retry_outlook") {
      // Old queued operations must never start writing merely because this fix is deployed.
      if (isInternalCall || body.confirm_calendar_delete !== true || typeof body.event_id !== "string") {
        return json({ blocked: true, reason: "explicit_event_delete_confirmation_required", processed: 0 });
      }
      const { data: event } = await authClient.from("events").select("company_id").eq("id", body.event_id).maybeSingle();
      if (!event) return json({ error: "Ingen tilgang" }, 403);
      const { data: scoped } = await db.rpc("has_company_access", { _uid: authData.user?.id,
        _company: event?.company_id, _module: "resource_plan", _level: "edit" });
      if (!scoped) return json({ error: "Ingen tilgang" }, 403);
      let query = db.from("calendar_delete_retry_queue").select("*").eq("event_id", body.event_id)
        .in("status", ["pending", "failed"]).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(50);
      if (body.technician_ids != null) {
        if (!Array.isArray(body.technician_ids) || !body.technician_ids.length || body.technician_ids.some((id: unknown) => typeof id !== "string" || !uuid.test(id))) return json({ error: "invalid_technician_ids" }, 400);
        query = query.in("technician_id", body.technician_ids);
      }
      const { data: jobs, error } = await query;
      if (error) return json({ error: error.message }, 500);
      const outlook = await processJobs(db, (jobs ?? []) as DeleteJob[]);
      return json({ status: !outlook.length || outlook.some(r => r.status !== "deleted") ? "reconciliation_required" : "success", processed: outlook.length, outlook });
    }

    const eventId = typeof body.event_id === "string" ? body.event_id : null;
    const technicianId = typeof body.technician_id === "string" ? body.technician_id : null;
    const scheduleBlockId = typeof body.schedule_block_id === "string" ? body.schedule_block_id : null;
    if (!eventId && !scheduleBlockId) return json({ error: "event_id eller schedule_block_id kreves" }, 400);
    if (action === "remove_assignment" && !technicianId && !scheduleBlockId) return json({ error: "technician_id kreves" }, 400);

    // Fail-closed: an Outlook appointment with an unconfirmed (fuzzy/AI/stale) job link must never
    // remove a technician from that job. The UI offers "Fjern feil kobling" / "Skjul avtale i Hub".
    if (scheduleBlockId) {
      const { data: sb } = await authClient.from("schedule_blocks")
        .select("source, project_id, match_state, match_reason").eq("id", scheduleBlockId).maybeSingle();
      if (!sb) return json({ error: "Ingen tilgang" }, 403);
      if (sb && !isTrustedOutlookBlock(sb)) {
        return json({ error: "unconfirmed_outlook_link", message: "Outlook-avtalen er ikke bekreftet koblet til jobben. Bruk «Fjern feil kobling» eller «Skjul avtale i Hub»." }, 409);
      }
    }

    const { data: local, error: localError } = await db.rpc("remove_work_visit_from_plan", {
      p_event_id: eventId,
      p_technician_id: technicianId,
      p_remove_all: action === "remove_event",
      p_schedule_block_id: scheduleBlockId,
      p_actor: authData.user?.id ?? null,
    });
    if (localError) return json({ error: localError.message }, 500);

    if (local?.status === "already_removed") return json({ status: "already_removed", local,
      outlook_complete: false, warnings: [{ error: "explicit_event_delete_confirmation_required", technician_id: technicianId,
        retry_requires_confirmation: true }] });

    const resolvedEventId = local?.event_id;
    if (!resolvedEventId) return json({ error: "local_removal_receipt_missing", local }, 500);
    const query = db.from("calendar_delete_retry_queue").select("*").eq("event_id", resolvedEventId);
    const { data: jobs, error: queueError } = technicianId && action !== "remove_event"
      ? await query.eq("technician_id", technicianId)
      : await query;
    if (queueError) return json({ error: queueError.message, local }, 500);
    const outlook = await processJobs(db, (jobs ?? []).filter((job: DeleteJob & { status?: string }) => job.status !== "resolved"));
    const warnings = outlook.filter((result) => result.status !== "deleted");
    if (!outlook.length) warnings.push({ status: "queued", error: "no_calendar_delete_receipt_reconciliation_required" });
    return json({
      status: local?.status ?? "success",
      local,
      outlook,
      outlook_complete: warnings.length === 0,
      warnings,
    });
  } catch (error) {
    console.error("[remove-work-visit-from-plan]", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});