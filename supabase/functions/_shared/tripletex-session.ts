// Opens a TEST-only Tripletex session for a guarded connection and verifies whoAmI.companyId. Never logs tokens.
import { TRIPLETEX_BASE, assertTripletexCompany, GuardError, type Connection } from "./tripletex-guard.ts";

const reqId = (r: Response) => r.headers.get("x-tlx-request-id") || r.headers.get("x-request-id") || null;

export async function openSession(conn: Connection) {
  const base = TRIPLETEX_BASE[conn.environment];
  if (!base || conn.environment !== "test") throw new GuardError("env_blocked", "Kun Tripletex TEST er tillatt.");
  const token = Deno.env.get(conn.secret_name);
  if (!token) throw new GuardError("not_configured", "API-nøkkelen for tilkoblingen mangler.");
  const s = await fetch(`${base}/token/session/:createFromRefreshToken`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refreshToken: token, ttlSeconds: 900 }), signal: AbortSignal.timeout(15000),
  });
  const sb: any = await s.json().catch(() => null);
  const session = sb?.value?.token;
  if (!s.ok || !session) throw new GuardError("auth_failed", "Innlogging mot Tripletex feilet.");
  const auth = "Basic " + btoa(`0:${session}`);
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, {
      method, headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
    });
    return { r, b: await r.json().catch(() => null) as any, request_id: reqId(r) };
  };
  const who = await call("GET", "/token/session/%3EwhoAmI?fields=companyId,employeeId");
  assertTripletexCompany(conn, who.b?.value?.companyId);
  return { call, employeeId: who.b?.value?.employeeId as number | undefined };
}
export type TtCall = Awaited<ReturnType<typeof openSession>>["call"];
