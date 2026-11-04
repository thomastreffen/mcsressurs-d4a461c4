// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";
it("file preview uses caller storage rights and never creates a service-role client", async () => {
  const keys: string[] = [];
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const source = readFileSync("supabase/functions/file-preview/index.ts", "utf8").replace(/^import .*;\s*$/gm, "");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    Deno: { serve: (fn: typeof handler) => handler = fn, env: { get: (key: string) => { keys.push(key); return "mock"; } } },
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "isolated" } }, error: null }) }, storage: { from: () => ({ download: async () => ({ data: null, error: { message: "RLS denied" } }) }) } }), URL, Response,
  });
  if (!handler) throw new Error("Handler missing");
  const r = await handler(new Request("https://example.test?bucket=private&path=secret.pdf", { headers: { Authorization: "Bearer mock" } }));
  expect(r.status).toBe(404); expect(keys).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
});