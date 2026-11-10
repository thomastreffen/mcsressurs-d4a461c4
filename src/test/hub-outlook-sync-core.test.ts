import { describe, it, expect } from "vitest";
import { planOutbound, decideInbound, gate, hubFingerprint, dedupKey, buildEventPayload, type HubAppointment } from "../../supabase/functions/_shared/hub-outlook-sync-core";

const a: HubAppointment = { id: "t1", company_id: "c1", title: "Befaring", description: null, start_at: "2026-11-12T07:00:00Z", end_at: "2026-11-12T08:00:00Z", status: "open", updated_at: "x" };

describe("Hub → Outlook sync core", () => {
  it("flag is off by default and blocks everything", () => {
    expect(gate({ enabled: false, dryRun: true, pilotMailboxes: ["test@mcs.no"] }, "test@mcs.no")).toBe("flag_off");
  });
  it("only pilot mailboxes are allowed when enabled", () => {
    expect(gate({ enabled: true, dryRun: true, pilotMailboxes: ["test@mcs.no"] }, "rune@mcs.no")).toBe("mailbox_not_in_pilot");
    expect(gate({ enabled: true, dryRun: true, pilotMailboxes: ["Test@mcs.no"] }, "test@mcs.no")).toBeNull();
  });
  it("creates once, then skips unchanged (idempotent)", () => {
    const first = planOutbound(a, null, "x@mcs.no");
    expect(first.kind).toBe("create");
    const fp = hubFingerprint(a);
    expect(planOutbound(a, { hub_version: fp, outlook_event_id: "E", outlook_change_key: "k", state: "synced" }, "x@mcs.no")).toEqual({ kind: "skip", reason: "unchanged" });
  });
  it("changed time produces update", () => {
    const m = { hub_version: hubFingerprint(a), outlook_event_id: "E", outlook_change_key: "k", state: "synced" };
    expect(planOutbound({ ...a, end_at: "2026-11-12T09:00:00Z" }, m, "x@mcs.no").kind).toBe("update");
  });
  it("never sends invitations", () => {
    const p = buildEventPayload(a, dedupKey("t1", "X@mcs.no"));
    expect(p.attendees).toEqual([]);
    expect(p.transactionId).toBe("mcs-appt-t1-x@mcs.no");
  });
  it("refuses rows without company scope", () => {
    expect(planOutbound({ ...a, company_id: null }, null, "x").kind).toBe("skip");
  });
  it("does not push while a conflict is unresolved", () => {
    expect(planOutbound({ ...a, title: "Ny" }, { hub_version: "old", outlook_event_id: "E", outlook_change_key: "k", state: "conflict" }, "x")).toEqual({ kind: "skip", reason: "unresolved_conflict" });
  });
  it("inbound: both sides changed is a conflict, never auto-merged", () => {
    const d = decideInbound({ ...a, title: "Endret i Hub" }, { hub_version: hubFingerprint(a), outlook_event_id: "E", outlook_change_key: "k1", state: "synced" }, { outlook_change_key: "k2", subject: "Endret i Outlook", start: a.start_at!, end: a.end_at!, isCancelled: false });
    expect(d).toEqual({ kind: "conflict", reason: "both_sides_changed" });
  });
  it("inbound: only Outlook changed applies to the appointment", () => {
    const d = decideInbound(a, { hub_version: hubFingerprint(a), outlook_event_id: "E", outlook_change_key: "k1", state: "synced" }, { outlook_change_key: "k2", subject: "Flyttet", start: a.start_at!, end: "2026-11-12T10:00:00Z", isCancelled: false });
    expect(d.kind).toBe("apply_to_hub");
  });
  it("inbound: same changeKey is a no-op", () => {
    expect(decideInbound(a, { hub_version: hubFingerprint(a), outlook_event_id: "E", outlook_change_key: "k1", state: "synced" }, { outlook_change_key: "k1", subject: "", start: "", end: "", isCancelled: false }).kind).toBe("noop");
  });
});
