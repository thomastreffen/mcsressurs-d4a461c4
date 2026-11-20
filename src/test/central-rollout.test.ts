// @vitest-environment node
import { it, expect, describe } from "vitest";
import { readFileSync } from "node:fs";
import { technicianRolloutStatus, automaticProof, rolloutGoNoGo, validBatch, batchPhrase, ROLLOUT_BATCH_MAX, type ProofOp } from "../../supabase/functions/_shared/central-rollout";

const now = new Date("2026-11-20T08:00:00Z");
const base = { eligible: true, activated: false, probes: [], openOperations: 0, pendingConflicts: 0 };
const op: ProofOp = { id: "op1", event_id: "ev1", technician_id: "rune", kind: "create", state: "verified", verification_source: "automatic_readback", created_at: "2026-11-20T07:00:00Z" };
const sql = readFileSync("drizzle/migrations/0124_central_calendar_verified_batches.sql", "utf8");
const pilot = readFileSync("supabase/functions/job-outlook-app-pilot/index.ts", "utf8");
const store = readFileSync("supabase/functions/_shared/central-calendar-store.ts", "utf8");

describe("all-active guard", () => {
  it("blanket all-active activation is disabled in the database", () => expect(sql).toContain("all_active_disabled_use_verified_batches"));
  it("a manually linked create does not prove the automatic pilot (JOB-000452)", () => {
    expect(automaticProof([{ ...op, verification_source: "manual_link" }], [], "create")).toBe(false);
    expect(automaticProof([op], [{ action: "link_central_operation", result: { operation_id: "op1" } }], "create")).toBe(false);
  });
  it("a create reached through the manual retry button does not count", () =>
    expect(automaticProof([op], [{ action: "retry_central_assignment_started", result: { event_id: "ev1", technician_id: "rune" } }], "create")).toBe(false));
  it("a fully automatic create + readback counts", () => expect(automaticProof([op], [], "create")).toBe(true));
  it("automatic verification is labelled by the store, manual link by the pilot", () => {
    expect(store).toContain('verification_source: "automatic_readback"');
    expect(pilot).toContain('verification_source: "manual_link"');
  });
});

describe("per-person readiness", () => {
  it("Graph 403 blocks exactly that person", () => expect(technicianRolloutStatus({ ...base, probes: [{ created_at: "2026-11-20T07:00:00Z", pass: false, http: 403 }] }, now)).toMatchObject({ status: "probe_failed", reason: "graph_403" }));
  it("a newer failure overrides an older pass", () => expect(technicianRolloutStatus({ ...base, probes: [{ created_at: "2026-11-19T07:00:00Z", pass: true, http: 200 }, { created_at: "2026-11-20T07:00:00Z", pass: false, http: 404 }] }, now).status).toBe("probe_failed"));
  it("a probe older than 7 days needs a new test", () => expect(technicianRolloutStatus({ ...base, probes: [{ created_at: "2026-11-10T07:00:00Z", pass: true, http: 200 }] }, now).reason).toBe("probe_stale"));
  it("fresh 200 is ready; never probed is not", () => {
    expect(technicianRolloutStatus({ ...base, probes: [{ created_at: "2026-11-20T07:00:00Z", pass: true, http: 200 }] }, now).status).toBe("ready");
    expect(technicianRolloutStatus(base, now).status).toBe("probe_required");
  });
  it("former/inactive employees are excluded", () => expect(technicianRolloutStatus({ ...base, eligible: false }, now).status).toBe("excluded"));
  it("SQL excludes Ståle and Andre and requires a fresh company-matched pass", () => {
    expect(sql).toContain("ebc15ac7-fd4c-461d-a61c-06b97d705cc0"); expect(sql).toContain("ba707f5e-0a7d-40b8-95f2-896d1c4c01c2");
    expect(sql).toMatch(/result->>'company_id'=_company::text/);
  });
});

describe("batches and go/no-go", () => {
  it("batch is 1–5 ready people only", () => {
    const m = new Map([["a", "ready"], ["b", "probe_failed"]] as const);
    expect(validBatch(["a"], m as any)).toBe(true);
    expect(validBatch(["a", "b"], m as any)).toBe(false);
    expect(validBatch(Array.from({ length: ROLLOUT_BATCH_MAX + 1 }, (_, i) => `x${i}`), new Map() as any)).toBe(false);
    expect(batchPhrase(3)).toBe("AKTIVER KALENDER PULJE 3 MONTØRER");
    expect(sql).toContain("batch_size_1_to_5");
  });
  it("no-go until automatic create is proven; held queue is only a warning, never released", () => {
    const x = { createProven: false, updateProven: false, deleteProven: false, unverifiedOperations: 0, legacyGlobalEnabled: false, heldQueue: 8, pendingConflicts: 0 };
    expect(rolloutGoNoGo(x)).toMatchObject({ go: false, blockers: ["automatic_create_not_proven"] });
    expect(rolloutGoNoGo({ ...x, createProven: true }).go).toBe(true);
    expect(rolloutGoNoGo({ ...x, createProven: true }).warnings).toContain("held_queue_never_released");
    expect(rolloutGoNoGo({ ...x, createProven: true, unverifiedOperations: 1 }).go).toBe(false);
  });
  it("new single activations beyond the first pilot also need the automatic proof", () => expect(sql).toMatch(/central_calendar_activations WHERE revoked_at IS NULL\) AND NOT public\.central_calendar_automatic_pilot_proven/));
  it("rollout probes are GET-only, rate-limited and never touch the queue", () => {
    const block = pilot.slice(pilot.indexOf('action === "rollout_overview"'), pilot.indexOf("// Isolated central API smoke test"));
    expect(block).not.toMatch(/method:\s*"(POST|PATCH|DELETE)"/);
    expect(block).toContain("60_000");
    expect(block).not.toMatch(/job_outlook_app_queue"\)\.update/);
  });
});

it("the write claim gate honours only per-person activations, never all-active", () => {
  const gate = readFileSync("drizzle/migrations/0125_central_calendar_ignore_all_active.sql", "utf8");
  expect(gate).toContain("a.scope='single' AND a.technician_id=_tech AND a.mailbox=_mailbox");
  expect(gate).not.toContain("scope='all_active'");
});

import { bootstrapDecision, bootstrapPhrase, nextRolloutStep } from "../../supabase/functions/_shared/central-rollout";
describe("one-time bootstrap", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const ready = { status: "ready" as const, last_pass_at: "2026-11-20T09:00:00Z" };
  it("allows exactly one named ready technician with probe < 24h before any automatic proof", () => {
    expect(bootstrapDecision({ createProven: false, bootstrapUsed: false, person: ready }, now).allowed).toBe(true);
  });
  it("refuses when already used, already proven, stale probe, restricted or active", () => {
    expect(bootstrapDecision({ createProven: false, bootstrapUsed: true, person: ready }, now).reason).toBe("bootstrap_already_used");
    expect(bootstrapDecision({ createProven: true, bootstrapUsed: false, person: ready }, now).reason).toBe("not_needed_use_batches");
    expect(bootstrapDecision({ createProven: false, bootstrapUsed: false, person: { status: "ready", last_pass_at: "2026-11-19T09:00:00Z" } }, now).reason).toBe("fresh_probe_24h_required");
    expect(bootstrapDecision({ createProven: false, bootstrapUsed: false, person: { ...ready, restricted: true } }, now).allowed).toBe(false);
    expect(bootstrapDecision({ createProven: false, bootstrapUsed: false, person: { status: "active" } }, now).reason).toBe("already_active");
  });
  it("phrase names the exact mailbox", () => {
    expect(bootstrapPhrase(" Marcus.Bogen@mcselektrotavler.no ")).toBe("BOOTSTRAP KALENDER marcus.bogen@mcselektrotavler.no");
  });
  it("next step: probe → bootstrap → wait → batches", () => {
    const base = { createProven: false, bootstrapUsed: false, bootstrapActive: false, anyReady: false, anyUnprobed: true, unverified: 0 };
    expect(nextRolloutStep(base)).toBe("probe_click");
    expect(nextRolloutStep({ ...base, anyReady: true })).toBe("bootstrap_click");
    expect(nextRolloutStep({ ...base, bootstrapUsed: true, bootstrapActive: true })).toBe("wait_for_new_assignment");
    expect(nextRolloutStep({ ...base, createProven: true, anyReady: true })).toBe("batch_click");
    expect(nextRolloutStep({ ...base, unverified: 1 })).toBe("resolve_unverified");
  });
});
