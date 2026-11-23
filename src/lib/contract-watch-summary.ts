// Pure summary for the Avtalevakt dashboard card (current pilot rows only). Counts only real stored rows.
export interface CwRow { id: string; action_status: string | null; status: string; is_test: boolean; created_at: string; source_sent_at?: string | null }
export interface CwSummary { actionRequired: number; scheduling: number; unknown: number; total: number; testCount: number; allTest: boolean; topId: string | null }
const RANK: Record<string, number> = { action_required: 0, awaiting_me: 0, scheduling: 1, awaiting_other: 1, unknown: 2 };
export function summarizeContractWatch(rows: CwRow[]): CwSummary {
  const open = rows.filter((r) => r.status === "open" && !["handled", "answered", "info"].includes(r.action_status ?? ""));
  const n = (f: (r: CwRow) => boolean) => open.filter(f).length;
  const when = (r: CwRow) => r.source_sent_at ?? r.created_at;
  const top = [...open].sort((a, b) => (RANK[a.action_status ?? "unknown"] ?? 2) - (RANK[b.action_status ?? "unknown"] ?? 2) || when(b).localeCompare(when(a)))[0];
  return {
    actionRequired: n((r) => r.action_status === "action_required" || r.action_status === "awaiting_me"), scheduling: n((r) => r.action_status === "scheduling" || r.action_status === "awaiting_other"),
    unknown: n((r) => !r.action_status || r.action_status === "unknown"),
    total: open.length, testCount: n((r) => r.is_test), allTest: open.length > 0 && open.every((r) => r.is_test), topId: top?.id ?? null,
  };
}
/** Discreet indicator only when something requires action. */
export const needsAttention = (s: CwSummary) => s.actionRequired > 0;
