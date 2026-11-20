// Pure readiness rules for rolling ordinary Resource Plan -> Outlook out to all active technicians.
// No I/O. The database RPCs (activate_central_calendar[_batch]) re-check every rule authoritatively.
export const ROLLOUT_BATCH_MAX = 5;
export const ROLLOUT_PROBE_FRESH_MS = 7 * 24 * 3600_000;
export const ROLLOUT_PROBE_SPACING_MS = 1500;
export const batchPhrase = (n: number) => `AKTIVER KALENDER PULJE ${n} MONTØRER`;
export const STOP_ALL_PHRASE = "STOPP KALENDER";

export type ProbeRow = { created_at: string; pass: boolean; http?: number | null; step?: string | null };
export type RolloutFacts = { eligible: boolean; activated: boolean; probes: ProbeRow[]; openOperations: number; pendingConflicts: number };
export type RolloutStatus = "active" | "ready" | "probe_required" | "probe_failed" | "excluded";

/** Newest probe decides: a later failure blocks exactly this person even after an older pass. */
export function technicianRolloutStatus(f: RolloutFacts, now: Date): { status: RolloutStatus; reason: string | null; attention: string | null } {
  const attention = f.openOperations > 0 ? "outlook_unconfirmed" : f.pendingConflicts > 0 ? "conflict_consent_pending" : null;
  if (!f.eligible) return { status: "excluded", reason: "not_active_employee_with_mailbox", attention: null };
  if (f.activated) return { status: "active", reason: null, attention };
  const latest = [...f.probes].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (!latest) return { status: "probe_required", reason: "never_probed", attention };
  if (!latest.pass) return { status: "probe_failed", reason: latest.http ? `graph_${latest.http}` : latest.step ?? "probe_failed", attention };
  const age = now.getTime() - Date.parse(latest.created_at);
  if (!(age >= 0 && age < ROLLOUT_PROBE_FRESH_MS)) return { status: "probe_required", reason: "probe_stale", attention };
  return { status: "ready", reason: null, attention };
}

export type ProofOp = { id: string; event_id: string; technician_id: string; kind: string; state: string; verification_source: string | null; created_at: string };
export type ProofAction = { action: string; result: Record<string, any> | null };
/** A proof is only an operation verified by automatic readback with no manual retry or manual link touching it. */
export function automaticProof(ops: ProofOp[], actions: ProofAction[], kind: "create" | "update" | "delete"): boolean {
  return ops.some(o => o.kind === kind && o.state === "verified" && o.verification_source === "automatic_readback" &&
    !actions.some(a => (a.action.startsWith("retry_central_assignment") && a.result?.event_id === o.event_id && a.result?.technician_id === o.technician_id) ||
      (["link_central_operation", "inspect_central_operation"].includes(a.action) && a.result?.operation_id === o.id)));
}

export type GoNoGoInput = { apiSmokeProven?: boolean; createProven: boolean; updateProven: boolean; deleteProven: boolean; unverifiedOperations: number; legacyGlobalEnabled: boolean; heldQueue: number; pendingConflicts: number };
/** Go = next verified batch may be activated. Never implies queue release or blanket activation. */
export function rolloutGoNoGo(x: GoNoGoInput) {
  const blockers: string[] = [], warnings: string[] = [];
  // Central API smoke (create/GET/PATCH/DELETE) may unblock batches, but never counts as ordinary trigger proof.
  if (!x.createProven && !x.apiSmokeProven) blockers.push("automatic_create_not_proven");
  if (!x.createProven && x.apiSmokeProven) warnings.push("ordinary_trigger_not_proven");
  if (x.unverifiedOperations > 0) blockers.push("unconfirmed_outlook_operations");
  if (x.legacyGlobalEnabled) blockers.push("legacy_global_sync_enabled");
  if (!x.updateProven) warnings.push("automatic_update_not_proven");
  if (!x.deleteProven) warnings.push("automatic_delete_not_proven");
  if (x.pendingConflicts > 0) warnings.push("conflict_consent_pending");
  if (x.heldQueue > 0) warnings.push("held_queue_never_released");
  return { go: blockers.length === 0, blockers, warnings };
}

/** Batch selection: only ready people, 1–5, no duplicates. */
export function validBatch(ids: string[], statusById: Map<string, RolloutStatus>): boolean {
  return ids.length >= 1 && ids.length <= ROLLOUT_BATCH_MAX && new Set(ids).size === ids.length && ids.every(id => statusById.get(id) === "ready");
}

export const BOOTSTRAP_PROBE_FRESH_MS = 24 * 3600_000;
export const bootstrapPhrase = (mailbox: string) => `BOOTSTRAP KALENDER ${mailbox.trim().toLowerCase()}`;

/** One-time first-technician activation that breaks the proof deadlock. DB RPC re-checks everything. */
export function bootstrapDecision(x: { createProven: boolean; bootstrapUsed: boolean; person?: { status: RolloutStatus; restricted?: boolean; last_pass_at?: string | null } }, now: Date) {
  if (x.createProven) return { allowed: false, reason: "not_needed_use_batches" };
  if (x.bootstrapUsed) return { allowed: false, reason: "bootstrap_already_used" };
  const p = x.person;
  if (!p) return { allowed: false, reason: "choose_one_technician" };
  if (p.restricted || p.status === "excluded") return { allowed: false, reason: "not_eligible" };
  if (p.status === "active") return { allowed: false, reason: "already_active" };
  const age = p.last_pass_at ? now.getTime() - Date.parse(p.last_pass_at) : Infinity;
  if (p.status !== "ready" || !(age >= 0 && age < BOOTSTRAP_PROBE_FRESH_MS)) return { allowed: false, reason: "fresh_probe_24h_required" };
  return { allowed: true, reason: null };
}

/** The single next click Thomas should make, in order. */
export function nextRolloutStep(x: { apiSmokeProven?: boolean; anyActive?: boolean; createProven: boolean; bootstrapUsed: boolean; bootstrapActive: boolean; anyReady: boolean; anyUnprobed: boolean; unverified: number }): string {
  if (x.unverified > 0) return "resolve_unverified";
  if (!x.createProven && !x.apiSmokeProven && x.anyActive) return "smoke_test_click";
  if (!x.createProven && !x.apiSmokeProven) {
    if (x.bootstrapUsed && x.bootstrapActive) return "wait_for_new_assignment";
    if (x.bootstrapUsed) return "bootstrap_used_contact";
    return x.anyReady ? "bootstrap_click" : "probe_click";
  }
  if (x.anyReady) return "batch_click";
  return x.anyUnprobed ? "probe_click" : "done";
}
