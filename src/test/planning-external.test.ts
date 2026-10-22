import { describe, it, expect } from "vitest";
import { canReadChannel, chosenRecipients, excludedRecipients, type ChannelPerson } from "@/lib/planning-external";
import { planningInviteEmail } from "../../supabase/functions/planning-external-invite/email";
const people: ChannelPerson[] = [
  { id: "mcs", kind: "internal", name: "MCS", company_name: "MCS" },
  { id: "supplier1", kind: "external", name: "Leverandør 1", company_name: "Test", participant_type: "supplier" },
  { id: "supplier2", kind: "external", name: "Leverandør 2", company_name: "Test", participant_type: "supplier" },
];
describe("project collaboration rules", () => {
  it("never offers Intern plan to customers", () => expect(canReadChannel("customer", "internal")).toBe(false));
  it("never offers Intern plan to suppliers", () => expect(canReadChannel("supplier", "internal")).toBe(false));
  it("never offers Kunde to suppliers", () => expect(canReadChannel("supplier", "customer")).toBe(false));
  it("never offers Leverandør to customers", () => expect(canReadChannel("customer", "supplier")).toBe(false));
  it("offers Alle to both groups", () => { expect(canReadChannel("customer", "all")).toBe(true); expect(canReadChannel("supplier", "all")).toBe(true); });
  it("omitted supplier 2 is not in intended recipients", () => expect(chosenRecipients(people,["supplier1"]).map(p => p.id)).toEqual(["mcs","supplier1"]));
  it("names supplier 2 as excluded", () => expect(excludedRecipients(people,["supplier1"]).map(p => p.id)).toEqual(["supplier2"]));
  it("defaults to no selected externals", () => expect(chosenRecipients(people,[]).map(p => p.id)).toEqual(["mcs"]));
  it("escapes user-provided email HTML and uses a fragment not a query token", () => {
    const mail = planningInviteEmail({ name: "<img src=x>", project: "Project & A", inviter: "<script>x</script>", type: "supplier", projectId: "a", token: "safe" });
    expect(mail.html).not.toContain("<img"); expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("/planlegging/ekstern/a#invite=safe");
    expect(mail.html).not.toContain("?invite=");
  });
});