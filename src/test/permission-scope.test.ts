import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const A = "00000000-0000-0000-0000-00000000000a"; // MCS Service
const B = "00000000-0000-0000-0000-00000000000b"; // BusBar
const HANS = "11111111-1111-1111-1111-111111111111";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE TABLE user_accounts(id uuid PRIMARY KEY, auth_user_id uuid, company_id uuid, is_active boolean);
    CREATE TABLE user_permission_overrides_v2(user_account_id uuid, permission_key text, mode text, scope_company_id uuid);
    CREATE TABLE user_roles_v2(user_account_id uuid, role_id uuid, scope_company_id uuid);
    CREATE TABLE role_permissions(role_id uuid, permission_key text, allowed boolean);
    INSERT INTO user_accounts VALUES ('${HANS}','${HANS}','${B}',true);
    INSERT INTO user_permission_overrides_v2 VALUES
      ('${HANS}','task_thread.email_external','allow','${B}'),
      ('${HANS}','regulation.review','allow','${B}'),
      ('${HANS}','jobs.view','allow','${A}');`);
  const sql = readFileSync("drizzle/migrations/0067_scope_aware_permission_check.sql", "utf8").replace(/--> statement-breakpoint/g, "");
  await db.exec(sql);
});

const q = async (perm: string, company?: string) =>
  (await db.query<{ r: boolean }>(company
    ? `SELECT check_permission_v2_company('${HANS}','${perm}','${company}') r`
    : `SELECT check_permission_v2('${HANS}','${perm}') r`)).rows[0].r;

describe("company-scoped overrides", () => {
  it("BusBar-scoped grant is kept in BusBar", async () => {
    expect(await q("task_thread.email_external", B)).toBe(true);
    expect(await q("regulation.review", B)).toBe(true);
  });
  it("BusBar-scoped grant does not apply in MCS Service", async () => {
    expect(await q("task_thread.email_external", A)).toBe(false);
    expect(await q("regulation.review", A)).toBe(false);
  });
  it("grant scoped to a non-home company is ignored without company context", async () => {
    expect(await q("jobs.view")).toBe(false);
    expect(await q("regulation.review")).toBe(true);
  });
  it("unknown permission is denied", async () => {
    expect(await q("admin.manage_users", B)).toBe(false);
  });
});
