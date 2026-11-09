// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const SERVICE = "00000000-0000-0000-0000-00000000000a";
const BUSBAR = "00000000-0000-0000-0000-00000000000b";
const RUNE = "10000000-0000-0000-0000-000000000001";
const SINDRE = "10000000-0000-0000-0000-000000000002";
const THOMAS = "10000000-0000-0000-0000-000000000003";
const MARCUS = "10000000-0000-0000-0000-000000000004";
const JOB = "20000000-0000-0000-0000-000000000001";
let db: PGlite;
const load = (name: string) => readFileSync(`drizzle/migrations/${name}`, "utf8").replace(/--> statement-breakpoint/g, "");
async function call(user: string, sql: string) {
  return db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',true)`);
    return tx.query(sql);
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE TYPE app_role AS ENUM ('admin','montør','super_admin','customer_user');
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE user_roles(user_id uuid,role app_role); CREATE TABLE internal_companies(id uuid PRIMARY KEY,name text);
    CREATE TABLE user_memberships(user_id uuid,company_id uuid,is_active boolean);
    CREATE TABLE events(id uuid PRIMARY KEY,company_id uuid,status text,title text);
    CREATE FUNCTION has_role(_user_id uuid,_role app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
    INSERT INTO user_roles VALUES ('${THOMAS}','super_admin'),('${SINDRE}','admin'),('${MARCUS}','montør');
    INSERT INTO internal_companies VALUES ('${SERVICE}','Service'),('${BUSBAR}','BusBar');
    INSERT INTO user_memberships VALUES ('${RUNE}','${SERVICE}',true),('${SINDRE}','${SERVICE}',true),('${SINDRE}','${BUSBAR}',true);
    INSERT INTO events VALUES ('${JOB}','${SERVICE}','pending','Own job');`);
  await db.exec(load("0070_admin_tier_helpers_inactive.sql"));
  await db.exec(load("0072_company_admin_explicit_assignments.sql"));
  await db.exec(`INSERT INTO company_admin_assignments(auth_user_id,company_id) VALUES ('${RUNE}','${SERVICE}');
    CREATE TABLE job_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid,body text);
    GRANT SELECT,INSERT,UPDATE,DELETE ON job_tasks TO authenticated;
    ALTER TABLE job_tasks ENABLE ROW LEVEL SECURITY;
    CREATE POLICY company_operations ON job_tasks FOR ALL TO authenticated USING (is_company_admin(auth.uid(),event_company_id(job_id))) WITH CHECK (is_company_admin(auth.uid(),event_company_id(job_id)));
    CREATE TABLE own_assignments(job_id uuid,user_id uuid); INSERT INTO own_assignments VALUES ('${JOB}','${MARCUS}');
    CREATE FUNCTION owns_job(_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM own_assignments WHERE job_id=_id AND user_id=auth.uid()) $$;
    CREATE POLICY technician_own_read ON job_tasks FOR SELECT TO authenticated USING (owns_job(job_id));`);
});
afterAll(async () => { await db?.close(); });
describe("company/parent RLS, isolated real Postgres roles", () => {
  it("Rune retains create/change/delete in Service using actual parent company, not home company", async () => {
    await call(RUNE, `INSERT INTO job_tasks(job_id,body) VALUES ('${JOB}','work')`);
    expect((await call(RUNE, "UPDATE job_tasks SET body='changed' RETURNING body")).rows).toEqual([{ body: "changed" }]);
    expect((await call(RUNE, "DELETE FROM job_tasks RETURNING id")).rows).toHaveLength(1);
    await call(RUNE, `INSERT INTO job_tasks(job_id,body) VALUES ('${JOB}','retained')`);
  });
  it("Sindre's membership+legacy admin does not imply BusBar administration or Service company admin", async () => {
    await expect(call(SINDRE, `INSERT INTO job_tasks(job_id,body) VALUES ('${JOB}','forbidden')`)).rejects.toThrow(/row-level security/i);
    expect((await call(SINDRE, "SELECT * FROM job_tasks")).rows).toHaveLength(0);
  });
  it("unknown parent and cross-company parent move fail closed", async () => {
    await expect(call(RUNE, "INSERT INTO job_tasks(job_id,body) VALUES (NULL,'orphan')")).rejects.toThrow(/row-level security/i);
    const busbarJob = "20000000-0000-0000-0000-000000000002";
    await db.exec(`INSERT INTO events VALUES ('${busbarJob}','${BUSBAR}','pending','BusBar');`);
    await expect(call(RUNE, `UPDATE job_tasks SET job_id='${busbarJob}'`)).rejects.toThrow(/row-level security/i);
    expect((await call(THOMAS, "SELECT * FROM job_tasks")).rows).toHaveLength(1);
  });
  it("technician retains own job information before and after approval, not unrelated job", async () => {
    expect((await call(MARCUS, "SELECT body FROM job_tasks")).rows).toEqual([{ body: "retained" }]);
    await db.exec(`UPDATE events SET status='accepted' WHERE id='${JOB}'; INSERT INTO job_tasks(job_id,body) VALUES ('20000000-0000-0000-0000-000000000002','other job')`);
    expect((await call(MARCUS, "SELECT body FROM job_tasks")).rows).toEqual([{ body: "retained" }]);
    expect((await call(MARCUS, "DELETE FROM job_tasks RETURNING id")).rows).toHaveLength(0);
  });
});