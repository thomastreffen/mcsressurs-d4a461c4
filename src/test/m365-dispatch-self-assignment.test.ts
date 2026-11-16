// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";

async function dispatch(emailSent: boolean) {
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const updates: any[] = [];
  const job = { id: "queue", technician_id: "tech", operation: "create", revision: 1, attempt_count: 0, status: "pending" };
  const db = {
    rpc: async () => ({ data: true }),
    functions: { invoke: async (name: string) => ({ data: { results: [name === "create-approval"
      ? { techId: "tech", autoApproved: true, emailSent }
      : { techId: "tech", status: "created", state: "accepted_by_graph" }] } }) },
    from(table: string) {
      const data = () => table === "events" ? { company_id: "company" }
        : table === "event_technicians" ? [{ technician_id: "tech" }]
        : table === "technicians" ? [{ email: "isolated@example.test" }] : [job];
      const c: any = { select: () => c, eq: () => c, in: () => c, limit: () => c,
        update: (v: any) => { updates.push(v); return c; },
        single: async () => ({ data: job }), maybeSingle: async () => ({ data: { id: "queue" } }),
        then: (resolve: any) => Promise.resolve({ data: data() }).then(resolve) };
      return c;
    },
  };
  const source = readFileSync("supabase/functions/m365-dispatch/index.ts", "utf8").replace(/^import .*;\s*$/gm, "");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    Deno: { serve: (h: typeof handler) => { handler = h; }, env: { get: () => "mock" } },
    createClient: () => db, getApprovalCallerId: async () => "caller", systemSenderEnabled: () => true,
    organizerEnabled: () => true, pilotAllows: () => true, corsHeaders: {}, Request, Response,
  });
  await handler(new Request("https://isolated.invalid", { method: "POST", headers: { Authorization: "Bearer mock" },
    body: JSON.stringify({ event_id: "11111111-1111-4111-8111-111111111111" }) }));
  return updates.at(-1)?.status;
}

it("autoapproval with calendar success but no email acceptance is not accepted dispatch", async () => {
  expect(await dispatch(false)).toBe("failed");
});
it("autoapproval with actual email and calendar acceptance is accepted dispatch", async () => {
  expect(await dispatch(true)).toBe("accepted");
});