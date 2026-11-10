import { describe, it, expect } from "vitest";
import {
  jobGate, planJobOutbound, jobDedupKey, shouldQueueFallback, canProcessQueueItem, clampBatch, decideJobInbound, buildJobPayload,
  type AppFlags, type HubJob,
} from "../../supabase/functions/_shared/job-outlook-app-core";

const on: AppFlags = { enabled: true, dryRun: false, pilotMailboxes: ["pilot@mcs.no"], scopeVerified: true };
const job: HubJob = { id: "e1", company_id: "c1", title: "60564 Madserud", address: "Vei 1", start_at: "2026-11-16T07:00:00Z", end_at: "2026-11-16T15:00:00Z", status: "scheduled", deleted_at: null };

describe("central app-only job calendar", () => {
  it("is off by default and requires verified scope and pilot mailbox", () => {
    expect(jobGate({ ...on, enabled: false }, "pilot@mcs.no")).toBe("flag_off");
    expect(jobGate({ ...on, scopeVerified: false }, "pilot@mcs.no")).toBe("scope_not_verified");
    expect(jobGate(on, "marcus.bogen@mcselektrotavler.no")).toBe("mailbox_not_in_pilot");
    expect(jobGate(on, "PILOT@mcs.no")).toBeNull();
  });
  it("never sends invitations and marks the event so it is not imported as a job", () => {
    const p = buildJobPayload(job, "t1", jobDedupKey("e1", "t1", "pilot@mcs.no")) as any;
    expect(p.attendees).toEqual([]);
    expect(p.body.content).toContain("MCS_SOURCE:true");
  });
  it("is idempotent: unchanged content is not written again", () => {
    const first = planJobOutbound(job, null, "t1", "pilot@mcs.no", true);
    expect(first.kind).toBe("create");
    const fp = (first as any).fingerprint;
    expect(planJobOutbound(job, { hub_version: fp, outlook_event_id: "x", outlook_change_key: "k", state: "synced" }, "t1", "pilot@mcs.no", true)).toEqual({ kind: "skip", reason: "unchanged" });
  });
  it("removed technician or cancelled job deletes the calendar copy", () => {
    const link = { hub_version: "a", outlook_event_id: "x", outlook_change_key: "k", state: "synced" };
    expect(planJobOutbound(job, link, "t1", "pilot@mcs.no", false).kind).toBe("delete");
    expect(planJobOutbound({ ...job, status: "cancelled" }, link, "t1", "pilot@mcs.no", true).kind).toBe("delete");
  });
  it("Outlook edits never change the Hub job; they become conflicts", () => {
    const link = { hub_version: "a", outlook_event_id: "x", outlook_change_key: "k1", state: "synced" };
    expect(decideJobInbound(link, { change_key: "k2", start: "", end: "", isCancelled: false, missing: false })).toEqual({ kind: "conflict", reason: "edited_in_outlook" });
    expect(planJobOutbound(job, { ...link, state: "conflict" }, "t1", "pilot@mcs.no", true)).toEqual({ kind: "skip", reason: "unresolved_conflict" });
  });
  it("queues only missing Microsoft login, once, in small batches", () => {
    expect(shouldQueueFallback("no_ms_connection")).toBe(true);
    expect(shouldQueueFallback("graph_conflict")).toBe(false);
    expect(canProcessQueueItem({ status: "pending", attempts: 1, max_attempts: 1 })).toBe(false);
    expect(clampBatch(500)).toBe(5);
  });
});
