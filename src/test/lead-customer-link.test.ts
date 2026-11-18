import { describe, it, expect } from "vitest";
import { leadCustomerPayload } from "@/components/leads/LeadCustomerPicker";
const c = { id: "c1", name: "Bravida Norge AS", org_number: "1", accounts: [{ id: "a1", name: "Oslo", org_number: null }], contacts: [] };
describe("lead customer link", () => {
  it("existing customer links customer_id without account", () => {
    expect(leadCustomerPayload({ mode: "existing", customer: c, accountId: null })).toEqual({ company_name: "Bravida Norge AS", customer_id: "c1", customer_account_id: null });
  });
  it("existing customer with department links account", () => {
    expect(leadCustomerPayload({ mode: "existing", customer: c, accountId: "a1" })?.customer_account_id).toBe("a1");
  });
  it("foreign department id is dropped", () => {
    expect(leadCustomerPayload({ mode: "existing", customer: c, accountId: "x" })?.customer_account_id).toBeNull();
  });
  it("new business is free text only, never a customer link", () => {
    expect(leadCustomerPayload({ mode: "new", name: " Ny AS " })).toEqual({ company_name: "Ny AS", customer_id: null, customer_account_id: null });
    expect(leadCustomerPayload({ mode: "new", name: "  " })).toBeNull();
  });
});
