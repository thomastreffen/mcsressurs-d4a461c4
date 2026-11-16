// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { requiresApproval } from "../../supabase/functions/_shared/communication-policy";
import { formatJobSchedule } from "../../supabase/functions/_shared/job-time";
import { jobInfoUrl, jobInfoPath, jobAttachmentLinks } from "../../supabase/functions/_shared/job-access-policy";
import { notifyFingerprint, shouldSendInfoUpdate, NOTIFY_DEDUP_WINDOW_MINUTES } from "../../supabase/functions/_shared/job-save-flow";
import { formatPlannedDays } from "../../supabase/functions/_shared/multi-day-calendar";
import { jobInfoAction, recipientPlannedDays, plannedDaysHtml } from "../../supabase/functions/_shared/job-communication";
const eventId = "11111111-1111-4111-8111-111111111111";
function fixture(name: string, internal = false, self = false) {
  let handler: (req: Request) => Promise<Response>;
  const writes: { table: string; values: any }[] = [], sends: any[] = [], records: any[] = [];
  const claims = new Set<string>();
  const mockSend = async (input: any, opts: any) => { sends.push({ input, opts }); return input.to.startsWith("marcus") ? { ok: false, status: 403, reason: "graph_forbidden" } : { ok: true, status: 202 }; };
  const techs = [{ id: "a", name: "Rune", user_id: self ? "creator" : "rune", email: "rune@example.test" }, { id: "b", name: "Marcus", user_id: "marcus", email: "marcus@example.test" }];
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
        if (table === "schedule_blocks") return ["19", "20"].map(d => ({ project_id: eventId, technician_id: "a", start_at: `2026-11-${d}T05:00:00Z`, end_at: `2026-11-${d}T13:00:00Z` }));
        if (table === "company_reminder_settings") return [{ company_id: "company", enabled: true, max_reminders: 3 }];
        if (table === "job_approvals") return single ? (self ? writes.find(w => w.table === table && w.values.technician_user_id === "creator")?.values ?? null : { token: "mock-approval" }) : techs.map(t => ({ id: t.id, job_id: eventId, technician_user_id: t.user_id, token: "mock-approval", reminder_profile: "standard", reminder_count: 0, created_at: "2020-01-01", expires_at: "2035-01-01" }));
        if (table === "event_logs") return writes.filter(w => w.table === "event_logs").map(w => w.values);
        return single ? null : [];
      };
      const chain: any = { select: () => chain, eq: () => chain, in: () => chain, is: () => chain, neq: () => chain, gte: () => chain, order: () => chain, limit: () => chain,
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
    systemSenderEnabled: () => true, sendMail: mockSend,
    sendJobEmail: async (_: any, event: string, tech: string, input: any, opts: any) => {
      const key = JSON.stringify([event, tech, input.subject, input.html]);
      if (claims.has(key)) return { ok: true, status: 202, duplicate: true };
      claims.add(key); records.push({ eventId: event, technicianId: tech, status: "pending" });
      return { ...await mockSend(input, opts), duplicate: false };
    },
    jobInfoUrl, jobInfoPath, jobAttachmentLinks, jobInfoAction, recipientPlannedDays, plannedDaysHtml, recordDelivery: async (_: any, record: any) => records.push(record), notifyFingerprint, shouldSendInfoUpdate, NOTIFY_DEDUP_WINDOW_MINUTES, formatPlannedDays, crypto, Request, Response, Date, Map, Set, console: { error() {}, log() {} } });
  return { sends, records, writes, call: async (payload: unknown) => {
    const response = await handler(new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer mock" }, body: JSON.stringify(payload) }));
    return { status: response.status, body: await response.json() };
  } };
}
describe("Actual handlers, mocked Cloud and Graph only", () => {
  it("self assignment autoapproves but sends info once with exact job link and no approval action", async () => {
    const f = fixture("create-approval", false, true);
    await f.call({ job_id: eventId });
    const own = f.sends.filter(s => s.input.to === "rune@example.test");
    expect(own).toHaveLength(1);
    expect(own[0].input.html).toContain(jobInfoUrl(eventId));
    expect(own[0].input.html).not.toContain("/approval/");
    expect(f.writes.filter(w => w.table === "job_approvals" && w.values.technician_user_id === "creator").map(w => w.values.status)).toEqual(["approved"]);
    expect(f.records.some(r => r.technicianId === "a" && r.status === "sent" && r.graphStatus === 202)).toBe(true);
    await f.call({ job_id: eventId });
    expect(f.sends.filter(s => s.input.to === "rune@example.test")).toHaveLength(1);
    expect(f.writes.filter(w => w.table === "job_approvals" && w.values.technician_user_id === "creator")).toHaveLength(1);
  });
  it("explicit opt-out sends no mail and records the choice", async () => {
    const f = fixture("create-approval", false, true);
    const result = await f.call({ job_id: eventId, send_notification: false });
    expect(result.body.reason).toBe("explicit_opt_out");
    expect(f.sends).toHaveLength(0);
    expect(f.records).toHaveLength(0);
    expect(f.writes.some(w => w.table === "event_logs" && w.values.metadata?.notification_choice === "without_notification")).toBe(true);
  });
  it("explicit resend to self is information only, never an approval request", async () => {
    const f = fixture("create-approval", false, true);
    await f.call({ job_id: eventId, resend: true });
    const own = f.sends.find(s => s.input.to === "rune@example.test");
    expect(own.input.html).toContain(jobInfoUrl(eventId));
    expect(own.input.html).not.toContain("/approval/");
  });
  it("normal assignment keeps approval actions separate from stable information", async () => {
    const f = fixture("create-approval");
    await f.call({ job_id: eventId });
    expect(f.sends[0].input.html).toContain(jobInfoUrl(eventId));
    expect(f.sends[0].input.html).toContain("/approval/mock-approval?action=approve");
  });
  it("approval can send without creator token and records one recipient failure", async () => {
    const f = fixture("create-approval"); const result = await f.call({ job_id: eventId });
    expect(result.status).toBe(200); expect(f.sends).toHaveLength(2);
    expect(f.sends.every(s => s.opts.personalToken === null && s.opts.useSystem)).toBe(true);
    expect(f.records.filter(r => r.status === "failed").map(r => r.technicianId)).toEqual(["b"]);
  });
  it.each([{}, { resend: true }, { time_change: true }])("approval/info paths retain exact recipient addresses and stable job access %j", async payload => {
    const f = fixture("create-approval"); await f.call({ job_id: eventId, ...payload });
    expect(f.sends.map(s => s.input.to)).toEqual(["rune@example.test", "marcus@example.test"]);
    expect(f.sends.every(s => s.input.html.includes(jobInfoUrl(eventId)))).toBe(true);
    const accepted = f.records.filter(r => r.status === "sent");
    expect(accepted).toHaveLength(1);
    expect(accepted.every(r => r.graphStatus === 202)).toBe(true);
    expect(f.sends).toHaveLength(2);
    expect(f.sends[0].input.html).toContain("19."); expect(f.sends[0].input.html).toContain("20.");
    expect(f.sends[1].input.html).not.toContain("19.");
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
    expect(f.sends.every(s => s.input.html.includes(jobInfoUrl(eventId)) && !s.input.html.includes(`/jobs/${eventId}`))).toBe(true);
    expect(f.sends[0].input.html).toContain("20.");
    expect(f.sends[1].input.html).not.toContain("20.");
  });
  it("change notification attempts both recipients without creator token", async () => {
    const f = fixture("notify-event-changes"); await f.call({ job_id: eventId, changes: [{ label: "Adresse", newValue: "Mock" }] });
    expect(f.sends).toHaveLength(2); expect(f.records.filter(r => r.status === "pending")).toHaveLength(2);
    expect(f.records.some(r => r.status === "failed")).toBe(true);
    expect(f.sends.every(s => s.input.html.includes(jobInfoUrl(eventId)))).toBe(true);
    expect(f.writes.filter(w => w.table === "notifications").map(w => w.values.link_url)).toEqual([jobInfoPath(eventId), jobInfoPath(eventId)]);
  });
  it("identical change notification within the dedup window is not sent twice", async () => {
    const f = fixture("notify-event-changes");
    const first = await f.call({ job_id: eventId, changes: [{ label: "Adresse", newValue: "Mock" }] });
    expect(first.status).toBe(200); expect(f.sends).toHaveLength(2);
    const second = await f.call({ job_id: eventId, changes: [{ label: "Adresse", newValue: "Mock" }] });
    expect(second.status).toBe(200); expect(second.body.skipped_duplicate).toBe(true);
    expect(f.sends).toHaveLength(2); // fortsatt bare første utsending
    const third = await f.call({ job_id: eventId, changes: [{ label: "Adresse", newValue: "Annet" }] });
    expect(third.body.skipped_duplicate).toBeUndefined();
    expect(f.sends).toHaveLength(4); // reell endring sendes
  });
});