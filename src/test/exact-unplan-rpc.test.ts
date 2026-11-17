// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
const U="10000000-0000-0000-0000-000000000001", C="a0000000-0000-0000-0000-000000000001";
const E="30000000-0000-0000-0000-000000000001", T="20000000-0000-0000-0000-000000000001", OTHER="20000000-0000-0000-0000-000000000002";
const B="40000000-0000-0000-0000-000000000001";
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite(); await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE FUNCTION has_company_access(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${U}'::uuid AND $2='${C}'::uuid $$;
 CREATE FUNCTION check_permission_v2(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${U}'::uuid $$;
 CREATE TABLE events(id uuid PRIMARY KEY,company_id uuid,project_type text,status text,start_time timestamptz,end_time timestamptz,deleted_at timestamptz,deleted_by uuid,cancelled_at timestamptz,cancelled_by uuid,outlook_sync_status text,updated_at timestamptz,updated_by uuid);
 CREATE TABLE technicians(id uuid PRIMARY KEY,user_id uuid,name text,email text);
 CREATE TABLE event_technicians(id uuid DEFAULT gen_random_uuid(),event_id uuid,technician_id uuid,calendar_event_id text,start_at timestamptz,end_at timestamptz);
 CREATE TABLE schedule_blocks(id uuid PRIMARY KEY,job_id uuid,project_id uuid,technician_id uuid,source text,outlook_event_id text,start_at timestamptz,end_at timestamptz,deleted_at timestamptz,deleted_reason text,updated_at timestamptz);
 CREATE TABLE job_calendar_links(job_id uuid,technician_id uuid,provider text,calendar_event_id text,sync_status text,updated_at timestamptz);
 CREATE TABLE job_calendar_day_links(event_id uuid,technician_id uuid,work_date date,outlook_event_id text);
 CREATE TABLE job_approvals(job_id uuid,technician_user_id uuid,outlook_event_id text);
 CREATE TABLE calendar_delete_retry_queue(id uuid DEFAULT gen_random_uuid(),event_id uuid,technician_id uuid,event_technician_id uuid,technician_user_id uuid,technician_name text,mailbox text,candidate_event_ids jsonb,start_at timestamptz,end_at timestamptz,status text,next_attempt_at timestamptz,resolved_at timestamptz,last_error text,UNIQUE(event_id,technician_id));
 CREATE TABLE event_logs(event_id uuid,action_type text,performed_by uuid,change_summary text);
 CREATE TABLE activity_log(entity_type text,entity_id uuid,action text,type text,description text,performed_by uuid,metadata jsonb);`);
 await db.exec(readFileSync("drizzle/migrations/0099_exact_calendar_unplan.sql","utf8"));
},30000);
afterAll(()=>db.close());
beforeEach(async()=>{
 await db.exec(`TRUNCATE events,technicians,event_technicians,schedule_blocks,job_calendar_links,job_calendar_day_links,job_approvals,calendar_delete_retry_queue,event_logs,activity_log;
 INSERT INTO events(id,company_id,project_type,status,start_time,end_time) VALUES('${E}','${C}','task','scheduled','2026-11-17T07:00Z','2026-11-17T15:00Z');
 INSERT INTO technicians VALUES('${T}','${U}','Isolated','isolated@example.test'),('${OTHER}','10000000-0000-0000-0000-000000000002','Other','other@example.test');
 INSERT INTO event_technicians(event_id,technician_id) VALUES('${E}','${T}'),('${E}','${OTHER}');
 INSERT INTO schedule_blocks(id,project_id,technician_id,source,start_at,end_at) VALUES('${B}','${E}','${T}','manual','2026-11-17T07:00Z','2026-11-17T15:00Z'),('40000000-0000-0000-0000-000000000002','${E}','${T}','manual','2026-11-18T07:00Z','2026-11-18T15:00Z'),('40000000-0000-0000-0000-000000000003','${E}','${OTHER}','manual','2026-11-17T07:00Z','2026-11-17T15:00Z');
 INSERT INTO job_calendar_day_links VALUES('${E}','${T}','2026-11-17','exact17'),('${E}','${T}','2026-11-18','exact18'),('${E}','${OTHER}','2026-11-17','other17');
 INSERT INTO job_calendar_links VALUES('${E}','${T}','microsoft','legacy','linked',now());
 INSERT INTO job_approvals VALUES('${E}','${U}','approval');`);
});
async function remove(block:string|null=B,all=false,user=U,tech:string|null=T){
 return db.query<{r:any}>("select remove_work_visit_from_plan($1,$2,$3,$4,$5) r",[E,tech,all,block,user]);
}
it("selected day retains next day, own assignment/approval, other technician and task",async()=>{
 await remove();
 expect((await db.query("select id from schedule_blocks where deleted_at is null")).rows).toHaveLength(2);
 expect((await db.query("select * from event_technicians")).rows).toHaveLength(2);
 expect((await db.query("select * from job_approvals")).rows).toHaveLength(1);
 expect((await db.query("select deleted_at from events")).rows).toEqual([{deleted_at:null}]);
 expect((await db.query("select candidate_event_ids from calendar_delete_retry_queue")).rows).toEqual([{candidate_event_ids:["exact17"]}]);
 expect((await db.query("select sync_status from job_calendar_links")).rows).toEqual([{sync_status:"linked"}]);
});
it("full one-person unplan preserves other person and Hub job",async()=>{
 const r=await remove(null); expect(r.rows[0].r.assignments_removed).toBe(1);
 expect((await db.query("select technician_id from event_technicians")).rows).toEqual([{technician_id:OTHER}]);
 expect((await db.query("select deleted_at from events")).rows).toEqual([{deleted_at:null}]);
});
it("standalone task closes only after last real block/assignment is removed",async()=>{
 await remove(null); await remove(null,false,U,OTHER);
 expect((await db.query("select status,deleted_at is not null gone from events")).rows).toEqual([{status:"cancelled",gone:true}]);
});
it("project survives last-person unplanning while remove-all explicitly removes it",async()=>{
 await db.exec("update events set project_type='project'"); await remove(null); await remove(null,false,U,OTHER);
 expect((await db.query("select deleted_at from events")).rows).toEqual([{deleted_at:null}]);
 await remove(null,true); expect((await db.query("select deleted_at is not null gone from events")).rows).toEqual([{gone:true}]);
});
it("unknown actor and other company rollback everything",async()=>{
 await expect(remove(B,false,"10000000-0000-0000-0000-000000000099")).rejects.toThrow("permission_denied");
 await db.exec("update events set company_id='a0000000-0000-0000-0000-000000000002'");
 await expect(remove()).rejects.toThrow("permission_denied");
 expect((await db.query("select * from calendar_delete_retry_queue")).rows).toHaveLength(0);
});
it("wrong technician/block pairing cannot remove someone else",async()=>{
 await expect(remove(B,false,U,OTHER)).rejects.toThrow("selected_block_mismatch");
 expect((await db.query("select * from schedule_blocks where deleted_at is null")).rows).toHaveLength(3);
});
it("Oslo midnight uses winter/summer/DST workday, not UTC date",async()=>{
 for(const [instant,day] of [["2026-11-16T23:30Z","2026-11-17"],["2026-07-16T22:30Z","2026-07-17"],["2026-10-24T22:30Z","2026-10-25"]]){
   await db.query("update schedule_blocks set start_at=$1 where id=$2",[instant,B]);
   await db.exec("delete from calendar_delete_retry_queue; delete from job_calendar_day_links where technician_id='"+T+"'");
   await db.query("insert into job_calendar_day_links values($1,$2,$3,'dst-exact')",[E,T,day]);
   await remove(); expect((await db.query("select candidate_event_ids from calendar_delete_retry_queue")).rows).toEqual([{candidate_event_ids:["dst-exact"]}]);
 }
});
it("resolved old queue is reopened only by a new explicit removal, no definition-triggered write",async()=>{
 await remove(); await db.exec("update calendar_delete_retry_queue set status='resolved'"); await remove();
 expect((await db.query("select status from calendar_delete_retry_queue")).rows).toEqual([{status:"pending"}]);
});it("unconfirmed earlier day survives a later day's unplan on the same recipient row",async()=>{
 await remove(); await db.exec("update calendar_delete_retry_queue set status='failed'");
 await remove("40000000-0000-0000-0000-000000000002");
 const ids=(await db.query<{candidate_event_ids:string[]}>("select candidate_event_ids from calendar_delete_retry_queue")).rows[0].candidate_event_ids;
 expect([...ids].sort()).toEqual(["exact17","exact18"]);
 expect((await db.query("select * from calendar_delete_retry_queue where candidate_event_ids ? 'other17'")).rows).toHaveLength(0);
});
it("old failed row with empty candidates (JOB-000440 shape) is never drained by the definition itself",async()=>{
 await db.query("insert into calendar_delete_retry_queue(event_id,technician_id,candidate_event_ids,status,next_attempt_at) values($1,$2,'[]','failed',now()-interval '1 day')",[E,T]);
 expect((await db.query("select status,candidate_event_ids from calendar_delete_retry_queue")).rows).toEqual([{status:"failed",candidate_event_ids:[]}]);
 expect((await db.query("select * from job_calendar_day_links where technician_id=$1",[T])).rows).toHaveLength(2);
});
