// READ-ONLY, company-scoped health check against Tripletex TEST only.
// Never writes data to Tripletex. Never logs or returns tokens.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { TRIPLETEX_BASE, assertAllowed, assertTripletexCompany, GuardError, type Connection } from "../_shared/tripletex-guard.ts";

type Status = "ok" | "not_configured" | "auth_failed" | "wrong_company" | "api_error" | "network_error" | "disabled";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const reqId = (r: Response) => r.headers.get("x-tlx-request-id") || r.headers.get("x-request-id") || null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser(authHeader.slice(7));
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: isSuper } = await admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
  if (!isSuper) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const connectionId = typeof body?.connection_id === "string" ? body.connection_id : null;
  if (!connectionId) return json({ error: "connection_id mangler" }, 400);
  const { data: conn } = await admin.from("tripletex_connections").select("*").eq("id", connectionId).maybeSingle();
  if (!conn) return json({ error: "Ukjent tilkobling" }, 404);
  const c = conn as Connection;

  const started = Date.now();
  const result = { status: "ok" as Status, http_status: null as number | null, request_id: null as string | null, message: "",
    company_id: null as number | null, company_name: null as string | null, projects: [] as { id: number; number: string; name: string }[] };

  try {
    assertAllowed(c, {});
    const base = TRIPLETEX_BASE[c.environment];
    const apiToken = Deno.env.get(c.secret_name);
    if (!apiToken) { result.status = "not_configured"; result.message = `${c.secret_name} er ikke lagt inn.`; }
    else {
      const sRes = await fetch(`${base}/token/session/:createFromRefreshToken`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken: apiToken, ttlSeconds: 900 }), signal: AbortSignal.timeout(15000),
      });
      result.http_status = sRes.status; result.request_id = reqId(sRes);
      const sBody: any = await sRes.json().catch(() => null);
      const session: string | undefined = sBody?.value?.token ?? sBody?.token;
      if (sRes.status >= 400 && sRes.status < 500) { result.status = "auth_failed"; result.message = "Tripletex avviste API-nøkkelen."; }
      else if (!sRes.ok || !session) { result.status = "api_error"; result.message = `Feil ved innlogging (HTTP ${sRes.status}).`; }
      else {
        const get = async (p: string) => {
          const r = await fetch(`${base}${p}`, { headers: { Authorization: "Basic " + btoa(`0:${session}`), Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
          result.http_status = r.status; result.request_id = reqId(r) ?? result.request_id;
          return { r, b: await r.json().catch(() => null) as any };
        };
        const who = await get("/token/session/%3EwhoAmI?fields=companyId");
        const companyId: number | undefined = who.b?.value?.companyId;
        result.company_id = companyId ?? null;
        if (!who.r.ok || !companyId) { result.status = "api_error"; result.message = "Kunne ikke hente innlogget selskap."; }
        else {
          const comp = await get(`/company/${companyId}?fields=id,name`);
          result.company_name = comp.b?.value?.name ?? null;
          assertTripletexCompany(c, companyId);
          const pr = await get("/project?count=5&fields=id,number,name");
          if (!pr.r.ok) { result.status = "api_error"; result.message = "Prosjektlisten feilet."; }
          else {
            result.projects = (pr.b?.values ?? []).map((p: any) => ({ id: p.id, number: p.number ?? "", name: p.name ?? "" }));
            result.message = "Tilkoblet og riktig selskap verifisert.";
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof GuardError) { result.status = e.code === "wrong_company" ? "wrong_company" : "disabled"; result.message = e.message; }
    else { result.status = "network_error"; result.message = e instanceof Error && e.name === "TimeoutError" ? "Tripletex svarte ikke i tide." : "Nettverksfeil."; }
  }

  const latency = Date.now() - started;
  console.log(JSON.stringify({ fn: "tripletex-test-health", connection: c.id, env: c.environment, status: result.status, http: result.http_status, request_id: result.request_id, latency_ms: latency }));
  await admin.from("tripletex_health_checks").insert({
    checked_by: user.id, environment: c.environment, status: result.status, http_status: result.http_status,
    request_id: result.request_id, latency_ms: latency, company_id: result.company_id,
    company_name: result.company_name, project_sample_count: result.projects.length, message: result.message,
  });
  await admin.from("tripletex_connections").update({ last_health_status: result.status, last_health_at: new Date().toISOString(), last_health_request_id: result.request_id, updated_at: new Date().toISOString() }).eq("id", c.id);

  return json({ ...result, environment: c.environment, latency_ms: latency, checked_at: new Date().toISOString() });
});
