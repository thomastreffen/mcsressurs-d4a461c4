import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSearchUrl, searchAllPages } from "./graph-search.ts";

Deno.test("search URL never combines $search with $orderby", () => {
  const u = buildSearchUrl("https://g", "subject:JOB- AND received>=2026-11-08");
  assert(u.includes("$search="));
  assert(!/\$orderby/i.test(u));
});

Deno.test("pages, dedupes, filters window, sorts desc, reports errors", async () => {
  const pages: Record<string, unknown> = {
    a: { value: [{ id: "1", receivedDateTime: "2026-11-09T01:00:00Z" }, { id: "old", receivedDateTime: "2026-11-01T00:00:00Z" }], "@odata.nextLink": "b" },
    b: { value: [{ id: "1", receivedDateTime: "2026-11-09T01:00:00Z" }, { id: "2", receivedDateTime: "2026-11-09T05:00:00Z" }] },
  };
  const f = ((u: string) => Promise.resolve(new Response(JSON.stringify(pages[u])))) as unknown as typeof fetch;
  const r = await searchAllPages("a", "t", "2026-11-08T00:00:00Z", 5, f);
  assertEquals(r.ok, true);
  assertEquals(r.messages.map((m) => m.id), ["2", "1"]);

  const bad = (() => Promise.resolve(new Response(JSON.stringify({ error: { code: "SearchWithOrderBy" } }), { status: 400 }))) as unknown as typeof fetch;
  const e = await searchAllPages("a", "t", "x", 5, bad);
  assertEquals([e.ok, e.status, e.code], [false, 400, "SearchWithOrderBy"]);
});
