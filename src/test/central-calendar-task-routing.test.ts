import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { routeTechnicianCalendar } from "../../supabase/functions/_shared/job-outlook-app-core";

const off = { enabled: false, dry_run: true, scope_verified_at: null, pilot_mailboxes: [] };
describe("JOB-000452: Thomas (not activated) + Rune (activated) on the same task", () => {
  it("routes Thomas delegated and Rune central, never both for one person", () => {
    const day = ["2026-11-24"];
    expect(routeTechnicianCalendar({ settings: off, mailbox: "thomas.treffen@mcsservice.no", workDates: day, targets: [] })).toBe("delegated");
    expect(routeTechnicianCalendar({ settings: off, mailbox: "rune.orbeck@mcsservice.no", workDates: day, targets: [], activated: true })).toBe("central");
  });
  it("central sync no longer rejects Resource Plan tasks", () => {
    const src = readFileSync("supabase/functions/job-outlook-app-sync/index.ts", "utf8");
    expect(src).not.toMatch(/project_type === "task"\) return/);
  });
  it("retry is single-technician, phrase-gated and never drains the queue", () => {
    const src = readFileSync("supabase/functions/job-outlook-app-pilot/index.ts", "utf8");
    const block = src.slice(src.indexOf('action === "retry_central_assignment"'), src.indexOf('if (action === "candidates")'));
    expect(block).toContain("exact_phrase_required");
    expect(block).toContain("technician_id: row.technician_id");
    expect(block).not.toContain("drain_queue");
  });
});
