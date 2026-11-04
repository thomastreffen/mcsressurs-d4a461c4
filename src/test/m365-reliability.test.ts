// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncOrganizer, type OrganizerLink, type OrganizerStore } from "../../supabase/functions/_shared/organizer-calendar";
import { communicationLight, requiresApproval } from "../../supabase/functions/_shared/communication-policy";
import { sendMail } from "../../supabase/functions/_shared/m365-sender";

const env: Record<string, string> = {};
(globalThis as any).Deno = { env: { get: (key: string) => env[key] } };
beforeEach(() => Object.assign(env, { AZURE_TENANT_ID: "mock", AZURE_CLIENT_ID: "mock", AZURE_CLIENT_SECRET: "mock", SYSTEM_CALENDAR_MODE: "postkontoret", M365_MAILBOX_SCOPE_VERIFIED: "true", M365_PILOT_RECIPIENTS: "rune@example.test,marcus@example.test", SYSTEM_SENDER_MODE: "postkontoret" }));
function fixture() {
  let link: OrganizerLink = { id: "link", transaction_id: "stable-transaction", graph_event_id: null, state: "reserved", updated_at: "revision" };
  const store: OrganizerStore = {
    reserve: async () => ({ ...link }),
    claim: async old => { if (link.state === "uncertain" || old.updated_at !== link.updated_at) return false; link.state = "uncertain"; return true; },
    save: async (_, values) => { link = { ...link, ...values }; },
  };
  const calls: { url: string; method: string; payload: any }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes("/oauth2/")) return Response.json({ access_token: "mock", expires_in: 3600 });
    calls.push({ url: String(url), method: init?.method ?? "GET", payload: init?.body ? JSON.parse(String(init.body)) : null });
    if (init?.method === "DELETE" || init?.method === "PATCH") return new Response(null, { status: 204 });
    return Response.json({ id: "immutable-id", attendees: [{ emailAddress: { address: "rune@example.test" }, status: { response: "accepted" } }] }, { status: 201 });
  }) as unknown as typeof fetch;
  return { store, f, calls, input: { email: "rune@example.test", body: { subject: "Mock meeting" }, store, fetchImpl: f } };
}
describe("Microsoft communication safety", () => {
  it("Rune without a personal token can use the approved system sender", async () => {
    const calls: string[] = [];
    const f = vi.fn(async (url: any) => { if (String(url).includes("/oauth2/")) return Response.json({ access_token: "mock" }); calls.push(String(url)); return new Response(null, { status: 202 }); }) as unknown as typeof fetch;
    expect(await sendMail({ to: "rune@example.test", subject: "Mock", html: "Mock" }, { personalToken: null, fetchImpl: f })).toEqual({ ok: true, status: 202, via: "system" });
    expect(calls[0]).toContain("/users/postkontoret@mcsservice.no/sendMail");
  });
  it("Marcus without valid OAuth can receive organizer invitation without his token", async () => {
    const x = fixture();
    const result = await syncOrganizer({ ...x.input, email: "marcus@example.test", action: "create" });
    expect(result.state).toBe("accepted_by_graph");
    expect(x.calls[0].payload.attendees[0].emailAddress.address).toBe("marcus@example.test");
  });
  it("create retry reads the organizer, never creates a duplicate", async () => {
    const x = fixture();
    await syncOrganizer({ ...x.input, action: "create" });
    await syncOrganizer({ ...x.input, action: "create" });
    expect(x.calls.map(c => c.method)).toEqual(["POST", "GET"]);
    expect(x.calls[0].payload.transactionId).toBe("stable-transaction");
  });
  it("update and delete target the persisted immutable object", async () => {
    const x = fixture();
    await syncOrganizer({ ...x.input, action: "create" });
    await syncOrganizer({ ...x.input, action: "update" });
    const result = await syncOrganizer({ ...x.input, action: "delete" });
    expect(x.calls.map(c => c.method)).toEqual(["POST", "PATCH", "DELETE"]);
    expect(result.signal).toBe("organizer_deleted");
  });
  it("legacy calendar objects never migrate automatically", async () => {
    const x = fixture();
    expect((await syncOrganizer({ ...x.input, legacyId: "individual-id", action: "create" })).status).toBe("legacy");
    expect(x.calls).toHaveLength(0);
  });
  it("unknown POST outcome is never blindly resent", async () => {
    const x = fixture();
    const broken = vi.fn(async () => { throw new Error("timeout"); }) as unknown as typeof fetch;
    expect((await syncOrganizer({ ...x.input, action: "create", fetchImpl: broken })).state).toBe("awaiting");
    expect((await syncOrganizer({ ...x.input, action: "create" })).state).toBe("awaiting");
    expect(x.calls).toHaveLength(0);
  });
  it("pilot restriction blocks real recipients without network calls", async () => {
    const x = fixture();
    expect((await syncOrganizer({ ...x.input, email: "outside@example.test", action: "create" })).status).toBe("pilot_blocked");
    expect(x.calls).toHaveLength(0);
  });
  it("Graph refusing calendar permission stays failed", async () => {
    const x = fixture();
    const denied = vi.fn(async () => new Response("denied", { status: 403 })) as unknown as typeof fetch;
    const result = await syncOrganizer({ ...x.input, action: "create", fetchImpl: denied });
    expect(result.status).toBe("graph_forbidden"); expect(result.state).toBe("failed");
  });
  it("internal informational meetings do not require Hub approval", () => {
    expect(requiresApproval({ entity_type: "internal" }, true)).toBe(false);
    expect(requiresApproval({ entity_type: "job" }, false)).toBe(false);
    expect(requiresApproval({ entity_type: "job" }, true)).toBe(true);
  });
  it("one recipient failure is red despite the other's Graph acceptance", () => {
    expect(communicationLight(["rune", "marcus"], [{ technician_id: "rune", channel: "email", status: "sent" }, { technician_id: "marcus", channel: "email", status: "failed" }])).toBe("red");
  });
  it("missing channel and Graph 202 never give green", () => {
    expect(communicationLight(["rune"], [{ technician_id: "rune", channel: "email", status: "sent" }])).toBe("yellow");
    expect(communicationLight(["rune"], ["email", "calendar"].map(channel => ({ technician_id: "rune", channel, status: "sent", delivery_state: "verified" })))).toBe("yellow");
  });
});