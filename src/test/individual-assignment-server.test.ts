// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
let db:PGlite;
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const E=id(1),C=id(2),U=id(3),T=id(4),V=id(5),S=id(6),P=id(7);
const respond=(token:string,action='reject')=>db.query<{r:any}>(`SELECT respond_to_job_assignment($1::uuid,$2,'ferie') r`,[token,action]);
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE events(id uuid PRIMARY KEY,company_id uuid,project_type text,status text,start_time timestamptz,end_time timestamptz,title text,deleted_at timestamptz,deleted_by uuid,cancelled_at timestamptz,cancelled_by uuid,outlook_sync_status text,updated_at timestamptz,updated_by uuid);
 CREATE TABLE technicians(id uuid PRIMARY KEY,user_id uuid,name text,email text,archived_at timestamptz,deleted_at timestamptz);
 CREATE TABLE event_technicians(id uuid DEFAULT gen_random_uuid(),event_id uuid,technician_id uuid,calendar_event_id text,start_at timestamptz,end_at timestamptz,UNIQUE(event_id,technician_id));
 CREATE TABLE schedule_blocks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,job_id uuid,project_id uuid,technician_id uuid,source text,outlook_event_id text,start_at timestamptz,end_at timestamptz,title text,match_state text,match_confidence int,match_reason text,deleted_at timestamptz,deleted_reason text,updated_at timestamptz);
 CREATE TABLE job_calendar_links(job_id uuid,technician_id uuid,provider text,calendar_event_id text,sync_status text,updated_at timestamptz);
 CREATE TABLE job_calendar_day_links(event_id uuid,technician_id uuid,work_date date,outlook_event_id text);
 CREATE TABLE job_approvals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid,technician_user_id uuid,token uuid DEFAULT gen_random_uuid(),status text DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','reschedule_requested')),expires_at timestamptz DEFAULT now()+interval '48 hours',created_at timestamptz DEFAULT now(),responded_at timestamptz,comment text,proposed_start timestamptz,proposed_end timestamptz,outlook_event_id text,reminder_count int,last_reminded_at timestamptz);
 CREATE TABLE user_accounts(auth_user_id uuid,person_id uuid,is_active boolean);
 CREATE TABLE employment_profiles(person_id uuid,company_id uuid,archived_at timestamptz,relationship_type text);
 CREATE TABLE calendar_delete_retry_queue(id uuid DEFAULT gen_random_uuid(),event_id uuid,technician_id uuid,event_technician_id uuid,technician_user_id uuid,technician_name text,mailbox text,candidate_event_ids jsonb,start_at timestamptz,end_at timestamptz,status text,next_attempt_at timestamptz,resolved_at timestamptz,last_error text,UNIQUE(event_id,technician_id));
 CREATE TABLE event_logs(event_id uuid,action_type text CHECK(action_type IN ('status_changed','work_visit_unplanned','technician_unplanned')),performed_by uuid,change_summary text);
 CREATE TABLE activity_log(entity_type text,entity_id uuid,action text,type text,description text,performed_by uuid,metadata jsonb);
 CREATE FUNCTION is_employee_of(u uuid,c uuid) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM user_accounts a JOIN employment_profiles ep ON ep.person_id=a.person_id WHERE a.auth_user_id=u AND ep.company_id=c AND ep.archived_at IS NULL AND ep.relationship_type='employee')$$;
 CREATE FUNCTION has_company_access(u uuid,c uuid,m text,l text) RETURNS boolean LANGUAGE sql AS $$SELECT u='${P}'::uuid AND c='${C}'::uuid$$;
 CREATE FUNCTION check_permission_v2(u uuid,p text) RETURNS boolean LANGUAGE sql AS $$SELECT u='${P}'::uuid$$;
 GRANT SELECT ON events,job_approvals,event_technicians,schedule_blocks TO authenticated;
 ALTER TABLE events ENABLE ROW LEVEL SECURITY;
 CREATE POLICY own_company ON events TO authenticated USING(has_company_access(auth.uid(),company_id,'resource_plan','view'));
 `);
 await db.exec(readFileSync('drizzle/migrations/0101_exact_calendar_unplan.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0104_individual_assignment_response_and_plan.sql','utf8'));
 await db.exec(`CREATE TRIGGER sync_assignment AFTER INSERT OR UPDATE OR DELETE ON event_technicians FOR EACH ROW EXECUTE FUNCTION sync_schedule_block_for_event_technician();
 CREATE TRIGGER sync_event AFTER UPDATE ON events FOR EACH ROW EXECUTE FUNCTION sync_schedule_blocks_for_event_time_change();`);
},120000);
afterAll(()=>db.close());
beforeEach(async()=>{
 await db.exec(`RESET ROLE; TRUNCATE events,technicians,event_technicians,schedule_blocks,job_approvals,user_accounts,employment_profiles,event_logs,activity_log,calendar_delete_retry_queue,job_calendar_day_links;
 SELECT set_config('request.jwt.claim.sub','${P}',false);
 INSERT INTO events(id,company_id,project_type,status,start_time,end_time,title) VALUES('${E}','${C}','task','rejected','2026-11-19 07:00Z','2026-11-19 15:00Z','isolated');
 INSERT INTO technicians(id,user_id,name,email) VALUES('${T}','${U}','Emil','e@example.test'),('${S}','${V}','Mats','m@example.test');
 INSERT INTO user_accounts VALUES('${U}','${U}',true),('${V}','${V}',true);
 INSERT INTO employment_profiles VALUES('${U}','${C}',NULL,'employee'),('${V}','${C}',NULL,'employee');
 INSERT INTO event_technicians(event_id,technician_id) VALUES('${E}','${T}'),('${E}','${S}');
 INSERT INTO schedule_blocks(company_id,project_id,technician_id,source,start_at,end_at) SELECT '${C}','${E}',t,'manual','2026-11-20 07:00Z','2026-11-20 15:00Z' FROM unnest(ARRAY['${T}'::uuid,'${S}'::uuid])t;
 INSERT INTO job_approvals(job_id,technician_user_id,outlook_event_id) VALUES('${E}','${U}','emil-copy'),('${E}','${V}','mats-copy');
 INSERT INTO job_calendar_day_links VALUES('${E}','${T}','2026-11-19','emil-day1'),('${E}','${S}','2026-11-19','mats-day1');`);
});
async function token(u=U){return (await db.query<{token:string}>('SELECT token FROM job_approvals WHERE technician_user_id=$1',[u])).rows[0].token;}
it('Emil rejects: Mats pending, both plans and mappings unchanged, global rejected is untouched',async()=>{
 const r=await respond(await token()); expect(r.rows[0].r.success).toBe(true);
 expect((await db.query('SELECT status FROM events')).rows).toEqual([{status:'rejected'}]);
 expect((await db.query('SELECT status,outlook_event_id FROM job_approvals ORDER BY technician_user_id')).rows).toEqual([{status:'rejected',outlook_event_id:'emil-copy'},{status:'pending',outlook_event_id:'mats-copy'}]);
 expect((await db.query('SELECT * FROM schedule_blocks WHERE deleted_at IS NULL')).rows).toHaveLength(4);
 expect((await db.query('SELECT * FROM job_calendar_day_links')).rows).toHaveLength(2);
 expect((await db.query('SELECT * FROM calendar_delete_retry_queue')).rows).toHaveLength(0);
});
it('acceptance never overrides explicit operational status and replay is refused',async()=>{
 const t=await token(); await respond(t,'approve'); expect((await respond(t,'approve')).rows[0].r.http_status).toBe(409);
 expect((await db.query('SELECT status FROM events')).rows[0]).toEqual({status:'rejected'});
 expect((await db.query('SELECT * FROM event_logs')).rows).toHaveLength(1);
});
it('proposal stays on individual response and does not move a day',async()=>{
 const r=await db.query<{r:any}>(`SELECT respond_to_job_assignment($1,'reschedule',NULL,'2026-11-21 07:00Z','2026-11-21 15:00Z')r`,[await token()]);
 expect(r.rows[0].r.success).toBe(true); expect((await db.query<{s:string}>('SELECT min(start_at)::text s FROM schedule_blocks')).rows[0].s).toContain('2026-11-19');
});
it.each(['inactive','foreign','removed','expired','cancelled'])('refuses %s response without changing another recipient',async(mode)=>{
 const t=await token();
 if(mode==='inactive') await db.exec(`UPDATE user_accounts SET is_active=false WHERE auth_user_id='${U}'`);
 if(mode==='foreign') await db.exec(`UPDATE employment_profiles SET company_id='${id(20)}' WHERE person_id='${U}'`);
 if(mode==='removed') await db.exec(`DELETE FROM event_technicians WHERE technician_id='${T}'`);
 if(mode==='expired') await db.exec(`UPDATE job_approvals SET expires_at=now()-interval '1 hour' WHERE technician_user_id='${U}'`);
 if(mode==='cancelled') await db.exec(`UPDATE events SET status='cancelled'`);
 expect((await respond(t)).rows[0].r.success).not.toBe(true);
 expect((await db.query<{status:string}>(`SELECT status FROM job_approvals WHERE technician_user_id='${V}'`)).rows[0].status).toBe('pending');
});
it('one day edit rotates only own token; stale link cannot answer new plan',async()=>{
 const old=await token(),other=await token(V);
 await db.exec(`UPDATE schedule_blocks SET start_at=start_at+interval '1 hour',end_at=end_at+interval '1 hour' WHERE technician_id='${T}' AND start_at::date='2026-11-20'`);
 expect(await token()).not.toBe(old); expect(await token(V)).toBe(other);
 expect((await respond(old)).rows[0].r.http_status).toBe(404);
});
it('whole visit edit preserves 19/20 day spacing and old response tokens expire',async()=>{
 const old=await token(); await db.exec(`UPDATE events SET start_time=start_time+interval '1 hour',end_time=end_time+interval '1 hour'`);
 const days=(await db.query<{s:string}>(`SELECT start_at::text s FROM schedule_blocks ORDER BY start_at`)).rows;
 expect(days).toHaveLength(4); expect(days[0].s).toContain('2026-11-19 08:00'); expect(days[3].s).toContain('2026-11-20 08:00'); expect(await token()).not.toBe(old);
});
it('assignment edit moves only own dates, never most recent arbitrary block',async()=>{
 await db.exec(`UPDATE event_technicians SET start_at='2026-11-19 08:00Z',end_at='2026-11-19 16:00Z' WHERE technician_id='${T}'`);
 expect((await db.query(`SELECT start_at::text s FROM schedule_blocks WHERE technician_id='${T}' ORDER BY start_at`)).rows).toEqual([{s:'2026-11-19 08:00:00+00'},{s:'2026-11-20 08:00:00+00'}]);
 expect((await db.query(`SELECT start_at::text s FROM schedule_blocks WHERE technician_id='${S}' ORDER BY start_at`)).rows[1]).toEqual({s:'2026-11-20 07:00:00+00'});
});
it('SQL failure rolls back response together with audit',async()=>{
 const t=await token(); await db.exec(`ALTER TABLE event_logs ADD CONSTRAINT fail_audit CHECK(false) NOT VALID`);
 await expect(respond(t)).rejects.toThrow(); await db.exec('ALTER TABLE event_logs DROP CONSTRAINT fail_audit');
 expect((await db.query<{status:string}>(`SELECT status FROM job_approvals WHERE token='${t}'`)).rows[0].status).toBe('pending');
});
it('authenticated non-planner and foreign-company RLS cannot edit shared plan or call token command',async()=>{
 await db.exec(`SELECT set_config('request.jwt.claim.sub','${U}',false); SET ROLE authenticated`);
 expect((await db.query('SELECT * FROM events')).rows).toHaveLength(0);
 await expect(db.query(`SELECT respond_to_job_assignment('${awaitTokenPlaceholder()}','reject','reason')`)).rejects.toThrow();
 await expect(db.query(`SELECT edit_resource_job_plan('${E}',ARRAY['${T}'::uuid],'2026-11-19 07:00Z','2026-11-19 15:00Z','2026-11-19 07:00Z','2026-11-19 15:00Z',ARRAY['${T}'::uuid,'${S}'::uuid])`)).rejects.toThrow();
 await db.exec('RESET ROLE');
});
function awaitTokenPlaceholder(){return id(99);}
it('reassign last task recipient is atomic; no accidental task cancel; stale edit refused',async()=>{
 await db.exec(`SELECT remove_work_visit_from_plan('${E}','${S}',false,NULL,'${P}')`);
 await db.exec(`SET ROLE authenticated`);
 await db.query(`SELECT edit_resource_job_plan('${E}',ARRAY['${S}'::uuid],'2026-11-19 07:00Z','2026-11-19 15:00Z','2026-11-19 07:00Z','2026-11-19 15:00Z',ARRAY['${T}'::uuid])`);
 await expect(db.query(`SELECT edit_resource_job_plan('${E}',ARRAY['${S}'::uuid],'2026-11-19 07:00Z','2026-11-19 15:00Z','2026-11-19 07:00Z','2026-11-19 15:00Z',ARRAY['${T}'::uuid])`)).rejects.toThrow('plan_changed_reload');
 await db.exec('RESET ROLE'); expect((await db.query<{deleted_at:string|null}>('SELECT deleted_at FROM events')).rows[0].deleted_at).toBe(null);
 expect((await db.query('SELECT technician_id FROM event_technicians')).rows).toEqual([{technician_id:S}]);
 expect((await db.query(`SELECT * FROM schedule_blocks WHERE technician_id='${S}' AND deleted_at IS NULL`)).rows).toHaveLength(2);
});
it('Oslo whole-visit shift preserves 08:00 across winter-to-summer offset',async()=>{
 await db.exec(`UPDATE events SET start_time='2026-03-27 07:00Z',end_time='2026-03-27 15:00Z';`);
 await db.exec(`UPDATE events SET start_time='2026-03-30 06:00Z',end_time='2026-03-30 14:00Z';`);
 expect((await db.query(`SELECT start_at AT TIME ZONE 'Europe/Oslo' s FROM schedule_blocks ORDER BY start_at`)).rows.map((r:any)=>new Date(r.s).toISOString().slice(0,19))).toEqual(['2026-03-30T08:00:00','2026-03-30T08:00:00','2026-03-31T08:00:00','2026-03-31T08:00:00']);
});
it('failed reassign rolls back additions, days, responses and removal queue',async()=>{
 await db.exec(`SET ROLE authenticated`);
 await expect(db.query(`SELECT edit_resource_job_plan('${E}',ARRAY['${id(99)}'::uuid],'2026-11-19 07:00Z','2026-11-19 15:00Z','2026-11-19 07:00Z','2026-11-19 15:00Z',ARRAY['${T}'::uuid,'${S}'::uuid])`)).rejects.toThrow('invalid_company_assignee');
 await db.exec('RESET ROLE'); expect((await db.query('SELECT * FROM event_technicians')).rows).toHaveLength(2); expect((await db.query('SELECT * FROM calendar_delete_retry_queue')).rows).toHaveLength(0);
});
it('concurrent repeated response claims only once and does not change Mats',async()=>{
 const t=await token();const r=await Promise.all([respond(t),respond(t),respond(t)]);
 expect(r.filter(x=>x.rows[0].r.success)).toHaveLength(1);expect((await db.query('SELECT * FROM event_logs')).rows).toHaveLength(1);
 expect((await db.query<{status:string}>(`SELECT status FROM job_approvals WHERE technician_user_id='${V}'`)).rows[0].status).toBe('pending');
});
it('explicit full task cancellation only after all references removed; mappings held',async()=>{
 await db.exec(`SELECT remove_work_visit_from_plan('${E}',NULL,true,NULL,'${P}')`);
 expect((await db.query<{status:string}>('SELECT status FROM events')).rows[0].status).toBe('cancelled');
 expect((await db.query('SELECT * FROM event_technicians')).rows).toHaveLength(0);
 expect((await db.query('SELECT * FROM schedule_blocks WHERE deleted_at IS NULL')).rows).toHaveLength(0);
 expect((await db.query('SELECT * FROM job_calendar_day_links')).rows).toHaveLength(2);
 expect((await db.query('SELECT * FROM calendar_delete_retry_queue')).rows).toHaveLength(2);
});
