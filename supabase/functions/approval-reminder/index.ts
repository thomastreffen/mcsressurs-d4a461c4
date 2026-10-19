import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { formatJobSchedule } from "../_shared/job-time.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://mcsressurs.lovable.app";

// Profile presets (minutes)
const PROFILES: Record<string, number[]> = {
  standard: [120, 1440, 2880],
  urgent: [30, 120, 360],
  none: [],
};

// Buffer: don't send reminders if event starts within 30 min
const START_BUFFER_MINUTES = 30;

async function getValidMsToken(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!data?.user) return null;
  const meta = data.user.user_metadata || {};
  if (!meta.ms_access_token) return null;
  const isExpired = meta.ms_expires_at ? new Date(meta.ms_expires_at) <= new Date() : false;
  if (!isExpired) return meta.ms_access_token;
  if (!meta.ms_refresh_token) return null;

  const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;
  const tenantId = Deno.env.get("AZURE_TENANT_ID")!;

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: meta.ms_refresh_token,
        grant_type: "refresh_token",
        scope: "openid profile email User.Read Mail.Send offline_access",
      }),
    }
  );
  if (!tokenRes.ok) return null;
  const newTokens = await tokenRes.json();
  const newExpiresAt = new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString();
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: newTokens.access_token,
      ms_refresh_token: newTokens.refresh_token || meta.ms_refresh_token,
      ms_expires_at: newExpiresAt,
    },
  });
  return newTokens.access_token;
}

function buildReminderEmail(
  job: any,
  techName: string,
  token: string,
  displayNumber: string,
  reminderNumber: number,
  techStartAt?: string | null,
  techEndAt?: string | null,
): { subject: string; body: string } {
  const { startDate, startTime, endTime } = formatJobSchedule(job.start_time, job.end_time, techStartAt, techEndAt);

  const approveUrl = `${APP_URL}/approval/${token}?action=approve`;
  const rescheduleUrl = `${APP_URL}/approval/${token}?action=reschedule`;
  const rejectUrl = `${APP_URL}/approval/${token}?action=reject`;
  const jobUrl = `${APP_URL}/jobs/${job.id}`;

  const subject = `Påminnelse: Du har ikke bekreftet oppdrag – ${displayNumber}`;

  const body = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e;">
  <div style="background: #d97706; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 18px;">⏰ Påminnelse – Jobbforespørsel (${reminderNumber}. påminnelse)</h1>
  </div>
  <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
    <p>Hei ${techName},</p>
    <p><strong>Ser ut til at du ikke har bekreftet denne avtalen.</strong></p>
    <p>Du ble tildelt et oppdrag som venter på ditt svar. Vennligst bekreft om du kan ta oppdraget.</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px 0; color: #64748b; width: 120px;">Jobbnummer</td><td style="padding: 8px 0; font-weight: 600;">${displayNumber}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Tittel</td><td style="padding: 8px 0;">${job.title}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Kunde</td><td style="padding: 8px 0;">${job.customer || "—"}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Dato</td><td style="padding: 8px 0;">${startDate}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Tid</td><td style="padding: 8px 0;">${startTime} – ${endTime}</td></tr>
    </table>
    
    <div style="margin: 24px 0; text-align: center;">
      <a href="${approveUrl}" style="display: inline-block; background: #22c55e; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 4px;">✓ Godkjenn</a>
      <a href="${rescheduleUrl}" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 4px;">⏰ Foreslå nytt tidspunkt</a>
      <a href="${rejectUrl}" style="display: inline-block; background: #ef4444; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 4px;">✕ Avslå</a>
    </div>
    
    <p style="margin-top: 16px;"><a href="${jobUrl}" style="color: #2563eb; text-decoration: none; font-size: 13px;">🔗 Åpne oppdrag</a></p>
    
    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">Denne lenken er gyldig i 48 timer. Du trenger ikke å logge inn for å svare.</p>
  </div>
</body>
</html>`;

  return { subject, body };
}

// Blocked event statuses — reminders should never be sent for these
const BLOCKED_EVENT_STATUSES = new Set([
  "completed", "finished", "ferdig",
  "invoiced", "fakturert",
  "cancelled", "canceled", "avlyst",
  "ready_for_invoicing",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now = new Date();
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(msg);
  };

  // Parse request body for manual trigger
  let manualJobId: string | null = null;
  let isManual = false;
  try {
    const body = await req.json();
    if (body?.jobId) {
      manualJobId = body.jobId;
      isManual = body.manual === true;
    }
  } catch { /* no body = cron trigger */ }

  log(`=== APPROVAL REMINDER RUN START ${isManual ? "(MANUAL)" : "(CRON)"} ===`);

  try {
    // ── KILL SWITCH: Check ALL company settings for global enabled flag ──
    const { data: allSettings } = await supabase
      .from("company_reminder_settings")
      .select("company_id, enabled");

    const enabledCompanies = new Set<string>();
    const disabledCompanies = new Set<string>();
    for (const s of allSettings || []) {
      if (s.enabled) enabledCompanies.add(s.company_id);
      else disabledCompanies.add(s.company_id);
    }

    log(`Kill-switch check: ${enabledCompanies.size} companies enabled, ${disabledCompanies.size} disabled`);

    // 1. Fetch pending approvals that need reminders
    let query = supabase
      .from("job_approvals")
      .select("id, job_id, technician_user_id, token, status, response_required, reminder_profile, reminder_config, reminder_count, last_reminded_at, created_at, expires_at, reminders_paused")
      .eq("status", "pending")
      .eq("response_required", true)
      .eq("reminders_paused", false)
      .neq("reminder_profile", "none");

    if (manualJobId) {
      query = query.eq("job_id", manualJobId);
    }

    const { data: pendingApprovals, error: apErr } = await query;

    if (apErr) throw apErr;
    log(`Found ${pendingApprovals?.length ?? 0} pending approvals`);

    if (!pendingApprovals || pendingApprovals.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, logs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch job details for validation
    const jobIds = [...new Set(pendingApprovals.map((a: any) => a.job_id))];
    const { data: jobs } = await supabase
      .from("events")
      .select("id, title, customer, address, start_time, end_time, company_id, job_number, internal_number, created_by, status, deleted_at, billing_status")
      .in("id", jobIds);

    const jobMap = new Map<string, any>();
    const companyIds = new Set<string>();
    for (const j of jobs || []) {
      jobMap.set(j.id, j);
      if (j.company_id) companyIds.add(j.company_id);
    }

    // Fetch company settings for intervals/max
    const { data: companySettings } = await supabase
      .from("company_reminder_settings")
      .select("*")
      .in("company_id", [...companyIds]);

    const settingsMap = new Map<string, any>();
    for (const s of companySettings || []) {
      settingsMap.set(s.company_id, s);
    }

    // Get technician info
    const userIds = [...new Set(pendingApprovals.map((a: any) => a.technician_user_id))];
    const { data: techs } = await supabase
      .from("technicians")
      .select("id, name, email, user_id")
      .in("user_id", userIds);

    const techMap = new Map<string, any>();
    for (const t of techs || []) {
      if (t.user_id) techMap.set(t.user_id, t);
    }

    // Fetch event_technicians time overrides for all relevant jobs
    const { data: allAssignments } = await supabase
      .from("event_technicians")
      .select("event_id, technician_id, start_at, end_at")
      .in("event_id", jobIds);

    const assignmentTimeMap = new Map<string, Map<string, { start_at: string | null; end_at: string | null }>>();
    for (const a of allAssignments || []) {
      if (!assignmentTimeMap.has(a.event_id)) assignmentTimeMap.set(a.event_id, new Map());
      assignmentTimeMap.get(a.event_id)!.set(a.technician_id, { start_at: a.start_at, end_at: a.end_at });
    }

    let sent = 0;
    let skipped = 0;

    for (const approval of pendingApprovals as any[]) {
      const aid = approval.id.slice(0, 8);
      const job = jobMap.get(approval.job_id);

      // ── GUARD: Job must exist ──
      if (!job) {
        log(`[ApprovalReminder][Skip] approval=${aid} reason=job_not_found`);
        skipped++;
        continue;
      }

      // ── GUARD: Job must not be deleted ──
      if (job.deleted_at) {
        log(`[ApprovalReminder][Skip] approval=${aid} reason=job_deleted`);
        skipped++;
        continue;
      }

      // ── GUARD: Company reminders must be enabled (kill-switch) ──
      if (job.company_id && disabledCompanies.has(job.company_id)) {
        log(`[ApprovalReminder][Skip] approval=${aid} reason=company_reminders_disabled`);
        skipped++;
        continue;
      }

      // ── GUARD: Event status must not be completed/invoiced/cancelled ──
      const eventStatus = (job.status || "").toLowerCase();
      const billingStatus = (job.billing_status || "").toLowerCase();
      if (BLOCKED_EVENT_STATUSES.has(eventStatus) || BLOCKED_EVENT_STATUSES.has(billingStatus)) {
        log(`[ApprovalReminder][Skip] approval=${aid} reason=blocked_status event_status=${eventStatus} billing_status=${billingStatus}`);
        skipped++;
        continue;
      }

      // ── GUARD: Event start_time must be in the future (with buffer) ──
      // Use technician-specific time override if available
      const techForGuard = techMap.get(approval.technician_user_id);
      const techTimesForGuard = techForGuard ? assignmentTimeMap.get(approval.job_id)?.get(techForGuard.id) : null;
      const effectiveStartTime = techTimesForGuard?.start_at || job.start_time;
      const eventStart = new Date(effectiveStartTime);
      const bufferMs = START_BUFFER_MINUTES * 60 * 1000;
      if (now.getTime() >= eventStart.getTime() - bufferMs) {
        log(`[ApprovalReminder][Skip] approval=${aid} reason=past_event start_time=${effectiveStartTime}`);
        skipped++;
        continue;
      }

      // ── GUARD: Approval token must not be expired ──
      if (approval.expires_at && new Date(approval.expires_at) <= now) {
        log(`[ApprovalReminder][Skip] approval=${aid} reason=token_expired expires_at=${approval.expires_at}`);
        skipped++;
        continue;
      }

      const tech = techMap.get(approval.technician_user_id);
      if (!tech?.email) {
        log(`[ApprovalReminder][Skip] approval=${aid} reason=no_tech_email`);
        skipped++;
        continue;
      }

      const companySetting = settingsMap.get(job.company_id);

      // Determine intervals
      let intervals: number[];
      let maxReminders: number;

      if (approval.reminder_profile === "custom" && approval.reminder_config) {
        const cfg = approval.reminder_config;
        intervals = [cfg.reminder1Minutes || 120, cfg.reminder2Minutes || 1440, cfg.reminder3Minutes || 2880];
        maxReminders = intervals.length;
      } else {
        intervals = PROFILES[approval.reminder_profile] || PROFILES.standard;
        maxReminders = companySetting?.max_reminders ?? 3;
      }

      if (intervals.length === 0) {
        log(`[ApprovalReminder][Skip] approval=${aid} reason=no_intervals profile=${approval.reminder_profile}`);
        skipped++;
        continue;
      }

      const currentCount = approval.reminder_count || 0;

      // ── GUARD: Max reminders reached (skip for manual) ──
      if (!isManual && (currentCount >= maxReminders || currentCount >= intervals.length)) {
        log(`[ApprovalReminder][Skip] approval=${aid} reason=max_reminders_reached count=${currentCount} max=${maxReminders}`);
        skipped++;
        continue;
      }

      // Check if enough time has passed (skip for manual triggers)
      if (!isManual) {
        const createdAt = new Date(approval.created_at).getTime();
        const elapsed = (now.getTime() - createdAt) / 60000;

        let totalRequired = 0;
        for (let i = 0; i <= currentCount; i++) {
          totalRequired += intervals[i];
        }

        if (elapsed < totalRequired) {
          log(`[ApprovalReminder][Skip] approval=${aid} reason=too_early elapsed=${Math.round(elapsed)}min required=${totalRequired}min`);
          skipped++;
          continue;
        }

        // Don't resend if last reminder was very recent (< 5 min)
        if (approval.last_reminded_at) {
          const sinceLastReminder = (now.getTime() - new Date(approval.last_reminded_at).getTime()) / 60000;
          if (sinceLastReminder < 5) {
            log(`[ApprovalReminder][Skip] approval=${aid} reason=recently_reminded since_last=${Math.round(sinceLastReminder)}min`);
            skipped++;
            continue;
          }
        }
      }

      // ── ALL GUARDS PASSED — Send reminder ──
      const displayNumber = job.job_number || job.internal_number || "—";
      const techTimes = tech ? assignmentTimeMap.get(approval.job_id)?.get(tech.id) : null;
      const { subject, body } = buildReminderEmail(job, tech.name, approval.token, displayNumber, currentCount + 1, techTimes?.start_at, techTimes?.end_at);

      // Find an admin user with MS token to send from
      let msToken: string | null = null;
      if (job.created_by) {
        msToken = await getValidMsToken(supabase, job.created_by);
      }

      if (!msToken) {
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "super_admin"])
          .limit(5);
        for (const admin of admins || []) {
          msToken = await getValidMsToken(supabase, admin.user_id);
          if (msToken) break;
        }
      }

      if (!msToken) {
        log(`[ApprovalReminder][Skip] approval=${aid} reason=no_ms_token`);
        skipped++;
        continue;
      }

      try {
        const emailRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${msToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: "HTML", content: body },
              toRecipients: [{ emailAddress: { address: tech.email } }],
            },
          }),
        });

        if (!emailRes.ok) {
          const errText = await emailRes.text();
          log(`[ApprovalReminder][Error] approval=${aid} reason=email_send_failed error=${errText.slice(0, 200)}`);
          continue;
        }

        // Update reminder count
        const newCount = currentCount + 1;
        await supabase
          .from("job_approvals")
          .update({
            reminder_count: newCount,
            last_reminded_at: now.toISOString(),
          })
          .eq("id", approval.id);

        sent++;
        log(`[ApprovalReminder][Send] approval=${aid} tech=${tech.email} job=${approval.job_id.slice(0, 8)} reminder=#${newCount} reason=${isManual ? "manual_trigger" : "reminder_due"}`);

        // Log to event_logs
        await supabase.from("event_logs").insert({
          event_id: approval.job_id,
          performed_by: null,
          action_type: "reminder_sent",
          change_summary: `Påminnelse #${newCount} sendt til ${tech.name}`,
        });

        // Check if we should escalate to manager
        if (newCount >= maxReminders) {
          const shouldNotifyManager = approval.reminder_profile === "custom"
            ? approval.reminder_config?.notifyManager
            : companySetting?.notify_manager;

          if (shouldNotifyManager && job.created_by) {
            await supabase.from("notifications").insert({
              user_id: job.created_by,
              company_id: job.company_id,
              type: "approval_reminder_escalation",
              priority: "important",
              title: `⚠️ ${tech.name} har ikke svart på oppdrag – ${displayNumber}`,
              message: `Alle påminnelser er sendt uten svar for ${job.title}`,
              link_url: `/projects/${approval.job_id}`,
              entity_type: "job",
              entity_id: approval.job_id,
              actor_name: tech.name,
            });
            log(`[ApprovalReminder][Escalate] approval=${aid} reason=max_reminders_reached_notify_manager`);
          }
        }
      } catch (emailErr: any) {
        log(`[ApprovalReminder][Error] approval=${aid} reason=exception error=${emailErr.message}`);
      }
    }

    log(`=== APPROVAL REMINDER DONE: ${sent} sent, ${skipped} skipped ===`);

    return new Response(
      JSON.stringify({ ok: true, sent, skipped, logs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    log(`[ApprovalReminder][Fatal] error=${err.message}`);
    console.error(err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message, logs }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
