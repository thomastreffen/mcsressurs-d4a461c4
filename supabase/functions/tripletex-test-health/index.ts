// READ-ONLY health check against Tripletex TEST environment only.
// Never writes data to Tripletex. Never logs or returns tokens.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Hard lock: the only allowed environment in this round.
const TRIPLETEX_BASE = "https://api-test.tripletex.tech/v2";

type Status = "ok" | "not_configured" | "auth_failed" | "wrong_company" | "api_error" | "network_error";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const reqId = (r: Response) =>
  r.headers.get("x-tlx-request-id") || r.headers.get("x-request-id") || r.headers.get("request-id") || null;

async function tGet(path: string, session: string) {
  if (!path.startsWith("/")) throw new Error("bad path");
  const res = await fetch(`${TRIPLETEX_BASE}${path}`, {
    method: "GET",
    headers: { Authorization: "Basic " + btoa(`0:${session}`), Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { res, body };
}

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

  const started = Date.now();
  const result: {
    status: Status; http_status: number | null; request_id: string | null; message: string;
    company_id: number | null; company_name: string | null; projects: { id: number; number: string; name: string }[];
  } = { status: "ok", http_status: null, request_id: null, message: "", company_id: null, company_name: null, projects: [] };

  const apiToken = Deno.env.get("TRIPLETEX_TEST_API_TOKEN");
  const expected = Deno.env.get("TRIPLETEX_TEST_EXPECTED_COMPANY_ID");

  try {
    if (!apiToken) {
      result.status = "not_configured";
      result.message = "TRIPLETEX_TEST_API_TOKEN er ikke lagt inn.";
    } else {
      // 1) Exchange internal-integration JWT (refresh token) for a short-lived session token.
      // Auth only — no business data is changed. Session lives 15 minutes.
      const sRes = await fetch(`${TRIPLETEX_BASE}/token/session/:createFromRefreshToken`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken: apiToken, ttlSeconds: 900 }),
        signal: AbortSignal.timeout(15000),
      });
      result.http_status = sRes.status; result.request_id = reqId(sRes);
      const sBody: any = await sRes.json().catch(() => null);
      const session: string | undefined = sBody?.value?.token ?? sBody?.token;
      if (sRes.status === 401 || sRes.status === 403 || (sRes.status >= 400 && sRes.status < 500)) {
        result.status = "auth_failed";
        result.message = "Tripletex avviste API-nøkkelen (sjekk at den er laget i testmiljøet).";
      } else if (!sRes.ok || !session) {
        result.status = "api_error";
        result.message = `Tripletex svarte med feil ved innlogging (HTTP ${sRes.status}).`;
      } else {
        // 2) whoAmI
        const who = await tGet("/token/session/%3EwhoAmI?fields=companyId", session);
        result.http_status = who.res.status; result.request_id = reqId(who.res) ?? result.request_id;
        const companyId: number | undefined = who.body?.value?.companyId;
        if (!who.res.ok || !companyId) {
          result.status = who.res.status === 401 ? "auth_failed" : "api_error";
          result.message = `Kunne ikke hente innlogget selskap (HTTP ${who.res.status}).`;
        } else {
          result.company_id = companyId;
          const comp = await tGet(`/company/${companyId}?fields=id,name`, session);
          result.company_name = comp.body?.value?.name ?? null;
          if (expected && String(companyId) !== expected.trim()) {
            result.status = "wrong_company";
            result.message = `Nøklene gjelder et annet selskap (${companyId}) enn forventet.`;
          } else {
            // 3) Read a few test projects
            const pr = await tGet("/project?count=5&fields=id,number,name", session);
            result.http_status = pr.res.status; result.request_id = reqId(pr.res) ?? result.request_id;
            if (!pr.res.ok) {
              result.status = "api_error";
              result.message = `Tilkoblet, men prosjektlisten feilet (HTTP ${pr.res.status}).`;
            } else {
              result.projects = (pr.body?.values ?? []).map((p: any) => ({ id: p.id, number: p.number ?? "", name: p.name ?? "" }));
              result.message = "Tilkoblet Tripletex testmiljø.";
            }
          }
        }
      }
    }
  } catch (e) {
    result.status = "network_error";
    result.message = e instanceof Error && e.name === "TimeoutError" ? "Tripletex svarte ikke i tide." : "Nettverksfeil mot Tripletex.";
  }

  const latency = Date.now() - started;
  console.log(JSON.stringify({ fn: "tripletex-test-health", env: "test", status: result.status, http: result.http_status, request_id: result.request_id, latency_ms: latency }));

  await admin.from("tripletex_health_checks").insert({
    checked_by: user.id, environment: "test", status: result.status, http_status: result.http_status,
    request_id: result.request_id, latency_ms: latency, company_id: result.company_id,
    company_name: result.company_name, project_sample_count: result.projects.length, message: result.message,
  });

  return json({ ...result, environment: "test", latency_ms: latency, checked_at: new Date().toISOString() });
});
