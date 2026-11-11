import { describe, it, expect } from "vitest";
import { planCalendarUpdate, notifyFingerprint, shouldSendInfoUpdate, NOTIFY_DEDUP_WINDOW_MINUTES } from "../../supabase/functions/_shared/job-save-flow";

describe("planCalendarUpdate (explicit «Oppdater Outlook»)", () => {
  it("patches when a real calendar link exists", () => {
    expect(planCalendarUpdate("AAMkADxyz", true)).toBe("patch");
    expect(planCalendarUpdate("AAMkADxyz", false)).toBe("patch");
  });

  it("never creates a new event in update-only mode when the link is missing", () => {
    expect(planCalendarUpdate(null, true)).toBe("no_link");
    expect(planCalendarUpdate(undefined, true)).toBe("no_link");
  });

  it("legacy flows may still create when the link is missing", () => {
    expect(planCalendarUpdate(null, false)).toBe("create");
  });

  it("treats a pending marker as no_link (sync in flight, no double create)", () => {
    expect(planCalendarUpdate("pending:abc", true)).toBe("no_link");
    expect(planCalendarUpdate("pending:abc", false)).toBe("no_link");
  });
});

describe("notifyFingerprint (idempotent «Lagre og varsle»)", () => {
  const changes = [
    { label: "Adresse", oldValue: "Gammel vei 1", newValue: "Sigurd Iversens vei 2" },
    { label: "Beskrivelse", oldValue: "", newValue: "Kurs kl 08" },
  ];
  const techs = ["t-1", "t-2"];

  it("is stable regardless of change and technician order", () => {
    const a = notifyFingerprint("job-1", changes, techs);
    const b = notifyFingerprint("job-1", [...changes].reverse(), [...techs].reverse());
    expect(a).toBe(b);
  });

  it("changes when a value changes", () => {
    const a = notifyFingerprint("job-1", changes, techs);
    const b = notifyFingerprint("job-1", [{ ...changes[0], newValue: "Annet sted" }, changes[1]], techs);
    expect(a).not.toBe(b);
  });

  it("changes when the recipient set changes", () => {
    const a = notifyFingerprint("job-1", changes, techs);
    const b = notifyFingerprint("job-1", changes, [...techs, "t-3"]);
    expect(a).not.toBe(b);
  });

  it("changes when the job changes", () => {
    expect(notifyFingerprint("job-1", changes, techs)).not.toBe(notifyFingerprint("job-2", changes, techs));
  });

  it("normalizes whitespace and null/empty old values", () => {
    const a = notifyFingerprint("job-1", [{ label: "Adresse", oldValue: null, newValue: " X " }], techs);
    const b = notifyFingerprint("job-1", [{ label: "Adresse", oldValue: "", newValue: "X" }], techs);
    expect(a).toBe(b);
  });
});

describe("shouldSendInfoUpdate", () => {
  it("blocks an identical notification inside the dedup window", () => {
    const fp = notifyFingerprint("job-1", [{ label: "Adresse", newValue: "X" }], ["t-1"]);
    expect(shouldSendInfoUpdate(fp, [fp])).toBe(false);
  });

  it("allows a notification whose fingerprint was not recently sent", () => {
    const fp = notifyFingerprint("job-1", [{ label: "Adresse", newValue: "X" }], ["t-1"]);
    expect(shouldSendInfoUpdate(fp, [])).toBe(true);
    expect(shouldSendInfoUpdate(fp, ["annet"])).toBe(true);
  });

  it("dedup window is bounded (minutes, not forever)", () => {
    expect(NOTIFY_DEDUP_WINDOW_MINUTES).toBeGreaterThan(0);
    expect(NOTIFY_DEDUP_WINDOW_MINUTES).toBeLessThanOrEqual(60);
  });
});
