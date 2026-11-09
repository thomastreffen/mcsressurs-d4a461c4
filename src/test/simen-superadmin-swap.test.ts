// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Isolated rehearsal of approval A, option B: replace Simen's single legacy row admin -> super_admin.
const THOMAS = "5a50a16b-ed15-4720-8cd6-3c303100395f";
const SIMEN = "9ee227c5-7cc0-409a-93aa-1ef0696d27ca";
const SIMEN_ROW = "7bf27509-ed16-4cdc-b2a6-553bbef21b99";
const JOHN = "6f2823df-7944-4fd1-bab0-95fe08d0a61e";
const load = (f: string) => readFileSync(`drizzle/migrations/${f}`, "utf8").replace(/--> statement-breakpoint/g, "");
let db: PGlite;

const APPLY = `UPDATE user_roles SET role='super_admin' WHERE id='${SIMEN_ROW}' AND user_id='${SIMEN}' AND role='admin'`;
const ROLLBACK = `UPDATE user_roles SET role='admin' WHERE id='${SIMEN_ROW}' AND user_id='${SIMEN}' AND role='super_admin'`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE TYPE app_role AS ENUM ('admin','montør','super_admin','customer_user');
    CREATE TABLE user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, role app_role,
      CONSTRAINT user_roles_user_id_unique UNIQUE(user_id), CONSTRAINT user_roles_user_id_role_key UNIQUE(user_id, role));
    CREATE TABLE internal_companies(id uuid PRIMARY KEY, name text);
    CREATE TABLE user_memberships(user_id uuid, company_id uuid, is_active boolean);
    CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid);
    CREATE FUNCTION has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql AS
      $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
    CREATE FUNCTION is_admin(_u uuid) RETURNS boolean LANGUAGE sql AS
      $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_u AND role IN ('admin','super_admin')) $$;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    INSERT INTO user_roles(id,user_id,role) VALUES
      ('cad9ef7a-ffc9-4ad1-8919-b238f94a691a','${THOMAS}','super_admin'),
      ('${SIMEN_ROW}','${SIMEN}','admin'),
      ('7d5a971d-d7f3-4761-8cab-48f45e448e5f','${JOHN}','admin');`);
  await db.exec(load("0070_admin_tier_helpers_inactive.sql"));
});

const snap = async () => (await db.query(`SELECT id::text, user_id::text, role::text FROM user_roles ORDER BY id`)).rows;
const tier = async (u: string) =>
  (await db.query<{ g: boolean; a: boolean }>(`SELECT is_global_superadmin('${u}') g, is_admin('${u}') a`)).rows[0];

describe("Simen super_admin swap (option B)", () => {
  it("adding a second row is blocked by UNIQUE(user_id) — the original failure", async () => {
    await expect(db.exec(`INSERT INTO user_roles(user_id,role) VALUES ('${SIMEN}','super_admin')`)).rejects.toThrow();
  });

  it("apply changes exactly one row, keeps admin-level access and adds global superadmin", async () => {
    const before = await snap();
    expect(await tier(SIMEN)).toEqual({ g: false, a: true });
    const r = await db.query(APPLY);
    expect(r.affectedRows).toBe(1);
    const after = await snap();
    expect(after.length).toBe(before.length);
    const changed = after.filter((row, i) => JSON.stringify(row) !== JSON.stringify(before[i]));
    expect(changed).toEqual([{ id: SIMEN_ROW, user_id: SIMEN, role: "super_admin" }]);
    expect(await tier(SIMEN)).toEqual({ g: true, a: true });
    expect(await tier(THOMAS)).toEqual({ g: true, a: true });
    expect(await tier(JOHN)).toEqual({ g: false, a: true });
  });

  it("apply is idempotent", async () => {
    expect((await db.query(APPLY)).affectedRows).toBe(0);
  });

  it("rollback restores only Simen's row and never touches Thomas", async () => {
    expect((await db.query(ROLLBACK)).affectedRows).toBe(1);
    expect(await tier(SIMEN)).toEqual({ g: false, a: true });
    expect(await tier(THOMAS)).toEqual({ g: true, a: true });
    expect((await db.query(ROLLBACK)).affectedRows).toBe(0);
  });
});
