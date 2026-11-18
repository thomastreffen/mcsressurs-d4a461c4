import { describe, it, expect } from "vitest";
import { conversionError } from "@/lib/offer-conversion";
describe("offer conversion errors", () => {
  it("Tripletex companies are told to link, not create", () => {
    expect(conversionError("tripletex_company_link_only")).toContain("koble til eksisterende");
  });
  it("non-accepted offer and other customer's project are explained", () => {
    expect(conversionError("ERROR: offer_not_accepted")).toBe("Tilbudet er ikke akseptert");
    expect(conversionError("project_customer_mismatch")).toBe("Prosjektet tilhører en annen kunde");
  });
});
