// @vitest-environment node
import { readFileSync } from "node:fs";
import { it, expect, vi } from "vitest";
import { z } from "zod";
import * as core from "../../supabase/functions/_shared/job-calendar-one-shot";
async function load(options: { admin?: boolean; company?: boolean; user?: boolean } = {}) {
  let serve: ((req: Request) => Promise<Response>) | undefined;
  const from = vi.fn(() => { const q: any = { select: () => q, order: () => q, limit: async () => ({ data: [], error: null }) }; return q; });
  const rpc = vi.fn(async () => ({ data: options.company !== false, error: null }));
  const client = { from, rpc, auth: { getClaims: async () => ({ data: { claims: { sub: options.user === false ? null : "authenticated-operator" } }, error: null }) } };
  const Deno = { env: { get: () => "isolated-config" }, serve: (s: typeof serve) => { serve = s; } };
  const ts = await import("typescript");
  const source = readFileSync("supabase/functions/job-calendar-one-shot/index.ts", "utf8").replace(/^import .*;\n/gm, "");
  const js = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  const bindings = { Deno, createClient: () => client, corsHeaders: {}, z, requireGlobalAccessManager: async () => options.admin !== false, tokenRoles: () => { throw Error("not reached"); }, diagnosticGate: () => null, ...core };
  new Function(...Object.keys(bindings), js)(...Object.values(bindings));
  if (!serve) throw Error("handler not captured");
  return { serve, from, rpc };
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