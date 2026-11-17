import { expect, it } from "vitest";
import { liveAssignmentResponses } from "../lib/live-assignment-responses";
import { getAcceptanceFromLegacy, getExecutionStatus } from "../lib/job-status";
it("Emil's historical rejection is not Mats' pending response; latest live response wins", () => {
  const rows = [
    { job_id: "60570", technician_user_id: "Emil", created_at: "2026-11-12T00:00Z", status: "rejected" },
    { job_id: "60570", technician_user_id: "Mats", created_at: "2026-11-12T00:00Z", status: "approved" },
    { job_id: "60570", technician_user_id: "Mats", created_at: "2026-11-17T00:00Z", status: "pending" },
  ];
  expect(liveAssignmentResponses(rows, [{ event_id: "60570", user_id: "Mats" }]).map(r => r.status)).toEqual(["pending"]);
});
it("shared rejected and scheduled do not fabricate personal responses", () => {
  expect(getExecutionStatus("rejected")).toBe("scheduled");
  expect(getAcceptanceFromLegacy("rejected")).toBeNull();
  expect(getAcceptanceFromLegacy("scheduled")).toBeNull();
});