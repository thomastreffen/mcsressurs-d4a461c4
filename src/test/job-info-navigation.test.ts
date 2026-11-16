import { expect, it } from "vitest";
import { jobEntryPath } from "../lib/job-info-navigation";
it("Mine oppdrag takes technicians straight to stable job info while planners retain workspace", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  expect(jobEntryPath(id, false)).toBe(`/job-info/${id}`);
  expect(jobEntryPath(id, true)).toBe(`/projects/${id}`);
});