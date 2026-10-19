import { describe, it, expect } from "vitest";
import { assertAllowed, assertTripletexCompany } from "../../supabase/functions/_shared/tripletex-guard";

const MCS = "a0000000-0000-0000-0000-000000000001";
const BUSBAR = "a3eb3912-cc88-4836-9f78-5207011aba55";
const conn = { id: "c", company_id: MCS, environment: "test", secret_name: "TRIPLETEX_TEST_API_TOKEN", expected_tripletex_company_id: 88777230, mode: "read_only", capabilities: ["projects_read"] };

describe("Tripletex company guard", () => {
  it("blocks MCS Service data on another company's connection", () => {
    expect(() => assertAllowed({ ...conn, company_id: BUSBAR }, { sourceCompanyId: MCS })).toThrow(/annet selskap/);
  });
  it("blocks everything when mode is off", () => {
    expect(() => assertAllowed({ ...conn, mode: "off" }, {})).toThrow();
  });
  it("blocks writes on read-only connections", () => {
    expect(() => assertAllowed(conn, { write: true })).toThrow();
  });
  it("blocks production until explicitly enabled", () => {
    expect(() => assertAllowed({ ...conn, environment: "production" }, {})).toThrow();
  });
  it("rejects a key belonging to another Tripletex company", () => {
    expect(() => assertTripletexCompany(conn, 12345)).toThrow();
    expect(() => assertTripletexCompany(conn, 88777230)).not.toThrow();
  });
});
