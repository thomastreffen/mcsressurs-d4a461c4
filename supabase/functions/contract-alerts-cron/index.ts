import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isCronBearer, requireGlobalAccessManager } from "../_shared/security-boundary.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // --- Auth check: require admin or service-role bearer ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  const jwt = authHeader.replace("Bearer ", "");
  // Allow service_role key or the pg_cron shared secret (for system calls)
  if (jwt !== serviceKey && !(await isCronBearer(supabaseAdmin, authHeader))) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await supabaseAnon.auth.getClaims(jwt);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;
    if (!(await requireGlobalAccessManager(supabaseAdmin, userId))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const runStart = Date.now();
  let alertsCreated = 0;
  let jobsUpdated = 0;
  let scannedDeadlines = 0;
  let notifiedUsers = 0;

  try {

    // Check for dry_run mode
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch { /* no body is fine */ }

    const today = new Date().toISOString().split("T")[0];

    // 1. Find open deadlines where today matches a notification day
    const { data: deadlines, error: dlErr } = await supabaseAdmin
      .from("contract_deadlines")
      .select("*, contracts(company_id, job_id, title, risk_level, executing_company_ids)")
      .eq("status", "open");

    if (dlErr) throw dlErr;

    scannedDeadlines = deadlines?.length || 0;

    for (const dl of deadlines || []) {
      const dueDate = new Date(dl.due_date);
      const daysUntil = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const notifyDays: number[] = dl.notify_days_before || [30, 14, 7, 2, 0];

      if (!notifyDays.includes(daysUntil)) continue;

      // Check if alert already exists for this deadline + date combo (throttle: 1/contract/day/type)
      const { count } = await supabaseAdmin
        .from("contract_alerts")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", dl.contract_id)
        .eq("alert_type", "deadline_upcoming")
        .eq("due_date", dl.due_date)
        .gte("created_at", today + "T00:00:00Z");

      if (count && count > 0) continue;

      const severity = daysUntil <= 2 ? "critical" : daysUntil <= 7 ? "warn" : "info";
      const contract = dl.contracts as any;

      if (!dryRun) {
        await supabaseAdmin.from("contract_alerts").insert({
          company_id: dl.company_id,
          contract_id: dl.contract_id,
          job_id: contract?.job_id || dl.job_id,
          alert_type: "deadline_upcoming",
          severity,
          title: daysUntil === 0
            ? `FRIST I DAG: ${dl.title}`
            : `Frist om ${daysUntil} dager: ${dl.title}`,
          message: `Kontrakt "${contract?.title || "Ukjent"}": ${dl.title} forfaller ${dl.due_date}.`,
          due_date: dl.due_date,
          target_user_id: dl.owner_user_id,
        });
      }
      alertsCreated++;

      // Mark overdue deadlines
      if (daysUntil < 0 && !dryRun) {
        await supabaseAdmin
          .from("contract_deadlines")
          .update({ status: "overdue" })
          .eq("id", dl.id);
      }

      // --- Intercompany notifications ---
      if (!dryRun && (severity === "warn" || severity === "critical")) {
        const notifyTitle = daysUntil === 0
          ? `FRIST I DAG: ${dl.title}`
          : `Kontraktfrist om ${daysUntil} dager: ${dl.title}`;
        const notifyMsg = `Kontrakt "${contract?.title || "Ukjent"}": ${dl.title} forfaller ${dl.due_date}.`;

        const targetUserIds = new Set<string>();

        // a) Job owner/planlegger if job_id exists
        if (contract?.job_id) {
          const { data: jobData } = await supabaseAdmin
            .from("events")
            .select("created_by")
            .eq("id", contract.job_id)
            .single();
          if (jobData?.created_by) targetUserIds.add(jobData.created_by);

          // Job participants
          const { data: participants } = await supabaseAdmin
            .from("job_participants")
            .select("user_id")
            .eq("job_id", contract.job_id);
          for (const p of participants || []) targetUserIds.add(p.user_id);
        }

        // b) Users in executing_company_ids with admin membership
        const execIds: string[] = contract?.executing_company_ids || [];
        if (execIds.length > 0) {
          const { data: members } = await supabaseAdmin
            .from("user_memberships")
            .select("user_id")
            .in("company_id", execIds)
            .eq("is_active", true);
          for (const m of members || []) targetUserIds.add(m.user_id);
        }

        // Deadline owner
        if (dl.owner_user_id) targetUserIds.add(dl.owner_user_id);

        // Throttle check: max 1 notification per contract per day per user
        for (const uid of targetUserIds) {
          const { count: existingNotif } = await supabaseAdmin
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid)
            .eq("event_id", contract?.job_id || dl.contract_id)
            .eq("type", "contract_deadline")
            .gte("created_at", today + "T00:00:00Z");

          if (existingNotif && existingNotif > 0) continue;

          await supabaseAdmin.from("notifications").insert({
            user_id: uid,
            title: notifyTitle,
            message: notifyMsg,
            type: "contract_deadline",
            event_id: contract?.job_id || null,
          });
          notifiedUsers++;
        }
      }
    }

    // 2. Update job snapshot fields for all contracts with jobs
    const { data: contracts } = await supabaseAdmin
      .from("contracts")
      .select("id, job_id, risk_level")
      .not("job_id", "is", null);

    for (const c of contracts || []) {
      // Improved: earliest open deadline, prioritize critical severity
      const { data: openDeadlines } = await supabaseAdmin
        .from("contract_deadlines")
        .select("due_date, severity")
        .eq("contract_id", c.id)
        .eq("status", "open")
        .order("due_date", { ascending: true })
        .limit(10);

      let nextDeadline: string | null = null;
      if (openDeadlines && openDeadlines.length > 0) {
        // If multiple with same earliest date, prefer critical
        const earliest = openDeadlines[0].due_date;
        const sameDateItems = openDeadlines.filter(d => d.due_date === earliest);
        const critical = sameDateItems.find(d => d.severity === "critical");
        nextDeadline = critical ? critical.due_date : earliest;
      }

      // Alert count: unread warn/critical in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { count: alertCount } = await supabaseAdmin
        .from("contract_alerts")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", c.id)
        .eq("is_read", false)
        .in("severity", ["warn", "critical"])
        .gte("created_at", thirtyDaysAgo.toISOString());

      if (!dryRun) {
        await supabaseAdmin.from("events").update({
          contract_risk_level: c.risk_level || "green",
          next_contract_deadline: nextDeadline,
          contract_alert_count: alertCount || 0,
        }).eq("id", c.job_id);
      }
      jobsUpdated++;
    }

    // 3. Log the cron run
    await supabaseAdmin.from("contract_cron_runs").insert({
      status: "ok",
      created_alerts_count: alertsCreated,
      scanned_deadlines_count: scannedDeadlines,
      notified_users_count: notifiedUsers,
      dry_run: dryRun,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: dryRun,
        alerts_created: alertsCreated,
        jobs_updated: jobsUpdated,
        scanned_deadlines: scannedDeadlines,
        notified_users: notifiedUsers,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("contract-alerts-cron error:", err);

    // Try to log the failed run
    try {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabaseAdmin.from("contract_cron_runs").insert({
        status: "fail",
        created_alerts_count: alertsCreated,
        scanned_deadlines_count: scannedDeadlines,
        notified_users_count: notifiedUsers,
        error_code: err.code || "unknown",
        error_message: err.message?.substring(0, 500),
      });
    } catch { /* best effort */ }

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
