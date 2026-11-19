import { describe, it, expect } from "vitest";
import { routeTechnicianCalendar, osloDate } from "../../supabase/functions/_shared/job-outlook-app-core";

const MATS = "mats.lien.hansen@mcselektrotavler.no";
const open = { enabled: true, dry_run: false, scope_verified_at: "2026-11-18T00:00:00Z", pilot_mailboxes: [MATS] };
const off = { enabled: false, dry_run: true, scope_verified_at: null, pilot_mailboxes: [] };
const t = (work_date: string, extra: Partial<{ mailbox: string; expires_at: string | null; revoked_at: string | null }> = {}) =>
  ({ work_date, mailbox: MATS, expires_at: "2026-12-31T00:00:00Z", revoked_at: null, ...extra });
const now = new Date("2026-11-19T08:00:00Z");

describe("one calendar path per technician", () => {
  it("today's production state (flags off, no target) keeps the existing delegated path – JOB 60576 unchanged", () => {
    expect(routeTechnicianCalendar({ settings: off, mailbox: MATS, workDates: ["2026-11-26"], targets: [], now })).toBe("delegated");
  });
  it("a target alone does nothing while global flags are off", () => {
    expect(routeTechnicianCalendar({ settings: off, mailbox: MATS, workDates: ["2026-11-26"], targets: [t("2026-11-26")], now })).toBe("delegated");
  });
  it("flags open + exact target for every day → central only (no delegated write)", () => {
    expect(routeTechnicianCalendar({ settings: open, mailbox: MATS, workDates: ["2026-11-26"], targets: [t("2026-11-26")], now })).toBe("central");
  });
  it("partial day coverage fails closed", () => {
    expect(routeTechnicianCalendar({ settings: open, mailbox: MATS, workDates: ["2026-11-26", "2026-11-27"], targets: [t("2026-11-26")], now })).toBe("blocked_partial_target");
  });
  it("other day, other mailbox, expired or revoked targets don't count", () => {
    expect(routeTechnicianCalendar({ settings: open, mailbox: MATS, workDates: ["2026-11-26"], targets: [t("2026-11-20")], now })).toBe("delegated");
    expect(routeTechnicianCalendar({ settings: open, mailbox: MATS, workDates: ["2026-11-26"], targets: [t("2026-11-26", { mailbox: "emil.strid@mcselektrotavler.no" })], now })).toBe("delegated");
    expect(routeTechnicianCalendar({ settings: open, mailbox: MATS, workDates: ["2026-11-26"], targets: [t("2026-11-26", { expires_at: "2026-11-18T00:00:00Z" })], now })).toBe("delegated");
    expect(routeTechnicianCalendar({ settings: open, mailbox: MATS, workDates: ["2026-11-26"], targets: [t("2026-11-26", { revoked_at: "x" })], now })).toBe("delegated");
  });
  it("mailbox not on the pilot list or dry-run on → delegated", () => {
    expect(routeTechnicianCalendar({ settings: { ...open, pilot_mailboxes: [] }, mailbox: MATS, workDates: ["2026-11-26"], targets: [t("2026-11-26")], now })).toBe("delegated");
    expect(routeTechnicianCalendar({ settings: { ...open, dry_run: true }, mailbox: MATS, workDates: ["2026-11-26"], targets: [t("2026-11-26")], now })).toBe("delegated");
  });
  it("08:00 Oslo on 26 Nov is 07:00 UTC and maps to that Oslo day; late UTC evening maps to next Oslo day", () => {
    expect(osloDate("2026-11-26T07:00:00Z")).toBe("2026-11-26");
    expect(osloDate("2026-11-25T23:30:00Z")).toBe("2026-11-26");
  });
});
