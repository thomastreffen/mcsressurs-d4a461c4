import { describe, it, expect, vi, afterEach } from "vitest";
import { proveSendScope } from "../../supabase/functions/_shared/m365-scope-proof";
const NOW = Date.parse("2026-11-20T00:00:00Z");
const att = (o: Record<string, string> = {}) => JSON.stringify({ positive_at: "2026-11-19", negative_at: "2026-11-19", mailbox: "postkontoret@mcsservice.no", negative_mailbox: "thomas.treffen@mcsservice.no", unscoped_entra_grants: "none", ...o });
const envOf = (e: Record<string, string>) => (k: string) => ({ AZURE_TENANT_ID: "t", AZURE_CLIENT_ID: "mail", ...e } as Record<string, string>)[k];
const t = (roles: string[], tid = "t", appId = "mail") => ({ tid, appId, roles });
describe("send-time scope proof", () => {
  it("classic: Entra Mail.Send + verified flag ok; without flag blocked", () => {
    expect(proveSendScope(envOf({ M365_MAILBOX_SCOPE_VERIFIED: "true" }), t(["Mail.Send"]), NOW)).toEqual({ ok: true, path: "classic" });
    expect(proveSendScope(envOf({}), t(["Mail.Send"]), NOW).ok).toBe(false);
  });
  it("flag alone never proves RBAC scope (no Mail.Send, no attestation)", () => {
    expect(proveSendScope(envOf({ M365_MAILBOX_SCOPE_VERIFIED: "true" }), t([]), NOW)).toMatchObject({ ok: false, reason: "rbac_attestation_missing" });
  });
  it("RBAC good", () => { expect(proveSendScope(envOf({ M365_RBAC_ATTESTATION: att() }), t([]), NOW)).toEqual({ ok: true, path: "exchange_rbac" }); });
  it.each([
    [{ M365_RBAC_ATTESTATION: att({ mailbox: "thomas.treffen@mcsservice.no" }) }, t([]), "rbac_wrong_sender"],
    [{ M365_RBAC_ATTESTATION: att({ negative_mailbox: "postkontoret@mcsservice.no" }) }, t([]), "rbac_negative_missing"],
    [{ M365_RBAC_ATTESTATION: att({ unscoped_entra_grants: "unknown" }) }, t([]), "rbac_unscoped_not_ruled_out"],
    [{ M365_RBAC_ATTESTATION: att({ positive_at: "2026-01-01" }) }, t([]), "rbac_attestation_expired"],
    [{ M365_RBAC_ATTESTATION: att({ app_id: "other" }) }, t([]), "rbac_attestation_identity_mismatch"],
    [{ M365_RBAC_ATTESTATION: "{bad" }, t([]), "rbac_attestation_invalid"],
    [{ M365_RBAC_ATTESTATION: att() }, t(["Calendars.ReadWrite", "Mail.ReadWrite"]), "unscoped_entra_grants"],
    [{ M365_RBAC_ATTESTATION: att(), M365_MAILBOX_SCOPE_VERIFIED: "true" }, t(["Mail.Send"]), "unscoped_entra_grants"],
    [{ M365_RBAC_ATTESTATION: att() }, t([], "other"), "token_identity_mismatch"],
  ])("RBAC bad %#", (e, tok, reason) => { expect(proveSendScope(envOf(e), tok, NOW)).toMatchObject({ ok: false, reason }); });
});
describe("sendMail system path", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  const jwt = (p: object) => `x.${btoa(JSON.stringify(p)).replace(/=+$/, "")}.y`;
  async function run(env: Record<string, string>, roles: string[]) {
    const all = { AZURE_TENANT_ID: "t", AZURE_CLIENT_ID: "mail", AZURE_CLIENT_SECRET: "s", M365_PILOT_RECIPIENTS: "thomas.treffen@mcsservice.no", ...env } as Record<string, string>;
    vi.stubGlobal("Deno", { env: { get: (k: string) => all[k] } });
    const { sendMail } = await import("../../supabase/functions/_shared/m365-sender");
    const calls: string[] = [];
    const f = vi.fn(async (url: string) => { calls.push(url); return url.includes("login.") ? new Response(JSON.stringify({ access_token: jwt({ tid: "t", appid: "mail", roles }), expires_in: 3600 })) : new Response("", { status: 202 }); }) as unknown as typeof fetch;
    const r = await sendMail({ to: "thomas.treffen@mcsservice.no", subject: "s", html: "h" }, { personalToken: "PERSONAL", useSystem: true, fetchImpl: f });
    return { r, graphCalls: calls.filter(u => u.includes("graph.microsoft.com")) };
  }
  it("RBAC without attestation: blocked before any Graph call, no personal fallback", async () => {
    const { r, graphCalls } = await run({ M365_MAILBOX_SCOPE_VERIFIED: "true" }, []);
    expect(r).toMatchObject({ ok: false, via: "system", reason: "scope_not_proven", detail: "rbac_attestation_missing" });
    expect(graphCalls).toEqual([]);
  });
  it("unscoped grants with attestation: blocked", async () => {
    const { r, graphCalls } = await run({ M365_RBAC_ATTESTATION: att() }, ["Calendars.ReadWrite"]);
    expect(r).toMatchObject({ ok: false, detail: "unscoped_entra_grants" });
    expect(graphCalls).toEqual([]);
  });
  it("non-pilot recipient blocked", async () => {
    const { r } = await run({ M365_RBAC_ATTESTATION: att(), M365_PILOT_RECIPIENTS: "a@x.no" }, []);
    expect(r).toMatchObject({ ok: false, reason: "pilot_blocked" });
  });
});
