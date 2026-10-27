// Execute the actual edge handler with isolated Cloud/Graph substitutes. No network or production writes.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { explicitPackageSend, responseFindingReady } from "../../supabase/functions/_shared/inspection-send-policy";

async function fixture(options: { approved?: boolean; graphOk?: boolean; status?: string } = {}) {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const writes: { table: string; patch: any; phase: string }[] = [];
  let phase = "before-graph";
  const finding = { id: "f2", status: "documentation_ready", documentation_status: "complete", internal_assessment: "Done", responsible_person_id: "thomas", response_text: "Routine", response_approved_at: options.approved === false ? null : "2026-10-27", condition_corrected_at: "2026-10-27", documentation_complete_at: "2026-10-27" };
  const pkg = { id: "11111111-1111-4111-8111-111111111111", status: options.status ?? "draft", company_id: "service", inspection_id: "case", package_number: 1, recipient_email: "dle@example.test", cc_emails: [], subject: "63210", email_body_snapshot: "<p>Routine</p>" };
  const client = {
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
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("login.microsoftonline")) return new Response(JSON.stringify({ access_token: "mock-graph-token" }), { status: 200 });
    if (url.includes("/sendMail")) { phase = "after-graph"; return new Response(options.graphOk === false ? "Rejected" : null, { status: options.graphOk === false ? 502 : 202 }); }
    throw new Error("Unexpected network attempt");
  });
  const source = readFileSync(`${process.cwd()}/supabase/functions/inspection-response-send/index.ts`, "utf8").replace(/^import .*;\s*$/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(js, { Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: () => "mock-config" } }, createClient: () => client, encodeBase64: () => "", corsHeaders: {}, z, explicitPackageSend, responseFindingReady, Response, Request, URLSearchParams, TextEncoder, Uint8Array, Date, console: { log() {}, error() {} }, fetch });
  if (!handler) throw new Error("Handler not registered");
  return { writes, fetch, call: (confirm: boolean | undefined) => handler?.(new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer mock-user" }, body: JSON.stringify({ package_id: pkg.id, confirm_send: confirm }) })) };
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
});