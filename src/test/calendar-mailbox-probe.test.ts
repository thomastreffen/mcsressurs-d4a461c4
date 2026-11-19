import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { probeCalendarMailbox } from "../../supabase/functions/_shared/calendar-mailbox-probe";
import { activeIdentity } from "../../supabase/functions/_shared/job-outlook-pilot-selector";
const mailbox = "rune.orbeck@mcsservice.no";
const env = (n: string) => ({ HUB_CALENDAR_TENANT_ID: "tenant", HUB_CALENDAR_CLIENT_ID: "calendar", HUB_CALENDAR_CLIENT_SECRET: "mock-only", AZURE_CLIENT_ID: "mail" }[n]);
const token = (facts = {}) => `header.${btoa(JSON.stringify({ tid: "tenant", appid: "calendar", roles: [], ...facts }))}.signature`;
describe("separate mailbox metadata probe", () => {
  beforeAll(() => vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal }));
  afterAll(() => vi.unstubAllGlobals());
  it.each([200,403,404,429,500])("reports HTTP %s without reading contents or any Graph write", async status => {
    const cancel = vi.fn();
    const json = vi.fn(() => { throw Error("private content must not be read"); });
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: token() }))).mockResolvedValueOnce({ status, body: { cancel }, headers: new Headers(), json });
    const r = await probeCalendarMailbox(mailbox, env, fetcher);
    expect("http" in r ? r.http : null).toBe(status); expect(r.pass).toBe(status === 200); expect(r.mailbox).toBe(mailbox);
    expect(fetcher.mock.calls[1][0]).toBe("https://graph.microsoft.com/v1.0/users/rune.orbeck%40mcsservice.no/calendar?$select=id");
    expect(fetcher.mock.calls[1][1].method).toBe("GET"); expect(json).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([{ tid: "wrong" }, { appid: "wrong" }, { roles: ["Mail.Send"] }])("blocks mismatched identity or non-calendar grant before Graph", async facts => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: token(facts) })));
    expect((await probeCalendarMailbox(mailbox, env, fetcher)).pass).toBe(false); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("never falls back to mail app", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: token() })));
    expect((await probeCalendarMailbox(mailbox, n => n === "AZURE_CLIENT_ID" ? "calendar" : env(n), fetcher)).pass).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("Rune may qualify without a job/day; former staff may never qualify", () => {
    const f = { technician_id: "d212d4ba-bde7-4e05-be69-1b983bdb7cb2", archived: false, deleted: false, account_active: true, person_active: true, employed_in_company: true, mailbox };
    expect(activeIdentity(f)).toBe(true);
    for (const technician_id of ["ebc15ac7-fd4c-461d-a61c-06b97d705cc0", "ba707f5e-0a7d-40b8-95f2-896d1c4c01c2"]) expect(activeIdentity({ ...f, technician_id })).toBe(false);
  });
  it("network uncertainty cannot become success or a retry", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("timeout"));
    expect((await probeCalendarMailbox(mailbox, env, fetcher)).pass).toBe(false); expect(fetcher).toHaveBeenCalledOnce();
  });
});