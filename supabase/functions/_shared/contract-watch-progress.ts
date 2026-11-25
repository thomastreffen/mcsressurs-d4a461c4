// Pure helpers for the resumable Avtalevakt historical test (no I/O). Tested in src/test/contract-watch-progress.test.ts.
export const BATCH_THREADS = 12;          // threads per AI call
export const BATCHES_PER_STEP = 3;        // AI calls per HTTP request (≈ 30–50 s each, in parallel)
export const MAX_BATCH_ATTEMPTS = 3;
export const LEASE_SEC = 150;             // one step must finish well inside the edge wall-clock limit
export const AI_TIMEOUT_MS = 90_000;
export const STALE_MIN = 10;              // no heartbeat for this long => run may be marked as timed out

export type ThreadRef = { key: string; ids: { id: string; folder: "inbox" | "sentitems" }[] };

export function planBatches(threads: ThreadRef[], size = BATCH_THREADS): ThreadRef[][] {
  const out: ThreadRef[][] = [];
  for (let i = 0; i < threads.length; i += size) out.push(threads.slice(i, i + size));
  return out;
}

/** Backoff for a failed batch: honour Retry-After (s) when given, else 30 s · 2^(attempt-1), max 10 min. */
export function backoffMs(attempt: number, retryAfterSec?: number | null): number {
  if (retryAfterSec && retryAfterSec > 0) return Math.min(retryAfterSec * 1000, 600_000);
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 600_000);
}

export type AiFailure = { halt: boolean; code: string; retryAfter?: number };
/** Circuit breaker: credits/permission/config problems stop the whole run; other errors retry the batch with backoff. */
export function classifyAiError(e: unknown): AiFailure {
  const name = (e as { name?: string })?.name ?? "";
  const retryAfter = (e as { retryAfter?: number })?.retryAfter;
  if (name === "PaymentRequiredError") return { halt: true, code: "ai_credits" };
  if (name === "PermissionDeniedError") return { halt: true, code: "ai_denied" };
  if (name === "ConfigurationError" || name === "AuthenticationError") return { halt: true, code: "ai_not_configured" };
  if (name === "RequestRejectedError") return { halt: true, code: "ai_rejected" };
  if (name === "RateLimitError") return { halt: false, code: "ai_rate_limited", retryAfter };
  if (name === "TimeoutError" || name === "AbortError" || name === "CancelledError") return { halt: false, code: "ai_timeout" };
  return { halt: false, code: "ai_batch_error" };
}

/** A running run is stale when neither heartbeat nor start time moved for STALE_MIN and no lease is held. */
export function isStale(r: { status: string; started_at: string; heartbeat_at?: string | null; lease_until?: string | null }, now = Date.now()): boolean {
  if (r.status !== "running") return false;
  if (r.lease_until && Date.parse(r.lease_until) > now) return false;
  const last = Date.parse(r.heartbeat_at ?? r.started_at);
  return now - last > STALE_MIN * 60_000;
}

export function mergeCounts(a: Record<string, number> | null | undefined, b: Record<string, number>): Record<string, number> {
  const o = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) o[k] = (o[k] ?? 0) + v;
  return o;
}

/** Final status once no batch is pending. */
export function finalStatus(total: number, done: number, failed: number): { status: "done" | "failed"; code: string | null } {
  if (total > 0 && done === 0 && failed > 0) return { status: "failed", code: "ai_failed" };
  if (failed > 0) return { status: "done", code: "partial_ai_failures" };
  return { status: "done", code: null };
}

/** Every status the scan function writes. Must match contract_watch_scan_runs_status_check (migration 0135). */
export const RUN_STATUSES = ["running", "done", "failed", "blocked", "timeout"] as const;

type RunLike = { status: string; started_at: string; heartbeat_at?: string | null; lease_until?: string | null };

/** Seconds until a running run becomes stale (0 when already stale). Legacy runs without heartbeat/lease use started_at. */
export function staleInSec(r: RunLike, now = Date.now()): number {
  const leaseEnd = r.lease_until ? Date.parse(r.lease_until) : NaN;
  const last = Date.parse(r.heartbeat_at ?? r.started_at);
  const staleAt = Math.max(last + STALE_MIN * 60_000, Number.isFinite(leaseEnd) ? leaseEnd : -Infinity);
  return Math.max(0, Math.ceil((staleAt - now) / 1000));
}

export type MarkTimeoutDecision = { ok: true } | { ok: false; code: "not_running" | "not_stale" | "invalid_timestamps"; http: number; retry_after_sec?: number };
/** Server-side decision for mark_timeout; the UI's stale flag is display only. */
export function decideMarkTimeout(r: RunLike, now = Date.now()): MarkTimeoutDecision {
  if (r.status !== "running") return { ok: false, code: "not_running", http: 409 };
  if (!Number.isFinite(Date.parse(r.heartbeat_at ?? r.started_at))) return { ok: false, code: "invalid_timestamps", http: 422 };
  if (!isStale(r, now)) return { ok: false, code: "not_stale", http: 409, retry_after_sec: Math.max(1, staleInSec(r, now)) };
  return { ok: true };
}

/** Classify an empty/failed guarded UPDATE so a DB error is never reported as "not stale". */
export function classifyTimeoutUpdate(res: { error?: { code?: string; message?: string } | null; rows: number; currentStatus?: string | null }):
  { ok: true } | { ok: false; code: "timeout_update_failed" | "already_finished" | "timeout_update_conflict"; http: number; detail?: string } {
  if (res.error) return { ok: false, code: "timeout_update_failed", http: 500, detail: `${res.error.code ?? "db_error"}: ${res.error.message ?? ""}`.slice(0, 300) };
  if (res.rows > 0) return { ok: true };
  if (res.currentStatus && res.currentStatus !== "running") return { ok: false, code: "already_finished", http: 409 };
  return { ok: false, code: "timeout_update_conflict", http: 409 };
}
