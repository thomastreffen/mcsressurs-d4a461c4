// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const SERVICE = "00000000-0000-0000-0000-00000000000a";
const BUSBAR = "00000000-0000-0000-0000-00000000000b";
const THOMAS = "10000000-0000-0000-0000-000000000001";
const RUNE = "10000000-0000-0000-0000-000000000002";
const ADMIN = "10000000-0000-0000-0000-000000000003"; // legacy admin, not intake
const UA_T = "20000000-0000-0000-0000-000000000001";
const UA_R = "20000000-0000-0000-0000-000000000002";
const UA_A = "20000000-0000-0000-0000-000000000003";
let db: PGlite;

const migration = readFileSync("drizzle/migrations/0073_order_intake_admin_and_notifications.sql", "utf8").replace(/--> statement-breakpoint/g, "");
const as = (u: string) => db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${u}'::uuid $$`);
const recipients = async (c: string) =>
  (await db.query<{ r: string }>(`SELECT order_intake_recipients('${c}') r`)).rows.map((x) => x.r).sort();

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE TYPE app_role AS ENUM ('admin','montør','super_admin','customer_user');
    CREATE TABLE user_roles(user_id uuid, role app_role);
    CREATE TABLE internal_companies(id uuid PRIMARY KEY, name text);
    CREATE TABLE people(id uuid PRIMARY KEY, full_name text);
    CREATE TABLE user_accounts(id uuid PRIMARY KEY, person_id uuid, auth_user_id uuid, is_active boolean, verified_at timestamptz DEFAULT now());
    CREATE TABLE user_memberships(user_id uuid, company_id uuid, is_active boolean);
    CREATE TABLE permissions(id uuid DEFAULT gen_random_uuid(), key text, module text, description text);
    CREATE TABLE user_permission_overrides_v2(id uuid DEFAULT gen_random_uuid(), user_account_id uuid, permission_key text, scope_company_id uuid, scope_department_id uuid, mode text, created_at timestamptz DEFAULT now());
    CREATE TABLE access_audit_log(id uuid DEFAULT gen_random_uuid(), user_id uuid, home_company_id uuid, company_id uuid, module text, level text, action text, details jsonb, performed_by uuid, performed_at timestamptz DEFAULT now());
    CREATE FUNCTION has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql AS
      $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
    CREATE FUNCTION is_global_superadmin(u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT has_role(u,'super_admin') $$;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    INSERT INTO internal_companies VALUES ('${SERVICE}','MCS Service AS'),('${BUSBAR}','BusBar AS');
    INSERT INTO people VALUES ('${UA_T}','Thomas'),('${UA_R}','Rune'),('${UA_A}','Admin');
    INSERT INTO user_accounts VALUES ('${UA_T}','${UA_T}','${THOMAS}',true),('${UA_R}','${UA_R}','${RUNE}',true),('${UA_A}','${UA_A}','${ADMIN}',true);
    INSERT INTO user_roles VALUES ('${THOMAS}','super_admin'),('${ADMIN}','admin');
    INSERT INTO user_memberships VALUES ('${THOMAS}','${SERVICE}',true),('${RUNE}','${SERVICE}',true),('${ADMIN}','${SERVICE}',true);`);
  await db.exec(migration);
});

describe("order intake responsibility and notifications", () => {
  it("empty list falls back to superadmin, never to all admins", async () => {
    expect(await recipients(SERVICE)).toEqual([THOMAS]);
  });
  it("non-superadmin cannot change the list", async () => {
    await as(ADMIN);
    await expect(db.query(`SELECT set_order_intake_member('${SERVICE}','${UA_A}',true,true)`)).rejects.toThrow(/Ingen tilgang/);
  });
  it("adding a person gives scoped admin + notification only in that company, with history", async () => {
    await as(THOMAS);
    await db.query(`SELECT set_order_intake_member('${SERVICE}','${UA_R}',true,true)`);
    expect(await recipients(SERVICE)).toEqual([RUNE]);
    expect(await recipients(BUSBAR)).toEqual([THOMAS]);
    const o = await db.query<{ n: number }>(`SELECT count(*)::int n FROM user_permission_overrides_v2 WHERE user_account_id='${UA_R}' AND scope_company_id='${SERVICE}'`);
    expect(o.rows[0].n).toBe(1);
    const h = await db.query<{ n: number }>(`SELECT count(*)::int n FROM access_audit_log WHERE module='orders.intake'`);
    expect(h.rows[0].n).toBe(1);
  });
  it("saving the same state twice is idempotent", async () => {
    await db.query(`SELECT set_order_intake_member('${SERVICE}','${UA_R}',true,true)`);
    const o = await db.query<{ n: number }>(`SELECT count(*)::int n FROM user_permission_overrides_v2 WHERE user_account_id='${UA_R}'`);
    expect(o.rows[0].n).toBe(1);
  });
  it("notification requires admin access; removing admin stops notifications", async () => {
    await db.query(`SELECT set_order_intake_member('${SERVICE}','${UA_R}',false,true)`);
    expect(await recipients(SERVICE)).toEqual([THOMAS]);
  });
  it("cannot grant intake to someone without membership in the company", async () => {
    await expect(db.query(`SELECT set_order_intake_member('${BUSBAR}','${UA_R}',true,true)`)).rejects.toThrow(/medlem/);
  });
  it("superadmin can opt in to notifications without a separate grant", async () => {
    await db.query(`SELECT set_order_intake_member('${SERVICE}','${UA_T}',false,true)`);
    expect(await recipients(SERVICE)).toEqual([THOMAS]);
    const m = await db.query<{ has_admin: boolean; notify: boolean }>(`SELECT has_admin, notify FROM list_order_intake_members('${SERVICE}') WHERE user_account_id='${UA_T}'`);
    expect(m.rows[0]).toEqual({ has_admin: true, notify: true });
  });
});
