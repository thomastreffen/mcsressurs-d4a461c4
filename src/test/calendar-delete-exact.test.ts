// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

function load(file: string, name: string, graph: typeof fetch) {
  const source = readFileSync(file, "utf8").replace(/^import .*;\s*$/gm, "");
  const context: any = { Deno: { serve() {} }, fetch: graph, Date, Map, Set, encodeURIComponent };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context[name];
}
function db(ids: string[]) {
  return { from(table: string) { const c: any = { select: () => c, eq: () => c, limit: () => c,
    then: (resolve: any) => Promise.resolve({ data: table === "job_calendar_links" ? ids.map(id => ({calendar_event_id:id})) : [] }).then(resolve) }; return c; } };
}
it("legacy direct delete deletes all exact copies, treating 404 as removed", async () => {
  const graph = vi.fn(async (_url: string | URL | Request) => new Response(null,{status:404}));
  const remove = load("supabase/functions/calendar-write-sync/index.ts","deleteGraphEventWithFallbacks",graph);
  const result = await remove(db(["day/1","day/2"]),{id:"job",microsoft_event_id:"untrusted"},{id:"tech",user_id:"uid",email:"isolated@example.test"},{},"mock");
  expect(result.deleted).toBe(true); expect(graph).toHaveBeenCalledTimes(2);
  expect(graph.mock.calls.map(c => String(c[0]))).toEqual([
    "https://graph.microsoft.com/v1.0/users/isolated%40example.test/events/day%2F1",
    "https://graph.microsoft.com/v1.0/users/isolated%40example.test/events/day%2F2",
  ]);
});
it("no exact IDs never triggers fuzzy calendar search or deletion", async () => {
  const graph = vi.fn(); const remove = load("supabase/functions/calendar-write-sync/index.ts","deleteGraphEventWithFallbacks",graph);
  expect((await remove(db([]),{id:"job"},{id:"tech",user_id:"uid",email:"isolated@example.test"},{},"mock")).deleted).toBe(false);
  expect(graph).not.toHaveBeenCalled();
});
it("one Graph rejection prevents all-copies success", async () => {
  const graph = vi.fn(async (_url: string | URL | Request) => new Response(null,{status:403}));
  const remove = load("supabase/functions/calendar-write-sync/index.ts","deleteGraphEventWithFallbacks",graph);
  expect((await remove(db(["known"]),{id:"job"},{id:"tech",user_id:"uid",email:"isolated@example.test"},{},"mock")).deleted).toBe(false);
});
it("imported exact delete uses escaped ID and accepts already-missing object", async () => {
  const graph = vi.fn(async (_url: string | URL | Request) => new Response(null,{status:404}));
  const remove = load("supabase/functions/delete-schedule-block/index.ts","deleteOutlookEvent",graph);
  expect(await remove("mock","isolated@example.test","id/part")).toEqual({ok:true,status:404});
  expect(String(graph.mock.calls[0]?.[0])).toContain("id%2Fpart");
});
it.each([403, 500])("absence deletion %s retains the stored Outlook mapping", async status => {
  const source = readFileSync("supabase/functions/absence-calendar-sync/index.ts", "utf8");
  const start = source.indexOf('      if (msRes.ok || msRes.status === 404)');
  const end = source.indexOf('\n    return new Response(JSON.stringify({ status: "unknown_action"', start);
  const block = source.slice(start,end).replace(/\n    }\s*$/, "");
  const updates: unknown[] = [];
  const sb = { from: () => ({ update: (v: unknown) => { updates.push(v); return { eq: async () => ({}) }; } }) };
  const response = await vm.runInNewContext(`(async () => { ${block} })()`, {
    msRes: new Response("denied",{status}), sb, absence_id:"isolated", corsHeaders:{}, Response, console:{error(){}},
  });
  expect((await response.json()).status).toBe("error");
  expect(updates).toHaveLength(0);
});