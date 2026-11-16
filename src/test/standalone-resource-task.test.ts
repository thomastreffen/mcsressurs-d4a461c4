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
 CREATE TABLE schedule_blocks(id uuid DEFAULT gen_random_uuid(),company_id uuid,technician_id uuid REFERENCES technicians,project_id uuid REFERENCES events,job_id uuid REFERENCES events,source text,start_at timestamptz,end_at timestamptz,title text,match_state text,match_confidence int,match_reason text,deleted_at timestamptz);
 CREATE TABLE event_logs(event_id uuid REFERENCES events,action_type text,performed_by uuid,change_summary text,metadata jsonb);
 GRANT USAGE ON SCHEMA auth TO authenticated;
 GRANT ALL ON events,event_technicians,schedule_blocks,event_logs TO authenticated;
 ALTER TABLE events ENABLE ROW LEVEL SECURITY;
 CREATE POLICY scope ON events TO authenticated USING(has_company_access(auth.uid(),company_id,'resource_plan','edit')) WITH CHECK(has_company_access(auth.uid(),company_id,'resource_plan','edit'));
 `);
 await db.exec(readFileSync('drizzle/migrations/0098_standalone_resource_tasks.sql','utf8'));
},30000);
afterAll(()=>db.close());
it('standalone task has no parent, internal semantics, assigned technician and two Oslo 08-16 days',async()=>{
 const result=await create('30000000-0000-0000-0000-000000000001');
 const id=result.rows[0].r.event_id;
 expect(result.rows[0].r.status).toBe('created');
 expect((await db.query('select project_type,entity_type,parent_project_id,status from events where id=$1',[id])).rows).toEqual([{project_type:'task',entity_type:'internal',parent_project_id:null,status:'scheduled'}]);
 expect((await db.query('select * from event_technicians where event_id=$1',[id])).rows).toHaveLength(1);
 expect((await db.query('select * from schedule_blocks where project_id=$1 and job_id=$1',[id])).rows).toHaveLength(2);
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
