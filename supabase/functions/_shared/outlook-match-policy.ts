// Fail-closed policy for linking imported Outlook appointments to Hub jobs.
// Pure (no I/O) so it is shared by outlook-schedule-sync, ai-project-matcher and tests.
//
// Rules:
//  - Only a deterministic Hub key (MCS_BLOCK_ID written by Hub into the Outlook body)
//    or an explicit human confirmation may set schedule_blocks.project_id.
//  - Fuzzy text / affinity / AI only ever produce a *suggestion* (suggested_project_id).
//  - Private, all-day and leisure/absence subjects ("FRI", ferie, fritid, …) never get
//    a suggestion at all.
//  - The display title is never rewritten to a project title unless the link is trusted.

export type MatchState = "auto" | "needs_confirmation" | "external" | "confirmed" | "manual" | "external_confirmed";

const LEISURE_TOKENS = new Set([
  "fri", "fridag", "fri dag", "ferie", "fritid", "permisjon", "perm", "avspasering", "avsp",
  "syk", "sykdom", "sykemelding", "egenmelding", "lege", "tannlege", "privat", "personlig",
  "helg", "juleferie", "påskeferie", "sommerferie", "vinterferie", "høstferie", "foreldrepermisjon",
  "velferd", "velferdspermisjon", "oof", "out of office", "vacation", "holiday", "off", "day off",
]);

function norm(s: string): string {
  return s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** True when the subject describes absence/leisure, e.g. "FRI", "Fri - tannlege", "Ferie uke 47". */
export function isLeisureSubject(subject?: string | null): boolean {
  const n = norm(subject || "");
  if (!n) return false;
  if (LEISURE_TOKENS.has(n)) return true;
  const words = n.split(" ");
  // Leading word decides ("Fri", "Ferie Spania") – avoids flagging "Frigoscandia".
  if (LEISURE_TOKENS.has(words[0])) return true;
  if (words.length >= 2 && LEISURE_TOKENS.has(`${words[0]} ${words[1]}`)) return true;
  return false;
}

/** Whole-word token match: "fri" never matches inside "frigoscandia". */
export function tokens(s?: string | null): string[] {
  return norm(s || "").split(" ").filter((w) => w.length > 2);
}

export function wholeWordIncludes(haystack: string, needle: string): boolean {
  const h = ` ${norm(haystack)} `;
  const n = norm(needle);
  if (!n) return false;
  return h.includes(` ${n} `);
}

export interface SuggestionEligibilityInput {
  subject?: string | null;
  isPrivate?: boolean;
  isAllDay?: boolean;
  showAs?: string | null;
}

/** Whether we may even *suggest* a project for this appointment. */
export function maySuggestProject(i: SuggestionEligibilityInput): boolean {
  if (i.isPrivate) return false;
  if (i.isAllDay) return false;
  if ((i.showAs || "").toLowerCase() === "oof") return false;
  if (!norm(i.subject || "")) return false;
  if (isLeisureSubject(i.subject)) return false;
  return true;
}

/** Score a project candidate with whole-word matching only. Max 100. */
export function scoreCandidate(
  subject: string,
  p: { title?: string | null; customer?: string | null; job_number?: string | null; project_aliases?: string[] | null },
): number {
  const subjTokens = tokens(subject);
  if (subjTokens.length === 0) return 0;
  const title = p.title || "";
  const titleTokens = new Set(tokens(title));
  const custTokens = new Set(tokens(p.customer));
  let score = 0;
  if (p.job_number && wholeWordIncludes(subject, p.job_number)) score += 60;
  for (const a of p.project_aliases || []) {
    if (a && norm(a).length > 2 && wholeWordIncludes(subject, a)) { score += 45; break; }
  }
  // Full title as whole phrase in subject (never the reverse: a short subject inside a long title).
  if (norm(title).length > 2 && wholeWordIncludes(subject, title)) score += 50;
  else {
    const hits = subjTokens.filter((t) => titleTokens.has(t)).length;
    score += Math.min(hits * 15, 45);
    const chits = subjTokens.filter((t) => custTokens.has(t)).length;
    score += Math.min(chits * 10, 20);
  }
  return Math.min(score, 100);
}

export const SUGGESTION_MIN_SCORE = 50;

export interface ExistingLink { project_id: string | null; match_state: string | null; }

/** Trusted link = explicit human decision. Everything else on an outlook block is untrusted. */
export function isTrustedState(state?: string | null): boolean {
  return state === "confirmed" || state === "manual";
}

export interface LinkDecision {
  projectId: string | null;
  suggestedProjectId: string | null;
  matchState: "auto" | "needs_confirmation" | "external" | "external_confirmed" | "confirmed";
  matchConfidence: number;
  matchReason: string;
}

/**
 * Decide the stored link for an imported appointment.
 * deterministicProjectId = project resolved from MCS_BLOCK_ID (Hub-written key).
 * suggestion = best fuzzy candidate (already gated by maySuggestProject).
 */
export function decideLink(args: {
  existing?: ExistingLink | null;
  deterministicProjectId?: string | null;
  suggestion?: { projectId: string; score: number; title: string } | null;
}): LinkDecision {
  const { existing, deterministicProjectId, suggestion } = args;
  if (existing?.project_id && isTrustedState(existing.match_state)) {
    return { projectId: existing.project_id, suggestedProjectId: null, matchState: "confirmed", matchConfidence: 100, matchReason: "Previously confirmed" };
  }
  // A human said "this is not a job" (Fjern feil kobling / Marker privat): re-import never
  // re-links or re-suggests, unless the Hub-written MCS_BLOCK_ID proves otherwise.
  if (existing?.match_state === "external_confirmed" && !deterministicProjectId) {
    return { projectId: null, suggestedProjectId: null, matchState: "external_confirmed", matchConfidence: 0, matchReason: "Feil kobling fjernet manuelt" };
  }
  if (deterministicProjectId) {
    return { projectId: deterministicProjectId, suggestedProjectId: null, matchState: "auto", matchConfidence: 100, matchReason: "MCS_BLOCK_ID link" };
  }
  if (suggestion && suggestion.score >= SUGGESTION_MIN_SCORE) {
    return {
      projectId: null,
      suggestedProjectId: suggestion.projectId,
      matchState: "needs_confirmation",
      matchConfidence: suggestion.score,
      matchReason: `Forslag (ikke koblet): ${suggestion.title}`,
    };
  }
  return { projectId: null, suggestedProjectId: null, matchState: "external", matchConfidence: 0, matchReason: "" };
}

/** Display title: project title only for a trusted/deterministic link; never for private. */
export function displayTitleFor(args: { isPrivate?: boolean; subject?: string | null; linkedProjectTitle?: string | null }): string {
  if (args.isPrivate) return "Opptatt";
  if (args.linkedProjectTitle) return args.linkedProjectTitle;
  return (args.subject || "").trim() || "Opptatt";
}

// ── All-day handling ─────────────────────────────────────────────────────────

function osloOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - utcMs;
}

/** "2026-11-16" → UTC instant of 00:00 Europe/Oslo that day (DST-safe). */
export function osloMidnightUtc(dateKey: string): Date {
  const [y, m, d] = dateKey.slice(0, 10).split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - osloOffsetMs(guess);
  t = guess - osloOffsetMs(t);
  return new Date(t);
}

/**
 * Graph all-day events carry a calendar date (midnight, designator-less) – not a UTC instant.
 * Map them to Oslo midnight boundaries so they land on the correct Norwegian date.
 */
export function allDayRangeUtc(rawStart: string, rawEnd: string): { start: Date; end: Date } {
  return { start: osloMidnightUtc(rawStart), end: osloMidnightUtc(rawEnd) };
}

/** Server-side twin of src/lib/outlook-block-display isTrustedOutlookLink. */
export function isTrustedOutlookBlock(b: { source?: string | null; project_id?: string | null; match_state?: string | null; match_reason?: string | null }): boolean {
  if (b.source !== "outlook") return true;
  if (!b.project_id) return false;
  if (isTrustedState(b.match_state)) return true;
  return b.match_state === "auto" && (b.match_reason || "").startsWith("MCS_BLOCK_ID");
}
