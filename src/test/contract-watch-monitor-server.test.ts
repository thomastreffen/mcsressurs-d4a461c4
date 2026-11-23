// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect, describe } from "vitest";
const db = new PGlite();
const owner = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002", commitment = "00000000-0000-0000-0000-000000000003";
const lease = "00000000-0000-0000-0000-000000000004", mailbox = "thomas.treffen@mcsservice.no", company = "a0000000-0000-0000-0000-000000000001";
beforeAll(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.uid',true)::uuid $$;
    CREATE FUNCTION is_global_superadmin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE TABLE user_accounts(auth_user_id uuid,person_id uuid,is_active boolean,verified_at timestamptz);
    CREATE TABLE contract_watch_settings(id boolean,enabled boolean,consent_at timestamptz,scope_verified_at timestamptz,allowed_mailboxes text[],consent_by uuid);
    CREATE TABLE contract_watch_scan_runs(mailbox text,pilot_version int,mode text,status text,counts jsonb,discard_reasons jsonb,started_at timestamptz DEFAULT now());
    CREATE TABLE contract_watch_commitments(id uuid PRIMARY KEY,company_id uuid,mailbox text,is_test boolean);
    CREATE TABLE contract_watch_audit(actor uuid,action text,details jsonb);
  `);
  await db.exec(readFileSync("drizzle/migrations/0133_contract_watch_monitor_foundation.sql", "utf8"));
  await db.exec(`INSERT INTO user_accounts VALUES('${owner}','c08e66f8-e4a7-489f-a773-60d5bf3ac6c6',true,now()),('${other}','00000000-0000-0000-0000-000000000009',true,now());
    INSERT INTO contract_watch_settings VALUES(true,true,now(),now(),ARRAY['${mailbox}'],'${owner}');
    INSERT INTO contract_watch_monitor(mailbox) VALUES('${mailbox}');
    INSERT INTO contract_watch_commitments VALUES('${commitment}','${company}','${mailbox}',true);
    SELECT set_config('test.uid','${owner}',false);
  `);
}, 30000);
afterAll(() => db.close());
describe.sequential("Real monitor SQL isolated from production", () => {
  it("starts off, without baseline, and cannot claim", async () => {
    const h = (await db.query<{ h: { auto_enabled: boolean; baseline_ok: boolean; last_ok_at: null; implementation_ready: boolean } }>("select cw_monitor_status() h")).rows[0].h;
    expect(h.auto_enabled).toBe(false); expect(h.baseline_ok).toBe(false); expect(h.last_ok_at).toBeNull(); expect(h.implementation_ready).toBe(false);
    expect((await db.query<{ ok: boolean }>("select cw_monitor_claim($1) ok", [lease])).rows[0].ok).toBe(false);
  });
  it("spotcheck v3 does not satisfy the full v3 baseline", async () => {
    await db.exec(`INSERT INTO contract_watch_scan_runs VALUES('${mailbox}',3,'lookup','done','{"threads_analyzed":3}','{}',now());`);
    expect((await db.query<{ ok: boolean }>("select cw_monitor_baseline_ok() ok")).rows[0].ok).toBe(false);
  });
  it("incomplete full v3 analysis does not permit activation", async () => {
    await db.exec(`INSERT INTO contract_watch_scan_runs VALUES('${mailbox}',3,'historical_test','done','{"threads_analyzed":99}','{"ai_batch_failed":12}',now());`);
    expect((await db.query<{ ok: boolean }>("select cw_monitor_baseline_ok() ok")).rows[0].ok).toBe(false);
  });
  it("claims only commissioned explicit auto activation and excludes concurrent runs", async () => {
    await db.exec(`INSERT INTO contract_watch_scan_runs VALUES('${mailbox}',3,'historical_test','done','{"threads_analyzed":99}','{}',now()+interval '1 second'); UPDATE contract_watch_monitor SET auto_enabled=true;`);
    expect((await db.query<{ ok: boolean }>("select cw_monitor_claim($1) ok", [lease])).rows[0].ok).toBe(false);
    await db.exec("UPDATE contract_watch_monitor SET commissioned_at=now()");
    expect((await db.query<{ ok: boolean }>("select cw_monitor_claim($1) ok", [lease])).rows[0].ok).toBe(true);
    expect((await db.query<{ ok: boolean }>("select cw_monitor_claim($1) ok", [other])).rows[0].ok).toBe(false);
  });
  it("dedupes replay and advances cursor atomically", async () => {
    const rows = JSON.stringify([{ graph_id: "mock-id", message_key: "a".repeat(64), conversation_id: "mock-thread", message_at: "2026-11-23T13:00:00Z" }]);
    await db.query("select cw_monitor_commit_page($1,'inbox','folder-id',null,'cursor1',$2)", [lease, rows]);
    await db.query("select cw_monitor_commit_page($1,'inbox','folder-id','cursor1','cursor2',$2)", [lease, rows]);
    expect((await db.query("select * from contract_watch_message_queue")).rows).toHaveLength(1);
    await expect(db.query("select cw_monitor_commit_page($1,'inbox','folder-id','cursor1','cursor3',$2)", [lease, rows])).rejects.toThrow("cursor_changed");
    expect((await db.query<{ next_url: string }>("select next_url from contract_watch_cursors")).rows[0].next_url).toBe("cursor2");
  });
  it("actually removes expired IDs during page commit", async () => {
    await db.exec("UPDATE contract_watch_message_queue SET expires_at=now()-interval '1 second'");
    await db.query("select cw_monitor_commit_page($1,'inbox','folder-id','cursor2','cursor3','[]')", [lease]);
    expect((await db.query("select * from contract_watch_message_queue")).rows).toHaveLength(0);
  });
  it("Thomas can phone-resolve and snooze with an audit, without touching source findings", async () => {
    await db.query("select cw_followup($1,'phone')", [commitment]);
    expect((await db.query<{ resolution: string }>("select resolution from contract_watch_followups")).rows[0].resolution).toBe("phone");
    await db.query("select cw_followup($1,'snooze')", [commitment]);
    expect((await db.query<{ hours: number }>("select (extract(epoch from (snoozed_until-now()))/3600)::double precision hours from contract_watch_followups")).rows[0].hours).toBeGreaterThan(23.9);
    expect((await db.query("select * from contract_watch_audit")).rows).toHaveLength(2);
    expect((await db.query("select * from contract_watch_commitments")).rows).toHaveLength(1);
  });
  it("other superadmins cannot read/change Thomas' state and users cannot access private cursors", async () => {
    await db.exec(`SELECT set_config('test.uid','${other}',false); SET ROLE authenticated`);
    await expect(db.query("select cw_monitor_status()")).rejects.toThrow("forbidden");
    await expect(db.query("select cw_followup($1,'phone')", [commitment])).rejects.toThrow("forbidden");
    expect((await db.query("select * from contract_watch_followups")).rows).toHaveLength(0);
    await expect(db.query("select * from contract_watch_cursors")).rejects.toThrow("permission denied");
    await expect(db.query("select cw_monitor_claim($1)", [lease])).rejects.toThrow("permission denied");
    await db.exec(`RESET ROLE; SELECT set_config('test.uid','${owner}',false)`);
  });
  it("stop invalidates in-flight lease, so a late commit cannot persist", async () => {
    await db.query("select cw_monitor_stop()");
    await expect(db.query("select cw_monitor_commit_page($1,'inbox','folder-id','cursor3','cursor4','[]')", [lease])).rejects.toThrow("lease_or_gate_lost");
    expect((await db.query<{ enabled: boolean }>("select auto_enabled enabled from contract_watch_monitor")).rows[0].enabled).toBe(false);
  });
});