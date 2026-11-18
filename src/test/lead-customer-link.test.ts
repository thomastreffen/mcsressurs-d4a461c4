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

import { filterContacts, selectableRecipients, validOrgOrEmpty } from "@/lib/customer-register";
const k = (id: string, acc: string | null, active = true, email: string | null = "a@b.no") => ({ id, name: id, email, phone: null, role: null, customer_account_id: acc, owner_user_id: null, is_active: active, verified_at: null });
describe("customer register", () => {
  it("department without own org number is allowed; invalid org rejected", () => {
    expect(validOrgOrEmpty("")).toBe(true);
    expect(validOrgOrEmpty("123 456 789")).toBe(true);
    expect(validOrgOrEmpty("12345")).toBe(false);
  });
  it("filters contacts per department and hides departed by default", () => {
    const list = [k("1", "A"), k("2", null), k("3", "A", false)];
    expect(filterContacts(list, "A", false).map((c) => c.id)).toEqual(["1"]);
    expect(filterContacts(list, "none", false).map((c) => c.id)).toEqual(["2"]);
    expect(filterContacts(list, "A", true).map((c) => c.id)).toEqual(["1", "3"]);
  });
  it("departed contacts and contacts without email are never email recipients", () => {
    expect(selectableRecipients([k("1", null), k("2", null, false), k("3", null, true, null)]).map((c) => c.id)).toEqual(["1"]);
  });
});
