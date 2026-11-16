import { describe, expect, it } from "vitest";
import { pilotChoices, freshMailboxProbe } from "../../supabase/functions/_shared/job-outlook-pilot-selector";
const job = { id: "job", company_id: "c1", deleted_at: null, project_type: "job" };
const assignees = ["mats", "emil"].map(id => ({ technician_id: id, name: id, email: `${id}@example.test`, deleted_at: null, archived_at: null }));
const blocks = ["mats", "emil"].flatMap(technician_id => [19, 20].map(day => ({ company_id: "c1", technician_id, start_at: `2026-11-${day}T07:00:00Z`, end_at: `2026-11-${day}T15:00:00Z`, source: "manual", deleted_at: null })));
describe("safe pilot selector", () => {
  it("offers both Mats days at actual Oslo times while marking both Emil days already synced", () => {
    const links = [19, 20].map(d => ({ technician_id: "emil", work_date: `2026-11-${d}`, outlook_event_id: "existing", status: "synced" }));
    const choices = pilotChoices(job, assignees, blocks, links);
    expect(choices[0].days.map(d => [d.work_date, d.synced])).toEqual([["2026-11-19", false], ["2026-11-20", false]]);
    expect(choices[0].days[0].start_at).toBe("2026-11-19T07:00:00Z");
    expect(choices[1].days.map(d => d.synced)).toEqual([true, true]);
  });
  it("excludes cross-company, deleted, unassigned and Outlook-derived blocks", () => {
    const bad = [ { ...blocks[0], company_id: "c2" }, { ...blocks[0], source: "outlook" }, { ...blocks[0], deleted_at: "2026-11-16" }, { ...blocks[0], technician_id: "outsider" } ];
    expect(pilotChoices(job, assignees, bad, [])).toEqual([]);
  });
  it("denies deleted jobs and archived technicians", () => {
    expect(pilotChoices({ ...job, deleted_at: "x" }, assignees, blocks, [])).toEqual([]);
    expect(pilotChoices(job, assignees.map(a => ({ ...a, archived_at: "x" })), blocks, [])).toEqual([]);
  });
  it("deduplicates dates and keeps DST Oslo day", () => {
    const choices = pilotChoices(job, assignees, [blocks[0], blocks[0], { ...blocks[0], start_at: "2026-03-28T23:30:00Z", end_at: "2026-03-29T05:00:00Z" }], []);
    expect(choices[0].days.map(d => d.work_date)).toEqual(["2026-03-29", "2026-11-19"]);
  });
  it("simulation requires target-specific 200 within 24h, not an old or failed test", () => {
    const now = new Date("2026-11-16T07:00:00Z");
    expect(freshMailboxProbe(null, now)).toBe(false);
    expect(freshMailboxProbe({ created_at: "2026-11-16T06:59:00Z", result: { pass: true, http: 200 } }, now)).toBe(true);
    expect(freshMailboxProbe({ created_at: "2026-11-15T07:00:00Z", result: { pass: true, http: 200 } }, now)).toBe(false);
    expect(freshMailboxProbe({ created_at: "2026-11-16T06:59:00Z", result: { pass: false, http: 403 } }, now)).toBe(false);
  });
});