import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Strip UTC offset so Graph uses the explicit timeZone property ── */
function toLocalDateTimeString(isoString: string): string {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string
): Promise<string | null> {
  const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !userData?.user) return null;

  const meta = userData.user.user_metadata || {};
  const accessToken = meta.ms_access_token;
  const refreshToken = meta.ms_refresh_token;
  const expiresAt = meta.ms_expires_at;

  if (!accessToken) return null;

  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  if (!refreshToken) return null;

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${Deno.env.get("AZURE_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("AZURE_CLIENT_ID")!,
        client_secret: Deno.env.get("AZURE_CLIENT_SECRET")!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read offline_access",
      }),
    }
  );

  if (!tokenRes.ok) return null;

  const tokenData = await tokenRes.json();
  const newExpires = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: tokenData.access_token,
      ms_refresh_token: tokenData.refresh_token || refreshToken,
      ms_expires_at: newExpires,
    },
  });

  return tokenData.access_token;
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

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authErr } = await supabaseAnon.auth.getUser(token);
    if (authErr || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authUser.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { action } = body;

    // ─── CREATE ───
    if (action === "create") {
      const { lead_id, start_time, end_time, location, attendee_emails, subject_suffix } = body;

      if (!lead_id || !start_time || !end_time) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: lead } = await supabaseAdmin.from("leads").select("*").eq("id", lead_id).single();
      if (!lead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const msToken = await ensureValidMsToken(supabaseAdmin, userId);
      if (!msToken) {
        return new Response(JSON.stringify({ error: "No valid Microsoft token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const refCode = lead.lead_ref_code || "";
      const eventSubject = `${refCode} ${subject_suffix || "Befaring"} - ${lead.company_name}`.trim();

      const attendees = (attendee_emails || []).map((email: string) => ({
        emailAddress: { address: email },
        type: "required",
      }));

      // Add lead contact if email exists
      if (lead.email) {
        attendees.push({
          emailAddress: { address: lead.email, name: lead.contact_name || lead.company_name },
          type: "required",
        });
      }

      const graphBody: any = {
        subject: eventSubject,
        body: {
          contentType: "HTML",
          content: `<p>Møte/befaring for lead: <strong>${lead.company_name}</strong></p><p>Ref: ${refCode}</p>`,
        },
        start: { dateTime: toLocalDateTimeString(start_time), timeZone: "Europe/Oslo" },
        end: { dateTime: toLocalDateTimeString(end_time), timeZone: "Europe/Oslo" },
        attendees,
      };

      if (location) {
        graphBody.location = { displayName: location };
      }

      const graphRes = await fetch("https://graph.microsoft.com/v1.0/me/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${msToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(graphBody),
      });

      if (!graphRes.ok) {
        const errText = await graphRes.text();
        console.error("[lead-calendar-event] Create failed:", graphRes.status, errText);
        return new Response(JSON.stringify({ error: "Failed to create event: " + errText }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const outlookEvent = await graphRes.json();

      // Store mapping
      await supabaseAdmin.from("lead_calendar_links").insert({
        lead_id,
        outlook_event_id: outlookEvent.id,
        event_subject: eventSubject,
        event_start: start_time,
        event_end: end_time,
        event_location: location || null,
        attendee_emails: attendee_emails || [],
        created_by: userId,
        last_synced_at: new Date().toISOString(),
      });

      // Log
      await supabaseAdmin.from("lead_history").insert({
        lead_id,
        action: "meeting_created",
        description: `Møte opprettet: ${eventSubject}`,
        performed_by: userId,
        metadata: { outlook_event_id: outlookEvent.id },
      });

      return new Response(JSON.stringify({
        success: true,
        outlook_event_id: outlookEvent.id,
        web_link: outlookEvent.webLink,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DELETE ───
    if (action === "delete") {
      const { link_id } = body;

      if (!link_id) {
        return new Response(JSON.stringify({ error: "Missing link_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: link } = await supabaseAdmin
        .from("lead_calendar_links")
        .select("*")
        .eq("id", link_id)
        .single();

      if (!link) {
        return new Response(JSON.stringify({ error: "Calendar link not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const msToken = await ensureValidMsToken(supabaseAdmin, userId);
      if (!msToken) {
        return new Response(JSON.stringify({ error: "No valid Microsoft token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete from Outlook
      const delRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/events/${link.outlook_event_id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${msToken}` },
        }
      );

      if (!delRes.ok && delRes.status !== 404) {
        console.error("[lead-calendar-event] Delete failed:", delRes.status);
        return new Response(JSON.stringify({ status: "reconciliation_required", error: "Outlook-fjerning er ikke bekreftet", code: delRes.status }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Remove from DB
      await supabaseAdmin.from("lead_calendar_links").delete().eq("id", link_id);

      // Log
      await supabaseAdmin.from("lead_history").insert({
        lead_id: link.lead_id,
        action: "meeting_deleted",
        description: `Møte slettet: ${link.event_subject || "Ukjent"}`,
        performed_by: userId,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RESYNC ───
    if (action === "resync") {
      const { link_id } = body;

      const { data: link } = await supabaseAdmin
        .from("lead_calendar_links")
        .select("*")
        .eq("id", link_id)
        .single();

      if (!link) {
        return new Response(JSON.stringify({ error: "Calendar link not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("lead_ref_code, company_name")
        .eq("id", link.lead_id)
        .single();

      const msToken = await ensureValidMsToken(supabaseAdmin, userId);
      if (!msToken) {
        return new Response(JSON.stringify({ error: "No valid Microsoft token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update existing Outlook event
      const patchBody: any = {
        subject: link.event_subject,
        start: { dateTime: toLocalDateTimeString(link.event_start), timeZone: "Europe/Oslo" },
        end: { dateTime: toLocalDateTimeString(link.event_end), timeZone: "Europe/Oslo" },
      };

      if (link.event_location) {
        patchBody.location = { displayName: link.event_location };
      }

      const patchRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/events/${link.outlook_event_id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${msToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patchBody),
        }
      );

      if (!patchRes.ok) {
        const errText = await patchRes.text();
        return new Response(JSON.stringify({ error: "Resync failed: " + errText }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("lead_calendar_links").update({
        last_synced_at: new Date().toISOString(),
      }).eq("id", link_id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[lead-calendar-event] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
