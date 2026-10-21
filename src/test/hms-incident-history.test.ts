import { describe, expect, it } from "vitest";
import { groupIncidentHistory } from "@/lib/hms/incident-history";

describe("personal incident history", () => {
  it("puts open cases before closed history, newest first within each section", () => {
    const reports = [
      { id: "closed-new", status: "closed", created_at: "2026-10-21T08:00:00Z" },
      { id: "open-old", status: "open", created_at: "2026-10-19T08:00:00Z" },
      { id: "open-new", status: "in_progress", created_at: "2026-10-20T08:00:00Z" },
    ];
    const groups = groupIncidentHistory(reports);
    expect([...groups.open, ...groups.closed].map((report) => report.id)).toEqual(["open-new", "open-old", "closed-new"]);
    expect(reports[0].id).toBe("closed-new");
  });

  it("keeps pending actions open and rejected cases in finished history", () => {
    const groups = groupIncidentHistory([
      { status: "action_pending", created_at: "2026-10-21T08:00:00Z" },
      { status: "rejected", created_at: "2026-10-21T08:00:00Z" },
    ]);
    expect(groups.open.map((report) => report.status)).toEqual(["action_pending"]);
    expect(groups.closed.map((report) => report.status)).toEqual(["rejected"]);
  });
});