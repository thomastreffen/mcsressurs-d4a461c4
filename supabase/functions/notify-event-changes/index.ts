import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { formatJobSchedule } from "../_shared/job-time.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://mcsressurs.lovable.app";

interface ChangeItem {
  label: string;
  oldValue?: string | null;
  newValue?: string | null;
  severity?: "critical" | "minor";
}

interface NotifyBody {
  job_id: string;
  changes: ChangeItem[];
  technician_ids?: string[]; // optional explicit list; otherwise all assigned
}

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmail(job: any, techName: string, displayNumber: string, changes: ChangeItem[]): { subject: string; body: string } {
  const { startDate, startTime, endTime } = formatJobSchedule(job.start_time, job.end_time);
  const jobUrl = `${APP_URL}/jobs/${job.id}`;

  const subject = `Oppdatering på oppdrag: ${displayNumber} – ${job.title || ""}`.trim();

  const changesRows = changes
    .map((change) => {
      const oldVal = change.oldValue && change.oldValue.trim() ? escapeHtml(change.oldValue) : "<em style=\"color:#94a3b8\">tomt</em>";
      const newVal = change.newValue && change.newValue.trim() ? escapeHtml(change.newValue) : "<em style=\"color:#94a3b8\">tomt</em>";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1e293b;width:140px;">${escapeHtml(change.label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;">
            <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Før</div>
            <div style="margin-bottom:6px;">${oldVal}</div>
            <div style="font-size:12px;color:#0f766e;text-transform:uppercase;letter-spacing:0.04em;">Nå</div>
            <div>${newVal}</div>
          </td>
        </tr>`;
    })
    .join("");

  const body = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#1a1a2e;background:#f8fafc;">
  <div style="background:#0f172a;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">MCS Service · Oppdragsoppdatering</div>
    <h1 style="margin:6px 0 0;font-size:20px;">Endringer på oppdrag ${escapeHtml(displayNumber)}</h1>
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:22px;border-radius:0 0 10px 10px;">
    <p style="margin-top:0;">Hei ${escapeHtml(techName)},</p>
    <p>Det er gjort endringer på oppdraget du er tildelt. <strong>Du trenger ikke å bekrefte på nytt</strong> – dette er en informasjonsoppdatering. Tid og dato er uendret.</p>

    <table style="width:100%;border-collapse:collapse;margin:14px 0;background:#f8fafc;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr>
        <td style="padding:8px 12px;color:#64748b;width:140px;">Tittel</td>
        <td style="padding:8px 12px;font-weight:600;">${escapeHtml(job.title || "—")}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;color:#64748b;">Kunde</td>
        <td style="padding:8px 12px;">${escapeHtml(job.customer || "—")}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;color:#64748b;">Dato</td>
        <td style="padding:8px 12px;">${startDate}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;color:#64748b;">Tid</td>
        <td style="padding:8px 12px;">${startTime} – ${endTime}</td>
      </tr>
    </table>

    <h2 style="font-size:15px;margin:18px 0 8px;color:#0f172a;">Hva er endret</h2>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      ${changesRows}
    </table>

    <div style="margin:22px 0 4px;">
      <a href="${jobUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Åpne oppdraget</a>
    </div>
    <p style="font-size:12px;color:#94a3b8;margin-top:18px;">Du mottar denne e-posten fordi du er tildelt oppdraget. Hvis tid eller dato endres, vil du bli bedt om å bekrefte på nytt i en egen e-post.</p>
  </div>
</body></html>`;

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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerUserId = userData.user.id;

    const body = (await req.json()) as NotifyBody;
    if (!body?.job_id || !Array.isArray(body?.changes) || body.changes.length === 0) {
      return new Response(JSON.stringify({ error: "Missing job_id or changes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobErr } = await supabaseAdmin
      .from("events").select("*").eq("id", body.job_id).single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load assigned technicians (or filter by passed list)
    const { data: assignments } = await supabaseAdmin
      .from("event_technicians").select("technician_id, start_at, end_at").eq("event_id", body.job_id);
    let techIds = (assignments || []).map((a: any) => a.technician_id);
    if (Array.isArray(body.technician_ids) && body.technician_ids.length > 0) {
      const set = new Set(body.technician_ids);
      techIds = techIds.filter((id) => set.has(id));
    }
    if (techIds.length === 0) {
      return new Response(JSON.stringify({ success: true, results: [], note: "No technicians to notify" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: technicians } = await supabaseAdmin
      .from("technicians").select("id, name, email, user_id").in("id", techIds);

    const displayNumber = job.job_number || job.internal_number || "—";
    const msToken = await getValidMsToken(supabaseAdmin, callerUserId);
    const results: any[] = [];

    for (const tech of technicians || []) {
      // In-app notification
      if (tech.user_id) {
        try {
          await supabaseAdmin.from("notifications").insert({
            user_id: tech.user_id,
            company_id: job.company_id,
            type: "job_info_update",
            priority: "important",
            title: `Oppdatering på ${displayNumber}: ${job.title || ""}`.trim(),
            message: body.changes.map((c) => `${c.label}: ${c.newValue || "tomt"}`).join(" · ").slice(0, 240),
            link_url: `/jobs/${job.id}`,
            entity_type: "event",
            entity_id: job.id,
            actor_user_id: callerUserId,
          } as any);
        } catch (e) {
          console.error("[notify-event-changes] notification insert failed", e);
        }
      }

      // Email
      if (msToken && tech.email) {
        const assignment = assignments?.find((a: any) => a.technician_id === tech.id);
        const recipientJob = { ...job, start_time: assignment?.start_at || job.start_time, end_time: assignment?.end_at || job.end_time };
        const { subject, body: html } = buildEmail(recipientJob, tech.name, displayNumber, body.changes);
        try {
          const emailRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
            method: "POST",
            headers: { Authorization: `Bearer ${msToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              message: {
                subject,
                body: { contentType: "HTML", content: html },
                toRecipients: [{ emailAddress: { address: tech.email } }],
              },
            }),
          });
          if (!emailRes.ok) {
            const errText = await emailRes.text();
            console.error("[notify-event-changes] email failed", tech.email, errText);
            results.push({ techId: tech.id, emailSent: false, error: errText });
          } else {
            results.push({ techId: tech.id, emailSent: true });
          }
        } catch (e) {
          console.error("[notify-event-changes] email exception", e);
          results.push({ techId: tech.id, emailSent: false, error: String(e) });
        }
      } else {
        results.push({ techId: tech.id, emailSent: false, reason: "No MS token or no email" });
      }
    }

    // Audit log
    await supabaseAdmin.from("event_logs").insert({
      event_id: job.id,
      performed_by: callerUserId,
      action_type: "info_update_sent",
      change_summary: `Info-varsel sendt til ${technicians?.length || 0} montør(er) om ${body.changes.length} endring(er) (uten ny godkjenning)`,
      metadata: { changes: body.changes, technician_ids: techIds },
    } as any);

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[notify-event-changes] exception", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
