// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Actual handler executed with no real network/database access. */
function fixture() {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const network: string[] = [], writes: string[] = [];
  const db = { from(table: string) {
    const filters: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
      insert: () => { writes.push(table); return Promise.resolve({ error: null }); },
      maybeSingle: async () => ({ data: filters.subscription_id === "valid-sub" && filters.client_state === "valid-state" ? { id: "row", company_id: "service" } : null, error: null }),
    };
    return chain;
  } };
  const source = readFileSync(process.env.WEBHOOK_SOURCE_FILE || "supabase/functions/graph-webhook-inbound/index.ts", "utf8").replace(/^import .*;\s*$/gm, "").replace(/^export \{ processMessage \};\s*$/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(js, {
    Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: () => "isolated" } },
    createClient: () => db, fetch: async (url: string) => {
      network.push(url);
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "isolated-graph" }));
      // Confirm authorized message fetch path without ingesting a real message.
      return new Response("not found", { status: 404 });
    }, Request, Response, URL, URLSearchParams, Date, console: { log() {}, warn() {}, error() {} },
  });
  return { network, writes, call: async (value: unknown[], suffix = "") => {
    if (!handler) throw new Error("Handler not registered");
    const response = await handler(new Request(`https://example.test/${suffix}`, { method: "POST", body: JSON.stringify({ value }) }));
    return { status: response.status, text: await response.text() };
  } };
}

describe("Graph webhook actual security flow", () => {
  it("preserves Graph validationToken handshake without authentication or side effects", async () => {
    const f = fixture();
    expect(await f.call([], "?validationToken=protocol%20validation")).toEqual({ status: 200, text: "protocol validation" });
    expect(f.network).toHaveLength(0); expect(f.writes).toHaveLength(0);
  });
  it("rejects missing clientState before obtaining Graph token (regression)", async () => {
    const f = fixture();
    await f.call([{ subscriptionId: "valid-sub", resource: "users/mailbox/messages/one" }]);
    expect(f.network).toHaveLength(0); expect(f.writes).toHaveLength(0);
  });
  it("rejects wrong state/unknown subscription/unsafe resource without writes", async () => {
    const f = fixture();
    await f.call([
      { subscriptionId: "valid-sub", clientState: "wrong", resource: "users/mailbox/messages/one" },
      { subscriptionId: "unknown", clientState: "valid-state", resource: "users/mailbox/messages/one" },
      { subscriptionId: "valid-sub", clientState: "valid-state", resource: "users/mailbox/messages/one?injected=1" },
    ]);
    expect(f.network).toHaveLength(0); expect(f.writes).toHaveLength(0);
  });
  it("matching stored subscription reaches legitimate Graph fetch; never infers company from clientState", async () => {
    const f = fixture();
    await f.call([{ subscriptionId: "valid-sub", clientState: "valid-state", resource: "users/mailbox/messages/one" }]);
    expect(f.network).toHaveLength(2);
    expect(f.network[1]).toContain("graph.microsoft.com/v1.0/users/mailbox/messages/one?");
    expect(f.writes).toEqual(["conversation_email_dead_letters"]);
  });
});