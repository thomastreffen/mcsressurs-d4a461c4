// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
const C='a0000000-0000-0000-0000-000000000001', U='10000000-0000-0000-0000-000000000001', T='20000000-0000-0000-0000-000000000001';
let db: PGlite;
const dates=JSON.stringify([{start:'2026-11-17T07:00:00Z',end:'2026-11-17T15:00:00Z'},{start:'2026-11-18T07:00:00Z',end:'2026-11-18T15:00:00Z'}]);
async function create(key:string, techs=[T], notify=true, company=C) {
 return db.transaction(async tx => {
  await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${U}',true)`);
  return tx.query<{r:{event_id:string,status:string}}>(`select create_standalone_resource_task($1::uuid,$2::uuid,'Standalone',$3::jsonb,$4::uuid[],NULL,NULL,NULL,$5) r`,[company,key,dates,techs,notify]);
 });
}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION has_company_access(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${U}'::uuid AND $2='${C}'::uuid $$;
 CREATE TABLE events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,created_by uuid,client_request_id uuid UNIQUE,project_type text,entity_type text,parent_project_id uuid REFERENCES events,title text,description text,customer text,address text,start_time timestamptz,end_time timestamptz,technician_id uuid,status text,deleted_at timestamptz);
 CREATE TABLE technicians(id uuid PRIMARY KEY); INSERT INTO technicians VALUES('${T}');
 CREATE TABLE event_technicians(event_id uuid REFERENCES events,technician_id uuid REFERENCES technicians,start_at timestamptz,end_at timestamptz,UNIQUE(event_id,technician_id));
 CREATE TABLE schedule_blocks(id uuid DEFAULT gen_random_uuid(),company_id uuid,technician_id uuid REFERENCES technicians,project_id uuid REFERENCES events,job_id uuid REFERENCES events,source text,start_at timestamptz,end_at timestamptz,title text,location text,match_state text,match_confidence int,match_reason text,deleted_at timestamptz);
 CREATE TABLE event_logs(event_id uuid REFERENCES events,action_type text,performed_by uuid,change_summary text,metadata jsonb);
 -- Production CHECK before 0099 (exact copy of the list that rejected the task)
 ALTER TABLE event_logs ADD CONSTRAINT event_logs_action_type_check CHECK (action_type IN ('created','updated','notifications_sent','technician_added'));
 CREATE FUNCTION event_company_id(uuid) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT company_id FROM events WHERE id=$1 $$;
 CREATE FUNCTION legacy_admin_in_company(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;
 CREATE POLICY admins ON event_logs FOR INSERT TO authenticated WITH CHECK (legacy_admin_in_company(event_company_id(event_id)));
 CREATE POLICY reads ON event_logs FOR SELECT TO authenticated USING (true);
 -- Production trigger: assignment insert auto-creates a day-1 block without job_id
 CREATE FUNCTION sync_block() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM schedule_blocks WHERE project_id=NEW.event_id AND technician_id=NEW.technician_id AND start_at=NEW.start_at AND end_at=NEW.end_at AND deleted_at IS NULL) THEN
   INSERT INTO schedule_blocks(company_id,technician_id,project_id,source,start_at,end_at,title,match_state) SELECT company_id,NEW.technician_id,NEW.event_id,'manual',NEW.start_at,NEW.end_at,title,'manual' FROM events WHERE id=NEW.event_id; END IF; RETURN NEW; END $$;
 CREATE TRIGGER sync_block AFTER INSERT ON event_technicians FOR EACH ROW EXECUTE FUNCTION sync_block();
 GRANT USAGE ON SCHEMA auth TO authenticated;
 GRANT ALL ON events,event_technicians,schedule_blocks,event_logs TO authenticated;
 ALTER TABLE events ENABLE ROW LEVEL SECURITY;
 CREATE POLICY scope ON events TO authenticated USING(has_company_access(auth.uid(),company_id,'resource_plan','edit')) WITH CHECK(has_company_access(auth.uid(),company_id,'resource_plan','edit'));
 `);
 await db.exec(readFileSync('drizzle/migrations/0098_standalone_resource_tasks.sql','utf8'));
 // Before the fix the exact prod failure reproduces and nothing is left behind
 await expect(create('30000000-0000-0000-0000-0000000000f0')).rejects.toThrow(/event_logs_action_type_check|row-level security/);
 expect((await db.query("select * from events where client_request_id='30000000-0000-0000-0000-0000000000f0'")).rows).toHaveLength(0);
 await db.exec(`ALTER TABLE event_logs DROP CONSTRAINT event_logs_action_type_check; ALTER TABLE event_logs ADD CONSTRAINT event_logs_action_type_check CHECK (action_type IN ('created','updated','notifications_sent','technician_added'))`);
 await expect(create('30000000-0000-0000-0000-0000000000f1')).rejects.toThrow(/event_logs_action_type_check/);
 for (const f of ['0099_event_logs_notification_choice_actions','0100_standalone_task_log_and_block_link']) await db.exec(readFileSync(`drizzle/migrations/${f}.sql`,'utf8'));
 expect((await db.query('select count(*)::int n from events')).rows).toEqual([{n:0}]);
 expect((await db.query('select count(*)::int n from schedule_blocks')).rows).toEqual([{n:0}]);
 expect((await db.query('select count(*)::int n from event_technicians')).rows).toEqual([{n:0}]);
},30000);
afterAll(()=>db.close());
it('standalone task has no parent, internal semantics, assigned technician and two Oslo 08-16 days',async()=>{
 const result=await create('30000000-0000-0000-0000-000000000001');
 const id=result.rows[0].r.event_id;
 expect(result.rows[0].r.status).toBe('created');
 expect((await db.query('select project_type,entity_type,parent_project_id,status from events where id=$1',[id])).rows).toEqual([{project_type:'task',entity_type:'internal',parent_project_id:null,status:'scheduled'}]);
 expect((await db.query('select * from event_technicians where event_id=$1',[id])).rows).toHaveLength(1);
 expect((await db.query('select * from schedule_blocks where project_id=$1 and job_id=$1',[id])).rows).toHaveLength(2);
 expect((await db.query('select * from schedule_blocks where project_id=$1',[id])).rows).toHaveLength(2);
 expect((await db.query('select action_type,performed_by from event_logs where event_id=$1 order by action_type',[id])).rows).toEqual([{action_type:'created',performed_by:U},{action_type:'notifications_requested',performed_by:U}]);
});
it('non-admin planner cannot forge a log entry in another name',async()=>{
 const id=(await create('30000000-0000-0000-0000-0000000000f2')).rows[0].r.event_id;
 await expect(db.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${U}',true)`);await tx.query(`insert into event_logs(event_id,action_type,performed_by) values($1,'updated','10000000-0000-0000-0000-000000000099')`,[id]);})).rejects.toThrow(/row-level security/);
});
it('same request key reuses one event and never duplicates blocks or notification choice',async()=>{
 const key='30000000-0000-0000-0000-000000000002'; const a=await create(key,[T,T]);const b=await create(key);
 expect(b.rows[0].r).toEqual({event_id:a.rows[0].r.event_id,status:'existing'});
 expect((await db.query('select * from schedule_blocks where project_id=$1',[a.rows[0].r.event_id])).rows).toHaveLength(2);
 expect((await db.query("select * from event_logs where event_id=$1 and action_type='notifications_requested'",[a.rows[0].r.event_id])).rows).toHaveLength(1);
});
it('explicit opt-out is recorded, never labelled sent',async()=>{
 const a=await create('30000000-0000-0000-0000-000000000003',[],false);
 expect((await db.query("select metadata->>'notification_choice' choice from event_logs where event_id=$1 and action_type='notifications_skipped'",[a.rows[0].r.event_id])).rows).toEqual([{choice:'without_notification'}]);
});
it('invalid assignment rolls back event, blocks and audit atomically',async()=>{
 const key='30000000-0000-0000-0000-000000000004';
 await expect(create(key,['20000000-0000-0000-0000-000000000099'])).rejects.toThrow(/foreign key/);
 expect((await db.query('select * from events where client_request_id=$1',[key])).rows).toHaveLength(0);
});
it('wrong company cannot create a task despite valid user',async()=>{
 await expect(create('30000000-0000-0000-0000-000000000005',[],true,'a0000000-0000-0000-0000-000000000002')).rejects.toThrow(/Ingen tilgang/);
});
it('projects and genuine same-company child tasks retain their model',async()=>{
 await db.exec(`INSERT INTO events(id,company_id,project_type,entity_type) VALUES('40000000-0000-0000-0000-000000000001','${C}','project','financial_project');
 INSERT INTO events(id,company_id,project_type,entity_type,parent_project_id) VALUES('40000000-0000-0000-0000-000000000002','${C}','task','job','40000000-0000-0000-0000-000000000001');`);
 expect((await db.query("select parent_project_id from events where id='40000000-0000-0000-0000-000000000002'")).rows).toEqual([{parent_project_id:'40000000-0000-0000-0000-000000000001'}]);
 await expect(db.exec(`UPDATE events SET company_id='a0000000-0000-0000-0000-000000000002' WHERE id='40000000-0000-0000-0000-000000000002'`)).rejects.toThrow(/same company/);
});
it('task chains, deleted parents and economic standalone tasks stay invalid',async()=>{
 await expect(db.exec(`INSERT INTO events(company_id,project_type,entity_type,parent_project_id) VALUES('${C}','task','internal','40000000-0000-0000-0000-000000000002')`)).rejects.toThrow(/INVALID_TASK_CHAIN/);
 await expect(db.exec(`INSERT INTO events(company_id,project_type,entity_type) VALUES('${C}','task','financial_project')`)).rejects.toThrow(/INVALID_TASK_ENTITY/);
 await db.exec(`UPDATE events SET deleted_at=now() WHERE id='40000000-0000-0000-0000-000000000001'`);
 await expect(db.exec(`INSERT INTO events(company_id,project_type,entity_type,parent_project_id) VALUES('${C}','task','internal','40000000-0000-0000-0000-000000000001')`)).rejects.toThrow(/active/);
});
it('child blocks must point to real parent; standalone blocks must point to own task',async()=>{
 await expect(db.exec(`INSERT INTO schedule_blocks(company_id,project_id,job_id) VALUES('${C}','40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002')`)).rejects.toThrow(/INVALID_BLOCK_PROJECT/);
});
