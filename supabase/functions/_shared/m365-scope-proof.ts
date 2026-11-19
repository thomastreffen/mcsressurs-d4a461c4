// Pure server-side proof that the central mail app may send ONLY as postkontoret. No I/O, no imports.
// Shared by system-sender-diagnostics (display/test gate) and m365-sender.sendMail (every system send).
// classic       = Entra Mail.Send + ApplicationAccessPolicy, attested by M365_MAILBOX_SCOPE_VERIFIED=true.
// exchange_rbac = Exchange RBAC for Applications, attested by M365_RBAC_ATTESTATION (positive + negative
//                 Test-ServicePrincipalAuthorization). Entra Mail.Send is then expected absent, and ANY unscoped
//                 Entra Mail.*/Calendars.* role in the token unions with RBAC and defeats the scope -> blocked.
export const SYSTEM_MAILBOX = "postkontoret@mcsservice.no";
export const RBAC_ATTESTATION_TTL_DAYS = 90;
export const UNSCOPED_RISK = ["Mail.Send", "Mail.ReadWrite", "Mail.Read", "Mail.ReadBasic", "Mail.ReadBasic.All", "MailboxSettings.ReadWrite", "MailboxSettings.Read", "Calendars.ReadWrite", "Calendars.Read", "Contacts.ReadWrite"];
export interface RbacAttestation { positive_at: string; negative_at: string; mailbox: string; negative_mailbox: string; unscoped_entra_grants: string; tenant_id?: string; app_id?: string }
const DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

export function parseAttestation(raw: string | undefined): { value: RbacAttestation | null; error: string | null } {
  if (!raw?.trim()) return { value: null, error: null };
  try {
    const a = JSON.parse(raw);
    const ok = a && DATE.test(a.positive_at ?? "") && DATE.test(a.negative_at ?? "") && typeof a.mailbox === "string" && typeof a.negative_mailbox === "string" && typeof a.unscoped_entra_grants === "string";
    return ok ? { value: { ...a, mailbox: a.mailbox.trim().toLowerCase(), negative_mailbox: a.negative_mailbox.trim().toLowerCase() }, error: null } : { value: null, error: "invalid" };
  } catch { return { value: null, error: "invalid" }; }
}

export interface TokenFacts { tid: string | null; appId: string | null; roles: string[] }
export type ScopeProof = { ok: true; path: "classic" | "exchange_rbac"; reason?: undefined } | { ok: false; path: "classic" | "exchange_rbac"; reason: string };

export function proveSendScope(env: (k: string) => string | undefined, t: TokenFacts | null, now = Date.now()): ScopeProof {
  const rawAtt = env("M365_RBAC_ATTESTATION")?.trim() ?? "";
  const roles = t?.roles ?? [];
  const path = rawAtt || !roles.includes("Mail.Send") ? "exchange_rbac" : "classic";
  if (!t) return { ok: false, path, reason: "token_unavailable" };
  const tenant = env("AZURE_TENANT_ID")?.trim(), client = env("AZURE_CLIENT_ID")?.trim();
  if (!tenant || !client || t.tid !== tenant || t.appId !== client) return { ok: false, path, reason: "token_identity_mismatch" };
  if (path === "classic") {
    return env("M365_MAILBOX_SCOPE_VERIFIED") === "true" ? { ok: true, path } : { ok: false, path, reason: "classic_scope_not_verified" };
  }
  const { value: a, error } = parseAttestation(rawAtt);
  if (!a) return { ok: false, path, reason: error ? "rbac_attestation_invalid" : "rbac_attestation_missing" };
  const unscoped = roles.filter(r => UNSCOPED_RISK.includes(r));
  if (unscoped.length) return { ok: false, path, reason: "unscoped_entra_grants" };
  if (a.mailbox !== SYSTEM_MAILBOX) return { ok: false, path, reason: "rbac_wrong_sender" };
  if (!a.negative_mailbox || a.negative_mailbox === a.mailbox) return { ok: false, path, reason: "rbac_negative_missing" };
  if (a.unscoped_entra_grants.trim().toLowerCase() !== "none") return { ok: false, path, reason: "rbac_unscoped_not_ruled_out" };
  if ((a.tenant_id && a.tenant_id !== tenant) || (a.app_id && a.app_id !== client)) return { ok: false, path, reason: "rbac_attestation_identity_mismatch" };
  const oldest = Math.min(Date.parse(a.positive_at), Date.parse(a.negative_at));
  if (!Number.isFinite(oldest) || oldest > now + 86_400_000 || now - oldest > RBAC_ATTESTATION_TTL_DAYS * 86_400_000) return { ok: false, path, reason: "rbac_attestation_expired" };
  return { ok: true, path };
}

/** Decode tid/appid/roles from an app token without verifying (Microsoft issued it to us over TLS). */
export function decodeTokenFacts(token: string): TokenFacts | null {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return { tid: p.tid ?? null, appId: p.appid ?? p.azp ?? null, roles: Array.isArray(p.roles) ? p.roles.map(String) : [] };
  } catch { return null; }
}
