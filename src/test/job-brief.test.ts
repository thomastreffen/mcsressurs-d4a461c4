import { describe, it, expect } from "vitest";
import { buildOperationalJobBrief, briefEmailRows } from "../../supabase/functions/_shared/job-brief";

const values = [
  { field_key: "kontaktperson_kunde_x", value: "Truls Martin Johansen" },
  { field_key: "telefon_kunde_x", value: "91533386" },
  { field_key: "epost_kunde_x", value: "truls.johansen@caverion.com" },
  { field_key: "oppdragssted_a", value: "Vy Mysen" },
  { field_key: "oppdragssted_b", value: "Ramstadveien 6" },
  { field_key: "oppdragssted_c", value: "1850 MYSEN" },
  { field_key: "arbeidsbeskrivelse_x", value: "Sette inn ny 3-polt NSX 400A ML 2,3 i eksisterende tavle." },
  { field_key: "materialansvar_x", value: "MCS Service skaffer alt" },
  { field_key: "hva_skaffer_service_x", value: "Klemmer for bryter og lange avdekkinger på begge sider." },
  { field_key: "fakturamottaker_x", value: "MCS Jaren" },
  { field_key: "fakturamerking_x", value: "J11580-102" },
];
const summary = { oppdragssted: "Vy Mysen", adresse: "Ramstadveien 6", postnummer: "1850", poststed: "MYSEN", firmanavn: "Caverion Norge AS" };
const event = {
  internal_number: "JOB-000413", title: "Vy Mysen 400A", customer: "Caverion Norge AS",
  description: "Bestilling: BST-000064\nKunde: Caverion Norge AS\nKontaktperson: Truls Martin Johansen\nTelefon: 91533386\nOppdragssted: Vy Mysen\n\nSette inn ny 3-polt NSX 400A ML 2,3 i eksisterende tavle.",
};

describe("operational job brief (BST-000064 / JOB-000413)", () => {
  const b = buildOperationalJobBrief({ event, orderSummary: summary, orderValues: values });
  it("resolves the expected fields from the order", () => {
    expect(b.siteName).toBe("Vy Mysen");
    expect(b.address).toBe("Ramstadveien 6, 1850 Mysen");
    expect(b.customer).toBe("Caverion Norge AS");
    expect(b.contactName).toBe("Truls Martin Johansen");
    expect(b.contactPhone).toBe("91533386");
    expect(b.materialResponsibility).toBe("MCS Service skaffer alt");
    expect(b.serviceMustProcure).toBe("Klemmer for bryter og lange avdekkinger på begge sider.");
    expect(b.workDescription).toBe("Sette inn ny 3-polt NSX 400A ML 2,3 i eksisterende tavle.");
  });
  it("never includes invoice recipient or PO in the email", () => {
    const html = briefEmailRows(b, { date: "torsdag", time: "08:00 – 16:00" });
    expect(html).not.toContain("MCS Jaren");
    expect(html).not.toContain("J11580-102");
    expect(html).toContain("google.com/maps");
  });
  it("edited event fields override the order", () => {
    const e = buildOperationalJobBrief({ event: { ...event, site_contact_name: "Ola", address: "Storgata 1", postal_code: "0150", city: "Oslo" }, orderSummary: summary, orderValues: values });
    expect(e.contactName).toBe("Ola");
    expect(e.address).toBe("Storgata 1, 0150 Oslo");
  });
  it("escapes HTML from order text", () => {
    const html = briefEmailRows({ ...b, workDescription: "<script>x</script>" }, { date: "", time: "" });
    expect(html).not.toContain("<script>");
  });
});
