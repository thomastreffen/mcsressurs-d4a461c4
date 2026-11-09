import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateClientState } from "../_shared/security-boundary.ts";
import { isSystemCaller } from "../_shared/system-caller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_MAILBOX = "postkontoret@mcsservice.no";

async function getGraphToken(): Promise<string | null> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) return null;

  const resp = await fetch(
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
  const data = await resp.json();
  return data.access_token || null;
}

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

    const { action, company_id } = await req.json();

    if (!action) {
      return new Response(JSON.stringify({ error: "action required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // LIST
    if (action === "list") {
      let query = supabase.from("ms_graph_subscriptions").select("*").order("created_at", { ascending: false });
      if (company_id) query = query.eq("company_id", company_id);
      const { data, error } = await query;
      if (error) throw error;

      // Add health indicator
      const now = new Date();
      const enriched = (data || []).map((s: any) => ({
        ...s,
        health: s.status === "disabled"
          ? "disabled"
          : s.status === "error"
          ? "error"
          : new Date(s.expiration_at) < now
          ? "expired"
          : new Date(s.expiration_at) < new Date(now.getTime() + 24 * 60 * 60 * 1000)
          ? "expiring_soon"
          : "healthy",
      }));

      return new Response(JSON.stringify({ subscriptions: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getGraphToken();
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Failed to get Graph token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notificationUrl = `${supabaseUrl}/functions/v1/graph-webhook-inbound`;

    // ENSURE
    if (action === "ensure") {
      // Check for existing active subscription
      const { data: existing } = await supabase
        .from("ms_graph_subscriptions")
        .select("*")
        .eq("company_id", company_id)
        .eq("status", "active")
        .order("expiration_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        const expAt = new Date(existing.expiration_at);
        const hoursLeft = (expAt.getTime() - Date.now()) / (1000 * 60 * 60);

        if (hoursLeft > 24) {
          return new Response(JSON.stringify({ status: "already_active", subscription: existing }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Renew
        const renewed = await renewSubscription(accessToken, existing.subscription_id, supabase, existing.id);
        return new Response(JSON.stringify({ status: "renewed", ...renewed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create new
      const result = await createSubscription(accessToken, notificationUrl, company_id, supabase);
      return new Response(JSON.stringify({ status: "created", ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ROTATE STATE: new cryptographic clientState + extended expiration on the EXISTING
    // subscription (no delete/recreate → no dropped notifications, no duplicates).
    if (action === "rotate_state") {
      const { data: sub } = await supabase
        .from("ms_graph_subscriptions")
        .select("*")
        .eq("company_id", company_id)
        .eq("status", "active")
        .order("expiration_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub) {
        return new Response(JSON.stringify({ error: "No active subscription to rotate" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newState = generateClientState();
      const newExpiration = new Date(Date.now() + 2.9 * 24 * 60 * 60 * 1000).toISOString();

      const resp = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${sub.subscription_id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expirationDateTime: newExpiration, clientState: newState }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        await supabase.from("ms_graph_subscriptions").update({
          status: "error",
          last_error: `Rotate failed: ${resp.status}`,
          updated_at: new Date().toISOString(),
        }).eq("id", sub.id);
        console.error("Graph clientState rotation failed:", resp.status, errText);
        return new Response(JSON.stringify({ error: `Rotate failed: ${resp.status}` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await resp.json();

      // Graph accepted the new state -> persist it atomically with the new expiry.
      await supabase.from("ms_graph_subscriptions").update({
        client_state: newState,
        expiration_at: newExpiration,
        last_renewed_at: new Date().toISOString(),
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", sub.id);

      return new Response(JSON.stringify({
        status: "rotated",
        subscription_id: sub.subscription_id,
        expiration_at: newExpiration,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RENEW
    if (action === "renew") {
      const { data: sub } = await supabase
        .from("ms_graph_subscriptions")
        .select("*")
        .eq("company_id", company_id)
        .in("status", ["active", "error"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub) {
        return new Response(JSON.stringify({ error: "No subscription to renew" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await renewSubscription(accessToken, sub.subscription_id, supabase, sub.id);
      return new Response(JSON.stringify({ status: "renewed", ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RECREATE
    if (action === "recreate") {
      // Delete old ones
      const { data: oldSubs } = await supabase
        .from("ms_graph_subscriptions")
        .select("id, subscription_id")
        .eq("company_id", company_id)
        .in("status", ["active", "error", "expired"]);

      for (const old of oldSubs || []) {
        try {
          await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${old.subscription_id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        } catch { /* ignore graph delete errors */ }

        await supabase.from("ms_graph_subscriptions").update({ status: "disabled" }).eq("id", old.id);
      }

      const result = await createSubscription(accessToken, notificationUrl, company_id, supabase);
      return new Response(JSON.stringify({ status: "recreated", ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DISABLE
    if (action === "disable") {
      const { data: subs } = await supabase
        .from("ms_graph_subscriptions")
        .select("id, subscription_id")
        .eq("company_id", company_id)
        .eq("status", "active");

      for (const sub of subs || []) {
        try {
          await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${sub.subscription_id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        } catch { /* ignore */ }
        await supabase.from("ms_graph_subscriptions").update({ status: "disabled" }).eq("id", sub.id);
      }

      return new Response(JSON.stringify({ status: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("graph-subscription-manage error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function createSubscription(
  accessToken: string,
  notificationUrl: string,
  companyId: string,
  supabase: any
) {
  // Max expiration for mail resources is ~4230 minutes (~2.9 days)
  const expiration = new Date(Date.now() + 2.9 * 24 * 60 * 60 * 1000).toISOString();
  const resource = `users/${SYSTEM_MAILBOX}/mailFolders('Inbox')/messages`;
  const clientState = generateClientState();

  const resp = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changeType: "created",
      notificationUrl,
      resource,
      expirationDateTime: expiration,
      clientState,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Graph subscription create failed:", errText);
    throw new Error(`Graph subscription failed: ${resp.status} ${errText}`);
  }

  const sub = await resp.json();

  const { data, error } = await supabase.from("ms_graph_subscriptions").insert({
    company_id: companyId,
    subscription_id: sub.id,
    resource,
    change_type: "created",
    notification_url: notificationUrl,
    client_state: clientState,
    expiration_at: sub.expirationDateTime,
    status: "active",
  }).select("*").single();

  if (error) throw error;
  return { subscription: data };
}

async function renewSubscription(
  accessToken: string,
  subscriptionId: string,
  supabase: any,
  dbId: string
) {
  const expiration = new Date(Date.now() + 2.9 * 24 * 60 * 60 * 1000).toISOString();

  const resp = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expirationDateTime: expiration }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    await supabase.from("ms_graph_subscriptions").update({
      status: "error",
      last_error: `Renew failed: ${resp.status} ${errText}`,
      updated_at: new Date().toISOString(),
    }).eq("id", dbId);
    throw new Error(`Renew failed: ${resp.status}`);
  }

  await resp.json();

  await supabase.from("ms_graph_subscriptions").update({
    expiration_at: expiration,
    last_renewed_at: new Date().toISOString(),
    status: "active",
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", dbId);

  return { renewed: true, expiration_at: expiration };
}
