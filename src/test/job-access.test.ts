// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { attachmentLocation, jobInfoPath, jobInfoUrl, jobAttachmentLinks } from "../../supabase/functions/_shared/job-access-policy";
import { buildOperationalJobBrief } from "../../supabase/functions/_shared/job-brief";
import { assignmentInfo } from "../../supabase/functions/_shared/job-assignment-info";
const id = "11111111-1111-4111-8111-111111111111";
function fixture(opts: { loggedIn?: boolean; assigned?: boolean; visible?: boolean; tokenOwner?: boolean; cancelled?: boolean; companyView?: boolean; rpcError?: boolean; eventError?: boolean; inactive?: boolean } = {}) {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  let signs = 0;
  const origin = "https://storage.example.test";
  const db: any = { rpc: async (name: string, args: any) => {
    if (name === "has_company_access") { expect(args).toEqual({ _uid: "recipient", _company: "job-company", _module: "resource_plan", _level: "view" }); return { data: opts.companyView === true }; }
    if (name === "check_permission_v2") return { data: false }; // Thomas has no legacy write permission.
    return { error: opts.rpcError ? { code: "42501" } : null, data: name === "read_my_assigned_job" && opts.visible !== false && opts.assigned !== false ? { event: { id, title: "Operativ jobb", status: opts.cancelled ? "cancelled" : "scheduled", start_time: "2030-01-01T08:00:00Z", end_time: "2030-01-01T10:00:00Z", description: "Varig beskrivelse", attachments: [{ name: "Manual", url: `${origin}/storage/v1/object/sign/job-attachments/job/manual.pdf?token=expired` }] }, assignment: {} } : null };
  }, storage: { from: (bucket: string) => ({ createSignedUrl: async (path: string, expires: number) => { signs++; expect(bucket).toBe("job-attachments"); expect(path).toBe("job/manual.pdf"); expect(expires).toBe(300); return { data: { signedUrl: "https://storage.example.test/fresh" } }; } }) }, from(table: string) {
    const data = () => table === "user_accounts" ? { is_active: !opts.inactive } : table === "events" ? opts.visible === false ? null : { id, company_id: "job-company", title: "Operativ jobb", status: opts.cancelled ? "cancelled" : "scheduled", start_time: "2030-01-01T08:00:00Z", end_time: "2030-01-01T10:00:00Z", description: "Varig beskrivelse", attachments: [{ name: "Manual", url: `${origin}/storage/v1/object/sign/job-attachments/job/manual.pdf?token=expired` }] } : table === "job_approvals" ? opts.tokenOwner === false ? null : { job_id: id, status: "approved" } : table === "event_technicians" ? opts.assigned === false ? [] : [{ start_at: null, end_at: null }] : null;
    const result = () => ({ data: data(), error: table === "events" && opts.eventError ? { code: "42703" } : null });
    const q: any = { select: () => q, eq: () => q, is: () => q, limit: () => q, maybeSingle: async () => result(), then: (f: any) => Promise.resolve(result()).then(f) };
    return q;
  } };
  const source = readFileSync("supabase/functions/job-access/index.ts", "utf8").replace(/^import .*;\s*$/gm, "");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { Deno: { env: { get: (key: string) => key === "SUPABASE_URL" ? origin : "mock" }, serve: (fn: typeof handler) => handler = fn }, createClient: () => db, corsHeaders: {}, getApprovalCallerId: async () => opts.loggedIn === false ? null : "recipient", attachmentLocation, jobInfoPath, buildOperationalJobBrief, assignmentInfo, Response, console: { error: () => {} } });
  return { signs: () => signs, call: async (body: unknown) => {
    if (!handler) throw new Error("Handler missing");
    const r = await handler(new Request("https://app.example.test", { method: "POST", body: JSON.stringify(body) }));
    return { status: r.status, data: await r.json() };
  } };
}
describe("Persistent job information, no live requests", () => {
  it("superadmin with caller-visible event reads without obsolete planner write grant", async () => {
    const r = await fixture({ assigned: false, companyView: true }).call({ action: "read", event_id: id });
    expect(r.status).toBe(200); expect(r.data.brief.workDescription).toBe("Varig beskrivelse");
  });
  it("ordinary company-scoped read-only planner reads the event company, not selected company", async () => {
    expect((await fixture({ assigned: false, companyView: true }).call({ action: "read", event_id: id, company_id: "other-selected-company" })).status).toBe(200);
  });
  it("company rights never bypass a caller-RLS hidden or deleted job", async () => {
    expect((await fixture({ assigned: false, visible: false, companyView: true }).call({ action: "read", event_id: id })).status).toBe(403);
  });
  it("wrong-company caller cannot use visible event alone", async () => {
    expect((await fixture({ assigned: false, companyView: false }).call({ action: "read", event_id: id })).status).toBe(403);
  });
  it("assigned-job RPC exception is technical failure, never missing job", async () => {
    const r = await fixture({ rpcError: true }).call({ action: "read", event_id: id });
    expect(r.status).toBe(500); expect(r.data.code).toBe("job_read_failed"); expect(r.data.stage).toBe("assigned_job");
  });
  it("event query exception is technical failure rather than denial", async () => {
    const r = await fixture({ assigned: false, eventError: true }).call({ action: "read", event_id: id });
    expect(r.status).toBe(500); expect(r.data.stage).toBe("event_rls");
  });
  it("deactivated account cannot use planner or assignment rights", async () => {
    expect((await fixture({ inactive: true, companyView: true }).call({ action: "read", event_id: id })).status).toBe(403);
  });
  it("used approval resolves only for authenticated recipient", async () => {
    expect((await fixture().call({ action: "resolve", token: "used" })).data.path).toBe(`/job-info/${id}`);
    expect((await fixture({ tokenOwner: false }).call({ action: "resolve", token: "used" })).status).toBe(404);
  });
  it("signed-out users cannot read or sign", async () => {
    const f = fixture({ loggedIn: false }); expect((await f.call({ action: "file", event_id: id, file_key: "event:0" })).status).toBe(401); expect(f.signs()).toBe(0);
  });
  it("removed assignee loses access despite broadly visible company event", async () => {
    const f = fixture({ assigned: false }); expect((await f.call({ action: "read", event_id: id })).status).toBe(403);
  });
  it("deleted or RLS-hidden event denies attachments", async () => {
    const f = fixture({ visible: false }); expect((await f.call({ action: "file", event_id: id, file_key: "event:0" })).status).toBe(403); expect(f.signs()).toBe(0);
  });
  it("reissues expired attachment link from storage identity, not old URL", async () => {
    const f = fixture(); expect((await f.call({ action: "file", event_id: id, file_key: "event:0" })).data).toEqual({ url: "https://storage.example.test/fresh", expires_in: 300 });
    expect((await f.call({ action: "file", event_id: id, file_key: "event:99" })).status).toBe(404); expect(f.signs()).toBe(1);
  });
  it("cancelled job remains labelled cancelled with preserved info for current assignee", async () => {
    const r = await fixture({ cancelled: true }).call({ action: "read", event_id: id }); expect(r.data.status).toBe("cancelled"); expect(r.data.brief.workDescription).toBe("Varig beskrivelse"); expect(r.data.files).toHaveLength(1);
  });
  it("never accepts arbitrary private buckets or foreign URLs", () => {
    expect(attachmentLocation({ bucket: "compliance-documents", path: "secret" }, "https://storage.example.test")).toBeNull();
    expect(attachmentLocation({ url: "https://evil.example/storage/v1/object/public/job-attachments/file" }, "https://storage.example.test")).toBeNull();
  });
  it("mail/calendar link points to authenticated job, never original signed or public file", () => {
    const html = jobAttachmentLinks(id, [{ url: "https://example.test/private" }]); expect(html).toContain(jobInfoUrl(id)); expect(html).not.toContain("https://example.test/private");
  });
});