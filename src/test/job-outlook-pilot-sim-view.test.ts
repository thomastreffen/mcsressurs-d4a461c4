import { describe, it, expect } from "vitest";
import { simOutcome, globalGateNotes } from "../../supabase/functions/_shared/job-outlook-pilot-sim-view";
import { planJobDays } from "../../supabase/functions/_shared/job-outlook-app-days";
const base = { in_pilot: true, gate: null, reason: null };
describe("pilot simulation display", () => {
  it("aggregate rejection does not block an active recipient's creation", () => {
    const o = simOutcome({ ...base, decision: "create", job_status: "rejected" });
    expect(o.tone).toBe("create");
  });
  it("active job missing day -> would create", () => expect(simOutcome({ ...base, decision: "create", job_status: "scheduled" }).tone).toBe("create"));
  it("in sync -> no change", () => expect(simOutcome({ ...base, decision: "skip", reason: "unchanged", job_status: "scheduled" }).tone).toBe("none"));
  it("non-target day is outside pilot", () => expect(simOutcome({ in_pilot: false, gate: "not_pilot_target", decision: "skip", reason: null }).tone).toBe("outside"));
  it("conflict is blocked", () => expect(simOutcome({ ...base, decision: "skip", reason: "unresolved_conflict", job_status: "scheduled" }).tone).toBe("blocked"));
  it("current production gates are all listed", () => expect(globalGateNotes({ enabled: false, dry_run: true, scope_verified: false, mailbox_allowed: false })).toHaveLength(4));
  it("planner preserves active recipient despite aggregate rejection; dry-run still holds writes", () => {
    const t = { id: "t", company_id: "c", event_id: "e", technician_id: "m", mailbox: "m@x.no", work_date: "2026-11-19", expires_at: "2099-01-01T00:00:00Z", revoked_at: null };
    const job: any = { id: "e", company_id: "c", title: "Majorstua", address: null, start_at: "2026-11-19T07:00:00Z", end_at: "2026-11-19T15:00:00Z", status: "rejected", deleted_at: null };
    const args: any = { blocks: [{ technician_id: "m", start_at: "2026-11-19T07:00:00Z", end_at: "2026-11-19T15:00:00Z" }], assignees: [{ technician_id: "m", email: "m@x.no" }], appLinks: [], legacyLinks: [], targets: [t], flags: { enabled: true, dryRun: true, scopeVerified: true, pilotMailboxes: ["m@x.no"] }, now: new Date("2026-11-17T09:00:00Z") };
    expect(planJobDays({ ...args, job })[0].decision.kind).toBe("create");
    expect(planJobDays({ ...args, job: { ...job, status: "scheduled" } })[0].decision.kind).toBe("create");
  });
});
