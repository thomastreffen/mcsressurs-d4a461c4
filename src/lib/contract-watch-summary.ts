// Pure summary for the Avtalevakt dashboard card. Counts only real stored rows; nothing is invented.
export interface CwRow { id: string; coverage: string | null; status: string; is_test: boolean; confidence_class: string; created_at: string }
export interface CwSummary { missing: number; partialOrConflict: number; unclear: number; total: number; testCount: number; allTest: boolean; topId: string | null }
const RANK: Record<string, number> = { missing: 0, conflict: 1, partial: 2, unclear: 3 };
export function summarizeContractWatch(rows: CwRow[]): CwSummary {
  const open = rows.filter((r) => r.status === "open" && r.coverage !== "covered");
  const n = (f: (r: CwRow) => boolean) => open.filter(f).length;
  const top = [...open].sort((a, b) => (RANK[a.coverage ?? "unclear"] ?? 3) - (RANK[b.coverage ?? "unclear"] ?? 3) || b.created_at.localeCompare(a.created_at))[0];
  return {
    missing: n((r) => r.coverage === "missing"),
    partialOrConflict: n((r) => r.coverage === "partial" || r.coverage === "conflict"),
    unclear: n((r) => !r.coverage || r.coverage === "unclear"),
    total: open.length, testCount: n((r) => r.is_test), allTest: open.length > 0 && open.every((r) => r.is_test),
    topId: top?.id ?? null,
  };
}
/** Discreet indicator only for actionable findings (missing/partial/conflict), never for unclear alone. */
export const needsAttention = (s: CwSummary) => s.missing + s.partialOrConflict > 0;
