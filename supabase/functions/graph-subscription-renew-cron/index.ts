import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isSystemCaller } from "../_shared/security-boundary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: service-role, pg_cron shared secret, or global superadmin only
    if (!(await isSystemCaller(supabase, supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, req.headers.get("Authorization")))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = Deno.env.get("AZURE_TENANT_ID");
    const clientId = Deno.env.get("AZURE_CLIENT_ID");
    const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");

    if (!tenantId || !clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "Missing Azure credentials" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Graph token
    const tokenResp = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      }
    );
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Token acquisition failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find subscriptions expiring within 24 hours
    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: subs, error: fetchErr } = await supabase
      .from("ms_graph_subscriptions")
      .select("*")
      .eq("status", "active")
      .lt("expiration_at", cutoff);

    if (fetchErr) throw fetchErr;

    let renewed = 0;
    let errors = 0;

    for (const sub of subs || []) {
      try {
        const newExpiration = new Date(Date.now() + 2.9 * 24 * 60 * 60 * 1000).toISOString();

        const resp = await fetch(
          `https://graph.microsoft.com/v1.0/subscriptions/${sub.subscription_id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ expirationDateTime: newExpiration }),
          }
        );

        if (resp.ok) {
          await resp.json();
          await supabase.from("ms_graph_subscriptions").update({
            expiration_at: newExpiration,
            last_renewed_at: new Date().toISOString(),
            status: "active",
            last_error: null,
            updated_at: new Date().toISOString(),
          }).eq("id", sub.id);
          renewed++;
        } else {
          const errText = await resp.text();
          await supabase.from("ms_graph_subscriptions").update({
            status: "error",
            last_error: `Renew failed: ${resp.status} - ${errText}`,
            updated_at: new Date().toISOString(),
          }).eq("id", sub.id);
          errors++;
        }
      } catch (err) {
        await supabase.from("ms_graph_subscriptions").update({
          status: "error",
          last_error: String(err),
          updated_at: new Date().toISOString(),
        }).eq("id", sub.id);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ renewed, errors, checked: (subs || []).length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Renew cron error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
