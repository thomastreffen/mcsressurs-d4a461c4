import { describe, it, expect } from "vitest";
import { suggestClassification, canLinkTripletex } from "@/lib/project-classification";

const base = { project_type: "project", project_number: null, external_tripletex_id: null, has_tripletex_mapping: false, parent_is_financial: false, has_children: false };

describe("TPX-000 klassifisering", () => {
  it("prosjektnummer gir økonomisk prosjekt", () => expect(suggestClassification({ ...base, project_number: "20001" })).toEqual({ type: "financial_project", status: "auto" }));
  it("Tripletex-mapping gir økonomisk prosjekt", () => expect(suggestClassification({ ...base, has_tripletex_mapping: true }).type).toBe("financial_project"));
  it("underjobber uten nummer krever gjennomgang", () => expect(suggestClassification({ ...base, has_children: true })).toEqual({ type: "financial_project", status: "needs_review" }));
  it("oppgave under prosjekt blir jobb", () => expect(suggestClassification({ ...base, project_type: "task", parent_is_financial: true }).type).toBe("job"));
  it("service blir serviceoppdrag", () => expect(suggestClassification({ ...base, project_type: "service" }).type).toBe("service"));
  it("resten havner i avklaringskø", () => expect(suggestClassification(base)).toEqual({ type: "unclassified", status: "needs_review" }));
  it("bare prosjekt kan kobles til Tripletex", () => {
    expect(canLinkTripletex("financial_project")).toBe(true);
    for (const t of ["job", "service", "internal", "unclassified"] as const) expect(canLinkTripletex(t)).toBe(false);
  });
});
