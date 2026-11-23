import { PILOT_MAILBOX } from "./contract-watch-core.ts";

// Deliberately false until the AI consumer, owner-only bell and live E2E commissioning are implemented.
export const MONITOR_RELEASE_READY = false;
export const PAGE_SIZE = 25;
export const MAX_PAGES_PER_FOLDER = 2;
export const MONITOR_COMPANY = "a0000000-0000-0000-0000-000000000001";
export type Folder = "inbox" | "sentitems";
const GRAPH = "https://graph.microsoft.com/v1.0";

export interface MonitorHealth {
  auto_enabled: boolean; commissioned: boolean; baseline_ok: boolean; implementation_ready: boolean;
  last_ok_at: string | null; last_attempt_at: string | null; last_error: string | null;
  paused_reason: string | null; retry_at: string | null; pending: number;
}
export function healthState(h: MonitorHealth, now = Date.now()): "off" | "blocked" | "unverified" | "error" | "stale" | "ok" {
  if (!h.auto_enabled) return "off";
  if (h.paused_reason || !h.commissioned || !h.baseline_ok || !h.implementation_ready) return "blocked";
  if (h.last_error) return "error";
  if (!h.last_ok_at || !Number.isFinite(Date.parse(h.last_ok_at))) return "unverified";
  return now - Date.parse(h.last_ok_at) > 45 * 60_000 ? "stale" : "ok";
}
export function retryPolicy(status: number, failures: number, retryAfter: string | null, now = Date.now()) {
  if ([402, 403, 401, 410].includes(status)) return { pause: status === 410 ? "cursor_expired" : `access_${status}`, retryAt: null };
  if (status === 429 && failures >= 3) return { pause: "repeated_throttle", retryAt: null };
  const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 0;
  const at = retryAfter && !seconds ? Date.parse(retryAfter) : NaN;
  const delay = Math.max(900_000, Math.min(86_400_000, 2 ** Math.min(failures, 6) * 900_000), seconds * 1000, Number.isFinite(at) ? at - now : 0);
  return { pause: null, retryAt: new Date(now + delay).toISOString() };
}

/** Refuse off-origin, other mailbox/folder, credentials, redirects and non-delta cursors. */
export function safeDeltaUrl(raw: string, folderId: string): string {
  const url = new URL(raw);
  if (url.origin !== "https://graph.microsoft.com" || url.username || url.password || url.hash) throw new Error("foreign_cursor");
  const path = decodeURIComponent(url.pathname);
  const users = [`/v1.0/users/${PILOT_MAILBOX}`, `/v1.0/users('${PILOT_MAILBOX}')`];
  const paths = users.flatMap((u) => [`${u}/mailFolders/${folderId}/messages/delta`, `${u}/mailFolders('${folderId}')/messages/delta`]);
  if (!paths.includes(path)) throw new Error("foreign_cursor");
  return url.href;
}
export function initialDeltaUrl(folderId: string, since: string): string {
  if (!folderId || !Number.isFinite(Date.parse(since))) throw new Error("invalid_initial_cursor");
  const url = new URL(`${GRAPH}/users/${encodeURIComponent(PILOT_MAILBOX)}/mailFolders/${encodeURIComponent(folderId)}/messages/delta`);
  // Graph message delta supports receivedDateTime filtering, also in Sent Items.
  url.searchParams.set("$filter", `receivedDateTime ge ${new Date(since).toISOString()}`);
  url.searchParams.set("$select", "id,conversationId,internetMessageId,receivedDateTime,sentDateTime,isDraft");
  url.searchParams.set("$top", String(PAGE_SIZE));
  return url.href;
}
export interface GraphDeltaMessage { id: string; conversationId?: string; internetMessageId?: string; receivedDateTime?: string; sentDateTime?: string; isDraft?: boolean; "@removed"?: unknown }
export interface QueueMessage { graph_id: string; message_key: string; conversation_id: string | null; message_at: string | null; removed: boolean }
export interface DeltaPage { value: GraphDeltaMessage[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string }
export interface IntakePorts {
  allowed: () => Promise<boolean>;
  get: (url: string) => Promise<DeltaPage>;
  commit: (expected: string | null, next: string, rows: QueueMessage[]) => Promise<void>;
}
/** Cursor and item progress must commit in ONE fenced DB transaction. Never replay inference here. */
export async function ingestFolder(folder: Folder, folderId: string, cursor: string | null, since: string, ports: IntakePorts) {
  let current = cursor; let pages = 0; let count = 0;
  while (pages < MAX_PAGES_PER_FOLDER) {
    if (!await ports.allowed()) throw new Error("monitor_stopped");
    const page = await ports.get(safeDeltaUrl(current ?? initialDeltaUrl(folderId, since), folderId));
    if (!Array.isArray(page.value) || page.value.length > PAGE_SIZE) throw new Error("invalid_delta_page");
    const next = page["@odata.nextLink"] ?? page["@odata.deltaLink"];
    if (!next) throw new Error("missing_delta_cursor");
    safeDeltaUrl(next, folderId);
    const rows: QueueMessage[] = [];
    for (const m of page.value) {
      if (!m || typeof m.id !== "string" || !m.id || m.id.length > 2048) throw new Error("invalid_message_id");
      if (m.isDraft) continue;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(m.internetMessageId || m.id));
      const at = folder === "sentitems" ? m.sentDateTime ?? m.receivedDateTime : m.receivedDateTime;
      // Ignore initial historical entries even if Graph returns extras; never process a new full history.
      if (!m["@removed"] && (!at || !Number.isFinite(Date.parse(at)) || Date.parse(at) < Date.parse(since))) continue;
      rows.push({ graph_id: m.id, message_key: Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join(""), conversation_id: m.conversationId?.slice(0, 2048) ?? null, message_at: at && Number.isFinite(Date.parse(at)) ? at : null, removed: !!m["@removed"] });
    }
    if (!await ports.allowed()) throw new Error("monitor_stopped");
    await ports.commit(current, next, rows);
    count += rows.length; pages++; current = next;
    if (!page["@odata.nextLink"]) return { pages, count, caughtUp: true };
  }
  return { pages, count, caughtUp: false };
}

// Used by the future AI consumer: sending a reply is evidence of a reply, not evidence of resolution.
export function nextThreadState(previous: string, event: "sent_reply" | "received_action" | "explicit_resolution" | "information") {
  if (event === "explicit_resolution") return "handled";
  if (event === "received_action") return "awaiting_me";
  if (event === "sent_reply") return previous === "handled" ? "handled" : "awaiting_other";
  return previous;
}
export function mayBell(p: { enabled: boolean; isTest: boolean; priority: string; owner: string; recipient: string; status: string }) {
  return p.enabled && !p.isTest && p.priority === "high" && !!p.owner && p.owner === p.recipient && ["awaiting_me", "action_required"].includes(p.status);
}