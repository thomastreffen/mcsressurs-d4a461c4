import { describe, it, expect } from "vitest";
import { activeIdentity, mailboxReadiness, EXCLUDED_TECHNICIANS } from "../../supabase/functions/_shared/job-outlook-pilot-selector";
const ok = { technician_id: "b0716dc3-ddf7-4501-92af-2397a5180085", archived: false, deleted: false, account_active: true, person_active: true, employed_in_company: true, mailbox: "mats.lien.hansen@mcselektrotavler.no" };
const now = new Date("2026-11-20T10:00:00Z");
describe("central calendar eligibility", () => {
  it("active employee with mailbox is eligible", () => { expect(activeIdentity(ok)).toBe(true); });
  it("Ståle Roar Jensen and Andre Midtgard are never eligible, even with an active login", () => {
    for (const id of ["ebc15ac7-fd4c-461d-a61c-06b97d705cc0", "ba707f5e-0a7d-40b8-95f2-896d1c4c01c2"]) {
      expect(EXCLUDED_TECHNICIANS.has(id)).toBe(true);
      expect(activeIdentity({ ...ok, technician_id: id })).toBe(false);
    }
  });
  it.each(["archived", "deleted"])("%s technician excluded", k => { expect(activeIdentity({ ...ok, [k]: true })).toBe(false); });
  it.each(["account_active", "person_active", "employed_in_company"])("missing %s excluded", k => { expect(activeIdentity({ ...ok, [k]: false })).toBe(false); });
  it("missing mailbox excluded", () => { expect(activeIdentity({ ...ok, mailbox: "" })).toBe(false); });
});
describe("per-mailbox readiness", () => {
  it("each mailbox needs its own fresh 200", () => {
    expect(mailboxReadiness(null, false, now)).toBe("not_selected");
    expect(mailboxReadiness(null, true, now)).toBe("probe_required");
    expect(mailboxReadiness({ created_at: "2026-11-20T09:00:00Z", result: { pass: true, http: 200 } }, true, now)).toBe("probe_ok");
    expect(mailboxReadiness({ created_at: "2026-11-18T09:00:00Z", result: { pass: true, http: 200 } }, true, now)).toBe("probe_required");
    expect(mailboxReadiness({ created_at: "2026-11-20T09:00:00Z", result: { pass: false, http: 403 } }, true, now)).toBe("probe_failed");
  });
});
