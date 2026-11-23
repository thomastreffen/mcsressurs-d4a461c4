// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { healthState, retryPolicy, ingestFolder, initialDeltaUrl, safeDeltaUrl, nextThreadState, mayBell, MONITOR_RELEASE_READY, type MonitorHealth, type DeltaPage } from "../../supabase/functions/_shared/contract-watch-monitor";
vi.stubGlobal("crypto", webcrypto);
const since = "2026-11-23T12:25:00Z";
const cursor = (folder = "inbox-id", token = "one") => `https://graph.microsoft.com/v1.0/users/thomas.treffen%40mcsservice.no/mailFolders/${folder}/messages/delta?$deltatoken=${token}`;
const health: MonitorHealth = { auto_enabled: true, commissioned: true, implementation_ready: true, baseline_ok: true, last_ok_at: null, last_attempt_at: null, last_error: null, paused_reason: null, retry_at: null, pending: 0 };

describe("Separate incremental intake (mock Graph only)", () => {
  it("production release stays blocked", () => expect(MONITOR_RELEASE_READY).toBe(false));
  it("metadata selection never requests body, attachments or recipients", () => {
    const url = new URL(initialDeltaUrl("inbox-id", since));
    expect(url.searchParams.get("$select")).toBe("id,conversationId,internetMessageId,receivedDateTime,sentDateTime,isDraft");
    expect(url.searchParams.get("$top")).toBe("25");
    expect(url.searchParams.get("$filter")).toBe("receivedDateTime ge 2026-11-23T12:25:00.000Z");
  });
  it("only Thomas and the exact folder on Graph are allowed", () => {
    expect(safeDeltaUrl(cursor(), "inbox-id")).toBe(cursor());
    for (const u of [cursor().replace("thomas.treffen", "rune.orbeck"), cursor("sent-id"), cursor().replace("graph.microsoft.com", "example.com"), cursor().replace("messages/delta", "messages")]) expect(() => safeDeltaUrl(u, "inbox-id")).toThrow("foreign_cursor");
  });
  it("commits items and cursor together; keeps internal/external IDs without content", async () => {
    const commit = vi.fn(); const get = vi.fn(async () => ({ value: [{ id: "m1", internetMessageId: "same", conversationId: "thread1", receivedDateTime: "2026-11-23T13:00:00Z" }], "@odata.deltaLink": cursor() }));
    const result = await ingestFolder("inbox", "inbox-id", null, since, { allowed: async () => true, get, commit });
    expect(result).toEqual({ pages: 1, count: 1, caughtUp: true });
    expect(commit.mock.calls[0][0]).toBeNull(); expect(commit.mock.calls[0][1]).toBe(cursor());
    expect(Object.keys(commit.mock.calls[0][2][0]).sort()).toEqual(["conversation_id", "graph_id", "message_at", "message_key", "removed"]);
  });
  it("empty delta advances cursor without starting a full scan", async () => {
    const commit = vi.fn(); const get = vi.fn(async () => ({ value: [], "@odata.deltaLink": cursor("inbox-id", "two") }));
    await ingestFolder("inbox", "inbox-id", cursor(), since, { allowed: async () => true, get, commit });
    expect(get).toHaveBeenCalledTimes(1); expect(get.mock.calls[0]).toEqual([cursor()]); expect(commit).toHaveBeenCalledWith(cursor(), cursor("inbox-id", "two"), []);
  });
  it("does not consume a cursor when storage fails", async () => {
    const get = vi.fn(async () => ({ value: [], "@odata.nextLink": cursor() }));
    await expect(ingestFolder("inbox", "inbox-id", null, since, { allowed: async () => true, get, commit: async () => { throw new Error("storage_failed"); } })).rejects.toThrow("storage_failed");
    expect(get).toHaveBeenCalledTimes(1);
  });
  it("caps each invocation at two pages per folder", async () => {
    const get = vi.fn(async () => ({ value: [], "@odata.nextLink": cursor() }));
    expect(await ingestFolder("inbox", "inbox-id", null, since, { allowed: async () => true, get, commit: vi.fn() })).toEqual({ pages: 2, count: 0, caughtUp: false });
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("revocation after GET prevents persistence and the next page", async () => {
    const allowed = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false); const commit = vi.fn();
    await expect(ingestFolder("inbox", "inbox-id", null, since, { allowed, get: async () => ({ value: [], "@odata.deltaLink": cursor() }), commit })).rejects.toThrow("monitor_stopped");
    expect(commit).not.toHaveBeenCalled();
  });
  it("skips old mail and drafts; tombstones stay removal-only", async () => {
    const commit = vi.fn();
    const page: DeltaPage = { value: [{ id: "old", receivedDateTime: "2026-11-01T10:00:00Z" }, { id: "draft", isDraft: true }, { id: "removed", "@removed": {} }], "@odata.deltaLink": cursor() };
    await ingestFolder("inbox", "inbox-id", null, since, { allowed: async () => true, get: async () => page, commit });
    expect(commit.mock.calls[0][2]).toHaveLength(1); expect(commit.mock.calls[0][2][0].removed).toBe(true);
  });
  it("same message in Sent and Inbox shares one persistent dedupe key", async () => {
    const commit = vi.fn(); const value = [{ id: "immutable-id", internetMessageId: "<same@id>", receivedDateTime: "2026-11-23T13:00:00Z", sentDateTime: "2026-11-23T13:00:00Z" }];
    for (const folder of ["inbox", "sentitems"] as const) await ingestFolder(folder, "inbox-id", null, since, { allowed: async () => true, get: async () => ({ value, "@odata.deltaLink": cursor() }), commit });
    expect(commit.mock.calls[0][2][0].message_key).toBe(commit.mock.calls[1][2][0].message_key);
  });
});
describe("Health, backoff and no false closure", () => {
  it("no successful test/sync is never healthy", () => { expect(healthState(health)).toBe("unverified"); expect(healthState({ ...health, auto_enabled: false })).toBe("off"); expect(healthState({ ...health, baseline_ok: false })).toBe("blocked"); });
  it("lost sync after 45 minutes is visible", () => { const now = Date.parse(since); expect(healthState({ ...health, last_ok_at: new Date(now - 46 * 60000).toISOString() }, now)).toBe("stale"); expect(healthState({ ...health, last_ok_at: since }, now)).toBe("ok"); });
  it("403/402 and expired delta stop; throttling honors Retry-After without tight retries", () => {
    expect(retryPolicy(403, 1, null).pause).toBe("access_403"); expect(retryPolicy(402, 1, null).pause).toBe("access_402"); expect(retryPolicy(410, 1, null).pause).toBe("cursor_expired");
    expect(retryPolicy(429, 3, null).pause).toBe("repeated_throttle");
    expect(retryPolicy(429, 0, "3600", Date.parse(since)).retryAt).toBe("2026-11-23T13:25:00.000Z");
  });
  it("a sent reply does not close an action and a new reminder reopens it", () => { expect(nextThreadState("awaiting_me", "sent_reply")).toBe("awaiting_other"); expect(nextThreadState("handled", "received_action")).toBe("awaiting_me"); expect(nextThreadState("awaiting_me", "explicit_resolution")).toBe("handled"); });
  it("only HIGH real items may notify exactly the owner in Hub", () => {
    const p = { enabled: true, isTest: false, priority: "high", owner: "Thomas", recipient: "Thomas", status: "awaiting_me" };
    expect(mayBell(p)).toBe(true); expect(mayBell({ ...p, recipient: "Rune" })).toBe(false); expect(mayBell({ ...p, isTest: true })).toBe(false); expect(mayBell({ ...p, enabled: false })).toBe(false); expect(mayBell({ ...p, priority: "normal" })).toBe(false);
  });
});