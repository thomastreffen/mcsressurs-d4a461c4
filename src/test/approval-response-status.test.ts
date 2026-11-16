// @vitest-environment node
import { expect, it } from "vitest";
import { approvalResponseStatus } from "../lib/approval-response-status";
it("counts Emil's stored rejection separately from Mats pending, not as two pending", () => {
  const states = ["rejected", "pending"].map(approvalResponseStatus);
  expect(states.filter(s => s === "declined")).toHaveLength(1);
  expect(states.filter(s => s === "pending")).toHaveLength(1);
});
it("both stored change-response names represent one change request", () => {
  expect(approvalResponseStatus("reschedule_requested")).toBe("change_request");
  expect(approvalResponseStatus("change_request")).toBe("change_request");
});
it("already normalized approvals are unchanged", () => {
  expect(["approved", "declined", "pending"].map(approvalResponseStatus)).toEqual(["approved", "declined", "pending"]);
});