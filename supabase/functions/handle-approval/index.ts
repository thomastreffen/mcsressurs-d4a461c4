import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
// The unguessable approval token authorizes one response, not calendar/job mutations.
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof body.token !== "string" || !uuid.test(body.token) || !["approve", "reject", "reschedule"].includes(body.action)) return json({ error: "invalid_response" }, 400);
    if (body.comment != null && (typeof body.comment !== "string" || body.comment.length > 4000)) return json({ error: "invalid_comment" }, 400);
    if (body.action === "reschedule" && (!Number.isFinite(Date.parse(body.proposed_start)) || !Number.isFinite(Date.parse(body.proposed_end)) || Date.parse(body.proposed_end) <= Date.parse(body.proposed_start))) return json({ error: "invalid_proposed_range" }, 400);
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "configuration_missing" }, 500);
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("respond_to_job_assignment", {
      _token: body.token, _action: body.action, _comment: body.comment ?? null,
      _start: body.action === "reschedule" ? body.proposed_start : null,
      _end: body.action === "reschedule" ? body.proposed_end : null,
    });
    if (error) return json({ error: "response_transaction_failed" }, 500);
    return json(data, data?.http_status ?? 500);
  } catch { return json({ error: "invalid_request" }, 400); }
});
