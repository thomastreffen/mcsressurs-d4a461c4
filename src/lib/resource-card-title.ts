/**
 * Display-title resolution for resource plan cards.
 *
 * Problem: tasks created from an order ("bestilling") get a generic title like
 * "Oppgave fra BST-000040". schedule_blocks.title is a snapshot taken at
 * creation time, so it keeps the old/generic title even after the user renames
 * the underlying event/task. The render layer must therefore always prefer the
 * live event title and only fall back to the block snapshot.
 */

/** Titles that carry no information for a human – only used as last resort. */
const GENERIC_TITLE_PATTERNS: RegExp[] = [
  /^oppgave\s+fra\s+(bst[-\s]?\d*|bestilling)/i,
  /^oppgave\s+uten\s+tittel$/i,
  /^uten\s+tittel$/i,
  /^nytt?\s+prosjekt$/i,
  /^ekstern(\s+blokk)?$/i,
  /^planlagt\s+arbeid$/i,
  /^oppdrag$/i,
  /^bst[-\s]?\d+$/i,
];

const ORDER_REF_RE = /\bBST[-\s]?(\d{3,})\b/i;

export function isGenericResourceTitle(title?: string | null): boolean {
  const t = (title ?? "").replace("SERVICE – ", "").trim();
  if (!t) return true;
  return GENERIC_TITLE_PATTERNS.some((re) => re.test(t));
}

/** Pull "BST-000040" out of any text (title/description/etc). */
export function extractOrderRef(...sources: (string | null | undefined)[]): string | null {
  for (const src of sources) {
    if (!src) continue;
    const m = src.match(ORDER_REF_RE);
    if (m) return `BST-${m[1]}`;
  }
  return null;
}

function clean(title?: string | null): string | null {
  const t = (title ?? "").replace("SERVICE – ", "").trim();
  return t ? t : null;
}

export interface ResourceCardTitleInput {
  /** Live title from the linked job/task event (highest priority). */
  eventTitle?: string | null;
  /** Live title from the parent project event. */
  parentTitle?: string | null;
  /** Snapshot title stored on schedule_blocks (may be stale). */
  blockTitle?: string | null;
  /** Subject from Outlook, for external blocks. */
  outlookSubject?: string | null;
  /** Order reference, shown as secondary info – never as main title. */
  sourceOrderNumber?: string | null;
  /** Final fallback such as JOB-000318 / internal number. */
  fallbackRef?: string | null;
}

/**
 * Picks the best human-readable title.
 * Non-generic live titles win over everything; generic titles are only used
 * when nothing better exists.
 */
export function getResourceCardTitle(input: ResourceCardTitleInput): string {
  const candidates = [
    input.eventTitle,
    input.parentTitle,
    input.blockTitle,
    input.outlookSubject,
  ].map(clean);

  const good = candidates.find((t) => t && !isGenericResourceTitle(t));
  if (good) return good;

  const generic = candidates.find((t): t is string => Boolean(t));
  if (generic) return generic;

  const ref = clean(input.sourceOrderNumber) ?? clean(input.fallbackRef);
  return ref ? `Oppgave fra ${ref}` : "Oppdrag";
}

/** Secondary line: "BST-000040 · JOB-000318 · 08–16" */
export function getResourceCardSecondary(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" · ");
}
