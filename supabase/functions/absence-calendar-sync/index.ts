import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Token helper (reused pattern) ── */
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
        scope: "https://graph.microsoft.com/.default offline_access",
      }),
    }
  );

  if (!tokenRes.ok) {
    console.error("[absence-cal] Token refresh failed:", await tokenRes.text());
    return null;
  }

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

const ABSENCE_LABELS: Record<string, string> = {
  ferie: "Ferie",
  avspassering: "Avspassering",
  syk: "Sykefravær",
  permisjon: "Permisjon",
  kurs: "Kurs/opplæring",
  annet: "Fravær",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { action, absence_id } = await req.json();
    if (!absence_id) throw new Error("absence_id required");

    // Fetch absence request
    const { data: absence, error: absErr } = await sb
      .from("absence_requests")
      .select("*")
      .eq("id", absence_id)
      .single();
    if (absErr || !absence) throw new Error("Absence not found");

    // Resolve the person → auth user for MS token lookup
    const { data: person } = await sb
      .from("people")
      .select("id, full_name")
      .eq("id", absence.person_id)
      .single();

    // Find the auth user_id for this person via user_accounts
    const { data: ua } = await sb
      .from("user_accounts")
      .select("auth_user_id")
      .eq("person_id", absence.person_id)
      .eq("is_active", true)
      .limit(1)
      .single();

    const targetAuthUserId = ua?.auth_user_id;
    if (!targetAuthUserId) {
      console.log("[absence-cal] No auth user for person", absence.person_id);
      return new Response(JSON.stringify({ status: "no_user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const msToken = await ensureValidMsToken(sb, targetAuthUserId);
    if (!msToken) {
      console.log("[absence-cal] No MS token for", targetAuthUserId);
      return new Response(JSON.stringify({ status: "no_token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const label = ABSENCE_LABELS[absence.absence_type] || "Fravær";
    const personName = person?.full_name || "Ansatt";

    if (action === "create" || action === "update") {
      // Build event body
      const isAllDay = absence.is_full_day;

      let eventBody: any;

      if (isAllDay) {
        // All-day event uses date format (no time)
        // Graph API expects end date to be exclusive (day after)
        const endDate = new Date(absence.end_date);
        endDate.setDate(endDate.getDate() + 1);
        const endDateStr = endDate.toISOString().split("T")[0];

        eventBody = {
          subject: `${label} – ${personName}`,
          body: {
            contentType: "Text",
            content: `Fravær registrert i MCS.\nType: ${label}\n${absence.comment ? `Kommentar: ${absence.comment}` : ""}`,
          },
          start: { dateTime: absence.start_date, timeZone: "Europe/Oslo" },
          end: { dateTime: endDateStr, timeZone: "Europe/Oslo" },
          isAllDay: true,
          showAs: "oof", // Out of Office
          isReminderOn: false,
          categories: ["MCS Fravær"],
        };
      } else {
        // Partial day
        const startDt = `${absence.start_date}T${absence.start_time || "08:00"}:00`;
        const endDt = `${absence.end_date || absence.start_date}T${absence.end_time || "16:00"}:00`;

        eventBody = {
          subject: `${label} – ${personName}`,
          body: {
            contentType: "Text",
            content: `Fravær registrert i MCS.\nType: ${label}\n${absence.comment ? `Kommentar: ${absence.comment}` : ""}`,
          },
          start: { dateTime: startDt, timeZone: "Europe/Oslo" },
          end: { dateTime: endDt, timeZone: "Europe/Oslo" },
          isAllDay: false,
          showAs: "oof",
          isReminderOn: false,
          categories: ["MCS Fravær"],
        };
      }

      const existingEventId = absence.outlook_event_id;
      const method = existingEventId ? "PATCH" : "POST";
      const url = existingEventId
        ? `https://graph.microsoft.com/v1.0/me/events/${existingEventId}`
        : "https://graph.microsoft.com/v1.0/me/events";

      console.log(`[absence-cal] ${method} Outlook event for ${personName} (${label})`);

      const msRes = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${msToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      });

      if (msRes.ok) {
        const msEvent = await msRes.json();
        // Store the outlook_event_id
        await sb
          .from("absence_requests")
          .update({ outlook_event_id: msEvent.id })
          .eq("id", absence_id);

        console.log(`[absence-cal] ${method === "POST" ? "Created" : "Updated"} event:`, msEvent.id);
        return new Response(
          JSON.stringify({ status: method === "POST" ? "created" : "updated", outlook_event_id: msEvent.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        const errText = await msRes.text();
        console.error(`[absence-cal] Graph error ${msRes.status}:`, errText);
        return new Response(
          JSON.stringify({ status: "error", code: msRes.status, detail: errText }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (action === "delete") {
      const eventId = absence.outlook_event_id;
      if (!eventId) {
        return new Response(JSON.stringify({ status: "no_event" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[absence-cal] Deleting Outlook event ${eventId} for ${personName}`);

      const msRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/events/${eventId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${msToken}` },
        }
      );

      if (msRes.ok || msRes.status === 404) {
        await sb.from("absence_requests").update({ outlook_event_id: null }).eq("id", absence_id);
        await msRes.text(); // consume
        return new Response(JSON.stringify({ status: "deleted" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        const errText = await msRes.text();
        console.error(`[absence-cal] Delete error ${msRes.status}:`, errText);
        return new Response(
          JSON.stringify({ status: "error", code: msRes.status }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify({ status: "unknown_action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[absence-cal] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
