import { describe, it, expect } from "vitest";
import { getOrderSiteAddress } from "@/lib/order-display";

describe("order site address", () => {
  it("BST-000064 gives Ramstadveien 6, 1850 Mysen", () => {
    expect(getOrderSiteAddress({ oppdragssted: "Vy Mysen", adresse: "Ramstadveien 6", postnummer: "1850", poststed: "MYSEN", firmanavn: "Caverion Norge AS" }))
      .toBe("Ramstadveien 6, 1850 Mysen");
  });
  it("is empty without site address (no invoice fallback)", () => {
    expect(getOrderSiteAddress({ firmanavn: "Caverion Norge AS", fakturamottaker: "MCS Jaren" })).toBe("");
  });
});
