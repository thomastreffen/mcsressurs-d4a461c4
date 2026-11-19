// @vitest-environment node
import { readFileSync } from "node:fs";
import { it, expect, vi } from "vitest";
import { z } from "zod";
import * as core from "../../supabase/functions/_shared/job-calendar-one-shot";
async function load(options: { admin?: boolean; company?: boolean; user?: boolean; diagnose?: boolean; permit?: core.OneShotPermit; dbError?: {table: string; code: string}; prepare?: boolean } = {}) {
  let serve: ((req: Request) => Promise<Response>) | undefined;
  const mutations = vi.fn(() => { throw Error("DB mutations prohibited"); });
  const inserts = vi.fn();
  const from = vi.fn((table: string) => {
    if (!options.diagnose) { const q: any = { select: () => q, order: () => q, not: () => q, eq: () => q, limit: async () => ({ data: [], error: null }) }; return q; }
    const x = options.permit ?? core.ONE_SHOT;
    const row: Record<string, unknown> = {
      events: { id: x.event_id, company_id: x.company_id, title: "Majorstua", status: "rejected", start_time: x.start, end_time: x.end },
      job_outlook_app_pilot_targets: { ...x, id: "target", revoked_at: null, expires_at: "2099-01-01" },
      technicians: { id: x.technician_id, user_id: "user", email: x.mailbox }, user_accounts: { person_id: "person", is_active: true }, people: { is_active: true },
      event_technicians: { id: "assignment" }, job_approvals: { status: "pending" },
      job_outlook_app_pilot_actions: { created_at: new Date().toISOString(), result: { http: 200, pass: true, tid_match: true, appid_match: true } },
      job_outlook_app_sync_settings: { enabled: false, dry_run: true, pilot_mailboxes: [], scope_verified_at: null }, hub_calendar_diagnostic_runs: {},
    };
    const array = table === "employment_profiles" ? [{ id: "employment" }] : table === "schedule_blocks" ? [{ technician_id: x.technician_id, company_id: x.company_id, start_at: x.start, end_at: x.end }] : [];
    let inserted = false;
    const result = () => ({ data: inserted ? { id: "00000000-0000-4000-8000-000000000010", expires_at: "2099-01-01" } : row[table], error: options.dbError?.table === table ? { code: options.dbError.code, message: "private payload must not escape" } : null });
    const q: any = { select: () => q, order: () => q, not: () => q, limit: () => q, eq: () => q, is: () => q, insert: (value: unknown) => { if (!options.prepare) return mutations(); inserts(table,value); inserted = true; return q; }, update: mutations, delete: mutations, single: async () => result(), maybeSingle: async () => result(), then: (resolve: any) => Promise.resolve({ ...result(), data: array }).then(resolve) };
    return q;
  });
  const rpc = vi.fn(async (_name: string, _args?: unknown) => ({ data: options.company !== false, error: null }));
  const client = { from, rpc, auth: { getClaims: async () => ({ data: { claims: { sub: options.user === false ? null : "authenticated-operator" } }, error: null }) } };
  const Deno = { env: { get: (n: string) => n === "AZURE_CLIENT_ID" ? "mail-app" : "isolated-config" }, serve: (s: typeof serve) => { serve = s; } };
  const ts = await import("typescript");
  const source = readFileSync("supabase/functions/job-calendar-one-shot/index.ts", "utf8").replace(/^import .*;\n/gm, "");
  const js = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  const bindings = { Deno, createClient: () => client, corsHeaders: {}, z, requireGlobalAccessManager: async () => options.admin !== false, tokenRoles: () => ({ appId: "isolated-config", roles: ["Calendars.ReadWrite"] }), diagnosticGate: () => null, ...core };
  new Function(...Object.keys(bindings), js)(...Object.values(bindings));
  if (!serve) throw Error("handler not captured");
  return { serve, from, rpc, mutations, inserts };
}
const request = (body: unknown, auth = true) => new Request("http://isolated.test", { method: "POST", headers: auth ? { Authorization: "Bearer mock-user-session" } : {}, body: JSON.stringify(body) });
it.each([{ admin: false }, { company: false }, { user: false }])("operator and company authorization deny before reads/network %j", async o => {
  const { serve, from } = await load(o); const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("network prohibited"));
  try { const r = await serve(request({ action: "preflight" })); expect([401,403]).toContain(r.status); expect(from).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); } finally { fetch.mockRestore(); }
});
it.each([{ action: "release_queue" }, { action: "create", confirm: core.ONE_SHOT.phrase }, { action: "preflight", mailbox: "other@example.test" }, { action: "create", run_id: "00000000-0000-4000-8000-000000000001", payload_hash: "a".repeat(64), confirm: core.ONE_SHOT.phrase, pending_busy_confirmed: false }])("input rejects before reads and Graph %j", async body => {
  const { serve, from } = await load(); const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("network prohibited"));
  try { expect((await serve(request(body))).status).toBe(400); expect(from).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); } finally { fetch.mockRestore(); }
});
it("authenticated status performs only private permit read with no Microsoft request", async () => {
  const { serve, from } = await load(); const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("network prohibited"));
  try { const r = await serve(request({ action: "status" })); expect(r.status).toBe(200); expect((await r.json()).consumed).toBe(false); expect(from).toHaveBeenCalledWith("job_calendar_one_shot_runs"); expect(fetch).not.toHaveBeenCalled(); } finally { fetch.mockRestore(); }
});
it("authenticated diagnose reads one exact calendarView without DB mutation, claim or Graph write", async () => {
  const { serve, rpc, mutations } = await load({ diagnose: true });
  const fakeToken = `header.${btoa(JSON.stringify({ tid: "isolated-config" }))}.signature`;
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).startsWith("https://login.microsoftonline.com/")) return new Response(JSON.stringify({ access_token: fakeToken }), { status: 200 });
    expect(init?.method).toBe("GET"); expect(String(url)).toBe(`https://graph.microsoft.com${core.oneShotView()}`);
    return new Response(JSON.stringify({ value: [{ id: "private-id", subject: "Private", showAs: "free", body: {content:""}, type:"singleInstance", isCancelled:false, isAllDay:false, start: { dateTime: core.ONE_SHOT.start, timeZone: "UTC" }, end: { dateTime: core.ONE_SHOT.end, timeZone: "UTC" } }] }), { status: 200 });
  });
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  try {
    const response = await serve(request({ action: "diagnose" })); expect(response.status).toBe(200);
    const data = await response.json(); expect(data.read_only).toBe(true); expect(data.diagnosis.conflicts[0].classification).toBe("free_overlap");
    expect(mutations).not.toHaveBeenCalled(); expect(rpc.mock.calls.every(c => ["has_company_access", "assignment_schedule_signature"].includes(String(c[0])))).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2); expect(JSON.stringify(data)).not.toContain("private-id"); expect(JSON.stringify(data)).not.toContain("Private");
  } finally { fetch.mockRestore(); vi.useRealTimers(); }
});it("unknown permit fails closed before reads or network", async () => {
  const { serve, from } = await load(); const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("network prohibited"));
  try { const r = await serve(request({ action: "status", permit: "emil_60570" })); expect(r.status).toBe(400); expect(from).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); } finally { fetch.mockRestore(); }
});
it("update/delete are never available for the 60576 permit", async () => {
  const { serve, from } = await load(); const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("network prohibited"));
  try { const r = await serve(request({ action: "mutation_preview", kind: "delete", permit: "mats_60576" })); expect(r.status).toBe(409); expect(from).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); } finally { fetch.mockRestore(); }
});
it("60576 wrong phrase (60570 phrase) is rejected before any read", async () => {
  const { serve, from } = await load();
  const r = await serve(request({ action: "create", permit: "mats_60576", run_id: "00000000-0000-4000-8000-000000000001", payload_hash: "a".repeat(64), confirm: core.ONE_SHOT.phrase, pending_busy_confirmed: true, resource_plan_confirmed: true, calendar_signature: "b".repeat(64) }));
  expect(r.status).toBe(409); expect(from).not.toHaveBeenCalled();
});

it.each([core.ONE_SHOT, core.ONE_SHOT_60576])("exact permit $id preflight persists only a preview, never a Graph POST", async x => {
  vi.useFakeTimers({toFake:["Date"]}); vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  const {serve,inserts,rpc} = await load({diagnose:true,permit:x,prepare:true});
  const fetch = vi.spyOn(globalThis,"fetch").mockImplementation(async (url,init) => {
    if(String(url).startsWith("https://login.microsoftonline.com/")) return new Response(JSON.stringify({access_token:`header.${btoa(JSON.stringify({tid:"isolated-config"}))}.signature`}));
    expect(init?.method).toBe("GET"); expect(String(url)).toBe(`https://graph.microsoft.com${core.oneShotView(x)}`);
    return new Response(JSON.stringify({value:[]}));
  });
  try { const response=await serve(request({action:"preflight",permit:x.id})); expect(response.status).toBe(200); expect((await response.json()).preview.work_date).toBe(x.work_date);
    expect(inserts).toHaveBeenCalledWith("job_calendar_one_shot_runs",expect.objectContaining({event_id:x.event_id,work_date:x.work_date,idempotency_key:x.key}));
    expect(rpc.mock.calls.some(c=>String(c[0]).includes("claim"))).toBe(false); expect(fetch).toHaveBeenCalledTimes(2);
  } finally {fetch.mockRestore();vi.useRealTimers();}
});
it.each(["23514","23503","PGRST116","42703"])("preflight database %s is not uncertain POST",async code=>{
  const {serve}=await load({diagnose:true,dbError:{table:"technicians",code}});
  const fetch=vi.spyOn(globalThis,"fetch").mockRejectedValue(Error("network prohibited"));
  try { const response=await serve(request({action:"preflight",permit:"mats_60576"})); const data=await response.json();
    expect(data).toMatchObject({stage:"tech_read",graph_post_attempted:false,status_check_required:false});
    expect(data.reason_code).not.toBe("stopped_requires_status_check"); expect(JSON.stringify(data)).not.toContain("private payload");expect(fetch).not.toHaveBeenCalled();
  } finally {fetch.mockRestore();}
});
it.each([401,403,429,500,"timeout","invalid","pagination"])("Graph GET %s stops read-only preflight without a claim",async outcome=>{
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  const {serve,mutations}=await load({diagnose:true,permit:core.ONE_SHOT_60576});
  const fetch=vi.spyOn(globalThis,"fetch").mockImplementation(async(url,init)=>{
    if(String(url).startsWith("https://login.microsoftonline.com/")) return new Response(JSON.stringify({access_token:`header.${btoa(JSON.stringify({tid:"isolated-config"}))}.signature`}));
    expect(init?.method).toBe("GET"); if(outcome==="timeout") throw Error("private network exception");
    return new Response(outcome==="invalid"?"not json":JSON.stringify(outcome==="pagination"?{value:[],"@odata.nextLink":"private"}:{value:[]}),{status:typeof outcome==="number"?outcome:200});
  });
  try {const data=await(await serve(request({action:"preflight",permit:"mats_60576"}))).json();expect(data).toMatchObject({reason_code:"graph_calendar_read_failed",stage:"graph_calendar_read",graph_post_attempted:false,status_check_required:false});expect(mutations).not.toHaveBeenCalled();}
  finally{fetch.mockRestore();vi.useRealTimers();}
});

it("60570 mutation preview reads only its exact permit tuple even after other successful pilots",()=>{
  const source=readFileSync("supabase/functions/job-calendar-one-shot/index.ts","utf8");
  const query=source.slice(source.indexOf('const stored = check('),source.indexOf('if (stored.length'));
  for(const [column,value] of [["event_id","event_id"],["technician_id","technician_id"],["company_id","company_id"],["mailbox","mailbox"],["work_date","work_date"],["idempotency_key","key"]]) expect(query).toContain(`.eq("${column}", x.${value})`);
});
