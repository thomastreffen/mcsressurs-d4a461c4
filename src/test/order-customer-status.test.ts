import { describe, it, expect } from "vitest";
import { customerStatusView, customerTimelineLabel, effectiveCustomerStatusEvents } from "../../supabase/functions/_shared/order-customer-status";

describe("kundevendt status – én kilde", () => {
  it("Venter kunde vises som «Venter på kunde», ikke «Trenger mer info»", () => {
    const v = customerStatusView("waiting_customer", false);
    expect(v.label).toBe("Venter på kunde");
    expect(v.label).not.toMatch(/mer info/i);
    expect(v.headline).not.toMatch(/mer fra deg|mer info/i);
    expect(v.body).toMatch(/tatt tak/);
    expect(v.step).toBe("processing");
    expect(v.subLabel).toBe("Venter på kunde");
    expect(customerTimelineLabel("waiting_customer")).toBe("Status: Venter på kunde");
  });
  it("«Trenger mer info» kun ved formell åpen forespørsel eller Mangler info", () => {
    expect(customerStatusView("waiting_customer", true).label).toBe("Trenger mer info");
    expect(customerStatusView("missing_info").label).toBe("Trenger mer info");
    expect(customerStatusView("under_review").label).toBe("Under behandling");
  });
});

describe("tidslinje: gjentatte forsøk vises én gang", () => {
  it("BST-000067: tre «Venter kunde»-forsøk blir én linje på siste tidspunkt", () => {
    const ev = [
      { event_type: "submitted", created_at: "2026-10-27T15:08:23Z" },
      { event_type: "status_changed", created_at: "2026-11-11T09:18:30Z", payload: { to: "waiting_customer" } },
      { event_type: "status_changed", created_at: "2026-11-11T09:27:54Z", payload: { to: "waiting_customer" } },
      { event_type: "status_changed", created_at: "2026-11-11T09:58:00Z", payload: { to: "waiting_customer" } },
    ];
    const out = effectiveCustomerStatusEvents(ev);
    expect(out.filter((e) => e.event_type === "status_changed")).toHaveLength(1);
    expect(out.find((e) => e.event_type === "status_changed")!.created_at).toBe("2026-11-11T09:58:00Z");
    expect(ev).toHaveLength(4);
  });
  it("ulike statuser beholdes", () => {
    const out = effectiveCustomerStatusEvents([
      { event_type: "status_changed", created_at: "2026-11-11T09:00:00Z", payload: { to: "under_review" } },
      { event_type: "status_changed", created_at: "2026-11-11T09:10:00Z", payload: { to: "waiting_customer" } },
    ]);
    expect(out).toHaveLength(2);
  });
});
