// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { mergeScopedRoleIds } from "@/lib/role-scope";

const ET = "00000000-0000-0000-0000-0000000000e1", BB = "00000000-0000-0000-0000-0000000000b1";
const ADMIN = "00000000-0000-0000-0000-00000000ad01", PL = "00000000-0000-0000-0000-0000000000a1";
const U = "22222222-2222-2222-2222-222222222222", G = "33333333-3333-3333-3333-333333333333";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE TABLE user_accounts(id uuid PRIMARY KEY, auth_user_id uuid, company_id uuid, is_active boolean);
    CREATE TABLE user_permission_overrides_v2(user_account_id uuid, permission_key text, mode text, scope_company_id uuid);
    CREATE TABLE user_roles_v2(user_account_id uuid, role_id uuid, scope_company_id uuid);
    CREATE TABLE role_permissions(role_id uuid, permission_key text, allowed boolean);
    INSERT INTO role_permissions VALUES ('${ADMIN}','admin.manage_users',true),('${ADMIN}','security.manage',true),('${PL}','jobs.view',true);
    INSERT INTO user_accounts VALUES ('${U}','${U}','${ET}',true),('${G}','${G}','${ET}',true);
    INSERT INTO user_roles_v2 VALUES ('${U}','${ADMIN}','${ET}'),('${G}','${ADMIN}',null);`);
  for (const f of ["0067_scope_aware_permission_check", "0068_role_scope_aware_permission_check"])
    await db.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8").replace(/--> statement-breakpoint/g, ""));
});
const c = async (u: string, p: string, co: string) =>
  (await db.query<{ r: boolean }>(`SELECT check_permission_v2_company('${u}','${p}','${co}') r`)).rows[0].r;

describe("company-scoped roles", () => {
  it("admin scoped to Elektrotavler is admin there", async () => {
    expect(await c(U, "admin.manage_users", ET)).toBe(true);
  });
  it("admin scoped to Elektrotavler gets no admin/security in BusBar", async () => {
    expect(await c(U, "admin.manage_users", BB)).toBe(false);
    expect(await c(U, "security.manage", BB)).toBe(false);
  });
  it("unscoped (global) roles behave as before", async () => {
    expect(await c(G, "admin.manage_users", BB)).toBe(true);
  });
  it("frontend: scoped v2 role applies only in its company and replaces v1 copy", () => {
    const v2 = [{ role_id: ADMIN, scope_company_id: ET }];
    expect(mergeScopedRoleIds([ADMIN, PL], v2, BB)).toEqual([PL]);
    expect(mergeScopedRoleIds([ADMIN, PL], v2, ET).sort()).toEqual([ADMIN, PL].sort());
    expect(mergeScopedRoleIds([PL], [{ role_id: PL, scope_company_id: null }], BB)).toEqual([PL]);
  });
});
