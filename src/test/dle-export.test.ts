import { describe, expect, it } from "vitest";
import { buildDleFiles, externalText, generateDlePdf, type DleRecord } from "@/lib/dle/export";
const records: DleRecord[] = [{ id: "secret-id-1", title: "RUH 2026-001", sections: [{ heading: "Beskrivelse", text: "Registrert avvik" }] }, { id: "secret-id-2", title: "RUH 2026-002", sections: [] }];
describe("DLE export rules", () => {
  it("exports one PDF per post when separate is selected", () => {
    const files = buildDleFiles("incidents", records, true, "MCS Service", "2026-10-19");
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("MCS_Service_RUH_2026_001_2026-10-19.pdf");
    expect(files[0].path).toBe("06_Avvik/MCS_Service_RUH_2026_001_2026-10-19.pdf");
  });
  it("combines only the selected records into one category PDF", () => {
    expect(buildDleFiles("incidents", records, false, "MCS Service", "2026-10-19")[0].records).toHaveLength(2);
    expect(buildDleFiles("incidents", records.slice(0, 1), false, "MCS Service", "2026-10-19")[0].records).toHaveLength(1);
  });
  it("keeps original SDS PDFs separate even in combined mode", () => {
    const originals = records.map((r) => ({ ...r, original: { chemicalId: r.id, filename: "original.pdf", mime: "application/pdf" } }));
    const files = buildDleFiles("sds", originals, false, "MCS Service", "2026-10-19");
    expect(files).toHaveLength(2);
    expect(files[0].records[0].original?.filename).toBe("original.pdf");
    expect(files[0].path.startsWith("08_SDS/")).toBe(true);
  });
  it("never puts technical IDs in download names", () => {
    expect(buildDleFiles("incidents", records, true, "MCS Service", "2026-10-19").map((f) => f.name).join()).not.toContain("secret-id");
  });
  it("removes internal system links from external text", () => {
    expect(externalText("Tiltak https://mcsressurs.lovable.app/hms/people/123 /compliance/tilsyn/456 avsluttet")).toBe("Tiltak   avsluttet");
  });
  it("assigns unique archive entries for duplicate titles", () => {
    const files = buildDleFiles("incidents", records.map((r) => ({ ...r, title: "RUH" })), true, "MCS Service", "2026-10-19");
    expect(new Set(files.map((f) => f.path)).size).toBe(2);
  });
  it("generates an actual nonempty PDF", async () => {
    const file = buildDleFiles("incidents", records, false, "MCS Service", "2026-10-19")[0];
    const blob = generateDlePdf(file, "MCS Service", "2026-10-19");
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(500);
  });
});
