import { missingSecrets } from "./hub-calendar-diagnostics-core.ts";

type Env = (name: string) => string | undefined;
/** Shared metadata-only probe. Never consumes Graph response content or follows redirects. */
export async function probeCalendarMailbox(mailbox: string, env: Env, transport: typeof fetch = fetch) {
  const value = (name: string) => env(name)?.trim() ?? "";
  const base = { mailbox, read_only: true, writes_enabled: false, endpoint: "GET /v1.0/users/{mailbox}/calendar?$select=id" };
  if (missingSecrets(env).length) return { ...base, pass: false, step: "configuration", reason: "not_configured" };
  try {
    const tenant = value("HUB_CALENDAR_TENANT_ID"), app = value("HUB_CALENDAR_CLIENT_ID");
    const tok = await transport(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
      method: "POST", signal: AbortSignal.timeout(15000), redirect: "error",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: app, client_secret: value("HUB_CALENDAR_CLIENT_SECRET"), grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
    });
    if (!tok.ok) { await tok.body?.cancel(); return { ...base, pass: false, step: "token", http: tok.status }; }
    const token = (await tok.json()).access_token;
    if (typeof token !== "string") return { ...base, pass: false, step: "token", reason: "token_missing" };
    const part = token.split(".")[1] ?? "";
    const facts = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    const identity = { tid_match: facts.tid === tenant, appid_match: (facts.appid ?? facts.azp) === app,
      app_id: app, tenant_id: tenant, separate_calendar_app: !!value("AZURE_CLIENT_ID") && app !== value("AZURE_CLIENT_ID") };
    const roles: string[] = Array.isArray(facts.roles) ? facts.roles : [];
    if (!identity.tid_match || !identity.appid_match || !identity.separate_calendar_app || roles.some(r => !["Calendars.Read", "Calendars.ReadWrite"].includes(r)))
      return { ...base, ...identity, pass: false, step: "identity", reason: "calendar_identity_unverified" };
    const requestId = crypto.randomUUID();
    const res = await transport(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/calendar?$select=id`, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, "client-request-id": requestId },
    });
    await res.body?.cancel(); // Even error bodies are private/untrusted; report only status.
    return { ...base, ...identity, pass: res.status === 200, step: "calendar_get", http: res.status,
      mailbox_match: true, request_id: res.headers.get("request-id"), client_request_id: requestId };
  } catch { return { ...base, pass: false, step: "read", reason: "calendar_read_failed" }; }
}