// Shared Microsoft 365 sender for system-generated mail.
// System mail goes from the shared mailbox (postkontoret) using the app's
// client-credentials grant; credentials come from env, never from code or logs.
// Pilot switch: SYSTEM_SENDER_MODE=postkontoret enables it; anything else keeps
// the legacy personal-mailbox path so production behaviour is unchanged until approved.

declare const Deno: { env: { get(k: string): string | undefined } };

export const SYSTEM_MAILBOX = "postkontoret@mcsservice.no";

export type SendResult =
  | { ok: true; status: number; via: "system" | "personal" }
  | { ok: false; status: number | null; via: "system" | "personal"; reason: string; detail?: string };

let cached: { token: string; exp: number } | null = null;

export function systemSenderEnabled(env: (k: string) => string | undefined = (k) => Deno.env.get(k)): boolean {
  return (env("SYSTEM_SENDER_MODE") ?? "").trim().toLowerCase() === "postkontoret";
}

export async function getAppToken(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const tenant = Deno.env.get("AZURE_TENANT_ID");
  const id = Deno.env.get("AZURE_CLIENT_ID");
  const secret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenant || !id || !secret) return null;
  const res = await fetchImpl(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) return null;
  cached = { token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3000) * 1000 };
  return cached.token;
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string | null;
}

/** Build the Graph sendMail payload. Pure, for tests. */
export function buildMailPayload(m: MailInput) {
  return {
    message: {
      subject: m.subject,
      body: { contentType: "HTML", content: m.html },
      toRecipients: [{ emailAddress: { address: m.to } }],
      ...(m.replyTo ? { replyTo: [{ emailAddress: { address: m.replyTo } }] } : {}),
    },
    saveToSentItems: true,
  };
}

/**
 * Send one message. Graph 202 means "handed over to Microsoft", never "delivered".
 * personalToken is only used when the system sender is disabled.
 */
export async function sendMail(
  m: MailInput,
  opts: { personalToken: string | null; useSystem?: boolean; fetchImpl?: typeof fetch },
): Promise<SendResult> {
  const f = opts.fetchImpl ?? fetch;
  const useSystem = opts.useSystem ?? systemSenderEnabled();
  if (!m.to) return { ok: false, status: null, via: useSystem ? "system" : "personal", reason: "no_email" };
  let token: string | null;
  let url: string;
  if (useSystem) {
    token = await getAppToken(f);
    if (!token) return { ok: false, status: null, via: "system", reason: "system_sender_unavailable" };
    url = `https://graph.microsoft.com/v1.0/users/${SYSTEM_MAILBOX}/sendMail`;
  } else {
    token = opts.personalToken;
    if (!token) return { ok: false, status: null, via: "personal", reason: "sender_no_ms_connection" };
    url = "https://graph.microsoft.com/v1.0/me/sendMail";
  }
  try {
    const res = await f(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildMailPayload(m)),
    });
    if (res.ok) return { ok: true, status: res.status, via: useSystem ? "system" : "personal" };
    const detail = (await res.text()).slice(0, 500);
    return { ok: false, status: res.status, via: useSystem ? "system" : "personal", reason: res.status === 403 ? "graph_forbidden" : "graph_error", detail };
  } catch (e) {
    return { ok: false, status: null, via: useSystem ? "system" : "personal", reason: "network_error", detail: String(e).slice(0, 200) };
  }
}
