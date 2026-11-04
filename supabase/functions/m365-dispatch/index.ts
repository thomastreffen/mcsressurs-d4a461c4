import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getApprovalCallerId } from "../_shared/approval-auth.ts";
import { organizerEnabled, pilotAllows, systemSenderEnabled } from "../_shared/m365-sender.ts";

// Bounded pilot dispatcher only. No cron, no fan-out, no replay after ambiguous sends.
Deno.serve(async req => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return json({});
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const callerClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: auth } } });
    const caller = await getApprovalCallerId(auth, callerClient);
    if (!caller) return json({ error: "Unauthorized" }, 401);
    const body = await req.json();
    if (typeof body.event_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.event_id)) return json({ error: "Invalid event_id" }, 400);
    const { data: event } = await db.from("events").select("company_id").eq("id", body.event_id).single();
    const { data: allowed } = await db.rpc("has_company_access", { _uid: caller, _company: event?.company_id, _module: "resource_plan", _level: "edit" });
    if (!allowed) return json({ error: "Ingen tilgang" }, 403);
    if (!systemSenderEnabled() || !organizerEnabled()) return json({ blocked: true, reason: "pilot_not_enabled" });
    const { data: jobs, error } = await db.from("m365_communication_queue").select("*").eq("event_id", body.event_id).in("status", ["pending", "failed"]).limit(7);
    if (error) throw error;
    if (!jobs?.length) return json({ processed: 0, reason: "No safe pending operation; uncertain attempts require reconciliation" });
    // Only create is automated here; changed/deleted recipients require lifecycle-specific reconciliation.
    if (jobs.some(j => j.operation !== "create")) return json({ blocked: true, reason: "lifecycle_reconciliation_required" });
    const { data: techs } = await db.from("technicians").select("email").in("id", jobs.map(j => j.technician_id));
    if (!techs || techs.length !== jobs.length || !pilotAllows(techs.map(t => t.email ?? ""))) return json({ blocked: true, reason: "recipient_outside_pilot" });
    const claimed = [];
    for (const job of jobs) {
      if (job.attempt_count >= 3) continue;
      const { data } = await db.from("m365_communication_queue").update({ status: "processing", claimed_revision: job.revision, attempt_count: job.attempt_count + 1 }).eq("id", job.id).eq("revision", job.revision).eq("status", job.status).select("id").maybeSingle();
      if (data) claimed.push(job);
    }
    if (!claimed.length) return json({ processed: 0 });
    const invoke = (name: string, payload: Record<string, unknown>) => callerClient.functions.invoke(name, { body: payload, headers: { Authorization: auth } });
    const calendar = await invoke("calendar-write-sync", { event_id: body.event_id, action: "create" });
    // Approval endpoint's recipient filter is server-intersected with current assignments.
    const mail = await invoke("create-approval", { job_id: body.event_id, technician_ids: claimed.map(j => j.technician_id), queue_dispatch: true });
    const uncertain = !!calendar.error || !!mail.error;
    for (const job of claimed) {
      const result = mail.data?.results?.find((r: any) => r.techId === job.technician_id);
      const state = uncertain ? "uncertain" : result?.emailSent || result?.autoApproved ? "accepted" : "failed";
      await db.from("m365_communication_queue").update({ status: state, reason_code: uncertain ? "unknown_outcome_do_not_replay" : result?.reasonCode ?? null }).eq("id", job.id).eq("revision", job.revision);
    }
    return json({ processed: claimed.length, uncertain, results: mail.data?.results ?? [] });
  } catch { return json({ error: "Dispatch failed; inspect pending/uncertain delivery status before retry" }, 500); }
});