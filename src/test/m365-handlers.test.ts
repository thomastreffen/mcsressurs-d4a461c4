// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { requiresApproval } from "../../supabase/functions/_shared/communication-policy";
import { formatJobSchedule } from "../../supabase/functions/_shared/job-time";
import { jobInfoUrl, jobAttachmentLinks } from "../../supabase/functions/_shared/job-access-policy";
const eventId = "11111111-1111-4111-8111-111111111111";
function fixture(name: string, internal = false) {
  let handler: (req: Request) => Promise<Response>;
  const writes: { table: string; values: any }[] = [], sends: any[] = [], records: any[] = [];
  const techs = [{ id: "a", name: "Rune", user_id: "rune", email: "rune@example.test" }, { id: "b", name: "Marcus", user_id: "marcus", email: "marcus@example.test" }];
  const event = { id: eventId, company_id: "company", title: "Meeting", entity_type: internal ? "internal" : "job", start_time: "2030-11-03T13:30:00Z", end_time: "2030-11-03T14:30:00Z", created_by: "creator", job_number: "63210", status: "requested" };
  const db: any = {
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "creator@example.test", user_metadata: {} } } }) } },
    rpc: async () => ({ data: true }),
    from(table: string) {
      let single = false;
      const result = () => {
        if (table === "events") return single ? event : [event];
        if (table === "event_technicians") return techs.map(t => ({ technician_id: t.id, event_id: eventId }));
        if (table === "technicians") return techs;
        if (table === "company_reminder_settings") return [{ company_id: "company", enabled: true, max_reminders: 3 }];
        if (table === "job_approvals") return single ? { token: "mock-approval" } : techs.map(t => ({ id: t.id, job_id: eventId, technician_user_id: t.user_id, token: "mock-approval", reminder_profile: "standard", reminder_count: 0, created_at: "2020-01-01", expires_at: "2035-01-01" }));
        return single ? null : [];
      };
      const chain: any = { select: () => chain, eq: () => chain, in: () => chain, is: () => chain, neq: () => chain, order: () => chain, limit: () => chain,
        insert: (values: any) => { writes.push({ table, values }); return chain; }, update: (values: any) => { writes.push({ table, values }); return chain; },
        single: async () => { single = true; return { data: result(), error: null }; },
        maybeSingle: async () => { single = true; return { data: result(), error: null }; },
        then: (resolve: any) => Promise.resolve({ data: result(), error: null }).then(resolve) };
      return chain;
    },
  };
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8").replace(/^import .*;\s*$/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(js, { Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: () => "mock" } }, createClient: () => db, corsHeaders: {}, formatJobSchedule, requiresApproval,
    getApprovalCallerId: async () => "creator", requireGlobalAccessManager: async () => false, resolveJobAddress: async () => "Mock address", buildOperationalJobBrief: () => ({}), briefEmailRows: () => "<tr>Mock</tr>",
    systemSenderEnabled: () => true, sendMail: async (input: any, opts: any) => { sends.push({ input, opts }); return input.to.startsWith("marcus") ? { ok: false, status: 403, reason: "graph_forbidden" } : { ok: true, status: 202 }; },
    jobInfoUrl, jobAttachmentLinks, recordDelivery: async (_: any, record: any) => records.push(record), crypto, Request, Response, Date, Map, Set, console: { error() {}, log() {} } });
  return { sends, records, writes, call: async (payload: unknown) => {
    const response = await handler(new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer mock" }, body: JSON.stringify(payload) }));
    return { status: response.status, body: await response.json() };
  } };
}
describe("Actual handlers, mocked Cloud and Graph only", () => {
  it("approval can send without creator token and records one recipient failure", async () => {
    const f = fixture("create-approval"); const result = await f.call({ job_id: eventId });
    expect(result.status).toBe(200); expect(f.sends).toHaveLength(2);
    expect(f.sends.every(s => s.opts.personalToken === null && s.opts.useSystem)).toBe(true);
    expect(f.records.filter(r => r.status === "failed").map(r => r.technicianId)).toEqual(["b"]);
  });
  it("internal meeting has no approval rows or approval links", async () => {
    const f = fixture("create-approval", true); await f.call({ job_id: eventId });
    expect(f.writes.filter(w => w.table === "job_approvals")).toHaveLength(0);
    expect(f.sends).toHaveLength(2); expect(f.sends.every(s => !s.input.html.includes("/approval/"))).toBe(true);
  });
  it("reminders use system sender and increment only accepted recipient", async () => {
    const f = fixture("approval-reminder"); await f.call({ jobId: eventId, manual: true });
    expect(f.sends).toHaveLength(2);
    expect(f.writes.filter(w => w.table === "job_approvals")).toHaveLength(1);
    expect(f.records.some(r => r.reasonCode === "graph_forbidden")).toBe(true);
  });
  it("change notification attempts both recipients without creator token", async () => {
    const f = fixture("notify-event-changes"); await f.call({ job_id: eventId, changes: [{ label: "Adresse", newValue: "Mock" }] });
    expect(f.sends).toHaveLength(2); expect(f.records.filter(r => r.status === "pending")).toHaveLength(2);
    expect(f.records.some(r => r.status === "failed")).toBe(true);
  });
});