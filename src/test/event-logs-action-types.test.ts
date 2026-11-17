// @vitest-environment node
// Guards every real public.event_logs writer against the live CHECK allow-list (migration 0102).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, expect, it } from "vitest";

const MIGRATION = "drizzle/migrations/0102_event_logs_writer_action_types.sql";
const sql = readFileSync(MIGRATION, "utf8");
const allowed = new Set([...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

/** Files that INSERT into event_logs (display-only readers are excluded). */
const writerFiles = execSync("rg -l \"event_logs\" supabase/functions src --type ts", { encoding: "utf8" })
  .split("\n").filter((f) => f && !f.includes("/test/") && !f.endsWith("types.ts") && !f.endsWith("EventHistoryTab.tsx"));

function writtenActions(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/(?:action_type|actionType)\s*:|logAction\(/g)) {
    const rest = src.slice(m.index! + m[0].length).replace(/^\s+/, "");
    const line = rest.split("\n")[0];
    // Literals compared with === are conditions, not written values.
    for (const lit of line.replace(/===\s*["'][a-z_]+["']/g, "").matchAll(/["']([a-z][a-z_]*)["']/g)) out.push(lit[1]);
  }
  return out;
}

it("every literal action_type written by an edge function or screen is in the live allow-list", () => {
  const missing: string[] = [];
  for (const f of writerFiles) for (const a of writtenActions(f)) if (!allowed.has(a)) missing.push(`${f}: ${a}`);
  expect(missing).toEqual([]);
  // Sanity: the scan really sees the previously rejected writers.
  const seen = new Set(writerFiles.flatMap(writtenActions));
  for (const a of ["sharepoint_upload", "outlook_calendar_unlinked", "email_draft_created", "duration_changed", "outlook_days_created", "marked_followed_up"]) expect(seen.has(a)).toBe(true);
});

it("database routines that write event_logs use allowed actions", () => {
  const dbActions = ["created", "notifications_requested", "notifications_skipped", "work_visit_created", "work_visit_existing", "work_visit_repaired", "work_visit_unplanned", "technician_unplanned"];
  for (const a of dbActions) expect(allowed.has(a)).toBe(true);
  const rpc = readFileSync("drizzle/migrations/0101_exact_calendar_unplan.sql", "utf8");
  expect(rpc).toMatch(/'work_visit_unplanned' ELSE 'technician_unplanned'/);
});

it("allow-list stays closed (no wildcard / LIKE / NOT VALID)", () => {
  expect(sql).not.toMatch(/LIKE|~|NOT VALID|IS NOT NULL/i);
  expect(allowed.has("anything_goes")).toBe(false);
});

const C = "a0000000-0000-0000-0000-000000000001", OTHER_C = "a0000000-0000-0000-0000-000000000002";
const PLANNER = "10000000-0000-0000-0000-000000000001", TECH = "10000000-0000-0000-0000-000000000002";
const E = "30000000-0000-0000-0000-000000000001", E2 = "30000000-0000-0000-0000-000000000002";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated;
  CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid);
  INSERT INTO events VALUES ('${E}','${C}'),('${E2}','${OTHER_C}');
  CREATE TABLE event_logs(id uuid DEFAULT gen_random_uuid(), event_id uuid REFERENCES events, action_type text NOT NULL, performed_by uuid, change_summary text, metadata jsonb);
  CREATE FUNCTION event_company_id(uuid) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT company_id FROM events WHERE id=$1 $$;
  CREATE FUNCTION legacy_admin_in_company(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE FUNCTION has_company_access(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${PLANNER}'::uuid AND $2='${C}'::uuid AND $3='resource_plan' $$;
  ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;
  -- Live policies (pg_policy, 17.11.2026)
  CREATE POLICY "Admins can insert event_logs" ON event_logs FOR INSERT TO authenticated WITH CHECK (legacy_admin_in_company(event_company_id(event_id)));
  CREATE POLICY "Resource planners insert own event_logs" ON event_logs FOR INSERT TO authenticated WITH CHECK (performed_by = auth.uid() AND has_company_access(auth.uid(), event_company_id(event_id), 'resource_plan', 'edit'));
  CREATE POLICY reads ON event_logs FOR SELECT TO authenticated USING (true);
  GRANT ALL ON event_logs TO authenticated; GRANT SELECT ON events TO authenticated;
  ALTER TABLE event_logs ADD CONSTRAINT event_logs_action_type_check CHECK (action_type IN ('created'));`);
  await db.exec(sql);
}, 30000);
afterAll(() => db.close());

async function asUser(uid: string, fn: (tx: any) => Promise<unknown>) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uid}',true)`);
    return fn(tx);
  });
}

it("non-admin planner can write each screen action for own company; rejected/rolled back otherwise", async () => {
  for (const a of ["duration_changed", "marked_followed_up", "reminders_paused", "profile_changed", "technician_assigned", "notifications_skipped", "attachment_added"]) {
    await asUser(PLANNER, (tx) => tx.query("insert into event_logs(event_id,action_type,performed_by) values($1,$2,$3)", [E, a, PLANNER]));
  }
  await expect(asUser(PLANNER, (tx) => tx.query("insert into event_logs(event_id,action_type,performed_by) values($1,'created',$2)", [E2, PLANNER]))).rejects.toThrow(/row-level security/);
  await expect(asUser(TECH, (tx) => tx.query("insert into event_logs(event_id,action_type,performed_by) values($1,'status_changed',$2)", [E, TECH]))).rejects.toThrow(/row-level security/);
  await expect(asUser(PLANNER, (tx) => tx.query("insert into event_logs(event_id,action_type,performed_by) values($1,'anything_goes',$2)", [E, PLANNER]))).rejects.toThrow(/event_logs_action_type_check/);
  // A batch with one bad action rolls back the whole batch (EventDrawer inserts arrays).
  await expect(asUser(PLANNER, async (tx) => {
    await tx.query("insert into event_logs(event_id,action_type,performed_by) values($1,'title_changed',$2)", [E, PLANNER]);
    await tx.query("insert into event_logs(event_id,action_type,performed_by) values($1,'bogus',$2)", [E, PLANNER]);
  })).rejects.toThrow(/check constraint/);
  expect((await db.query("select count(*)::int n from event_logs where action_type='title_changed'")).rows).toEqual([{ n: 0 }]);
  expect((await db.query("select count(*)::int n from event_logs")).rows).toEqual([{ n: 7 }]);
});

it("service-role edge writers (SharePoint, Outlook, mail) pass the CHECK", async () => {
  for (const a of ["sharepoint_connected", "sharepoint_disconnected", "sharepoint_upload", "outlook_calendar_sync", "outlook_calendar_unlinked", "email_draft_created", "outlook_update_skipped", "outlook_delete_unconfirmed", "outlook_days_created", "outlook_partial"]) {
    await db.query("insert into event_logs(event_id,action_type) values($1,$2)", [E, a]);
  }
});

it("migration list is unique and keeps every previously allowed value", () => {
  const list = [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  expect(new Set(list).size).toBe(list.length);
  const prev = readFileSync("drizzle/migrations/0099_event_logs_notification_choice_actions.sql", "utf8");
  for (const m of prev.matchAll(/'([a-z_]+)'/g)) expect(allowed.has(m[1])).toBe(true);
  void readdirSync;
});
