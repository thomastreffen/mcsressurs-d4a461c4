// @vitest-environment node
import { expect, it } from "vitest";
import { assignmentInfo } from "../../supabase/functions/_shared/job-assignment-info";
import { formatJobSchedule } from "../../supabase/functions/_shared/job-time";
const assigned = [
  { technician_id: "m", technicians: { name: "Mats", user_id: "mats" } },
  { technician_id: "e", technicians: { name: "Emil", user_id: "emil" } },
];
const blocks = ["19", "20"].flatMap(day => ["m", "e"].map(technician_id => ({ technician_id, start_at: `2026-11-${day}T07:00:00Z`, end_at: `2026-11-${day}T15:00:00Z` })));
it("another rejection preserves Mats pending and both own workdays, not Emil's blocks", () => {
  const result = assignmentInfo("mats", assigned, [{ technician_user_id: "emil", status: "rejected" }, { technician_user_id: "mats", status: "pending" }], blocks);
  expect(result.approvals).toEqual([{ name: "Mats", own: true, status: "pending" }, { name: "Emil", own: false, status: "rejected" }]);
  expect(result.planned_days).toEqual([{ start: "2026-11-19T07:00:00Z", end: "2026-11-19T15:00:00Z" }, { start: "2026-11-20T07:00:00Z", end: "2026-11-20T15:00:00Z" }]);
  expect(formatJobSchedule(result.planned_days[0].start, result.planned_days[0].end)).toMatchObject({ startTime: "08:00", endTime: "16:00" });
});
it("a replay does not duplicate planned days", () => {
  expect(assignmentInfo("mats", assigned, [], [...blocks, ...blocks]).planned_days).toHaveLength(2);
});
it("unassigned caller has no own schedule or own approval", () => {
  const result = assignmentInfo("other", assigned, [], blocks);
  expect(result.planned_days).toEqual([]);
  expect(result.approvals.some(a => a.own)).toBe(false);
});