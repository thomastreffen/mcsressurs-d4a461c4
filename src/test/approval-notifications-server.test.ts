// @vitest-environment node
// Production notification SQL, exercised only inside isolated in-memory PostgreSQL.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';

let db: PGlite;
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const job=id(100), company=id(200), parent=id(101);
const respond = (n: number) => db.exec(`UPDATE job_approvals SET status='approved' WHERE technician_user_id='${id(n)}' AND status='pending'`);
const rows = async () => (await db.query<{user_id:string;type:string}>(`SELECT user_id,type FROM notifications ORDER BY user_id,type`)).rows;
const addTech = async (n: number) => db.exec(`INSERT INTO technicians VALUES ('${id(n+500)}','${id(n)}','tech'); INSERT INTO event_technicians VALUES ('${job}','${id(n+500)}'); INSERT INTO job_approvals(job_id,technician_user_id) VALUES ('${job}','${id(n)}')`);
beforeAll(async () => {
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE events(id uuid PRIMARY KEY,company_id uuid,created_by uuid,parent_project_id uuid,deleted_at timestamptz,project_number text,job_number text,internal_number text,title text);
    CREATE TABLE technicians(id uuid,user_id uuid,name text);
    CREATE TABLE event_technicians(event_id uuid,technician_id uuid);
    CREATE TABLE job_approvals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid,technician_user_id uuid,token uuid DEFAULT gen_random_uuid(),status text DEFAULT 'pending',created_at timestamptz DEFAULT now(),response_required boolean DEFAULT true);
    CREATE TABLE user_accounts(id uuid,auth_user_id uuid,is_active boolean);
    CREATE TABLE project_members(project_id uuid,user_account_id uuid,member_type text,role text);
    CREATE TABLE job_participants(job_id uuid,user_id uuid);
    CREATE TABLE access_grants(uid uuid,company uuid,allowed boolean);
    CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,event_id uuid,type text,title text,message text,link_url text,priority text,entity_type text,entity_id uuid,company_id uuid,actor_user_id uuid,actor_name text,read boolean DEFAULT false);
    CREATE FUNCTION has_company_access(u uuid,c uuid,m text,l text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM access_grants WHERE uid=u AND company=c AND allowed) $$;
    CREATE FUNCTION user_has_company_access(u uuid,c uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM access_grants WHERE uid=u AND company=c AND allowed) $$;
    GRANT SELECT ON notifications TO authenticated;
    ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own ON notifications FOR SELECT TO authenticated USING(user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid);
  `);
  await db.exec(readFileSync('drizzle/migrations/0093_approval_response_notifications_single_source.sql','utf8').replace(/--> statement-breakpoint/g,''));
},120000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE events,technicians,event_technicians,job_approvals,user_accounts,project_members,job_participants,access_grants,notifications;
    INSERT INTO events VALUES ('${job}','${company}','${id(1)}','${parent}',NULL,NULL,NULL,'JOB-MOCK','Mock'),('${parent}','${company}',NULL,NULL,NULL,NULL,NULL,NULL,'Parent');
    INSERT INTO user_accounts SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,true FROM generate_series(1,8)n;
    INSERT INTO access_grants SELECT auth_user_id,'${company}',true FROM user_accounts;
    INSERT INTO project_members VALUES ('${job}','${id(1)}','internal','owner'),('${parent}','${id(3)}','internal','member'),('${job}','${id(4)}','internal','follower');
    INSERT INTO job_participants VALUES ('${job}','${id(3)}');
  `);
  await addTech(2);
});
it('one technician emits only one final notification per relevant recipient; eight accounts are not eight recipients',async () => {
  await respond(2);
  expect(await rows()).toEqual([{user_id:id(1),type:'all_approved'},{user_id:id(3),type:'all_approved'}]);
});
it('multiple technicians: progress only to owner/manager, final once to participants',async () => {
  await addTech(5);
  await respond(2);
  expect(await rows()).toEqual([{user_id:id(1),type:'approved'}]);
  await respond(5);
  expect(await rows()).toEqual([{user_id:id(1),type:'all_approved'},{user_id:id(1),type:'approved'},{user_id:id(3),type:'all_approved'}]);
});
it('replays and repeated clicks do not emit notifications or claim a second pending response',async () => {
  await respond(2); await respond(2);
  await db.exec(`UPDATE job_approvals SET status='approved' WHERE job_id='${job}'`);
  expect(await rows()).toHaveLength(2);
  expect((await db.query(`UPDATE job_approvals SET status='approved' WHERE job_id='${job}' AND status='pending' RETURNING id`)).rows).toHaveLength(0);
});
it('a fresh token/approval scope permits one new final notification',async () => {
  await respond(2);
  await db.exec(`UPDATE job_approvals SET status='pending',token=gen_random_uuid() WHERE job_id='${job}'`);
  await respond(2);
  expect(await rows()).toHaveLength(4);
});
it('old-token responses cannot claim the replacement pending request',async () => {
  const old=(await db.query<{token:string}>('SELECT token FROM job_approvals')).rows[0]?.token;
  await db.exec('UPDATE job_approvals SET token=gen_random_uuid()');
  expect((await db.query(`UPDATE job_approvals SET status='approved' WHERE token='${old}' AND status='pending' RETURNING id`)).rows).toHaveLength(0);
  expect(await rows()).toHaveLength(0);
});
it('simultaneous queued responses produce one final batch and no two finals',async () => {
  await addTech(5);
  await Promise.all([respond(2),respond(5),respond(2),respond(5)]);
  expect((await rows()).filter(r=>r.type==='all_approved')).toHaveLength(2);
  expect((await rows()).filter(r=>r.type==='approved')).toHaveLength(1);
});
it('unassigned historical approvals cannot complete the live scope or notify',async () => {
  await db.exec(`INSERT INTO job_approvals(job_id,technician_user_id) VALUES('${job}','${id(7)}')`);
  await respond(7); expect(await rows()).toHaveLength(0);
  await respond(2); expect((await rows()).every(r=>r.type==='all_approved')).toBe(true);
});
it('a missing approval for a live technician prevents false completion',async () => {
  await db.exec(`INSERT INTO technicians VALUES ('${id(505)}','${id(5)}','tech'); INSERT INTO event_technicians VALUES ('${job}','${id(505)}')`);
  await respond(2); expect(await rows()).toEqual([{user_id:id(1),type:'approved'}]);
});
it('foreign-company explicit participants and revoked accounts are excluded',async () => {
  await db.exec(`UPDATE access_grants SET company='${id(201)}' WHERE uid='${id(3)}'; UPDATE user_accounts SET is_active=false WHERE auth_user_id='${id(1)}'`);
  await respond(2); expect(await rows()).toHaveLength(0);
});
it('parent members from another company do not inherit notification relevance',async () => {
  await db.exec(`DELETE FROM job_participants; UPDATE events SET company_id='${id(201)}' WHERE id='${parent}'`);
  await respond(2); expect(await rows()).toEqual([{user_id:id(1),type:'all_approved'}]);
});
it('actor never receives their own approval notification, even as owner',async () => {
  await db.exec(`UPDATE events SET created_by='${id(2)}' WHERE id='${job}'; DELETE FROM project_members WHERE user_account_id='${id(1)}'`);
  await respond(2); expect(await rows()).toEqual([{user_id:id(3),type:'all_approved'}]);
});
it('retired edge fan-out is suppressed but assignment notifications survive',async () => {
  await db.exec(`INSERT INTO notifications(user_id,event_id,type,message) VALUES
    ('${id(1)}','${job}','approval_pending','tech godkjente Mock'),
    ('${id(1)}','${job}','approved','accepted'),
    ('${id(2)}','${job}','approval_pending','Du har fått et oppdrag');`);
  expect(await rows()).toEqual([{user_id:id(2),type:'approval_pending'}]);
});
it('notification RLS still isolates recipients and read changes do not delete history',async () => {
  await respond(2);
  const visible=await db.transaction(async tx=>{
    await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(1)}',true)`);
    return tx.query('SELECT user_id FROM notifications');
  });
  expect(visible.rows).toEqual([{user_id:id(1)}]);
  await db.exec('UPDATE notifications SET read=true');
  expect(await rows()).toHaveLength(2);
});
it('rejection/time proposals have one source, target responsible people and exclude actor',async () => {
  await db.exec(`UPDATE job_approvals SET status='rejected'`);
  expect(await rows()).toEqual([{user_id:id(1),type:'rejected'}]);
  await db.exec(`UPDATE job_approvals SET status='pending',token=gen_random_uuid(); UPDATE job_approvals SET status='reschedule_requested'`);
  expect(await rows()).toEqual([{user_id:id(1),type:'rejected'},{user_id:id(1),type:'time_change_proposed'}]);
});
it('approval and batched notifications roll back together',async () => {
  await expect(db.transaction(async tx=>{
    await tx.exec(`UPDATE job_approvals SET status='approved'`);
    throw new Error('simulate transaction abort');
  })).rejects.toThrow('simulate transaction abort');
  expect(await rows()).toHaveLength(0);
  expect((await db.query<{status:string}>('SELECT status FROM job_approvals')).rows[0]?.status).toBe('pending');
});
it('a client cannot forge the transition key to bypass source suppression',async () => {
  await expect(db.exec(`INSERT INTO notifications(user_id,event_id,type,approval_transition_key) VALUES('${id(1)}','${job}','all_approved','forged')`)).rejects.toThrow('trigger-owned');
});