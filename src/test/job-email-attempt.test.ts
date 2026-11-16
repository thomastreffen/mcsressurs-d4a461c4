// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mail = vi.hoisted(() => vi.fn());
vi.mock("../../supabase/functions/_shared/m365-sender.ts", () => ({ sendMail: mail }));
vi.mock("../../supabase/functions/_shared/recipient-delivery.ts", () => ({ recordDelivery: vi.fn() }));
import { sendJobEmail } from "../../supabase/functions/_shared/job-email-attempt";
import { assertNotificationResult } from "../lib/job-notification-result";
function store() {
  const rows = new Map<string, any>();
  return { rows, rpc: async (_: string, p: any) => {
    const row = rows.get(p._key);
    if (!row || (p._retry && row.outcome === "failed")) { rows.set(p._key, { outcome: "pending" }); return { data: true }; }
    return { data: false };
  }, from: () => { let key = "", update: any; const c: any = { select: () => c, update: (v: any) => { update = v; return c; }, eq: (_: string, v: string) => { key = v; return c; }, maybeSingle: async () => ({ data: rows.get(key) }), then: (resolve: any) => { if (update) Object.assign(rows.get(key), update); return Promise.resolve({ error: null }).then(resolve); } }; return c; } };
}
const message = { to: "technician@example.test", subject: "Assignment", html: '<a href="/job-info/job">Åpne jobbinfo</a>' };
const opts = { personalToken: null, useSystem: true };
beforeEach(() => { mail.mockReset(); mail.mockResolvedValue({ ok: true, status: 202, via: "system" }); });
it("seven assigned recipients each get one claim; parallel duplicate sends never repeat", async () => {
  const db = store();
  await Promise.all(Array.from({ length: 7 }, (_, i) => Promise.all([sendJobEmail(db, "job", String(i), message, opts), sendJobEmail(db, "job", String(i), message, opts)])));
  expect(mail).toHaveBeenCalledTimes(7); expect(db.rows.size).toBe(7);
});
it("202 acceptance never retries even explicitly", async () => {
  const db = store(); await sendJobEmail(db, "job", "a", message, opts);
  expect((await sendJobEmail(db, "job", "a", message, opts, true)).duplicate).toBe(true);
  expect(mail).toHaveBeenCalledTimes(1);
});
it("a definite rejection retries only explicitly, unknown network outcome never does", async () => {
  const db = store(); mail.mockResolvedValueOnce({ ok: false, status: 403, reason: "graph_forbidden" });
  await sendJobEmail(db, "job", "a", message, opts); await sendJobEmail(db, "job", "a", message, opts);
  expect(mail).toHaveBeenCalledTimes(1); await sendJobEmail(db, "job", "a", message, opts, true); expect(mail).toHaveBeenCalledTimes(2);
  mail.mockResolvedValueOnce({ ok: false, status: null, reason: "network_error" });
  await sendJobEmail(db, "job", "b", message, opts); await sendJobEmail(db, "job", "b", message, opts, true);
  expect(mail).toHaveBeenCalledTimes(3);
});
it("claim/audit failure prevents every mail call", async () => {
  await expect(sendJobEmail({ rpc: async () => ({ error: true }) }, "job", "a", message, opts)).rejects.toThrow(); expect(mail).not.toHaveBeenCalled();
});
it("partial success and transport errors never pass as all recipients notified", () => {
  expect(() => assertNotificationResult({ data: { results: [{ emailSent: true }, { emailSent: false }] } })).toThrow();
  expect(() => assertNotificationResult({ error: { message: "401" } })).toThrow("401");
  expect(() => assertNotificationResult({ data: { results: [{ emailSent: true }, { autoApproved: true }] } })).toThrow();
});