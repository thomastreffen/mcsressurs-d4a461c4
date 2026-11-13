import { describe, it, expect } from "vitest";
import {
  planJobDays, pilotTargetGate, effectiveAction, isReleasedQueueItem, canReleaseQueueItem, jobDayDedupKey, clampTargetHours,
  type PilotTarget, type AppDayLink,
} from "../../supabase/functions/_shared/job-outlook-app-days";
import type { AppFlags, HubJob } from "../../supabase/functions/_shared/job-outlook-app-core";

const now = new Date("2026-11-13T09:00:00Z");
const job: HubJob = { id: "e60570", company_id: "c1", title: "60570 Majorstua", address: "Vei 1", start_at: "2026-11-19T07:00:00Z", end_at: "2026-11-20T15:00:00Z", status: "scheduled", deleted_at: null };
const blocks = [
  { technician_id: "emil", start_at: "2026-11-19T07:00:00Z", end_at: "2026-11-19T15:00:00Z" },
  { technician_id: "emil", start_at: "2026-11-20T07:00:00Z", end_at: "2026-11-20T15:00:00Z" },
  { technician_id: "mats", start_at: "2026-11-19T07:00:00Z", end_at: "2026-11-19T15:00:00Z" },
  { technician_id: "mats", start_at: "2026-11-20T07:00:00Z", end_at: "2026-11-20T15:00:00Z" },
];
const assignees = [{ technician_id: "emil", email: "emil@mcs.no" }, { technician_id: "mats", email: "Mats@mcs.no" }];
const target = (o: Partial<PilotTarget> = {}): PilotTarget => ({ id: "t1", company_id: "c1", event_id: "e60570", technician_id: "mats", mailbox: "mats@mcs.no", work_date: "2026-11-19", expires_at: "2026-11-14T09:00:00Z", revoked_at: null, ...o });
const flagsOn: AppFlags = { enabled: true, dryRun: false, scopeVerified: true, pilotMailboxes: ["mats@mcs.no", "emil@mcs.no"] };
const base = { job, blocks, assignees, appLinks: [] as AppDayLink[], legacyLinks: [], now };

describe("central calendar per-day pilot", () => {
  it("is default deny: current production settings block every day", () => {
    const rows = planJobDays({ ...base, targets: [target()], flags: { enabled: false, dryRun: true, scopeVerified: false, pilotMailboxes: [] } });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.gate === "flag_off" && effectiveAction(r, true) === "blocked")).toBe(true);
  });
  it("opens exactly one technician + one day; same mailbox other day and other technicians stay blocked", () => {
    const rows = planJobDays({ ...base, targets: [target()], flags: flagsOn });
    const open = rows.filter((r) => !r.gate);
    expect(open.map((r) => `${r.technicianId}|${r.workDate}`)).toEqual(["mats|2026-11-19"]);
    expect(rows.find((r) => r.technicianId === "mats" && r.workDate === "2026-11-20")!.gate).toBe("not_pilot_target");
    expect(rows.find((r) => r.technicianId === "emil" && r.workDate === "2026-11-19")!.gate).toBe("not_pilot_target");
  });
  it("one appointment per technician per Oslo day with deterministic keys", () => {
    const rows = planJobDays({ ...base, targets: [], flags: flagsOn });
    expect(new Set(rows.map((r) => r.dedupKey)).size).toBe(4);
    expect(rows[0].dedupKey).toBe(jobDayDedupKey("e60570", "emil", "2026-11-19", "emil@mcs.no"));
  });
  it("dry-run never reaches Graph even for an open target", () => {
    const r = planJobDays({ ...base, targets: [target()], flags: { ...flagsOn, dryRun: true } }).find((x) => !x.gate)!;
    expect(effectiveAction(r, true)).toBe("dry_run");
  });
  it("rejects cross-company, expired, revoked and wrong-mailbox targets", () => {
    const q = { companyId: "c1", eventId: "e60570", technicianId: "mats", mailbox: "mats@mcs.no", workDate: "2026-11-19" };
    expect(pilotTargetGate([target({ company_id: "c2" })], q, now)).toBe("not_pilot_target");
    expect(pilotTargetGate([target({ expires_at: "2026-11-13T08:00:00Z" })], q, now)).toBe("pilot_target_expired");
    expect(pilotTargetGate([target({ revoked_at: "x" })], q, now)).toBe("not_pilot_target");
    expect(pilotTargetGate([target({ mailbox: "other@mcs.no" })], q, now)).toBe("not_pilot_target");
    expect(pilotTargetGate([target()], q, now)).toBeNull();
  });
  it("adopts existing legacy day events instead of duplicating (Emil 19+20)", () => {
    const legacyLinks = [
      { id: "L19", technician_id: "emil", work_date: "2026-11-19", start_at: "2026-11-19T07:00:00Z", end_at: "2026-11-19T15:00:00Z", outlook_event_id: "o19", status: "synced" },
      { id: "L20", technician_id: "emil", work_date: "2026-11-20", start_at: "2026-11-20T08:00:00Z", end_at: "2026-11-20T15:00:00Z", outlook_event_id: "o20", status: "synced" },
    ];
    const rows = planJobDays({ ...base, legacyLinks, targets: [], flags: flagsOn }).filter((r) => r.technicianId === "emil");
    expect(rows.map((r) => r.decision.kind)).toEqual(["adopt", "adopt"]);
    expect((rows[0].decision as any).fingerprint).toBeTruthy();
    expect((rows[1].decision as any).fingerprint).toBeNull(); // times differ => later update, never a second create
  });
  it("replay after create is unchanged (idempotent)", () => {
    const first = planJobDays({ ...base, targets: [target()], flags: flagsOn }).find((r) => !r.gate)!;
    const link: AppDayLink = { technician_id: "mats", work_date: "2026-11-19", mailbox: "mats@mcs.no", dedup_key: first.dedupKey!, outlook_event_id: "g1", outlook_change_key: "k", hub_version: (first.decision as any).fingerprint, state: "synced" };
    const again = planJobDays({ ...base, appLinks: [link], targets: [target()], flags: flagsOn }).find((r) => !r.gate)!;
    expect(again.decision).toEqual({ kind: "skip", reason: "unchanged" });
  });
  it("removed day deletes only app-created events, never adopted legacy events", () => {
    const own: AppDayLink = { technician_id: "mats", work_date: "2026-11-21", mailbox: "mats@mcs.no", dedup_key: "k21", outlook_event_id: "g21", outlook_change_key: null, hub_version: "x", state: "synced" };
    const adopted: AppDayLink = { ...own, work_date: "2026-11-22", dedup_key: "k22", outlook_event_id: "o22", adopted_from_day_link_id: "L22" };
    const rows = planJobDays({ ...base, appLinks: [own, adopted], targets: [], flags: flagsOn });
    expect(rows.find((r) => r.workDate === "2026-11-21")!.decision.kind).toBe("delete");
    expect(rows.find((r) => r.workDate === "2026-11-22")!.decision).toEqual({ kind: "skip", reason: "adopted_legacy_not_deleted" });
  });
  it("Oslo work date is DST-safe (late UTC evening belongs to next Oslo day)", () => {
    const rows = planJobDays({ ...base, blocks: [{ technician_id: "mats", start_at: "2026-11-18T23:30:00Z", end_at: "2026-11-19T05:00:00Z" }, { technician_id: "mats", start_at: "2026-03-28T23:30:00Z", end_at: "2026-03-29T05:00:00Z" }], targets: [], flags: flagsOn });
    expect(rows.map((r) => r.workDate)).toEqual(["2026-03-29", "2026-11-19"]);
  });
  it("unassigned technician blocks are ignored", () => {
    const rows = planJobDays({ ...base, assignees: [assignees[0]], targets: [], flags: flagsOn });
    expect(rows.every((r) => r.technicianId === "emil")).toBe(true);
  });
});

describe("held queue intents (60570/60571 and others)", () => {
  const held = { status: "pending", attempts: 0, max_attempts: 1, released_at: null, event_id: "e60570", technician_id: "mats", company_id: "c1" };
  it("are never drained without explicit release", () => {
    expect(isReleasedQueueItem(held)).toBe(false);
    expect(isReleasedQueueItem({ ...held, released_at: "2026-11-13T09:00:00Z" })).toBe(true);
    expect(isReleasedQueueItem({ ...held, released_at: "x", attempts: 1 })).toBe(false);
  });
  it("release requires an active matching pilot target in the same company", () => {
    expect(canReleaseQueueItem(held, [], now)).toEqual({ ok: false, reason: "no_active_pilot_target" });
    expect(canReleaseQueueItem(held, [target({ company_id: "c2" })], now).ok).toBe(false);
    expect(canReleaseQueueItem({ ...held, event_id: "e60571" }, [target()], now).ok).toBe(false);
    expect(canReleaseQueueItem(held, [target()], now)).toEqual({ ok: true });
    expect(canReleaseQueueItem({ ...held, released_at: "x" }, [target()], now)).toEqual({ ok: false, reason: "already_released" });
  });
  it("pilot targets expire within 72h", () => {
    expect(clampTargetHours(1000)).toBe(72);
    expect(clampTargetHours(undefined)).toBe(24);
  });
});
