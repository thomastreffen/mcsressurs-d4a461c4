// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll,afterAll,it,expect } from "vitest";
const db=new PGlite();
const account="722815fb-6c0f-46a6-ab28-638093cac64e", user="00000000-0000-0000-0000-000000000001", company="00000000-0000-0000-0000-000000000002", event="00000000-0000-0000-0000-000000000003";
beforeAll(async()=>{
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${user}'::uuid$$;
 CREATE FUNCTION is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.admin',true)='yes'$$;
 CREATE FUNCTION is_employee_of(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $2='${company}'::uuid$$;
 CREATE TABLE user_accounts(id uuid PRIMARY KEY,auth_user_id uuid,is_active boolean); CREATE TABLE user_permission_overrides_v2(id uuid DEFAULT gen_random_uuid(),user_account_id uuid,permission_key text,mode text,scope_company_id uuid,scope_department_id uuid,UNIQUE(user_account_id,permission_key)); CREATE TABLE user_permission_overrides(user_id uuid,permission_key text,allowed boolean,UNIQUE(user_id,permission_key));
 CREATE TABLE events(id uuid,title text,job_number text,internal_number text,status text,start_time timestamptz,end_time timestamptz,address text,postal_code text,city text,customer text,site_contact_name text,site_contact_phone text,description text,access_notes text,location_details text,source_order_form_id uuid,attachments jsonb,company_id uuid,deleted_at timestamptz);
 CREATE TABLE event_technicians(event_id uuid,technician_id uuid,start_at timestamptz,end_at timestamptz); CREATE TABLE technicians(id uuid,user_id uuid);
 INSERT INTO user_accounts VALUES('${account}','${user}',true); INSERT INTO user_permission_overrides_v2(user_account_id,permission_key,mode) VALUES('${account}','leads.view','deny'),('${account}','regulation.review','allow');`);
 await db.exec(readFileSync("drizzle/migrations/0066_atomic_permission_changes_and_own_job_read.sql","utf8"));
},30000);
afterAll(()=>db.close());
const save=(changes:unknown)=>db.query(`SELECT save_permission_override_changes('${account}','${company}',$1::jsonb)`,[JSON.stringify(changes)]);
it("atomic upsert twice preserves unrelated globals and no global legacy scoped grant",async()=>{
 await db.exec("SET test.admin='yes'");
 const changes=[{permission_key:"resourceplan.view",mode:"allow",expected:null}];await save(changes);await save(changes);
 expect((await db.query("SELECT permission_key,mode FROM user_permission_overrides_v2 ORDER BY permission_key")).rows).toEqual([{permission_key:"leads.view",mode:"deny"},{permission_key:"regulation.review",mode:"allow"},{permission_key:"resourceplan.view",mode:"allow"}]);
 expect((await db.query("SELECT * FROM user_permission_overrides")).rows).toHaveLength(0);
});
it("duplicate keys fail atomically and other scope cannot be overwritten",async()=>{
 await expect(save([{permission_key:"x",mode:"allow"},{permission_key:"x",mode:"deny"}])).rejects.toThrow("Duplicate");
 await expect(save([{permission_key:"leads.view",mode:"allow",expected:{mode:"deny"}}])).rejects.toThrow("different scope");
});
it("remove is idempotent without touching role or other overrides",async()=>{
 const change=[{permission_key:"resourceplan.view",mode:null,expected:{mode:"allow"}}];await save(change);await save(change);
 expect((await db.query("SELECT * FROM user_permission_overrides_v2")).rows).toHaveLength(2);
});
it("non-admin cannot change rights",async()=>{await db.exec("SET test.admin='no'");await expect(save([{permission_key:"resourceplan.view",mode:"allow"}])).rejects.toThrow("Forbidden");});
it("own active same-company assignment can read without planner permission before/after approval",async()=>{
 await db.exec(`INSERT INTO events(id,title,status,company_id,attachments) VALUES('${event}','Own job','requested','${company}','[]');INSERT INTO technicians VALUES('${user}','${user}');INSERT INTO event_technicians(event_id,technician_id) VALUES('${event}','${user}');`);
 expect((await db.query<any>(`SELECT read_my_assigned_job('${event}') result`)).rows[0].result.event.title).toBe("Own job");
 await db.exec("UPDATE events SET status='scheduled'");expect((await db.query<any>(`SELECT read_my_assigned_job('${event}') result`)).rows[0].result.event.status).toBe("scheduled");
 await db.exec(`UPDATE events SET company_id='00000000-0000-0000-0000-000000000099'`);expect((await db.query<any>(`SELECT read_my_assigned_job('${event}') result`)).rows[0].result).toBeNull();
});