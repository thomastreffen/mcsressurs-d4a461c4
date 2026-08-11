import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Check permission via v2 system
    const { data: hasPerm } = await supabaseAdmin.rpc("check_permission_v2", {
      _auth_user_id: user.id,
      _perm: "admin.data_integrity",
    });
    if (!hasPerm) {
      return new Response(JSON.stringify({ error: "Forbidden: mangler rettighet admin.data_integrity" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "scan";

    if (action === "scan") {
      return await handleScan(supabaseAdmin, corsHeaders);
    } else if (action === "mark_orphans") {
      return await handleMarkOrphans(supabaseAdmin, corsHeaders);
    } else if (action === "repair") {
      return await handleRepair(supabaseAdmin, body, user.id, corsHeaders);
    } else if (action === "repair_resource_plan") {
      const { data, error } = await supabaseAdmin.rpc("repair_resource_plan_ghosts");
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("data-integrity error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function handleScan(db: any, headers: Record<string, string>) {
  const { data: resourcePlanReport } = await db.rpc("scan_resource_plan_ghosts");
  // 1. Orphaned regulation_queries: scope_id points to non-existing entity
  const { data: regQueries } = await db
    .from("regulation_queries")
    .select("id, question, scope_type, scope_id, created_at, is_orphan")
    .not("scope_id", "is", null)
    .neq("scope_type", "global")
    .limit(500);

  const orphanRegs: any[] = [];
  if (regQueries?.length) {
    // Gather scope_ids by type
    const jobIds = regQueries.filter((r: any) => r.scope_type === "job").map((r: any) => r.scope_id);
    const leadIds = regQueries.filter((r: any) => r.scope_type === "lead").map((r: any) => r.scope_id);
    const quoteIds = regQueries.filter((r: any) => r.scope_type === "quote").map((r: any) => r.scope_id);

    const existingJobIds = new Set<string>();
    const existingLeadIds = new Set<string>();
    const existingQuoteIds = new Set<string>();

    if (jobIds.length) {
      const { data } = await db.from("events").select("id").in("id", jobIds);
      data?.forEach((r: any) => existingJobIds.add(r.id));
    }
    if (leadIds.length) {
      const { data } = await db.from("leads").select("id").in("id", leadIds);
      data?.forEach((r: any) => existingLeadIds.add(r.id));
    }
    if (quoteIds.length) {
      const { data } = await db.from("calculations").select("id").in("id", quoteIds);
      data?.forEach((r: any) => existingQuoteIds.add(r.id));
    }

    for (const rq of regQueries) {
      let isOrphan = false;
      let reason = "";
      if (rq.scope_type === "job" && !existingJobIds.has(rq.scope_id)) {
        isOrphan = true; reason = "Jobb finnes ikke";
      } else if (rq.scope_type === "lead" && !existingLeadIds.has(rq.scope_id)) {
        isOrphan = true; reason = "Lead finnes ikke";
      } else if (rq.scope_type === "quote" && !existingQuoteIds.has(rq.scope_id)) {
        isOrphan = true; reason = "Kalkyle finnes ikke";
      }
      // Also check soft-deleted
      if (!isOrphan && rq.scope_type === "job") {
        const { data: ev } = await db.from("events").select("deleted_at").eq("id", rq.scope_id).single();
        if (ev?.deleted_at) { isOrphan = true; reason = "Jobb er slettet"; }
      }
      if (isOrphan) orphanRegs.push({ ...rq, orphan_reason: reason });
    }
  }

  // 2. Orphaned communication_logs
  const { data: commLogs } = await db
    .from("communication_logs")
    .select("id, subject, entity_type, entity_id, created_at, is_orphan")
    .limit(500);

  const orphanComms: any[] = [];
  if (commLogs?.length) {
    const jobCommIds = commLogs.filter((c: any) => c.entity_type === "job").map((c: any) => c.entity_id);
    const leadCommIds = commLogs.filter((c: any) => c.entity_type === "lead").map((c: any) => c.entity_id);

    const existingJobs = new Set<string>();
    const existingLeads = new Set<string>();

    if (jobCommIds.length) {
      const { data } = await db.from("events").select("id").in("id", [...new Set(jobCommIds)]);
      data?.forEach((r: any) => existingJobs.add(r.id));
    }
    if (leadCommIds.length) {
      const { data } = await db.from("leads").select("id").in("id", [...new Set(leadCommIds)]);
      data?.forEach((r: any) => existingLeads.add(r.id));
    }

    for (const cl of commLogs) {
      if (cl.entity_type === "job" && !existingJobs.has(cl.entity_id)) {
        orphanComms.push({ ...cl, orphan_reason: "Jobb finnes ikke" });
      } else if (cl.entity_type === "lead" && !existingLeads.has(cl.entity_id)) {
        orphanComms.push({ ...cl, orphan_reason: "Lead finnes ikke" });
      }
    }
  }

  // 3. Orphaned job_calendar_links
  const { data: calLinks } = await db
    .from("job_calendar_links")
    .select("id, job_id, technician_id, sync_status, created_at, is_orphan")
    .limit(500);

  const orphanCals: any[] = [];
  if (calLinks?.length) {
    const calJobIds = [...new Set(calLinks.map((c: any) => c.job_id))];
    const existingCalJobs = new Set<string>();
    if (calJobIds.length) {
      const { data } = await db.from("events").select("id").in("id", calJobIds);
      data?.forEach((r: any) => existingCalJobs.add(r.id));
    }
    for (const cl of calLinks) {
      if (!existingCalJobs.has(cl.job_id)) {
        orphanCals.push({ ...cl, orphan_reason: "Jobb finnes ikke" });
      }
    }
  }

  const report = {
    orphan_regulation_queries: orphanRegs.slice(0, 50),
    orphan_comm_logs: orphanComms.slice(0, 50),
    orphan_calendar_links: orphanCals.slice(0, 50),
    resource_plan_findings: resourcePlanReport?.findings ?? [],
    totals: {
      regulation_queries: orphanRegs.length,
      communication_logs: orphanComms.length,
      calendar_links: orphanCals.length,
      resource_plan: resourcePlanReport?.total ?? 0,
      total: orphanRegs.length + orphanComms.length + orphanCals.length + (resourcePlanReport?.total ?? 0),
    },
  };

  return new Response(JSON.stringify(report), { headers: { ...headers, "Content-Type": "application/json" } });
}

async function handleMarkOrphans(db: any, headers: Record<string, string>) {
  // Re-scan then mark
  const scanRes = await handleScan(db, headers);
  const report = await scanRes.clone().json();
  const now = new Date().toISOString();
  let marked = 0;

  for (const rq of report.orphan_regulation_queries) {
    await db.from("regulation_queries").update({ is_orphan: true, orphan_reason: rq.orphan_reason, orphan_detected_at: now }).eq("id", rq.id);
    marked++;
  }
  for (const cl of report.orphan_comm_logs) {
    await db.from("communication_logs").update({ is_orphan: true, orphan_reason: cl.orphan_reason, orphan_detected_at: now }).eq("id", cl.id);
    marked++;
  }
  for (const cl of report.orphan_calendar_links) {
    await db.from("job_calendar_links").update({ is_orphan: true, orphan_reason: cl.orphan_reason, orphan_detected_at: now }).eq("id", cl.id);
    marked++;
  }

  return new Response(JSON.stringify({ success: true, marked, totals: report.totals }), { headers: { ...headers, "Content-Type": "application/json" } });
}

async function handleRepair(db: any, body: any, userId: string, headers: Record<string, string>) {
  const { repair_type, record_id, table, new_scope_id } = body;
  if (!repair_type || !record_id || !table) {
    return new Response(JSON.stringify({ error: "Missing repair_type, record_id, or table" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const now = new Date().toISOString();

  // Audit log helper
  const logAudit = async (action: string, description: string) => {
    await db.from("activity_log").insert({
      entity_type: "data_integrity",
      entity_id: record_id,
      action,
      description,
      performed_by: userId,
      type: "admin_action",
      visibility: "internal",
    });
  };

  if (table === "regulation_queries") {
    if (repair_type === "move_to_global") {
      const { error } = await db.from("regulation_queries").update({
        scope_type: "global",
        scope_id: null,
        is_orphan: false,
        orphan_reason: null,
        orphan_detected_at: null,
      }).eq("id", record_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      await logAudit("repair_move_to_global", `Fagforespørsel flyttet til global scope`);
    } else if (repair_type === "relink") {
      if (!new_scope_id) return new Response(JSON.stringify({ error: "new_scope_id required" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
      const { error } = await db.from("regulation_queries").update({
        scope_id: new_scope_id,
        is_orphan: false,
        orphan_reason: null,
        orphan_detected_at: null,
      }).eq("id", record_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      await logAudit("repair_relink", `Fagforespørsel koblet til ny scope: ${new_scope_id}`);
    }
  } else if (table === "job_calendar_links") {
    if (repair_type === "unlink_and_fail") {
      const { error } = await db.from("job_calendar_links").update({
        sync_status: "failed",
        last_error: "itemNotFound – orphan repair",
        is_orphan: false,
        orphan_reason: null,
        orphan_detected_at: null,
      }).eq("id", record_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      await logAudit("repair_unlink_fail", `Kalenderkobling satt til failed`);
    } else if (repair_type === "delete_link") {
      // Soft archive by setting sync_status = archived
      const { error } = await db.from("job_calendar_links").update({
        sync_status: "archived",
        is_orphan: false,
        orphan_reason: null,
        orphan_detected_at: null,
      }).eq("id", record_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      await logAudit("repair_archive_link", `Kalenderkobling arkivert`);
    }
  } else if (table === "communication_logs") {
    if (repair_type === "mark_archived") {
      const { error } = await db.from("communication_logs").update({
        mode: "archived",
        is_orphan: false,
        orphan_reason: null,
        orphan_detected_at: null,
      }).eq("id", record_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      await logAudit("repair_archive_comm", `Kommunikasjonslogg arkivert`);
    } else if (repair_type === "relink") {
      if (!new_scope_id) return new Response(JSON.stringify({ error: "new_scope_id required" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
      const { error } = await db.from("communication_logs").update({
        entity_id: new_scope_id,
        is_orphan: false,
        orphan_reason: null,
        orphan_detected_at: null,
      }).eq("id", record_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      await logAudit("repair_relink_comm", `Kommunikasjonslogg koblet til ${new_scope_id}`);
    }
  }

  return new Response(JSON.stringify({ success: true, repair_type, record_id, table }), { headers: { ...headers, "Content-Type": "application/json" } });
}
