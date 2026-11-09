// @vitest-environment node
// Isolated rehearsal of the company-bounded legacy admin migration and superadmin-only access write gates.
// Uses the exact generated SQL artifacts that are applied in production.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const DIR = ".lovable/security-2026-11-09";
const SERVICE = "00000000-0000-0000-0000-00000000000a";
const BUSBAR = "00000000-0000-0000-0000-00000000000b";
const ELEKTRO = "00000000-0000-0000-0000-00000000000c";
const THOMAS = "10000000-0000-0000-0000-000000000001"; // super_admin
const SIMEN = "10000000-0000-0000-0000-000000000002"; // super_admin, member Elektrotavler only
const JOHN = "10000000-0000-0000-0000-000000000003"; // legacy admin, member Service
const RUNE = "10000000-0000-0000-0000-000000000004"; // v1 admin.manage_users override, member Service
const SINDRE = "10000000-0000-0000-0000-000000000005"; // legacy admin, member Service+Elektro+BusBar
const MARCUS = "10000000-0000-0000-0000-000000000006"; // technician
const EV_SERVICE = "20000000-0000-0000-0000-00000000000a";
const EV_BUSBAR = "20000000-0000-0000-0000-00000000000b";
const EV_NULL = "20000000-0000-0000-0000-00000000000c";

let db: PGlite;
const load = (f: string) => readFileSync(`drizzle/migrations/${f}`, "utf8").replace(/--> statement-breakpoint/g, "");
const art = (f: string) => readFileSync(`${DIR}/${f}`, "utf8");
const eventsOnly = (sql: string) => sql.split(/;\n(?=ALTER POLICY)/).filter((s) => s.includes(" ON public.events ")).map((s) => s.replace(/;\s*$/, "")).join(";\n") + ";";

async function as(user: string, sql: string) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',true)`);
    return tx.query(sql);
  });
}
const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow(/row-level security/i);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE TYPE app_role AS ENUM ('admin','montør','super_admin','customer_user');
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE internal_companies(id uuid PRIMARY KEY, name text);
    CREATE TABLE user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE, role app_role);
    CREATE TABLE user_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, company_id uuid, is_active boolean);
    CREATE TABLE user_permission_overrides(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, permission_key text, allowed boolean);
    CREATE TABLE user_role_assignments(user_id uuid, role_id uuid);
    CREATE TABLE role_permissions(role_id uuid, permission_key text, allowed boolean);
    CREATE TABLE technicians(id uuid PRIMARY KEY, user_id uuid);
    CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid, title text);
    CREATE TABLE event_technicians(event_id uuid, technician_id uuid);
    CREATE TABLE job_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid);
    CREATE TABLE leads(id uuid PRIMARY KEY, company_id uuid); CREATE TABLE calculations(id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE customers(id uuid PRIMARY KEY, company_id uuid); CREATE TABLE documents(id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE form_instances(id uuid PRIMARY KEY, company_id uuid); CREATE TABLE form_templates(id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE schedule_blocks(id uuid PRIMARY KEY, company_id uuid); CREATE TABLE customer_portal_users(id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE tasks(id uuid PRIMARY KEY, company_id uuid);
    CREATE FUNCTION has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
      $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
    CREATE FUNCTION check_permission(_user_id uuid, _perm text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
      $$ SELECT COALESCE((SELECT allowed FROM user_permission_overrides WHERE user_id=_user_id AND permission_key=_perm LIMIT 1),
        (SELECT bool_or(rp.allowed) FROM user_role_assignments ura JOIN role_permissions rp ON rp.role_id=ura.role_id WHERE ura.user_id=_user_id AND rp.permission_key=_perm), false) $$;
    CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
      $$ SELECT has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR check_permission(auth.uid(),'admin.manage_users') $$;
    CREATE FUNCTION is_active_member_of(_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
      $$ SELECT _company_id IS NOT NULL AND EXISTS(SELECT 1 FROM user_memberships um WHERE um.user_id=auth.uid() AND um.company_id=_company_id AND um.is_active) $$;
    CREATE FUNCTION event_company_id(_event_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
      $$ SELECT company_id FROM events WHERE id=_event_id $$;
    INSERT INTO internal_companies VALUES ('${SERVICE}','Service'),('${BUSBAR}','BusBar'),('${ELEKTRO}','Elektrotavler');
    INSERT INTO user_roles(user_id,role) VALUES ('${THOMAS}','super_admin'),('${SIMEN}','super_admin'),('${JOHN}','admin'),('${SINDRE}','admin'),('${MARCUS}','montør');
    INSERT INTO user_permission_overrides(user_id,permission_key,allowed) VALUES ('${RUNE}','admin.manage_users',true);
    INSERT INTO user_memberships(user_id,company_id,is_active) VALUES ('${SIMEN}','${ELEKTRO}',true),('${JOHN}','${SERVICE}',true),('${RUNE}','${SERVICE}',true),
      ('${SINDRE}','${SERVICE}',true),('${SINDRE}','${ELEKTRO}',true),('${SINDRE}','${BUSBAR}',true),('${MARCUS}','${SERVICE}',true);
    INSERT INTO technicians VALUES ('30000000-0000-0000-0000-000000000001','${MARCUS}');
    INSERT INTO events VALUES ('${EV_SERVICE}','${SERVICE}','Service'),('${EV_BUSBAR}','${BUSBAR}','BusBar'),('${EV_NULL}',NULL,'Orphan');
    INSERT INTO event_technicians VALUES ('${EV_SERVICE}','30000000-0000-0000-0000-000000000001');
    GRANT SELECT, INSERT, UPDATE, DELETE ON events, user_roles, user_memberships, user_permission_overrides TO authenticated;
    GRANT SELECT ON event_technicians, technicians TO authenticated;
    ALTER TABLE events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "read all" ON events FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Admins can create events" ON public.events FOR INSERT WITH CHECK (is_admin());
    CREATE POLICY "Admins can delete events" ON public.events FOR DELETE USING (is_admin());
    CREATE POLICY "Admins can update all, technicians own" ON public.events FOR UPDATE USING ((is_admin() OR (id IN ( SELECT event_technicians.event_id FROM event_technicians WHERE (event_technicians.technician_id IN ( SELECT technicians.id FROM technicians WHERE (technicians.user_id = auth.uid())))))));
    ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY; ALTER TABLE user_memberships ENABLE ROW LEVEL SECURITY; ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;
    CREATE POLICY legacy_admin_all ON user_roles FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
    CREATE POLICY legacy_admin_all ON user_memberships FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
    CREATE POLICY legacy_admin_all ON user_permission_overrides FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());`);
  await db.exec(load("0070_admin_tier_helpers_inactive.sql"));
  await db.exec(art("company-bounded-admin.helpers.sql"));
  const gates = art("access-write-gates.sql").split("\n").filter((l) => / ON public\.(user_roles|user_memberships|user_permission_overrides) AS/.test(l)).join("\n");
  await db.exec(gates);
  await db.exec(eventsOnly(art("company-bounded-admin.policies.sql")));
});
afterAll(async () => { await db?.close(); });

describe("company-bounded legacy admin (events)", () => {
  it("legacy admin John keeps full CRUD in his own company (Service)", async () => {
    await as(JOHN, `INSERT INTO events VALUES (gen_random_uuid(),'${SERVICE}','new')`);
    expect((await as(JOHN, `UPDATE events SET title='edited' WHERE id='${EV_SERVICE}' RETURNING id`)).rows).toHaveLength(1);
  });
  it("legacy admin John cannot create, edit or delete in BusBar", async () => {
    await denied(as(JOHN, `INSERT INTO events VALUES (gen_random_uuid(),'${BUSBAR}','x')`));
    expect((await as(JOHN, `UPDATE events SET title='x' WHERE id='${EV_BUSBAR}' RETURNING id`)).rows).toHaveLength(0);
    expect((await as(JOHN, `DELETE FROM events WHERE id='${EV_BUSBAR}' RETURNING id`)).rows).toHaveLength(0);
  });
  it("moving a Service row to BusBar is rejected", async () => {
    await denied(as(JOHN, `UPDATE events SET company_id='${BUSBAR}' WHERE id='${EV_SERVICE}'`));
  });
  it("Rune (v1 admin.manage_users) is bounded to MCS Service", async () => {
    expect((await as(RUNE, `UPDATE events SET title='r' WHERE id='${EV_SERVICE}' RETURNING id`)).rows).toHaveLength(1);
    await denied(as(RUNE, `INSERT INTO events VALUES (gen_random_uuid(),'${ELEKTRO}','x')`));
  });
  it("Sindre keeps rows in his member companies incl. BusBar projects", async () => {
    expect((await as(SINDRE, `UPDATE events SET title='s' WHERE id='${EV_BUSBAR}' RETURNING id`)).rows).toHaveLength(1);
  });
  it("Thomas and Simen (super_admin) act in every company, also without membership", async () => {
    await as(THOMAS, `INSERT INTO events VALUES (gen_random_uuid(),'${BUSBAR}','t')`);
    await as(SIMEN, `INSERT INTO events VALUES (gen_random_uuid(),'${SERVICE}','s')`);
  });
  it("technician still updates own assigned job; not other jobs", async () => {
    expect((await as(MARCUS, `UPDATE events SET title='m' WHERE id='${EV_SERVICE}' RETURNING id`)).rows).toHaveLength(1);
    expect((await as(MARCUS, `UPDATE events SET title='m' WHERE id='${EV_BUSBAR}' RETURNING id`)).rows).toHaveLength(0);
  });
  it("rows without a company keep previous admin behaviour (documented residual)", async () => {
    expect((await as(JOHN, `UPDATE events SET title='o' WHERE id='${EV_NULL}' RETURNING id`)).rows).toHaveLength(1);
  });
});

describe("superadmin-only access write gates", () => {
  it("legacy admin cannot give himself super_admin", async () => {
    await denied(as(JOHN, `UPDATE user_roles SET role='super_admin' WHERE user_id='${JOHN}' RETURNING id`).then((r) => { if (!r.rows.length) throw new Error("row-level security: no row"); return r; }));
  });
  it("v1 manage_users holder cannot add memberships or overrides", async () => {
    await denied(as(RUNE, `INSERT INTO user_memberships(user_id,company_id,is_active) VALUES ('${RUNE}','${BUSBAR}',true)`));
    await denied(as(RUNE, `INSERT INTO user_permission_overrides(user_id,permission_key,allowed) VALUES ('${RUNE}','security.manage',true)`));
  });
  it("Thomas and Simen can still manage access", async () => {
    await as(THOMAS, `INSERT INTO user_memberships(user_id,company_id,is_active) VALUES ('${MARCUS}','${BUSBAR}',false)`);
    expect((await as(SIMEN, `DELETE FROM user_memberships WHERE user_id='${MARCUS}' AND company_id='${BUSBAR}' RETURNING id`)).rows).toHaveLength(1);
  });
});

describe("rollback", () => {
  it("rollback script restores the previous global admin behaviour exactly", async () => {
    await db.exec(eventsOnly(art("company-bounded-admin.rollback.sql")));
    await as(JOHN, `INSERT INTO events VALUES (gen_random_uuid(),'${BUSBAR}','after rollback')`);
  });
});
