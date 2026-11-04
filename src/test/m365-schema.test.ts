// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
const db = new PGlite();
const event = "00000000-0000-0000-0000-000000000001", tech = "00000000-0000-0000-0000-000000000002";
beforeAll(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
  CREATE TABLE events(id uuid PRIMARY KEY,title text,description text,start_time timestamptz,end_time timestamptz,address text,deleted_at timestamptz,status text);
  GRANT SELECT ON events TO authenticated; ALTER TABLE events ENABLE ROW LEVEL SECURITY;
  CREATE POLICY event_scope ON events FOR SELECT TO authenticated USING(id='${event}');
  CREATE TABLE event_logs(action_type text);
  CREATE TABLE event_technicians(id uuid PRIMARY KEY,event_id uuid,technician_id uuid,start_at timestamptz,end_at timestamptz,calendar_event_id text);`);
  await db.exec(readFileSync("drizzle/migrations/0063_migration.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0064_m365_delivery_and_organizer_support.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0065_m365_durable_communication_queue.sql", "utf8"));
  await db.exec(`INSERT INTO events(id) VALUES('${event}'),('00000000-0000-0000-0000-000000000003');`);
}, 30000);
afterAll(() => db.close());
it("all assignment insertion paths enqueue intent without sending", async () => {
  await db.exec(`INSERT INTO event_technicians(id,event_id,technician_id) VALUES('${tech}','${event}','${tech}');`);
  expect((await db.query("SELECT operation,status FROM m365_communication_queue")).rows).toEqual([{ operation: "create", status: "pending" }]);
  expect((await db.query("SELECT * FROM event_recipient_delivery")).rows).toHaveLength(0);
});
it("calendar-ID-only updates do not recursively enqueue", async () => {
  await db.exec(`UPDATE event_technicians SET calendar_event_id='mock-id' WHERE id='${tech}';`);
  expect((await db.query<{ revision: number }>("SELECT revision FROM m365_communication_queue")).rows[0].revision).toBe(1);
});
it("changes and removed assignees retain durable delete intent", async () => {
  await db.exec(`UPDATE events SET title='Changed' WHERE id='${event}'; DELETE FROM event_technicians WHERE id='${tech}';`);
  expect((await db.query("SELECT operation,revision FROM m365_communication_queue")).rows).toEqual([{ operation: "delete", revision: 3 }]);
});
it("delivery upserts increment attempts atomically and respect constraints", async () => {
  const sql = `SELECT record_event_delivery('${event}','${tech}','email','sent','accepted_by_graph')`;
  await db.exec(sql); await db.exec(sql);
  expect((await db.query("SELECT attempt_count,delivery_state FROM event_recipient_delivery")).rows).toEqual([{ attempt_count: 2, delivery_state: "accepted_by_graph" }]);
  await expect(db.exec(`SELECT record_event_delivery('${event}','${tech}','email','sent','invented')`)).rejects.toThrow();
});
it("authenticated users cannot write delivery or execute recording RPC", async () => {
  await db.exec("SET ROLE authenticated");
  expect((await db.query("SELECT * FROM event_recipient_delivery")).rows).toHaveLength(1);
  await expect(db.exec(`SELECT record_event_delivery('${event}','${tech}','email','sent','verified')`)).rejects.toThrow("permission denied");
  await expect(db.exec("UPDATE m365_communication_queue SET status='accepted'")).rejects.toThrow("permission denied");
  await db.exec("RESET ROLE");
});
it("delivery, organizer and queue reads follow hidden event RLS", async () => {
  const hidden = "00000000-0000-0000-0000-000000000003";
  await db.exec(`INSERT INTO m365_organizer_links(event_id,technician_id) VALUES('${hidden}','${tech}'); INSERT INTO m365_communication_queue(event_id,technician_id,operation) VALUES('${hidden}','${tech}','create'); SELECT record_event_delivery('${hidden}','${tech}','email','sent','accepted_by_graph');`);
  await db.exec("SET ROLE authenticated");
  for (const table of ["m365_organizer_links", "m365_communication_queue", "event_recipient_delivery"]) {
    expect((await db.query(`SELECT * FROM ${table} WHERE event_id='${hidden}'`)).rows).toHaveLength(0);
  }
  await db.exec("RESET ROLE");
});