/**
 * Fail-closed display for Outlook-imported schedule blocks.
 * An Outlook block is shown as a job only when its link is trusted: an explicit human
 * decision (confirmed/manual) or the Hub-written MCS_BLOCK_ID key. Anything else
 * (fuzzy/AI "needs_confirmation", stale project_id on "external") renders as the
 * Outlook original – or "Opptatt" when private – and never as a project.
 */
export interface OutlookBlockLike {
  source?: string | null;
  project_id?: string | null;
  match_state?: string | null;
  match_reason?: string | null;
  outlook_subject?: string | null;
  is_private?: boolean | null;
  title?: string | null;
}

export function isTrustedOutlookLink(b: OutlookBlockLike): boolean {
  if (b.source !== "outlook") return true;
  if (!b.project_id) return false;
  if (b.match_state === "confirmed" || b.match_state === "manual") return true;
  return b.match_state === "auto" && (b.match_reason || "").startsWith("MCS_BLOCK_ID");
}

export function outlookOriginalTitle(b: OutlookBlockLike): string {
  if (b.is_private) return "Opptatt";
  return (b.outlook_subject || "").trim() || "Opptatt";
}

/** Returns the safe project link + title to render. */
export function safeOutlookBlockView<T extends OutlookBlockLike>(b: T): { project_id: string | null; title: string; untrustedProjectId: string | null } {
  if (b.source !== "outlook") return { project_id: b.project_id ?? null, title: b.title || "", untrustedProjectId: null };
  if (isTrustedOutlookLink(b)) return { project_id: b.project_id ?? null, title: b.is_private ? "Opptatt" : (b.title || outlookOriginalTitle(b)), untrustedProjectId: null };
  return { project_id: null, title: outlookOriginalTitle(b), untrustedProjectId: b.project_id ?? null };
}

/** Legacy all-day rows were stored as UTC midnight (= 01:00 Oslo). Normalise to local midnight of that calendar date. */
export function normaliseAllDay(d: Date): Date {
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return d;
}
