// @vitest-environment node
import { expect, it, vi } from "vitest";
import { processUnplanDeletes, type DeleteJob } from "../../supabase/functions/_shared/unplan-calendar-delete";

const job: DeleteJob = { id: "queue", event_id: "event", technician_id: "tech", technician_name: "Isolated",
  mailbox: "isolated@example.test", candidate_event_ids: [], start_at: "2026-11-17T07:00:00Z", end_at: "2026-11-17T15:00:00Z", attempts: 1 };
function fixture(active: string[] = [], central = false) {
  const links = [{ work_date: "2026-11-17", outlook_event_id: "exact/17" }, { work_date: "2026-11-18", outlook_event_id: "exact/18" }];
  const writes: any[] = [];
  const db: any = { from(table: string) {
    const filters: Record<string, string> = {}; let deletion = false;
    const data = () => table === "job_calendar_day_links" ? links : table === "schedule_blocks" ? active.map(d => ({ start_at: `${d}T07:00:00Z` }))
      : table === "job_outlook_app_links" ? central ? [{ outlook_event_id: "central" }] : [] : null;
    const c: any = { select: () => c, eq: (k: string,v: string) => { filters[k] = v; return c; }, is: () => c, in: () => c, or: () => c,
      update: (v: any) => { writes.push({ table, ...v }); return c; }, delete: () => { deletion = true; return c; },
      maybeSingle: async () => ({ data: table === "technicians" ? { user_id: "own-user", email: job.mailbox } : { id: job.id } }),
      then: (resolve: any) => { if (deletion) { const at = links.findIndex(l => l.outlook_event_id === filters.outlook_event_id); if (at >= 0) links.splice(at,1); }
        return Promise.resolve({ data: data(), error: null }).then(resolve); } };
    return c;
  } };
  return { db, links, writes };
}
it("empty legacy candidates resolve exact removed day; active other day and Hub job remain untouched", async () => {
  const x = fixture(["2026-11-18"]); const token = vi.fn(async () => "mock-token");
  const graph = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }));
  const result = await processUnplanDeletes(x.db,[job],token,graph);
  expect(graph).toHaveBeenCalledTimes(1);
  expect(String(graph.mock.calls[0]?.[0])).toContain("exact%2F17");
  expect(token).toHaveBeenCalledWith("own-user");
  expect(result[0].status).toBe("deleted");
  expect(x.links.map(l => l.work_date)).toEqual(["2026-11-18"]);
  expect(x.writes.some(w => ["events","event_technicians","job_approvals"].includes(w.table))).toBe(false);
});
it("404 is already removed and clears only exact mappings", async () => {
  const x = fixture(); const graph = vi.fn(async () => new Response(null,{status:404}));
  expect((await processUnplanDeletes(x.db,[job],async () => "mock",graph))[0].status).toBe("deleted");
  expect(x.links).toHaveLength(0);
});
it("403 preserves mapping and records sanitized Graph reason with backoff", async () => {
  const x = fixture(); const graph = vi.fn(async () => Response.json({error:{code:"ErrorAccessDenied",message:"private"}},{status:403}));
  const result = await processUnplanDeletes(x.db,[job],async () => "mock",graph);
  expect(result[0].error).toBe("graph_delete_403_ErrorAccessDenied");
  expect(x.links).toHaveLength(2);
  expect(x.writes.at(-1).attempts).toBe(2);
  expect(Date.parse(x.writes.at(-1).next_attempt_at)).toBeGreaterThan(Date.now());
});
it("missing personal token never falls back to central/mail app", async () => {
  const x = fixture(); const graph = vi.fn();
  expect((await processUnplanDeletes(x.db,[job],async () => null,graph))[0].error).toBe("delegated_token_unavailable_reconnect_required");
  expect(graph).not.toHaveBeenCalled();
});
it("central linkage requires gated reconciliation, never delegated deletion", async () => {
  const x = fixture([],true); const graph = vi.fn();
  expect((await processUnplanDeletes(x.db,[job],async () => "mock",graph))[0].error).toBe("central_delete_requires_gated_reconciliation");
  expect(graph).not.toHaveBeenCalled();
});
it("replanned day blocks deletion", async () => {
  const x = fixture(["2026-11-17","2026-11-18"]); const graph = vi.fn();
  expect((await processUnplanDeletes(x.db,[job],async () => "mock",graph))[0].error).toBe("job_replanned_delete_blocked");
  expect(graph).not.toHaveBeenCalled();
});
it("candidate snapshot is persisted before exact Graph deletion", async () => {
  const x = fixture(["2026-11-18"]);
  const graph = vi.fn(async () => {
    expect(x.writes.some(w => w.table === "calendar_delete_retry_queue" && w.candidate_event_ids?.[0] === "exact/17")).toBe(true);
    return new Response(null,{status:204});
  });
  await processUnplanDeletes(x.db,[job],async () => "mock",graph);
  expect(graph).toHaveBeenCalledTimes(1);
});