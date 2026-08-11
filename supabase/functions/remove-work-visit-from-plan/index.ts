import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type DeleteJob = {
  id: string;
  event_id: string;
  technician_id: string;
  technician_name: string | null;
  mailbox: string | null;
  candidate_event_ids: unknown;
  start_at: string | null;
  end_at: string | null;
  attempts: number;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function getAppToken(): Promise<string | null> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) return null;

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return typeof payload.access_token === "string" ? payload.access_token : null;
}

function candidateIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0 && !item.startsWith("pending:")))];
}

async function deleteGraphEvent(token: string, mailbox: string, eventId: string) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  return { ok: response.ok || response.status === 404, status: response.status };
}

async function searchAndDelete(
  token: string,
  mailbox: string,
  job: DeleteJob,
): Promise<{ ok: boolean; attempts: Array<{ source: string; event_id: string; status: number }> }> {
  const attempts: Array<{ source: string; event_id: string; status: number }> = [];
  for (const eventId of candidateIds(job.candidate_event_ids)) {
    const result = await deleteGraphEvent(token, mailbox, eventId);
    attempts.push({ source: "stored_id", event_id: eventId, status: result.status });
    if (result.ok) return { ok: true, attempts };
  }

  if (!job.start_at || !job.end_at) return { ok: false, attempts };
  const start = new Date(new Date(job.start_at).getTime() - 48 * 60 * 60 * 1000).toISOString();
  const end = new Date(new Date(job.end_at).getTime() + 48 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    startDateTime: start,
    endDateTime: end,
    "$top": "100",
    "$select": "id,body,categories",
  });
  const lookup = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/calendarView?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' } },
  );
  if (!lookup.ok) {
    attempts.push({ source: "calendar_view", event_id: "lookup", status: lookup.status });
    return { ok: false, attempts };
  }

  const payload = await lookup.json();
  const matches = (payload.value ?? []).filter((entry: { id?: string; body?: { content?: string }; categories?: string[] }) => {
    const body = entry.body?.content ?? "";
    return body.includes(`MCS_EVENT_ID:${job.event_id}`) ||
      (entry.categories ?? []).includes("MCS") && body.includes(`MCS_TECHNICIAN_ID:${job.technician_id}`);
  });
  if (matches.length === 0 && attempts.length === 0) {
    // No stored ID and no MCS event in the relevant window means Outlook is already clean.
    return { ok: true, attempts: [{ source: "calendar_view", event_id: "not_found", status: 404 }] };
  }
  for (const match of matches) {
    if (!match.id) continue;
    const result = await deleteGraphEvent(token, mailbox, match.id);
    attempts.push({ source: "calendar_view", event_id: match.id, status: result.status });
    if (result.ok) return { ok: true, attempts };
  }
  return { ok: false, attempts };
}

async function processJobs(db: any, jobs: DeleteJob[]) {
  const token = await getAppToken();
  const results: Array<Record<string, unknown>> = [];
  for (const job of jobs) {
    if (!job.mailbox) {
      const error = "Montøren mangler e-postadresse";
      await db.from("calendar_delete_retry_queue").update({
        status: "failed", attempts: job.attempts + 1, last_attempt_at: new Date().toISOString(),
        next_attempt_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), last_error: error,
      }).eq("id", job.id);
      results.push({ technician_id: job.technician_id, technician_name: job.technician_name, status: "queued", error });
      continue;
    }
    if (!token) {
      const error = "Kunne ikke hente Microsoft-token";
      await db.from("calendar_delete_retry_queue").update({
        status: "failed", attempts: job.attempts + 1, last_attempt_at: new Date().toISOString(),
        next_attempt_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), last_error: error,
      }).eq("id", job.id);
      results.push({ technician_id: job.technician_id, technician_name: job.technician_name, status: "queued", error });
      continue;
    }

    await db.from("calendar_delete_retry_queue").update({ status: "processing" }).eq("id", job.id);
    const deletion = await searchAndDelete(token, job.mailbox, job);
    if (deletion.ok) {
      await Promise.all([
        db.from("calendar_delete_retry_queue").update({
          status: "resolved", attempts: job.attempts + 1, last_attempt_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(), last_error: null,
        }).eq("id", job.id),
        db.from("job_calendar_links").update({
          sync_status: "unlinked", calendar_event_id: null, calendar_event_url: null, last_error: null,
        }).eq("job_id", job.event_id).eq("technician_id", job.technician_id),
      ]);
      results.push({ technician_id: job.technician_id, technician_name: job.technician_name, status: "deleted", attempts: deletion.attempts });
    } else {
      const error = `Outlook-sletting feilet (${deletion.attempts.at(-1)?.status ?? "ukjent"})`;
      const delayMinutes = Math.min(360, 5 * 2 ** Math.min(job.attempts, 6));
      await db.from("calendar_delete_retry_queue").update({
        status: "failed", attempts: job.attempts + 1, last_attempt_at: new Date().toISOString(),
        next_attempt_at: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(), last_error: error,
      }).eq("id", job.id);
      results.push({ technician_id: job.technician_id, technician_name: job.technician_name, status: "queued", error, attempts: deletion.attempts });
    }
  }
  return results;
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

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: authData } = await authClient.auth.getUser();
    if (!authData.user) return json({ error: "Unauthorized" }, 401);

    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: canDelete } = await db.rpc("check_permission_v2", {
      _auth_user_id: authData.user.id,
      _perm: "calendar.delete_events",
    });
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "remove_assignment";
    if (!canDelete && action !== "scan_ghosts") return json({ error: "Mangler rettighet: calendar.delete_events" }, 403);

    if (action === "scan_ghosts") {
      const { data, error } = await db.rpc("scan_resource_plan_ghosts");
      return error ? json({ error: error.message }, 500) : json(data);
    }
    if (action === "repair_ghosts") {
      const { data, error } = await db.rpc("repair_resource_plan_ghosts");
      return error ? json({ error: error.message }, 500) : json(data);
    }
    if (action === "retry_outlook") {
      const { data: jobs, error } = await db.from("calendar_delete_retry_queue").select("*")
        .in("status", ["pending", "failed"]).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(50);
      if (error) return json({ error: error.message }, 500);
      const outlook = await processJobs(db, (jobs ?? []) as DeleteJob[]);
      return json({ status: "success", processed: outlook.length, outlook });
    }

    const eventId = typeof body.event_id === "string" ? body.event_id : null;
    const technicianId = typeof body.technician_id === "string" ? body.technician_id : null;
    const scheduleBlockId = typeof body.schedule_block_id === "string" ? body.schedule_block_id : null;
    if (!eventId && !scheduleBlockId) return json({ error: "event_id eller schedule_block_id kreves" }, 400);
    if (action === "remove_assignment" && !technicianId && !scheduleBlockId) return json({ error: "technician_id kreves" }, 400);

    const { data: local, error: localError } = await db.rpc("remove_work_visit_from_plan", {
      p_event_id: eventId,
      p_technician_id: technicianId,
      p_remove_all: action === "remove_event",
      p_schedule_block_id: scheduleBlockId,
      p_actor: authData.user.id,
    });
    if (localError) return json({ error: localError.message }, 500);

    const resolvedEventId = local?.event_id;
    const query = db.from("calendar_delete_retry_queue").select("*").eq("event_id", resolvedEventId);
    const { data: jobs, error: queueError } = technicianId && action !== "remove_event"
      ? await query.eq("technician_id", technicianId)
      : await query;
    if (queueError) return json({ error: queueError.message, local }, 500);
    const outlook = await processJobs(db, (jobs ?? []).filter((job: DeleteJob & { status?: string }) => job.status !== "resolved"));
    const warnings = outlook.filter((result) => result.status !== "deleted");
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