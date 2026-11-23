import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@4";
import { MONITOR_RELEASE_READY } from "../_shared/contract-watch-monitor.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const input = z.object({ action: z.enum(["status", "stop", "run"]) }).strict();

// No cron / no Graph calls / no inference until commissioning. Status is caller-scoped, not service-role.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_ANON_KEY");
    const auth = req.headers.get("Authorization");
    if (!url || !key) return json({ error: "not_configured" }, 503);
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const client = createClient(url, key, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data, error } = await client.auth.getClaims(auth.slice(7));
    if (error || !data?.claims?.sub) return json({ error: "unauthorized" }, 401);
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "invalid_action" }, 400);
    const status = await client.rpc("cw_monitor_status");
    if (status.error) return json({ error: status.error.message.includes("forbidden") ? "forbidden" : "status_failed" }, status.error.message.includes("forbidden") ? 403 : 503);
    if (parsed.data.action === "status") return json(status.data);
    if (parsed.data.action === "stop") {
      const result = await client.rpc("cw_monitor_stop");
      return result.error ? json({ error: "stop_failed" }, 503) : json({ ok: true });
    }
    if (!MONITOR_RELEASE_READY) return json({ error: "pipeline_not_ready", note: "Full v3-baseline, AI-kø, Hub-varsel og ende-til-ende-kontroll kreves før aktivering." }, 409);
    return json({ error: "activation_required" }, 409);
  } catch { return json({ error: "unexpected" }, 500); }
});