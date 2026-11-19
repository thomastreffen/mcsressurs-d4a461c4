import { describe, it, expect } from "vitest";
import { invokeCentralSync, safeCentralError } from "../../supabase/functions/_shared/central-sync-invoke";
const env = { url: "https://x.test", serviceKey: "svc" };
describe("invokeCentralSync", () => {
  it("sends the service key explicitly as bearer and apikey", async () => {
    let h: any = null;
    const r = await invokeCentralSync({ action: "sync_event", event_id: "e", technician_id: "t" }, env, (async (_u: any, init: any) => { h = init.headers; return new Response(JSON.stringify({ status: "pending", results: [{ status: "created" }] }), { status: 200 }); }) as any);
    expect(h.Authorization).toBe("Bearer svc"); expect(h.apikey).toBe("svc"); expect(r.ok).toBe(true);
  });
  it("turns a 401 into a safe exact stage instead of invoke_failed", async () => {
    const r = await invokeCentralSync({ action: "sync_event", event_id: "e" }, env, (async () => new Response(JSON.stringify({ error: "system_caller_rejected" }), { status: 401 })) as any);
    expect(r.stage).toBe("http_401_system_caller_rejected");
  });
  it("reports network errors and missing config without calling", async () => {
    expect((await invokeCentralSync({ action: "sync_event", event_id: "e" }, env, (async () => { throw new Error("x"); }) as any)).stage).toBe("invoke_network_error");
    expect((await invokeCentralSync({ action: "sync_event", event_id: "e" }, { url: "", serviceKey: "" })).stage).toBe("invoke_config_missing");
    expect(safeCentralError(500, null)).toBe("http_500_non_2xx");
  });
  it("no caller uses the generic functions.invoke path anymore", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["job-outlook-app-pilot", "calendar-write-sync", "remove-work-visit-from-plan"]) expect(readFileSync(`supabase/functions/${f}/index.ts`, "utf8")).not.toContain('functions.invoke("job-outlook-app-sync"');
  });
});
