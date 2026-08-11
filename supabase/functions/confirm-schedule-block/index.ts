import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { action, block_id, project_id } = body;

    // ── Server-side permission check: calendar.write_events ──
    const { data: canWrite } = await supabase.rpc("check_permission_v2", {
      _auth_user_id: user.id,
      _perm: "calendar.write_events",
    });
    if (!canWrite) {
      console.log(`[confirm-schedule-block] DENIED: User ${user.id} lacks calendar.write_events`);
      return new Response(JSON.stringify({ error: "Mangler rettighet: calendar.write_events", error_code: "permission_denied" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the block
    const { data: block, error: blockError } = await supabase
      .from("schedule_blocks")
      .select("*, technicians(user_id, name), events(title)")
      .eq("id", block_id)
      .single();

    if (blockError || !block) {
      return new Response(JSON.stringify({ error: "Block not found" }), { status: 404, headers: corsHeaders });
    }

    if (action === "confirm") {
      // Confirm with suggested or provided project
      const targetProjectId = project_id || block.project_id;
      if (!targetProjectId) {
        return new Response(JSON.stringify({ error: "No project to confirm" }), { status: 400, headers: corsHeaders });
      }

      const { error: updateError } = await supabase
        .from("schedule_blocks")
        .update({ match_state: "confirmed", project_id: targetProjectId })
        .eq("id", block_id);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: corsHeaders });
      }

      // Update Outlook event with feedback
      if (block.outlook_event_id && block.calendar_id) {
        try {
          await updateOutlookEvent(supabase, block, targetProjectId);
        } catch (err: any) {
          console.error("[confirm-schedule-block] Outlook update failed:", err.message);
          // Non-fatal – block is confirmed in DB
        }
      }

      return new Response(JSON.stringify({ status: "confirmed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "mark_external") {
      const { error: updateError } = await supabase
        .from("schedule_blocks")
        .update({ match_state: "external", project_id: null })
        .eq("id", block_id);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ status: "marked_external" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
  } catch (err: any) {
    console.error("[confirm-schedule-block] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

async function updateOutlookEvent(supabase: any, block: any, projectId: string) {
  const tenantId = Deno.env.get("AZURE_TENANT_ID")!;
  const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;

  // Get project title
  const { data: project } = await supabase
    .from("events")
    .select("title")
    .eq("id", projectId)
    .single();

  const projectTitle = project?.title || "Ukjent prosjekt";
  const appUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", "") || "";
  const projectLink = `${appUrl}/projects/${projectId}`;

  // Get app token
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("No Graph token");

  const graphToken = tokenData.access_token;
  const userEmail = block.calendar_id;

  // Update event body and categories
  const patchUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/events/${block.outlook_event_id}`;

  const patchBody = {
    categories: ["MCS"],
    body: {
      contentType: "HTML",
      content: `<p>Koblet til MCS prosjekt: <strong>${projectTitle}</strong></p><p><a href="${projectLink}">Åpne i MCS</a></p><p>MCS_EVENT_ID:${projectId}</p><p>MCS_TECHNICIAN_ID:${block.technician_id}</p><p>MCS_BLOCK_ID:${block.id}</p>`,
    },
  };

  const patchRes = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${graphToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patchBody),
  });

  if (!patchRes.ok) {
    const errText = await patchRes.text();
    throw new Error(`Graph PATCH ${patchRes.status}: ${errText}`);
  }

  // Update mcs_block_id in our DB
  await supabase
    .from("schedule_blocks")
    .update({ mcs_block_id: block.id })
    .eq("id", block.id);
}
