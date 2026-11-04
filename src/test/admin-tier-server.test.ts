// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const SERVICE = "00000000-0000-0000-0000-00000000000a";
const BUSBAR = "00000000-0000-0000-0000-00000000000b";
const THOMAS = "10000000-0000-0000-0000-000000000001";
const JOHN = "10000000-0000-0000-0000-000000000002"; // legacy admin, no explicit assignment
const SINDRE = "10000000-0000-0000-0000-000000000003"; // member Service + BusBar
let db: PGlite;

const load = (f: string) => readFileSync(`drizzle/migrations/${f}`, "utf8").replace(/--> statement-breakpoint/g, "");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE TYPE app_role AS ENUM ('admin','montør','super_admin','customer_user');
    CREATE TABLE user_roles(user_id uuid, role app_role);
    CREATE TABLE internal_companies(id uuid PRIMARY KEY, name text);
    CREATE TABLE user_memberships(user_id uuid, company_id uuid, is_active boolean);
    CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid);
    CREATE FUNCTION has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql AS
      $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    INSERT INTO internal_companies VALUES ('${SERVICE}','MCS Service AS'),('${BUSBAR}','BusBar AS');
    INSERT INTO user_roles VALUES ('${THOMAS}','super_admin'),('${JOHN}','admin'),('${SINDRE}','admin');
    INSERT INTO user_memberships VALUES ('${JOHN}','${SERVICE}',true),('${SINDRE}','${SERVICE}',true),('${SINDRE}','${BUSBAR}',true);`);
  await db.exec(load("0070_admin_tier_helpers_inactive.sql"));
  await db.exec(load("0072_company_admin_explicit_assignments.sql"));
});

const ca = async (u: string, c: string | null) =>
  (await db.query<{ r: boolean }>(`SELECT is_company_admin('${u}', ${c ? `'${c}'` : "NULL"}) r`)).rows[0].r;

describe("company-aware admin tiers (server)", () => {
  it("only super_admin is global superadmin", async () => {
    const r = await db.query<{ u: string; s: boolean }>(`SELECT x u, is_global_superadmin(x::uuid) s FROM unnest(ARRAY['${THOMAS}','${JOHN}','${SINDRE}']) x`);
    expect(r.rows.map((x) => x.s)).toEqual([true, false, false]);
  });
  it("legacy admin role alone never makes company admin", async () => {
    expect(await ca(JOHN, SERVICE)).toBe(false);
  });
  it("explicit assignment applies only in that company and requires active membership", async () => {
    await db.exec(`INSERT INTO company_admin_assignments(auth_user_id, company_id) VALUES ('${SINDRE}','${SERVICE}')`);
    expect(await ca(SINDRE, SERVICE)).toBe(true);
    expect(await ca(SINDRE, BUSBAR)).toBe(false);
    await db.exec(`UPDATE user_memberships SET is_active=false WHERE user_id='${SINDRE}' AND company_id='${SERVICE}'`);
    expect(await ca(SINDRE, SERVICE)).toBe(false);
  });
  it("revoked assignment and unknown company never grant", async () => {
    await db.exec(`UPDATE user_memberships SET is_active=true WHERE user_id='${SINDRE}';
      UPDATE company_admin_assignments SET revoked_at=now() WHERE auth_user_id='${SINDRE}'`);
    expect(await ca(SINDRE, SERVICE)).toBe(false);
    expect(await ca(THOMAS, null)).toBe(false);
  });
  it("superadmin covers every company", async () => {
    expect(await ca(THOMAS, BUSBAR)).toBe(true);
  });
});
