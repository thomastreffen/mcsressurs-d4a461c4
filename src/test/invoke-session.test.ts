import { beforeEach, describe, expect, it, vi } from "vitest";
const { getSession, refreshSession, invoke } = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession, refreshSession }, functions: { invoke } } }));
import { invokeWithSession } from "@/lib/invoke-session";
const session = (token = "original", id = "person") => ({ access_token: token, user: { id }, expires_at: Date.now() / 1000 + 3600 });
const authResult = (s: unknown) => ({ data: { session: s }, error: null });
const unauthorized = { data: null, error: { context: { status: 401 } } };
beforeEach(() => {
 getSession.mockReset().mockResolvedValue(authResult(session()));
 refreshSession.mockReset().mockResolvedValue(authResult(session("renewed")));
 invoke.mockReset().mockResolvedValue({ data: { results: [] }, error: null });
});
describe("Authenticated calendar and project requests", () => {
 it("awaits hydration and passes the session bearer explicitly", async () => {
  let ready: (value: any) => void = () => {};
  getSession.mockReturnValueOnce(new Promise(resolve => { ready = resolve; }));
  const request = invokeWithSession("ms-calendar", { body: { action: "availability" } });
  expect(invoke).not.toHaveBeenCalled();
  ready(authResult(session())); await request;
  expect(invoke).toHaveBeenCalledWith("ms-calendar", { body: { action: "availability" }, headers: { Authorization: "Bearer original" } });
 });
 it("does not send an anonymous request when signed out", async () => {
  getSession.mockResolvedValue(authResult(null));
  expect((await invokeWithSession("tripletex-import", { body: { action: "search" } })).error).toBeTruthy();
  expect(invoke).not.toHaveBeenCalled();
 });
 it.each(["search", "preview", "search_hub_customers", "project_open_status"])("retries %s once after a 401 and refresh", async action => {
  invoke.mockResolvedValueOnce(unauthorized);
  await invokeWithSession("tripletex-import", { body: { action, company_id: "same-company" } });
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke.mock.calls[1][1]).toEqual({ body: { action, company_id: "same-company" }, headers: { Authorization: "Bearer renewed" } });
 });
 it("shares a refresh across concurrent reads", async () => {
  invoke.mockResolvedValueOnce(unauthorized).mockResolvedValueOnce(unauthorized);
  let ready: (value: any) => void = () => {};
  refreshSession.mockReturnValueOnce(new Promise(resolve => { ready = resolve; }));
  const requests = [invokeWithSession("ms-calendar", { body: { action: "availability" } }), invokeWithSession("tripletex-import", { body: { action: "search" } })];
  await vi.waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));
  ready(authResult(session("renewed"))); await Promise.all(requests);
  expect(invoke).toHaveBeenCalledTimes(4);
 });
 it("never loops on repeated 401", async () => {
  invoke.mockResolvedValue(unauthorized);
  expect((await invokeWithSession("ms-calendar", { body: { action: "availability" } })).error).toBeTruthy();
  expect(invoke).toHaveBeenCalledTimes(2);
 });
 it.each([403, 500])("does not retry status %s", async status => {
  invoke.mockResolvedValue({ error: { context: { status } }, data: null });
  await invokeWithSession("tripletex-import", { body: { action: "search" } });
  expect(invoke).toHaveBeenCalledTimes(1); expect(refreshSession).not.toHaveBeenCalled();
 });
 it.each([['tripletex-import', 'import'], ['ms-calendar', 'upsert_job_events'], ['create-approval', undefined]])("never replays %s %s", async (name, action) => {
  invoke.mockResolvedValue(unauthorized);
  await invokeWithSession(name, { body: { action } });
  expect(invoke).toHaveBeenCalledTimes(1); expect(refreshSession).not.toHaveBeenCalled();
 });
 it("does not replay a request as a different person", async () => {
  invoke.mockResolvedValueOnce(unauthorized);
  refreshSession.mockResolvedValue(authResult(session("other", "another-person")));
  await invokeWithSession("tripletex-import", { body: { action: "search" } });
  expect(invoke).toHaveBeenCalledTimes(1);
 });
 it("renews near-expiry sessions before the first request", async () => {
  getSession.mockResolvedValue(authResult({ ...session(), expires_at: Date.now()/1000 - 1 }));
  await invokeWithSession("tripletex-import", { body: { action: "import" } });
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls[0][1].headers.Authorization).toBe("Bearer renewed");
 });
 it("pins a renewed bearer before sending an approval mutation", async () => {
  getSession.mockResolvedValue(authResult({ ...session(), expires_at: Date.now()/1000 - 1 }));
  await invokeWithSession("create-approval", { body: { job_id: "job" } });
  expect(invoke).toHaveBeenCalledExactlyOnceWith("create-approval", { body: { job_id: "job" }, headers: { Authorization: "Bearer renewed" } });
 });
 it("does not send approvals when signed out", async () => {
  getSession.mockResolvedValue(authResult(null));
  expect((await invokeWithSession("create-approval", { body: { job_id: "job" } })).error).toBeTruthy();
  expect(invoke).not.toHaveBeenCalled();
 });
});
