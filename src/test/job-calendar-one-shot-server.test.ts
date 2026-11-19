// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { ONE_SHOT as x, ONE_SHOT_60576 as second } from "../../supabase/functions/_shared/job-calendar-one-shot";
let db: PGlite;
const actor = "00000000-0000-0000-0000-000000000001", user = "00000000-0000-0000-0000-000000000002", target = "00000000-0000-0000-0000-000000000003";
const clock = "2026-11-17 10:00Z";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE events(id uuid PRIMARY KEY,company_id uuid,title text,status text,deleted_at timestamptz);
  CREATE TABLE technicians(id uuid PRIMARY KEY,user_id uuid,email text,deleted_at timestamptz,archived_at timestamptz);
  CREATE TABLE event_technicians(event_id uuid,technician_id uuid,calendar_event_id text);
  CREATE TABLE job_approvals(job_id uuid,technician_user_id uuid,status text,created_at timestamptz,outlook_event_id text);
  CREATE TABLE people(id uuid,is_active boolean); CREATE TABLE user_accounts(auth_user_id uuid,person_id uuid,is_active boolean);
  CREATE TABLE employment_profiles(person_id uuid,company_id uuid,relationship_type text,archived_at timestamptz);
  CREATE TABLE schedule_blocks(project_id uuid,technician_id uuid,company_id uuid,source text,deleted_at timestamptz,start_at timestamptz,end_at timestamptz);
  CREATE TABLE job_outlook_app_sync_settings(id boolean,enabled boolean,dry_run boolean,pilot_mailboxes text[],scope_verified_at timestamptz);
  CREATE TABLE job_outlook_app_pilot_targets(id uuid PRIMARY KEY,event_id uuid,technician_id uuid,company_id uuid,mailbox text,work_date date,expires_at timestamptz,revoked_at timestamptz);
  CREATE TABLE job_outlook_app_pilot_actions(target_id uuid,action text,created_at timestamptz,result jsonb);
  CREATE TABLE job_calendar_links(job_id uuid,technician_id uuid,calendar_event_id text);
  CREATE TABLE m365_organizer_links(event_id uuid,technician_id uuid,graph_event_id text);
  CREATE TABLE job_calendar_day_links(event_id uuid,technician_id uuid,work_date date,start_at timestamptz,end_at timestamptz,status text,idempotency_key text UNIQUE,last_error text,UNIQUE(event_id,technician_id,work_date));
  CREATE TABLE job_outlook_app_links(company_id uuid,event_id uuid,technician_id uuid,mailbox text,work_date date,dedup_key text UNIQUE,outlook_event_id text,outlook_change_key text,state text,hub_version text);
  CREATE TABLE job_outlook_app_queue(status text,attempts int,released_at timestamptz);
  CREATE FUNCTION is_global_superadmin(u uuid) RETURNS boolean LANGUAGE sql AS $$SELECT u='${actor}'::uuid$$;
  CREATE FUNCTION has_company_access(u uuid,c uuid,m text,l text) RETURNS boolean LANGUAGE sql AS $$SELECT u='${actor}'::uuid AND c='${x.company_id}'::uuid AND m='resource_plan' AND l='edit'$$;
  CREATE FUNCTION assignment_schedule_signature(e uuid,u uuid) RETURNS text LANGUAGE sql AS $$SELECT 'unchanged-signature'::text$$;`);
  // Fixed local clock tests the deployed SQL on the exact future day without relying on runner timezone/date.
  await db.exec(readFileSync("drizzle/migrations/0105_job_calendar_one_shot.sql", "utf8").replace(/now\(\)/g, `'${clock}'::timestamptz`));
  await db.exec(readFileSync("drizzle/migrations/0106_one_shot_conflict_consent.sql", "utf8").replace(/now\(\)/g, `'${clock}'::timestamptz`));
  await db.exec(readFileSync("drizzle/migrations/0119_one_shot_calendar_permits.sql", "utf8").replace(/now\(\)/g, `'${clock}'::timestamptz`));
  await db.exec(readFileSync("drizzle/migrations/0120_one_shot_preview_permit_scope.sql", "utf8"));
  await db.exec("ALTER TABLE job_outlook_app_links ADD COLUMN adopted_from_day_link_id uuid");
  await db.exec(readFileSync("drizzle/migrations/0121_central_calendar_daily_operations.sql","utf8"));
  await db.exec(readFileSync("drizzle/migrations/0122_central_calendar_exact_claim.sql","utf8").replace(/now\(\)/g, `'${clock}'::timestamptz`));
}, 120000);
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE job_calendar_daily_operations,job_calendar_one_shot_audit,job_calendar_one_shot_runs,events,technicians,event_technicians,job_approvals,people,user_accounts,employment_profiles,schedule_blocks,job_outlook_app_sync_settings,job_outlook_app_pilot_targets,job_outlook_app_pilot_actions,job_calendar_links,m365_organizer_links,job_calendar_day_links,job_outlook_app_links,job_outlook_app_queue CASCADE;
  INSERT INTO events VALUES('${x.event_id}','${x.company_id}','60570 Majorstua stasjon','rejected',NULL);
  INSERT INTO technicians VALUES('${x.technician_id}','${user}','${x.mailbox}',NULL,NULL);
  INSERT INTO event_technicians VALUES('${x.event_id}','${x.technician_id}',NULL);
  INSERT INTO job_approvals VALUES('${x.event_id}','${user}','pending','${clock}',NULL);
  INSERT INTO people VALUES('${user}',true); INSERT INTO user_accounts VALUES('${user}','${user}',true); INSERT INTO employment_profiles VALUES('${user}','${x.company_id}','employee',NULL);
  INSERT INTO schedule_blocks VALUES('${x.event_id}','${x.technician_id}','${x.company_id}','manual',NULL,'2026-11-19 07:00Z','2026-11-19 15:00Z'),('${x.event_id}','${x.technician_id}','${x.company_id}','manual',NULL,'2026-11-20 07:00Z','2026-11-20 15:00Z');
  INSERT INTO job_outlook_app_sync_settings VALUES(true,false,true,'{}',NULL);
  INSERT INTO job_outlook_app_pilot_targets VALUES('${target}','${x.event_id}','${x.technician_id}','${x.company_id}','${x.mailbox}','${x.work_date}','2026-11-18 09:00Z',NULL);
  INSERT INTO job_outlook_app_pilot_actions VALUES('${target}','probe_mailbox','2026-11-17 09:00Z','{"http":200,"pass":true,"tid_match":true,"appid_match":true}');
  INSERT INTO job_outlook_app_queue SELECT 'pending',0,NULL FROM generate_series(1,5);`);
});
async function prepare() { return (await db.query<{id:string}>(`INSERT INTO job_calendar_one_shot_runs(target_id,actor,event_id,technician_id,company_id,mailbox,work_date,payload,payload_hash,job_snapshot,schedule_signature,calendar_signature,conflict_summary) SELECT $1,$2,id,$3,company_id,$4,$5,'{}','frozen',to_jsonb(e),'unchanged-signature','calendar-frozen','{"category":"clear"}' FROM events e RETURNING id`, [target, actor, x.technician_id, x.mailbox, x.work_date])).rows[0].id; }
const claim = async (id: string, who = actor) => (await db.query<{ok:boolean}>("SELECT claim_job_calendar_one_shot($1,$2,'frozen','calendar-frozen',false,true,'OPPRETT MATS 19.11.2026 08–16') ok", [id,who])).rows[0].ok;
it("only one simultaneous permit consumes and reserves exact day; global OFF and five queue intents untouched", async () => {
  const ids = await Promise.all([prepare(),prepare()]); const results = await Promise.all(ids.map(id => claim(id).catch(() => false))); expect(results.filter(Boolean)).toHaveLength(1);
  expect((await db.query("SELECT work_date::text,status,last_error FROM job_calendar_day_links")).rows).toEqual([{ work_date: "2026-11-19", status: "pending", last_error: "one_shot_reserved" }]);
  expect((await db.query("SELECT status,attempts,released_at FROM job_outlook_app_queue")).rows).toEqual(Array(5).fill({status:"pending",attempts:0,released_at:null}));
  expect((await db.query("SELECT enabled,dry_run,pilot_mailboxes,scope_verified_at FROM job_outlook_app_sync_settings")).rows).toEqual([{enabled:false,dry_run:true,pilot_mailboxes:[],scope_verified_at:null}]);
});
it.each(["inactive", "employment", "removed", "hours", "expired", "rejected", "global", "probe", "snapshot"])("claim stops on %s and no day slot or consumed audit remains", async mode => {
  const id = await prepare();
  const sql:Record<string,string> = { inactive:"UPDATE user_accounts SET is_active=false", employment:"UPDATE employment_profiles SET archived_at='2026-11-17 09:00Z'", removed:"DELETE FROM event_technicians", hours:"UPDATE schedule_blocks SET end_at=end_at-interval '1 hour'", expired:"UPDATE job_outlook_app_pilot_targets SET expires_at='2026-11-17 09:00Z'", rejected:"UPDATE job_approvals SET status='rejected'", global:"UPDATE job_outlook_app_sync_settings SET enabled=true", probe:"UPDATE job_outlook_app_pilot_actions SET result='{}'", snapshot:"UPDATE events SET title='changed'" };
  await db.exec(sql[mode]); expect(await claim(id)).toBe(false); expect((await db.query("SELECT * FROM job_calendar_day_links")).rows).toHaveLength(0); expect((await db.query("SELECT * FROM job_calendar_one_shot_audit")).rows).toHaveLength(0);
});
it("existing legacy day reservation prevents independent create", async () => { const id=await prepare(); await db.exec(`INSERT INTO job_calendar_day_links VALUES('${x.event_id}','${x.technician_id}','${x.work_date}','2026-11-19 07:00Z','2026-11-19 15:00Z','pending','existing',NULL)`); expect(await claim(id)).toBe(false); });
it("receipt atomically persists exact central link and audit without job/approval changes; no repost after uncertain", async () => {
  const id=await prepare(); expect(await claim(id)).toBe(true);
  await db.query("SELECT finish_job_calendar_one_shot($1,$2,'uncertain',NULL,503,NULL,false)",[id,actor]); expect(await claim(id)).toBe(false);
  expect((await db.query<{ok:boolean}>("SELECT finish_job_calendar_one_shot($1,$2,'succeeded','graph-exact-id',200,'ck',true)ok",[id,actor])).rows[0].ok).toBe(true);
  expect((await db.query("SELECT outlook_event_id,work_date::text,mailbox FROM job_outlook_app_links")).rows).toEqual([{outlook_event_id:"graph-exact-id",work_date:"2026-11-19",mailbox:x.mailbox}]);
  expect((await db.query("SELECT status FROM events")).rows).toEqual([{status:"rejected"}]); expect((await db.query("SELECT status FROM job_approvals")).rows).toEqual([{status:"pending"}]);
});
it("audit failure rolls back consumed permit and reservation", async () => { const id=await prepare(); await db.exec("ALTER TABLE job_calendar_one_shot_audit ADD CONSTRAINT stop_audit CHECK(false) NOT VALID"); await expect(claim(id)).rejects.toThrow(); await db.exec("ALTER TABLE job_calendar_one_shot_audit DROP CONSTRAINT stop_audit"); expect((await db.query("SELECT * FROM job_calendar_day_links")).rows).toHaveLength(0); expect((await db.query("SELECT state,consumed_at FROM job_calendar_one_shot_runs")).rows).toEqual([{state:"prepared",consumed_at:null}]); });
it("ordinary callers cannot read permit or execute claims; wrong actor cannot consume", async () => { const id=await prepare(); expect(await claim(id,user)).toBe(false); await db.exec("SET ROLE authenticated"); await expect(db.query("SELECT * FROM job_calendar_one_shot_runs")).rejects.toThrow(/permission denied/); await expect(claim(id)).rejects.toThrow(/permission denied/); });
it("other-time override requires exact consent and audits once with five intents held", async () => {
  const id=await prepare(); await db.query("UPDATE job_calendar_one_shot_runs SET conflict_summary=$2 WHERE id=$1",[id,{category:"other",conflicts:[{local_overlap:"13:00–13:30",show_as:"tentative"}]}]);
  expect(await claim(id)).toBe(false);
  const args=[id,actor,"frozen","calendar-frozen",true,true,x.overridePhrase];
  expect((await db.query<{ok:boolean}>("SELECT claim_job_calendar_one_shot($1,$2,$3,$4,$5,$6,$7) ok",args)).rows[0].ok).toBe(true);
  expect((await db.query<{ok:boolean}>("SELECT claim_job_calendar_one_shot($1,$2,$3,$4,$5,$6,$7) ok",args)).rows[0].ok).toBe(false);
  const rows=(await db.query<{detail:{conflict_override:boolean;confirmation:string;resource_plan_confirmed:boolean}}>("SELECT detail FROM job_calendar_one_shot_audit WHERE action='consumed'")).rows;
  expect(rows).toHaveLength(1);expect(rows[0].detail.conflict_override).toBe(true);expect(rows[0].detail.confirmation).toBe(x.overridePhrase);expect(rows[0].detail.resource_plan_confirmed).toBe(true);
  expect((await db.query("SELECT status,attempts,released_at FROM job_outlook_app_queue")).rows).toEqual(Array(5).fill({status:"pending",attempts:0,released_at:null}));
});
it.each(["duplicate","unknown",null])("SQL never overrides %s identity",async category=>{
  const id=await prepare();await db.query("UPDATE job_calendar_one_shot_runs SET conflict_summary=$2 WHERE id=$1",[id,category?{category}:null]);
  expect((await db.query<{ok:boolean}>("SELECT claim_job_calendar_one_shot($1,$2,'frozen','calendar-frozen',true,true,$3) ok",[id,actor,x.overridePhrase])).rows[0].ok).toBe(false);
});
it.each(["signature","plan","phrase","override"])("SQL refuses missing %s without consuming",async mode=>{
  const id=await prepare();await db.query("UPDATE job_calendar_one_shot_runs SET conflict_summary=$2 WHERE id=$1",[id,{category:"other"}]);
  expect((await db.query<{ok:boolean}>("SELECT claim_job_calendar_one_shot($1,$2,'frozen',$3,$4,$5,$6) ok",[id,actor,mode==="signature"?null:"calendar-frozen",mode!=="override",mode!=="plan",mode==="phrase"?x.phrase:x.overridePhrase])).rows[0].ok).toBe(false);
  expect((await db.query("SELECT * FROM job_calendar_one_shot_audit")).rows).toHaveLength(0);
});
it("60576 exact preview tuple saves; old 60570 key, wrong day/job fail at database boundary",async()=>{
  await db.query("INSERT INTO events VALUES($1,$2,'60576','requested',NULL)",[second.event_id,second.company_id]);
  const insert=(key:string,day:string,event:string)=>db.query(`INSERT INTO job_calendar_one_shot_runs(target_id,actor,event_id,technician_id,company_id,mailbox,work_date,idempotency_key,payload,payload_hash,job_snapshot,schedule_signature) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}','frozen','{}','signature') RETURNING work_date::text`,[target,actor,event,second.technician_id,second.company_id,second.mailbox,day,key]);
  expect((await insert(second.key,second.work_date,second.event_id)).rows).toEqual([{work_date:"2026-11-26"}]);
  await expect(insert(x.key,second.work_date,second.event_id)).rejects.toThrow(/one_shot_run_exact_permit/);
  await expect(insert(second.key,"2026-11-27",second.event_id)).rejects.toThrow(/one_shot_run_exact_permit/);
  await expect(insert(second.key,second.work_date,x.event_id)).rejects.toThrow(/one_shot_run_exact_permit/);
  expect((await db.query("SELECT consumed_at FROM job_calendar_one_shot_runs")).rows).toEqual([{consumed_at:null}]);
});

it("ordinary daily claim is locked by globals, then exact day reserves once in isolated DB",async()=>{
 const call=()=>db.query<{id:string|null}>("SELECT claim_central_calendar_day($1,$2,$3,$4,$5,$6,'create',$7,$8,'{}',NULL,NULL) id",["ordinary-key",x.event_id,x.technician_id,x.company_id,x.mailbox,x.work_date,x.start,x.end]);
 expect((await call()).rows[0].id).toBeNull();
 await db.exec(`UPDATE job_outlook_app_sync_settings SET enabled=true,dry_run=false,scope_verified_at='${clock}',pilot_mailboxes=ARRAY['${x.mailbox}'];`);
 expect((await call()).rows[0].id).toEqual(expect.any(String));expect((await call()).rows[0].id).toBeNull();
 expect((await db.query("SELECT status,attempts,released_at FROM job_outlook_app_queue")).rows).toEqual(Array(5).fill({status:"pending",attempts:0,released_at:null}));
});
it("daily journal is inaccessible to ordinary callers",async()=>{await db.exec("SET ROLE authenticated");await expect(db.query("SELECT * FROM job_calendar_daily_operations")).rejects.toThrow(/permission denied/);});
