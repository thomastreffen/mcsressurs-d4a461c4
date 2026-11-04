import { describe, it, expect, vi, beforeEach } from "vitest";

const env: Record<string, string> = { AZURE_TENANT_ID: "t", AZURE_CLIENT_ID: "c", AZURE_CLIENT_SECRET: "s" };
(globalThis as any).Deno = { env: { get: (k: string) => env[k] } };

const mod = await import("../../supabase/functions/_shared/m365-sender");
const { sendMail, buildMailPayload, systemSenderEnabled, SYSTEM_MAILBOX } = mod;

function fakeGraph(sendStatus = 202) {
  const calls: { url: string; body: any; auth: string }[] = [];
  const f = vi.fn(async (url: string, init: any) => {
    if (url.includes("/oauth2/")) return new Response(JSON.stringify({ access_token: "APP", expires_in: 3600 }));
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    return new Response(sendStatus === 202 ? null : "denied", { status: sendStatus });
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe("shared Microsoft sender", () => {
  beforeEach(() => { delete env.SYSTEM_SENDER_MODE; });

  it("stays on the legacy path until the pilot switch is set", () => {
    expect(systemSenderEnabled()).toBe(false);
    env.SYSTEM_SENDER_MODE = "postkontoret";
    expect(systemSenderEnabled()).toBe(true);
  });

  it("system mode always sends from postkontoret, even when the creator has no Microsoft connection", async () => {
    const g = fakeGraph();
    const r = await sendMail({ to: "mats@mcsservice.no", subject: "Jobb", html: "<p>x</p>", replyTo: "rune@mcsservice.no" },
      { personalToken: null, useSystem: true, fetchImpl: g.f });
    expect(r.ok).toBe(true);
    expect(g.calls[0].url).toBe(`https://graph.microsoft.com/v1.0/users/${SYSTEM_MAILBOX}/sendMail`);
    expect(g.calls[0].body.message.replyTo[0].emailAddress.address).toBe("rune@mcsservice.no");
  });

  it("202 is reported as handed over (status 202), not as delivered", async () => {
    const g = fakeGraph(202);
    const r = await sendMail({ to: "a@b.no", subject: "s", html: "h" }, { personalToken: null, useSystem: true, fetchImpl: g.f });
    expect(r).toEqual({ ok: true, status: 202, via: "system" });
  });

  it("legacy mode without creator connection fails loudly instead of skipping", async () => {
    const g = fakeGraph();
    const r = await sendMail({ to: "a@b.no", subject: "s", html: "h" }, { personalToken: null, useSystem: false, fetchImpl: g.f });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).reason).toBe("sender_no_ms_connection");
    expect(g.calls.length).toBe(0);
  });

  it("missing recipient email is a failure with reason, never a silent skip", async () => {
    const r = await sendMail({ to: "", subject: "s", html: "h" }, { personalToken: "x", useSystem: false, fetchImpl: fakeGraph().f });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).reason).toBe("no_email");
  });

  it("Microsoft refusing permission is reported as graph_forbidden", async () => {
    const r = await sendMail({ to: "a@b.no", subject: "s", html: "h" }, { personalToken: null, useSystem: true, fetchImpl: fakeGraph(403).f });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect((r as any).reason).toBe("graph_forbidden"); expect(r.status).toBe(403); }
  });

  it("payload has one recipient and no reply-to when none given", () => {
    const p = buildMailPayload({ to: "a@b.no", subject: "s", html: "h" });
    expect(p.message.toRecipients).toHaveLength(1);
    expect("replyTo" in p.message).toBe(false);
  });
});
