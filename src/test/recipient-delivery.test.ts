import { describe, it, expect } from "vitest";
import { calendarResultToDelivery, overallSyncStatus } from "../../supabase/functions/_shared/recipient-delivery";
import { deliveryLabel } from "@/components/RecipientDeliveryStatus";

describe("per-recipient delivery", () => {
  it("is only synced when every recipient succeeded", () => {
    expect(overallSyncStatus(["sent", "sent"])).toBe("synced");
  });
  it("partial failure is reported as partial, not synced", () => {
    // Medarbeidermøte: 4 created, 3 without Microsoft connection
    expect(overallSyncStatus(["sent", "sent", "sent", "sent", "failed", "failed", "failed"])).toBe("partial");
  });
  it("no successes is failed", () => {
    expect(overallSyncStatus(["failed", "failed"])).toBe("failed");
  });
  it("no_token becomes a failed row with a reason, not silence", () => {
    expect(calendarResultToDelivery("no_token")).toEqual({ status: "failed", reason: "no_ms_connection" });
  });
  it("sender without Microsoft connection is shown to the planner", () => {
    expect(deliveryLabel({ channel: "email", status: "failed", reason_code: "sender_no_ms_connection" }))
      .toBe("E-post feilet – Avsender mangler Microsoft-kobling");
  });
});
