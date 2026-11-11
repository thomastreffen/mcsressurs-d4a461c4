import { describe, it, expect } from "vitest";
import { planOutbound, decideInbound, gate, hubFingerprint, dedupKey, buildEventPayload, classifyGraphEvent, parseGraphInstant, buildSnapshot, planResolution, type HubAppointment } from "../../supabase/functions/_shared/hub-outlook-sync-core";

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
  it("inbound: cancellation in Outlook marks the appointment cancelled", () => {
    const d = decideInbound(a, { hub_version: hubFingerprint(a), outlook_event_id: "E", outlook_change_key: "k1", state: "synced" }, { outlook_change_key: "k2", subject: "", start: "", end: "", isCancelled: true });
    expect(d.kind).toBe("mark_cancelled");
  });
});

describe("Inbound classification (conservative)", () => {
  const base = { id: "E", changeKey: "k2", subject: "Befaring", start: { dateTime: "2026-11-12T07:00:00" }, end: { dateTime: "2026-11-12T08:00:00" }, type: "singleInstance" };
  it("maps a normal single event to a change with UTC instants", () => {
    const c = classifyGraphEvent(base);
    expect(c.kind).toBe("change");
    if (c.kind === "change") {
      expect(c.change.start).toBe("2026-11-12T07:00:00.000Z");
      expect(c.change.outlook_change_key).toBe("k2");
    }
  });
  it("blocks recurring series instead of truncating them", () => {
    expect(classifyGraphEvent({ ...base, type: "seriesMaster" })).toEqual({ kind: "blocked", reason: "recurring_unsupported" });
    expect(classifyGraphEvent({ ...base, type: "occurrence", seriesMasterId: "M" })).toEqual({ kind: "blocked", reason: "recurring_unsupported" });
    expect(classifyGraphEvent({ ...base, seriesMasterId: "M" })).toEqual({ kind: "blocked", reason: "recurring_unsupported" });
  });
  it("blocks all-day events instead of guessing times", () => {
    expect(classifyGraphEvent({ ...base, isAllDay: true })).toEqual({ kind: "blocked", reason: "all_day_unsupported" });
  });
  it("blocks invalid or missing times", () => {
    expect(classifyGraphEvent({ ...base, start: null })).toEqual({ kind: "blocked", reason: "invalid_time" });
    expect(classifyGraphEvent({ ...base, end: { dateTime: "2026-11-12T06:00:00" } })).toEqual({ kind: "blocked", reason: "invalid_range" });
  });
  it("passes cancellations through even without times", () => {
    const c = classifyGraphEvent({ id: "E", changeKey: "k9", isCancelled: true });
    expect(c.kind).toBe("change");
    if (c.kind === "change") expect(c.change.isCancelled).toBe(true);
  });
  it("blocks events without a changeKey (cannot dedup safely)", () => {
    expect(classifyGraphEvent({ ...base, changeKey: null })).toEqual({ kind: "blocked", reason: "missing_change_key" });
  });
  it("parses Graph instants with and without offset (DST-safe, stored as UTC)", () => {
    expect(parseGraphInstant("2026-07-01T06:00:00")).toBe("2026-07-01T06:00:00.000Z"); // sommertid
    expect(parseGraphInstant("2026-01-15T07:00:00Z")).toBe("2026-01-15T07:00:00.000Z"); // vintertid
    expect(parseGraphInstant("2026-11-12T07:00:00+01:00")).toBe("2026-11-12T06:00:00.000Z");
    expect(parseGraphInstant("ikke-en-dato")).toBeNull();
    expect(parseGraphInstant(null)).toBeNull();
  });
});

describe("Conflict resolution", () => {
  it("snapshot carries the Outlook fields and the fingerprint Hub would have after adopting them", () => {
    const snap = buildSnapshot({ outlook_change_key: "k2", subject: "Flyttet", start: "2026-11-12T09:00:00.000Z", end: "2026-11-12T10:00:00.000Z", isCancelled: false }, a);
    expect(snap.title).toBe("Flyttet");
    expect(snap.hub_fingerprint).toBe(hubFingerprint({ ...a, title: "Flyttet", start_at: "2026-11-12T09:00:00.000Z", end_at: "2026-11-12T10:00:00.000Z" }));
  });
  it("keep_hub re-queues an outbound push", () => {
    expect(planResolution("keep_hub", null)).toEqual({ kind: "keep_hub", nextState: "pending" });
  });
  it("keep_outlook adopts the snapshot and marks the link synced", () => {
    const snap = buildSnapshot({ outlook_change_key: "k2", subject: "Flyttet", start: "2026-11-12T09:00:00.000Z", end: "2026-11-12T10:00:00.000Z", isCancelled: false }, a);
    const r = planResolution("keep_outlook", snap);
    expect(r.kind).toBe("keep_outlook");
    if (r.kind === "keep_outlook") {
      expect(r.fields.title).toBe("Flyttet");
      // After adopting, Hub's fingerprint equals the stored version, so the next outbound run is a no-op.
      expect(planOutbound({ ...a, ...r.fields }, { hub_version: r.hub_version, outlook_event_id: "E", outlook_change_key: "k2", state: "synced" }, "x")).toEqual({ kind: "skip", reason: "unchanged" });
    }
  });
  it("keep_outlook without a snapshot is invalid (no silent data loss)", () => {
    expect(planResolution("keep_outlook", null)).toEqual({ kind: "invalid", reason: "missing_snapshot" });
  });
});
