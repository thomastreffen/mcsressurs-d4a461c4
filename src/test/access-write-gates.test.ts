// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const ROOT = "10000000-0000-0000-0000-000000000001";
const LEGACY = "10000000-0000-0000-0000-000000000002";
const MEMBER = "10000000-0000-0000-0000-000000000003";
const SIMEN = "10000000-0000-0000-0000-000000000004";
let db: PGlite;
const staged = readFileSync(".lovable/security-2026-11-09/access-write-gates.staged.sql", "utf8");
const tables = [...new Set([...staged.matchAll(/ON public\.(\w+)/g)].map(m => m[1]))];

async function asUser(user: string, sql: string) {
  return db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',true);`);
    return tx.query(sql);
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE root_users(id uuid PRIMARY KEY); INSERT INTO root_users VALUES ('${ROOT}');
    CREATE FUNCTION is_global_superadmin(_auth_user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM root_users WHERE id=_auth_user_id) $$;`);
  for (const table of tables) {
    await db.exec(`CREATE TABLE public.${table}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), marker text);
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO authenticated;
      ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY legacy_permissive ON public.${table} FOR ALL TO authenticated USING (true) WITH CHECK (true);`);
  }
});
afterAll(async () => { await db?.close(); });

describe("actual staged restrictive write SQL, isolated PostgreSQL roles", () => {
  it("reproduces legacy permissive escalation before the gates", async () => {
    await asUser(LEGACY, "INSERT INTO user_roles(marker) VALUES ('legacy-self-escalation')");
    expect((await db.query("SELECT marker FROM user_roles")).rows).toEqual([{ marker: "legacy-self-escalation" }]);
    await db.exec("DELETE FROM user_roles");
    await db.exec(staged);
  });
  it("blocks INSERT through all 15 access sources despite old permissive policies", async () => {
    for (const table of tables) {
      await expect(asUser(LEGACY, `INSERT INTO ${table}(marker) VALUES ('forbidden')`)).rejects.toThrow(/row-level security/i);
      await asUser(ROOT, `INSERT INTO ${table}(marker) VALUES ('retained')`);
    }
    expect(tables).toHaveLength(15);
  });
  it("blocks legacy and member UPDATE/DELETE, retains global admin and reads", async () => {
    for (const user of [LEGACY, MEMBER]) {
      for (const table of tables) {
        expect((await asUser(user, `UPDATE ${table} SET marker='forbidden' RETURNING id`)).rows).toHaveLength(0);
        expect((await asUser(user, `DELETE FROM ${table} RETURNING id`)).rows).toHaveLength(0);
        expect((await asUser(user, `SELECT marker FROM ${table}`)).rows).toEqual([{ marker: "retained" }]);
      }
    }
    expect((await asUser(ROOT, "UPDATE user_roles SET marker='authorized' RETURNING id")).rows).toHaveLength(1);
  });
  it("Simen stays blocked until explicit assignment, then gets actual RLS access; Thomas never loses access", async () => {
    await expect(asUser(SIMEN, "INSERT INTO user_roles(marker) VALUES ('before-approval')")).rejects.toThrow(/row-level security/i);
    await db.exec(`INSERT INTO root_users VALUES ('${SIMEN}')`);
    await asUser(SIMEN, "INSERT INTO user_roles(marker) VALUES ('approved')");
    await db.exec(`DELETE FROM root_users WHERE id='${SIMEN}'`);
    await expect(asUser(SIMEN, "INSERT INTO user_roles(marker) VALUES ('after-rollback')")).rejects.toThrow(/row-level security/i);
    await asUser(ROOT, "INSERT INTO user_roles(marker) VALUES ('thomas-retained')");
    expect((await db.query("SELECT marker FROM user_roles ORDER BY marker")).rows.map(r => r.marker)).toEqual(["approved", "authorized", "thomas-retained"]);
  });
});