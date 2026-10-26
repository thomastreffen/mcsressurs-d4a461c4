import { resolveJobAddress } from "../_shared/job-address.ts";
import { buildOperationalJobBrief, briefEmailRows } from "../_shared/job-brief.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { formatJobSchedule } from "../_shared/job-time.ts";
import { getApprovalCallerId } from "../_shared/approval-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://mcsressurs.lovable.app";

async function getValidMsToken(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!data?.user) return null;

  const meta = data.user.user_metadata || {};
  if (!meta.ms_access_token) return null;

  const isExpired = meta.ms_expires_at ? new Date(meta.ms_expires_at) <= new Date() : false;

  if (!isExpired) return meta.ms_access_token;

  // Refresh token
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

  if (!tokenRes.ok) {
    console.error("[create-approval] Token refresh failed:", await tokenRes.text());
    return null;
  }

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

interface InfoChange {
  label: string;
  oldValue?: string | null;
  newValue?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildInfoChangesHtml(changes: InfoChange[]): string {
  if (!changes || changes.length === 0) return "";
  const rows = changes.map((c) => {
    const oldVal = c.oldValue && String(c.oldValue).trim()
      ? escapeHtml(String(c.oldValue))
      : '<em style="color:#94a3b8">tomt</em>';
    const newVal = c.newValue && String(c.newValue).trim()
      ? escapeHtml(String(c.newValue))
      : '<em style="color:#94a3b8">tomt</em>';
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1e293b;width:140px;vertical-align:top;">${escapeHtml(c.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Før</div>
          <div style="margin-bottom:6px;">${oldVal}</div>
          <div style="font-size:11px;color:#0f766e;text-transform:uppercase;letter-spacing:0.04em;">Nå</div>
          <div>${newVal}</div>
        </td>
      </tr>`;
  }).join("");
  return `
    <div style="margin:18px 0 8px;padding:14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;">
      <p style="margin:0 0 8px;font-weight:700;color:#0c4a6e;font-size:13px;">📋 Øvrige praktiske endringer (kun til informasjon – krever ikke ny godkjenning)</p>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        ${rows}
      </table>
    </div>`;
}

function buildApprovalEmail(
  job: any,
  techName: string,
  token: string,
  displayNumber: string,
  isTimeChange: boolean = false,
  techStartAt?: string | null,
  techEndAt?: string | null,
  infoChanges: InfoChange[] = [],
): { subject: string; body: string } {
  // Use technician-specific time override if available, otherwise fall back to event times
  const { startDate, startTime, endTime } = formatJobSchedule(job.start_time, job.end_time, techStartAt, techEndAt);

  const approveUrl = `${APP_URL}/approval/${token}?action=approve`;
  const rescheduleUrl = `${APP_URL}/approval/${token}?action=reschedule`;
  const rejectUrl = `${APP_URL}/approval/${token}?action=reject`;
  const jobUrl = `${APP_URL}/jobs/${job.id}`;

  const subject = isTimeChange
    ? `Tidsendring: ${displayNumber} – ${job.title}`
    : `Jobbforespørsel: ${displayNumber} – ${job.title}`;

  // Build attachments section
  const attachments = Array.isArray(job.attachments) ? job.attachments : [];
  let attachmentsHtml = "";
  if (attachments.length > 0) {
    attachmentsHtml = `
    <div style="margin: 16px 0; padding: 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
      <p style="margin: 0 0 8px; font-weight: 600; color: #64748b; font-size: 13px;">📎 Vedlegg</p>
      <ul style="margin: 0; padding-left: 20px;">
        ${attachments.map((a: any) => `<li style="margin-bottom: 4px;"><a href="${escapeHtml(String(a.url || "#"))}" style="color: #2563eb; text-decoration: none;">${escapeHtml(String(a.name || "Vedlegg"))}</a></li>`).join("")}
      </ul>
    </div>`;
  }

  const body = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e;">
  <div style="background: #2563b0; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 18px;">MCS Service – Jobbforespørsel</h1>
  </div>
  <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
    <p>Hei ${techName},</p>
    <p>${isTimeChange
      ? (infoChanges.length > 0
          ? "Tidspunktet for et oppdrag du er tildelt har blitt endret, og det er gjort flere praktiske oppdateringer på oppdraget. Vennligst bekreft det nye tidspunktet. Øvrige endringer er kun til informasjon."
          : "Tidspunktet for et oppdrag du er tildelt har blitt endret. Vennligst bekreft om du kan ta oppdraget på nytt tid.")
      : (infoChanges.length > 0
          ? "Du har blitt tildelt en jobb, og det er gjort flere praktiske oppdateringer. Vennligst bekreft om du kan ta oppdraget. Øvrige endringer er kun til informasjon."
          : "Du har blitt tildelt en ny jobb. Vennligst bekreft om du kan ta oppdraget.")}</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      ${briefEmailRows(job.__brief ?? buildOperationalJobBrief({ event: { ...job, job_number: displayNumber } }), { date: startDate, time: `${startTime} – ${endTime}` })}
    </table>
    
    ${attachmentsHtml}
    ${buildInfoChangesHtml(infoChanges)}
    
    <div style="margin: 24px 0; text-align: center;">
      <a href="${approveUrl}" style="display: inline-block; background: #22c55e; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 4px;">✓ Godkjenn</a>
      <a href="${rescheduleUrl}" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 4px;">⏰ Foreslå nytt tidspunkt</a>
      <a href="${rejectUrl}" style="display: inline-block; background: #ef4444; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 4px;">✕ Avslå</a>
    </div>
    
    <p style="margin-top: 16px;"><a href="${jobUrl}" style="color: #2563eb; text-decoration: none; font-size: 13px;">🔗 Se jobben i MCS Ressurs</a></p>
    
    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">Denne lenken er gyldig i 48 timer. Du trenger ikke å logge inn for å svare.</p>
  </div>
</body>
</html>`;

  return { subject, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Validate caller
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } }
    );

    const callerUserId = await getApprovalCallerId(authHeader, supabaseAnon);
    if (!callerUserId) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .single();

    if (!roleData || (roleData.role !== "admin" && roleData.role !== "super_admin")) {
      return new Response(JSON.stringify({ error: "Forbidden - admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { job_id, reminder_profile, reminder_config, response_required, time_change, info_changes, resend } = await req.json();
    const isResend = resend === true;
    if (!job_id) {
      return new Response(JSON.stringify({ error: "Missing job_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rProfile = reminder_profile || "standard";
    const rConfig = reminder_config || null;
    const rRequired = response_required !== false;
    const isTimeChange = time_change === true;
    const infoChanges: InfoChange[] = Array.isArray(info_changes)
      ? info_changes.filter((c: any) => c && typeof c.label === "string").map((c: any) => ({
          label: String(c.label),
          oldValue: c.oldValue ?? null,
          newValue: c.newValue ?? null,
        }))
      : [];

    // Fetch job
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Operative address: newest event address, else the order's oppdragssted
    job.address = (await resolveJobAddress(supabaseAdmin, job)) || null;
    // Operational brief: edited event fields win, linked order fills the gaps (same helper as the app view).
    {
      let orderId: string | null = job.source_order_form_id ?? null;
      if (!orderId) {
        const { data: linked } = await supabaseAdmin.from("order_form_submissions").select("id")
          .eq("linked_event_id", job.id).is("deleted_at", null).order("last_activity_at", { ascending: false }).limit(1).maybeSingle();
        orderId = linked?.id ?? null;
      }
      let orderSummary = null, orderValues = null;
      if (orderId) {
        const [{ data: sub }, { data: vals }] = await Promise.all([
          supabaseAdmin.from("order_form_submissions").select("summary").eq("id", orderId).maybeSingle(),
          supabaseAdmin.from("order_form_submission_values").select("field_key, value").eq("submission_id", orderId),
        ]);
        orderSummary = sub?.summary ?? null; orderValues = vals ?? null;
      }
      job.__brief = buildOperationalJobBrief({ event: { ...job, job_number: job.job_number || job.internal_number }, orderSummary, orderValues });
    }

    // Fetch technicians assigned to this job (include time overrides)
    const { data: assignments } = await supabaseAdmin
      .from("event_technicians")
      .select("technician_id, start_at, end_at")
      .eq("event_id", job_id);

    if (!assignments || assignments.length === 0) {
      return new Response(JSON.stringify({ error: "No technicians assigned to this job" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get technician details
    // Build a map of technician_id -> time overrides
    const techTimeMap = new Map<string, { start_at: string | null; end_at: string | null }>();
    for (const a of assignments) {
      techTimeMap.set(a.technician_id, { start_at: a.start_at, end_at: a.end_at });
    }

    const techIds = assignments.map((a: any) => a.technician_id);
    const { data: technicians } = await supabaseAdmin
      .from("technicians")
      .select("id, name, email, user_id")
      .in("id", techIds);

    if (!technicians || technicians.length === 0) {
      return new Response(JSON.stringify({ error: "Technician records not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const displayNumber = job.job_number || job.internal_number || "—";

    // Get MS token from caller for sending emails
    const msToken = await getValidMsToken(supabaseAdmin, callerUserId);
    if (!msToken) {
      console.error("[create-approval] No valid MS token for caller:", callerUserId);
    }

    const results: any[] = [];

    for (const tech of technicians) {
      const isSelf = tech.user_id === callerUserId;

      if (isResend) {
        // Re-send job info + attachments; reuse existing approval (keep its status), create one if missing.
        let token: string | null = null;
        const { data: existing } = await supabaseAdmin
          .from("job_approvals").select("token").eq("job_id", job_id).eq("technician_user_id", tech.user_id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (existing?.token) token = existing.token;
        else {
          const { data: ins, error: insErr } = await supabaseAdmin.from("job_approvals")
            .insert({ job_id, technician_user_id: tech.user_id, response_required: rRequired, reminder_profile: rProfile, reminder_config: rConfig })
            .select("token").single();
          if (insErr) { results.push({ techId: tech.id, techName: tech.name, emailSent: false, error: insErr.message }); continue; }
          token = ins.token;
        }
        if (!msToken || !tech.email) {
          results.push({ techId: tech.id, techName: tech.name, emailSent: false, reason: !msToken ? "no_ms_token" : "no_email" });
          continue;
        }
        const techTimes = techTimeMap.get(tech.id);
        const { subject, body } = buildApprovalEmail(job, tech.name, token!, displayNumber, false, techTimes?.start_at, techTimes?.end_at, []);
        const emailRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
          method: "POST",
          headers: { Authorization: `Bearer ${msToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { subject: `Jobbinfo (sendt på nytt): ${displayNumber} – ${job.title}`, body: { contentType: "HTML", content: body }, toRecipients: [{ emailAddress: { address: tech.email } }] } }),
        });
        const ok = emailRes.ok;
        if (!ok) console.error("[create-approval] Resend failed:", tech.email, await emailRes.text());
        results.push({ techId: tech.id, techName: tech.name, emailSent: ok });
        await supabaseAdmin.from("event_logs").insert({
          event_id: job_id, performed_by: callerUserId, action_type: "info_resent",
          change_summary: ok ? `Jobbinfo med vedlegg sendt på nytt til ${tech.name} (${tech.email})` : `Kunne ikke sende jobbinfo på nytt til ${tech.name}`,
        });
        void subject;
        continue;
      }

      if (isSelf && !isTimeChange) {
        // Auto-approve when assigning to yourself – no email needed
        const { data: approval, error: approvalErr } = await supabaseAdmin
          .from("job_approvals")
          .insert({
            job_id: job_id,
            technician_user_id: tech.user_id,
            status: "approved",
            responded_at: new Date().toISOString(),
            response_required: rRequired,
            reminder_profile: rProfile,
            reminder_config: rConfig,
          })
          .select("token")
          .single();

        if (approvalErr) {
          console.error("[create-approval] Self-approve insert error:", tech.id, approvalErr);
          results.push({ techId: tech.id, error: approvalErr.message });
          continue;
        }

        results.push({ techId: tech.id, token: approval?.token, emailSent: false, autoApproved: true });

        await supabaseAdmin.from("event_logs").insert({
          event_id: job_id,
          performed_by: callerUserId,
          action_type: "created",
          change_summary: `${tech.name} automatisk godkjent (tildelt seg selv)`,
        });

        continue;
      }

      let approvalToken: string;

      if (isTimeChange) {
        // Time change: update existing approval record with a new token
        const newToken = crypto.randomUUID();
        const { error: updateErr } = await supabaseAdmin
          .from("job_approvals")
          .update({
            status: "pending",
            responded_at: null,
            comment: null,
            proposed_start: null,
            proposed_end: null,
            reminder_count: 0,
            last_reminded_at: null,
            response_required: rRequired,
            reminder_profile: rProfile,
            reminder_config: rConfig,
            token: newToken,
            token_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          })
          .eq("job_id", job_id)
          .eq("technician_user_id", tech.user_id);

        if (updateErr) {
          console.error("[create-approval] Time change update error:", tech.id, updateErr);
          results.push({ techId: tech.id, error: updateErr.message });
          continue;
        }
        approvalToken = newToken;
      } else {
        // New approval: insert record
        const { data: approval, error: approvalErr } = await supabaseAdmin
          .from("job_approvals")
          .insert({
            job_id: job_id,
            technician_user_id: tech.user_id,
            response_required: rRequired,
            reminder_profile: rProfile,
            reminder_config: rConfig,
          })
          .select("token")
          .single();

        if (approvalErr) {
          console.error("[create-approval] Insert error for tech:", tech.id, approvalErr);
          results.push({ techId: tech.id, error: approvalErr.message });
          continue;
        }
        approvalToken = approval.token;
      }

      // Send email via Microsoft Graph
      if (msToken && tech.email) {
        const techTimes = techTimeMap.get(tech.id);
        const { subject, body } = buildApprovalEmail(job, tech.name, approvalToken, displayNumber, isTimeChange, techTimes?.start_at, techTimes?.end_at, infoChanges);

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
            console.error("[create-approval] Email send failed for:", tech.email, errText);
            results.push({ techId: tech.id, token: approvalToken, emailSent: false, error: errText });
          } else {
            console.log("[create-approval] Email sent to:", tech.email);
            results.push({ techId: tech.id, token: approvalToken, emailSent: true });
          }
        } catch (emailErr) {
          console.error("[create-approval] Email exception:", emailErr);
          results.push({ techId: tech.id, token: approvalToken, emailSent: false });
        }
      } else {
        results.push({ techId: tech.id, token: approvalToken, emailSent: false, reason: "No MS token or no email" });
      }

      // Log to event_logs
      const logMessage = isTimeChange
        ? `Tidsendring – ny forespørsel sendt til ${tech.name}`
        : `Godkjenningsforespørsel sendt til ${tech.name}`;
      await supabaseAdmin.from("event_logs").insert({
        event_id: job_id,
        performed_by: callerUserId,
        action_type: isTimeChange ? "time_change" : "created",
        change_summary: logMessage,
      });
    }

    // Audit: include info-changes in the same approval flow (so admin sees combined update in history)
    if (infoChanges.length > 0) {
      await supabaseAdmin.from("event_logs").insert({
        event_id: job_id,
        performed_by: callerUserId,
        action_type: "info_update_included",
        change_summary: `Info-oppdatering (${infoChanges.length} endring(er)) inkludert i samme godkjenningsflyt – ingen separat info-varsel sendt`,
        metadata: { info_changes: infoChanges, combined_with: isTimeChange ? "time_change" : "approval" },
      } as any);
    }

    // After processing: update job status
    if (isTimeChange) {
      // Time change: set status back to requested since approvals are reset
      await supabaseAdmin.from("events").update({ status: "requested" }).eq("id", job_id);
    } else {
      const hasSelfApproved = results.some((r: any) => r.autoApproved);
      if (hasSelfApproved) {
        const { data: allApprovals } = await supabaseAdmin
          .from("job_approvals")
          .select("status")
          .eq("job_id", job_id);

        const allApproved = allApprovals && allApprovals.length > 0 && allApprovals.every((a: any) => a.status === "approved");
        if (allApproved) {
          await supabaseAdmin.from("events").update({ status: "scheduled" }).eq("id", job_id);
          await supabaseAdmin.from("event_logs").insert({
            event_id: job_id,
            performed_by: callerUserId,
            action_type: "status_change",
            change_summary: "Alle montører godkjent – status satt til Planlagt",
          });
        } else {
          await supabaseAdmin.from("events").update({ status: "approved" }).eq("id", job_id);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-approval] Exception:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
