import { expect, it } from "vitest";
import { jobEntryPath, overviewEventPath } from "../lib/job-info-navigation";
it("Mine oppdrag takes technicians straight to stable job info while planners retain workspace", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  expect(jobEntryPath(id, false)).toBe(`/job-info/${id}`);
  expect(jobEntryPath(id, true)).toBe(`/projects/${id}`);
});
it("standalone and project-child task cards open their own job information, never a fabricated parent", () => {
  expect(overviewEventPath("task-id", "task")).toBe("/job-info/task-id");
  expect(overviewEventPath("child-id", "task")).toBe("/job-info/child-id");
  expect(overviewEventPath("project-id", "project")).toBe("/projects/project-id");
});