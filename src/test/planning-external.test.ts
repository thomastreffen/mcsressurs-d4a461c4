import { describe, it, expect } from "vitest";
import { canReadChannel, chosenRecipients, excludedRecipients, externalCanOpen, externalCanWrite, type ChannelPerson } from "@/lib/planning-external";
import { planningInviteEmail } from "../../supabase/functions/planning-external-invite/email";
import { planningAccessEmail } from "../../supabase/functions/planning-external-login/email";
import { clearExternalStorage, externalLandingPath, EXTERNAL_PORTAL_KEY } from "@/lib/planning-external-portal";
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
  it("opens a single explicitly listed project directly", () => {
    expect(externalLandingPath([{ id: "project-a" }])).toBe("/planlegging/ekstern/project-a");
  });
  it("keeps multiple explicit projects on Mine prosjekter", () => {
    expect(externalLandingPath([{ id: "project-a" }, { id: "project-b" }])).toBe("/ekstern");
  });
  it("does not invent a project for an empty grant list", () => {
    expect(externalLandingPath([])).toBe("/ekstern");
  });
  it("logout clears every external credential without clearing Hub storage", () => {
    sessionStorage.setItem(EXTERNAL_PORTAL_KEY, "portal-test");
    sessionStorage.setItem("planning-external:a", "project-test");
    sessionStorage.setItem("hub-selection", "keep");
    clearExternalStorage();
    expect(sessionStorage.getItem(EXTERNAL_PORTAL_KEY)).toBeNull();
    expect(sessionStorage.getItem("planning-external:a")).toBeNull();
    expect(sessionStorage.getItem("hub-selection")).toBe("keep");
    sessionStorage.removeItem("hub-selection");
  });
  it("resend uses the common entrance and fragment-only credential", () => {
    const email = planningAccessEmail({ name: "Test", project: "A", type: "supplier", token: "test-only" });
    expect(email.html).toContain("/ekstern#access=test-only");
    expect(email.html).not.toContain("?access=");
  });
  it("completed (read) projects can be opened but not written to", () => { expect(externalCanOpen("read")).toBe(true); expect(externalCanWrite("read")).toBe(false); });
  it("closed projects can neither be opened nor written to", () => { expect(externalCanOpen("none")).toBe(false); expect(externalCanWrite("none")).toBe(false); });
  it("active projects allow writing", () => expect(externalCanWrite("write")).toBe(true));
  it("a single closed project does not auto-open", () => {
    expect(externalLandingPath([{ id: "project-a", access_mode: "none" }])).toBe("/ekstern");
  });
});
