import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// How far back to search (default 24h)
const SEARCH_WINDOW_HOURS = 24;

async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string,
  meta: any
): Promise<string | null> {
  const accessToken = meta.ms_access_token;
  const refreshToken = meta.ms_refresh_token;
  const expiresAt = meta.ms_expires_at;

  if (!accessToken) return null;

  // Token still valid
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
    await tokenRes.text();
    return null;
  }

  const tokenData = await tokenRes.json();
  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: tokenData.access_token,
      ms_refresh_token: tokenData.refresh_token || refreshToken,
      ms_expires_at: newExpiry,
    },
  });

  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // --- Auth check: require admin or service-role bearer ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return respond({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwt = authHeader.replace("Bearer ", "");

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Allow service_role key (for pg_cron / system calls)
  if (jwt !== serviceRoleKey) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await supabaseAnon.auth.getClaims(jwt);
    if (claimsErr || !claims?.claims?.sub) {
      return respond({ error: "Unauthorized" }, 401);
    }
    const userId = claims.claims.sub as string;
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "super_admin"])
      .limit(1);
    if (!roleData || roleData.length === 0) {
      return respond({ error: "Forbidden" }, 403);
    }
  }

  try {

    console.log("[inbox-scan] Starting scan...");

    // 1. Build ref_code → entity map
    const refMap = new Map<string, { entity_type: string; entity_id: string }>();

    const { data: jobs } = await supabaseAdmin
      .from("events")
      .select("id, internal_number")
      .not("internal_number", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    for (const job of jobs || []) {
      if (job.internal_number) {
        refMap.set(job.internal_number, { entity_type: "job", entity_id: job.id });
      }
    }

    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id, lead_ref_code")
      .not("lead_ref_code", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    for (const lead of leads || []) {
      if (lead.lead_ref_code) {
        refMap.set(lead.lead_ref_code, { entity_type: "lead", entity_id: lead.id });
      }
    }

    console.log(`[inbox-scan] Loaded ${refMap.size} ref codes (${jobs?.length || 0} jobs, ${leads?.length || 0} leads)`);

    if (refMap.size === 0) {
      return respond({ success: true, message: "No ref codes found", scanned_users: 0, new_messages: 0 });
    }

    // 2. Get all users with MS tokens
    const { data: { users }, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (usersErr) {
      console.error("[inbox-scan] Failed to list users:", usersErr);
      return respond({ error: "Failed to list users" }, 500);
    }

    const msUsers = (users || []).filter(u => u.user_metadata?.ms_access_token);
    console.log(`[inbox-scan] Found ${msUsers.length} users with MS tokens`);

    let totalNewMessages = 0;
    let scannedUsers = 0;

    // 3. For each user, search inbox for ref codes
    for (const user of msUsers) {
      const meta = user.user_metadata || {};
      const msToken = await ensureValidMsToken(supabaseAdmin, user.id, meta);
      if (!msToken) {
        console.log(`[inbox-scan] Skipping user ${user.id} – no valid token`);
        continue;
      }

      scannedUsers++;
      const userEmail = user.email?.toLowerCase() || "";

      // Search for messages containing JOB- or LEAD- in subject, received in last 24h
      const sinceDate = new Date(Date.now() - SEARCH_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      const searchQueries = [
        `subject:JOB- AND received>=${sinceDate.split("T")[0]}`,
        `subject:LEAD- AND received>=${sinceDate.split("T")[0]}`,
      ];

      for (const searchQuery of searchQueries) {
        try {
          const url = `${GRAPH_BASE}/me/messages?$search="${encodeURIComponent(searchQuery)}"&$top=50&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,from,toRecipients,receivedDateTime,webLink,internetMessageId,conversationId,isDraft`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${msToken}` },
          });

          if (!res.ok) {
            const errText = await res.text();
            console.log(`[inbox-scan] Graph search failed for user ${user.id}: ${res.status} ${errText.substring(0, 100)}`);
            continue;
          }

          const data = await res.json();
          const messages = data.value || [];

          for (const msg of messages) {
            if (msg.isDraft) continue;

            // Extract ref codes from subject
            const subject = msg.subject || "";
            const matchedRefs: string[] = [];

            for (const refCode of refMap.keys()) {
              if (subject.includes(refCode)) {
                matchedRefs.push(refCode);
              }
            }

            if (matchedRefs.length === 0) continue;

            // Check if this message is already stored
            const { data: existing } = await supabaseAdmin
              .from("communication_logs")
              .select("id")
              .eq("graph_message_id", msg.id)
              .limit(1);

            if (existing && existing.length > 0) continue;

            // Determine direction
            const fromAddr = msg.from?.emailAddress?.address?.toLowerCase() || "";
            const isFromSelf = fromAddr === userEmail;
            const direction = isFromSelf ? "outbound" : "inbound";

            // Store for each matched ref (usually just one)
            for (const refCode of matchedRefs) {
              const entity = refMap.get(refCode)!;

              // Double-check not already stored for this entity
              const { data: entityExisting } = await supabaseAdmin
                .from("communication_logs")
                .select("id")
                .eq("graph_message_id", msg.id)
                .eq("entity_id", entity.entity_id)
                .limit(1);

              if (entityExisting && entityExisting.length > 0) continue;

              const row = {
                entity_type: entity.entity_type,
                entity_id: entity.entity_id,
                direction,
                mode: isFromSelf ? "sent" : "received",
                to_recipients: (msg.toRecipients || []).map((r: any) => ({
                  address: r.emailAddress?.address,
                })),
                subject: subject,
                body_preview: (msg.bodyPreview || "").substring(0, 500),
                graph_message_id: msg.id,
                internet_message_id: msg.internetMessageId || null,
                conversation_id: msg.conversationId || null,
                outlook_weblink: msg.webLink || null,
                created_by: user.id,
                ref_code: refCode,
                created_at: msg.receivedDateTime || new Date().toISOString(),
              };

              const { error: insertErr } = await supabaseAdmin
                .from("communication_logs")
                .insert(row);

              if (!insertErr) {
                totalNewMessages++;
                console.log(`[inbox-scan] Stored ${direction} message for ${entity.entity_type}/${entity.entity_id} ref=${refCode}`);
              } else {
                console.log(`[inbox-scan] Insert failed: ${insertErr.message}`);
              }
            }
          }
        } catch (err) {
          console.error(`[inbox-scan] Search error for user ${user.id}:`, err);
        }
      }
    }

    console.log(`[inbox-scan] Done. Scanned ${scannedUsers} users, stored ${totalNewMessages} new messages.`);

    return respond({
      success: true,
      scanned_users: scannedUsers,
      new_messages: totalNewMessages,
      ref_codes_loaded: refMap.size,
    });
  } catch (err) {
    console.error("[inbox-scan] Fatal error:", err);
    return respond({ error: String(err) }, 500);
  }
});
