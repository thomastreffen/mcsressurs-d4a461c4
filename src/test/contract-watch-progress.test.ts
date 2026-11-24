import { describe, it, expect } from "vitest";
import { planBatches, backoffMs, classifyAiError, isStale, mergeCounts, finalStatus } from "../../supabase/functions/_shared/contract-watch-progress";

const ref = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `t${i}`, ids: [{ id: `m${i}`, folder: "inbox" as const }] }));
const NOW = Date.parse("2026-11-24T08:00:00Z");

describe("resumable historical test", () => {
  it("splits 300 threads into 25 batches of 12, none lost", () => {
    const b = planBatches(ref(300));
    expect(b.length).toBe(25);
    expect(b.flat().length).toBe(300);
  });
  it("backs off 30s, 60s, 120s and honours Retry-After", () => {
    expect([1, 2, 3].map((a) => backoffMs(a))).toEqual([30000, 60000, 120000]);
    expect(backoffMs(1, 45)).toBe(45000);
  });
  it("halts the run on credits/permission errors, retries on rate limit/timeout", () => {
    expect(classifyAiError({ name: "PaymentRequiredError" })).toEqual({ halt: true, code: "ai_credits" });
    expect(classifyAiError({ name: "PermissionDeniedError" }).halt).toBe(true);
    expect(classifyAiError({ name: "RateLimitError", retryAfter: 20 })).toEqual({ halt: false, code: "ai_rate_limited", retryAfter: 20 });
    expect(classifyAiError({ name: "TimeoutError" }).halt).toBe(false);
  });
  it("the stuck 07:29:47 run without heartbeat is stale; a fresh or leased run is not", () => {
    expect(isStale({ status: "running", started_at: "2026-11-24T07:29:47Z", heartbeat_at: null }, NOW)).toBe(true);
    expect(isStale({ status: "running", started_at: "2026-11-24T07:29:47Z", heartbeat_at: "2026-11-24T07:55:00Z" }, NOW)).toBe(false);
    expect(isStale({ status: "running", started_at: "2026-11-24T07:00:00Z", lease_until: "2026-11-24T08:01:00Z" }, NOW)).toBe(false);
    expect(isStale({ status: "done", started_at: "2026-11-24T07:00:00Z" }, NOW)).toBe(false);
  });
  it("merges step counters additively", () => {
    expect(mergeCounts({ stored: 3, a: 1 }, { stored: 2, b: 4 })).toEqual({ stored: 5, a: 1, b: 4 });
  });
  it("final status: all failed = failed, some failed = done with warning", () => {
    expect(finalStatus(25, 0, 25)).toEqual({ status: "failed", code: "ai_failed" });
    expect(finalStatus(25, 24, 1)).toEqual({ status: "done", code: "partial_ai_failures" });
    expect(finalStatus(25, 25, 0)).toEqual({ status: "done", code: null });
  });
});
