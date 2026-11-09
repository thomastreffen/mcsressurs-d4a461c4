import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateClientState, isSystemCaller } from "../_shared/security-boundary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_MAILBOX = "postkontoret@mcsservice.no";
const MAX_EXPIRATION_HOURS = 2.9 * 24; // ~69.6 hours, just under Graph max of 4230 min
const RENEW_THRESHOLD_HOURS = 12; // Renew when less than 12 hours remain

async function getGraphToken(): Promise<string | null> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    console.error("SUBSCRIPTION_SYNC_ERROR", { reason: "Missing Azure credentials" });
    return null;
  }

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
  if (!data.access_token) {
    console.error("SUBSCRIPTION_SYNC_ERROR", { reason: "Token acquisition failed", error: data.error_description });
  }
  return data.access_token || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Auth: service-role, pg_cron shared secret, or global superadmin only
  if (!(await isSystemCaller(supabase, supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, req.headers.get("Authorization")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const notificationUrl = `${supabaseUrl}/functions/v1/graph-webhook-inbound`;
  const resource = `users/${SYSTEM_MAILBOX}/mailFolders('Inbox')/messages`;
  const now = new Date();

  console.log("SUBSCRIPTION_CHECK_START", {
    mailbox: SYSTEM_MAILBOX,
    notificationUrl,
    resource,
    timestamp: now.toISOString(),
  });

  try {
    // 1. Check for existing active subscription
    const { data: existing, error: fetchErr } = await supabase
      .from("ms_graph_subscriptions")
      .select("*")
      .eq("mailbox_email", SYSTEM_MAILBOX)
      .in("status", ["active", "error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    const accessToken = await getGraphToken();
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Failed to get Graph token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. If active subscription exists, check if it needs renewal
    if (existing) {
      const expiresAt = new Date(existing.expiration_at);
      const hoursLeft = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      console.log("SUBSCRIPTION_EXISTING_FOUND", {
        id: existing.id,
        subscription_id: existing.subscription_id,
        status: existing.status,
        expiration_at: existing.expiration_at,
        hours_left: hoursLeft.toFixed(1),
      });

      // Mark as checked
      await supabase.from("ms_graph_subscriptions").update({
        last_checked_at: now.toISOString(),
        updated_at: now.toISOString(),
      }).eq("id", existing.id);

      // If expired or in error state → try to recreate
      if (hoursLeft <= 0 || existing.status === "error") {
        console.log("SUBSCRIPTION_EXPIRED", {
          subscription_id: existing.subscription_id,
          hours_left: hoursLeft.toFixed(1),
          status: existing.status,
        });

        // Try to delete old subscription from Graph (ignore errors)
        try {
          await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${existing.subscription_id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        } catch { /* ignore */ }

        // Mark old as disabled
        await supabase.from("ms_graph_subscriptions").update({
          status: "disabled",
          updated_at: now.toISOString(),
        }).eq("id", existing.id);

        // Create new
        const result = await createSubscription(accessToken, notificationUrl, resource, supabase, now);
        return new Response(
          JSON.stringify({ action: "recreated", ...result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If expiring within threshold → renew
      if (hoursLeft < RENEW_THRESHOLD_HOURS) {
        console.log("SUBSCRIPTION_RENEWING", {
          subscription_id: existing.subscription_id,
          hours_left: hoursLeft.toFixed(1),
        });

        const renewResult = await renewSubscription(accessToken, existing, supabase, now);
        return new Response(
          JSON.stringify({ action: "renewed", ...renewResult }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Healthy — no action needed
      console.log("SUBSCRIPTION_HEALTHY", {
        subscription_id: existing.subscription_id,
        hours_left: hoursLeft.toFixed(1),
        expiration_at: existing.expiration_at,
      });

      return new Response(
        JSON.stringify({
          action: "no_action",
          status: "healthy",
          subscription_id: existing.subscription_id,
          expiration_at: existing.expiration_at,
          hours_left: Math.round(hoursLeft * 10) / 10,
          last_renewed_at: existing.last_renewed_at,
          last_error: existing.last_error,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. No subscription exists → create new
    console.log("SUBSCRIPTION_NONE_FOUND", { mailbox: SYSTEM_MAILBOX });
    const result = await createSubscription(accessToken, notificationUrl, resource, supabase, now);
    return new Response(
      JSON.stringify({ action: "created", ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("SUBSCRIPTION_ERROR", { error: String(err), stack: (err as Error).stack });
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createSubscription(
  accessToken: string,
  notificationUrl: string,
  resource: string,
  supabase: any,
  now: Date,
) {
  const expiration = new Date(now.getTime() + MAX_EXPIRATION_HOURS * 60 * 60 * 1000).toISOString();
  const clientState = generateClientState();

  console.log("SUBSCRIPTION_CREATING", { resource, notificationUrl, expiration });

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
    console.error("SUBSCRIPTION_CREATE_FAILED", { status: resp.status, error: errText });

    // Store failed attempt
    await supabase.from("ms_graph_subscriptions").insert({
      mailbox_email: SYSTEM_MAILBOX,
      subscription_id: "FAILED-" + Date.now(),
      resource,
      change_type: "created",
      notification_url: notificationUrl,
      client_state: clientState,
      expiration_at: expiration,
      status: "error",
      last_error: `Create failed: ${resp.status} - ${errText}`,
      error_message: `Create failed: ${resp.status}`,
      last_checked_at: now.toISOString(),
      company_id: "00000000-0000-0000-0000-000000000000",
    });

    throw new Error(`Graph subscription create failed: ${resp.status} ${errText}`);
  }

  const sub = await resp.json();
  console.log("SUBSCRIPTION_CREATED", {
    subscription_id: sub.id,
    expiration: sub.expirationDateTime,
    resource: sub.resource,
  });

  // Get a valid company_id for the record
  const { data: company } = await supabase
    .from("internal_companies")
    .select("id")
    .limit(1)
    .maybeSingle();

  const companyId = company?.id || "00000000-0000-0000-0000-000000000000";

  const { data, error } = await supabase.from("ms_graph_subscriptions").insert({
    company_id: companyId,
    mailbox_email: SYSTEM_MAILBOX,
    subscription_id: sub.id,
    resource,
    change_type: "created",
    notification_url: notificationUrl,
    client_state: clientState,
    expiration_at: sub.expirationDateTime,
    status: "active",
    last_checked_at: now.toISOString(),
  }).select("*").single();

  if (error) throw error;
  return { subscription: data };
}

async function renewSubscription(
  accessToken: string,
  existing: any,
  supabase: any,
  now: Date,
) {
  const newExpiration = new Date(now.getTime() + MAX_EXPIRATION_HOURS * 60 * 60 * 1000).toISOString();

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/subscriptions/${existing.subscription_id}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expirationDateTime: newExpiration }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("SUBSCRIPTION_RENEW_FAILED", {
      subscription_id: existing.subscription_id,
      status: resp.status,
      error: errText,
    });

    await supabase.from("ms_graph_subscriptions").update({
      status: "error",
      last_error: `Renew failed: ${resp.status} - ${errText}`,
      error_message: `Renew failed: ${resp.status}`,
      last_checked_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("id", existing.id);

    throw new Error(`Renew failed: ${resp.status}`);
  }

  await resp.json();
  console.log("SUBSCRIPTION_RENEWED", {
    subscription_id: existing.subscription_id,
    new_expiration: newExpiration,
  });

  await supabase.from("ms_graph_subscriptions").update({
    expiration_at: newExpiration,
    last_renewed_at: now.toISOString(),
    last_checked_at: now.toISOString(),
    status: "active",
    last_error: null,
    error_message: null,
    updated_at: now.toISOString(),
  }).eq("id", existing.id);

  return {
    subscription_id: existing.subscription_id,
    expiration_at: newExpiration,
    renewed: true,
  };
}
