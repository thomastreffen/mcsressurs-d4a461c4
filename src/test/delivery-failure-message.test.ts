import { describe, it, expect } from "vitest";
import { deliveryFailureMessage, failureLine } from "../../supabase/functions/_shared/recipient-delivery";

describe("planner alert for failed Outlook delivery", () => {
  it("names the person and states the Hub save is OK", () => {
    const m = deliveryFailureMessage("60564 Madserud", "Marcus Bogen Østenengen", "calendar", "no_ms_connection");
    expect(m).toContain("Marcus Bogen Østenengen");
    expect(m).toContain("lagret og planlagt i Hub");
    expect(m).toContain("Microsoft-pålogging");
  });
  it("gives one line per affected person", () => {
    expect(failureLine("Mats Lien Hansen", "calendar", "no_ms_connection")).not.toEqual(
      failureLine("Marcus Bogen Østenengen", "calendar", "no_ms_connection"));
  });
});
