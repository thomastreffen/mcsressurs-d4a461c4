// Execute the actual edge handler with isolated Cloud/Graph substitutes. No network or production writes.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buildTestMessage, explicitPackageSend, resolveTestRecipient, responseFindingReady } from "../../supabase/functions/_shared/inspection-send-policy";

async function fixture(options: { approved?: boolean; graphOk?: boolean; status?: string } = {}) {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const writes: { table: string; patch: any; phase: string }[] = [];
  let phase = "before-graph";
  const finding = { id: "f2", status: "documentation_ready", documentation_status: "complete", internal_assessment: "Done", responsible_person_id: "thomas", response_text: "Routine", response_approved_at: options.approved === false ? null : "2026-10-27", condition_corrected_at: "2026-10-27", documentation_complete_at: "2026-10-27" };
  const pkg = { id: "11111111-1111-4111-8111-111111111111", status: options.status ?? "draft", company_id: "service", inspection_id: "case", package_number: 1, recipient_email: "dle@example.test", cc_emails: [], subject: "63210", email_body_snapshot: "<p>Routine</p>" };
  const storage = { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(4) } }) }) };
  const client = {
    storage,
    auth: { getUser: async () => ({ data: { user: { id: "thomas" } } }) },
    rpc: async () => ({ data: true }),
    from(table: string) {
      let patch: any = null;
      const data = () => {
        if (patch) return [{ id: pkg.id }];
        if (table === "compliance_response_packages") return pkg;
        if (table === "compliance_response_package_findings") return [{ finding_id: "f2", response_text_snapshot: "Routine" }];
        if (table === "compliance_findings") return [finding];
        if (table === "compliance_finding_evidence") return [{ finding_id: "f2" }];
        if (table === "compliance_inspections") return { id: "case", company_id: "service", case_number: "63210" };
        if (table === "user_accounts") return { person_id: "p-thomas" };
        if (table === "people") return { email: "Thomas@mcsservice.no" };
        if (table === "documents") return { file_path: "a/rutine.pdf", storage_bucket: "job-attachments" };
        return [];
      };
      const chain: any = {
        select: () => chain, eq: () => chain, in: () => chain, is: () => chain, neq: () => chain, order: () => chain,
        update: (value: any) => { patch = value; writes.push({ table, patch, phase }); return chain; },
        insert: (value: any) => { patch = value; writes.push({ table, patch, phase }); return chain; },
        maybeSingle: async () => ({ data: patch ? { id: pkg.id } : data(), error: null }),
        then: (resolve: any) => Promise.resolve({ data: data(), error: null }).then(resolve),
      };
      return chain;
    },
  };
  const sentBodies: any[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("login.microsoftonline")) return new Response(JSON.stringify({ access_token: "mock-graph-token" }), { status: 200 });
    if (url.includes("/sendMail")) { sentBodies.push(JSON.parse(String((init as any)?.body ?? "{}"))); phase = "after-graph"; return new Response(options.graphOk === false ? "Rejected" : null, { status: options.graphOk === false ? 502 : 202 }); }
    throw new Error("Unexpected network attempt");
  });
  const source = readFileSync(`${process.cwd()}/supabase/functions/inspection-response-send/index.ts`, "utf8").replace(/^import .*;\s*$/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(js, { Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: () => "mock-config" } }, createClient: () => client, encodeBase64: () => "", corsHeaders: {}, z, buildTestMessage, resolveTestRecipient, explicitPackageSend, responseFindingReady, atob, Response, Request, URLSearchParams, TextEncoder, Uint8Array, Date, console: { log() {}, error() {} }, fetch });
  if (!handler) throw new Error("Handler not registered");
  const raw = (b: unknown) => handler?.(new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer mock-user" }, body: JSON.stringify(b) }));
  return { writes, fetch, sentBodies, raw, call: (confirm: boolean | undefined) => handler?.(new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer mock-user" }, body: JSON.stringify({ package_id: pkg.id, confirm_send: confirm }) })) };
}
describe("Actual inspection sender with mocked services", () => {
  it("refuses a direct call without explicit preview confirmation before any email or status write", async () => {
    const f = await fixture(); const response = await f.call(undefined);
    expect(response?.status).toBe(409); expect(f.fetch).not.toHaveBeenCalled(); expect(f.writes).toEqual([]);
  });
  it("refuses an unapproved finding even with explicit confirmation", async () => {
    const f = await fixture({ approved: false }); expect((await f.call(true))?.status).toBe(409); expect(f.fetch).not.toHaveBeenCalled(); expect(f.writes).toEqual([]);
  });
  it("refuses re-sending an already sent package", async () => {
    const f = await fixture({ status: "sent" }); expect((await f.call(true))?.status).toBe(409); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("only marks findings submitted and logs outgoing correspondence after Graph acceptance", async () => {
    const f = await fixture(); expect((await f.call(true))?.status).toBe(200);
    const submitted = f.writes.filter(w => w.patch.status === "submitted");
    expect(submitted.map(w => w.table)).toEqual(["compliance_findings", "compliance_inspections"]);
    expect(submitted.every(w => w.phase === "after-graph")).toBe(true);
    expect(f.writes.find(w => w.table === "compliance_correspondence")?.phase).toBe("after-graph");
    expect(f.writes.some(w => w.patch.status === "approved")).toBe(false);
  });
  it("keeps findings untouched and records failure when Microsoft rejects", async () => {
    const f = await fixture({ graphOk: false }); expect((await f.call(true))?.status).toBe(502);
    expect(f.writes.some(w => w.patch.status === "submitted" || w.patch.status === "sent")).toBe(false);
    expect(f.writes.some(w => w.patch.status === "draft" && w.patch.send_error === "Rejected")).toBe(true);
  });

  const testBody = { mode: "test", inspection_id: "22222222-2222-4222-8222-222222222222", subject: "Svar på tilsyn – sak 63210", html: "<p>Routine</p>", attachments: [{ document_id: "33333333-3333-4333-8333-333333333333", storage_bucket: "job-attachments", file_path: "a/rutine.pdf", export_name: "02-01_Rutine.pdf" }, { export_name: "00_Oversikt.csv" }], generated: [{ export_name: "00_Oversikt.csv", content: "a;b" }] };
  it("test send goes only to the caller's work e-mail, marked TEST, with the same HTML and attachments", async () => {
    const f = await fixture(); const r = await f.raw(testBody); expect(r?.status).toBe(200);
    const m = f.sentBodies[0].message;
    expect(m.toRecipients).toEqual([{ emailAddress: { address: "thomas@mcsservice.no" } }]);
    expect(m.ccRecipients).toBeUndefined();
    expect(m.subject.startsWith("TEST – DLE svarpakke – sak 63210")).toBe(true);
    expect(m.body.content).toContain("<p>Routine</p>");
    expect(m.attachments.map((a: any) => a.name)).toEqual(["02-01_Rutine.pdf", "00_Oversikt.csv"]);
  });
  it("test send never changes package, finding or case status and never logs correspondence", async () => {
    const f = await fixture(); await f.raw(testBody);
    expect(f.writes.map(w => w.table)).toEqual(["compliance_inspection_events"]);
    expect(f.writes[0].patch.event_type).toBe("response_test_sent");
    expect(f.writes.some(w => ["submitted", "sent", "sending"].includes(w.patch.status))).toBe(false);
  });
  it("test mode cannot be used to send a stored package to DLE", async () => {
    const f = await fixture(); const r = await f.raw({ ...testBody, package_id: "11111111-1111-4111-8111-111111111111", confirm_send: true });
    expect(r?.status).toBe(200); expect(f.sentBodies[0].message.toRecipients[0].emailAddress.address).toBe("thomas@mcsservice.no");
    expect(f.writes.some(w => w.table === "compliance_response_packages")).toBe(false);
  });
  it("final send still requires explicit confirmation", async () => {
    const f = await fixture(); expect((await f.raw({ package_id: "11111111-1111-4111-8111-111111111111" }))?.status).toBe(409); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("falls back to login e-mail only when no work e-mail exists", () => {
    expect(resolveTestRecipient(null, "A@B.no")).toBe("a@b.no"); expect(resolveTestRecipient("x", null)).toBeNull();
  });
});
