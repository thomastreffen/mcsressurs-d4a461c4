import { describe, it, expect, vi } from "vitest";
import { ONE_SHOT } from "../../supabase/functions/_shared/job-calendar-one-shot";
import { MUTATIONS_APPROVED, assertMutationRequest, exactEventPath, exactGetPath, storedScopeOk, verifyCopy, mutationGate, patchDiff, classifyMutationStatus, executeMutation, reconcileMutation, type StoredCopy } from "../../supabase/functions/_shared/job-calendar-one-shot-mutation";

const x = ONE_SHOT;
const stored: StoredCopy = { graph_event_id: "AAMk-mats", graph_change_key: "ck1", mailbox: x.mailbox, event_id: x.event_id, technician_id: x.technician_id, work_date: x.work_date, company_id: x.company_id, state: "succeeded" };
const body = `<a href="https://mcsressurs.lovable.app/jobs/1">Jobb</a><!-- MCS_EVENT_ID:${x.event_id} MCS_TECHNICIAN_ID:${x.technician_id} MCS_WORK_DATE:${x.work_date} -->`;
const graphEvent = (over: Record<string, unknown> = {}) => ({ id: "AAMk-mats", changeKey: "ck1", transactionId: x.key, type: "singleInstance", showAs: "busy", isCancelled: false, attendees: [], subject: "60570 Majorstua", body: { content: body }, start: { dateTime: x.start, timeZone: "UTC" }, end: { dateTime: x.end, timeZone: "UTC" }, ...over });
const payload = { subject: "60570 Majorstua", showAs: "busy", start: { dateTime: x.start, timeZone: "UTC" }, end: { dateTime: x.end, timeZone: "UTC" } };
const planned = { dayStillPlanned: true, specialDeletePermit: false, desired: { ...payload, end: { dateTime: "2026-11-19T14:00:00.000Z", timeZone: "UTC" } }, current: payload };

describe("one-shot update/delete primitives (locked)", () => {
  it("writes are not approved in this build", () => expect(MUTATIONS_APPROVED).toBe(false));
  it("transport allows only GET of the exact stored id; PATCH/DELETE refused while locked", () => {
    expect(() => assertMutationRequest("GET", exactGetPath("AAMk-mats"), "AAMk-mats")).not.toThrow();
    expect(() => assertMutationRequest("PATCH", exactEventPath("AAMk-mats"), "AAMk-mats")).toThrow("mutation_not_approved");
    expect(() => assertMutationRequest("DELETE", exactEventPath("AAMk-mats"), "AAMk-mats")).toThrow("mutation_not_approved");
    expect(() => assertMutationRequest("GET", exactGetPath("other-1300"), "AAMk-mats")).toThrow("mutation_transport_denied");
    expect(() => assertMutationRequest("DELETE", "/v1.0/users/emil.strid@mcselektrotavler.no/events/AAMk-mats", "AAMk-mats")).toThrow("mutation_transport_denied");
  });
  it("stored scope must be the exact Mats/60570/19 Nov copy with changeKey", () => {
    expect(storedScopeOk(stored)).toBeNull();
    expect(storedScopeOk({ ...stored, work_date: "2026-11-20" })).toBe("exact_scope_mismatch");
    expect(storedScopeOk({ ...stored, mailbox: "emil.strid@mcselektrotavler.no" })).toBe("exact_scope_mismatch");
    expect(storedScopeOk({ ...stored, state: "uncertain" })).toBe("no_verified_copy");
    expect(storedScopeOk({ ...stored, graph_change_key: null })).toBe("change_key_missing");
  });
  it("verifies id, markers, time, busy, no attendees, job link", () => {
    const v = verifyCopy({ status: 200, data: graphEvent() }, stored);
    expect(v.verification).toBe("verified");
    expect(v.facts).toMatchObject({ start_ok: true, end_ok: true, show_as: "busy", attendees: 0, job_link: true });
  });
  it("Outlook edits, missing markers, 404 and errors never verify", () => {
    expect(verifyCopy({ status: 200, data: graphEvent({ changeKey: "ck2" }) }, stored).verification).toBe("changed_in_outlook");
    expect(verifyCopy({ status: 200, data: graphEvent({ body: { content: "privat" } }) }, stored).verification).toBe("identity_mismatch");
    expect(verifyCopy({ status: 200, data: graphEvent({ type: "occurrence" }) }, stored).verification).toBe("identity_mismatch");
    expect(verifyCopy({ status: 404, data: null }, stored).verification).toBe("missing");
    for (const s of [401, 403, 429, 500, 503]) expect(verifyCopy({ status: s, data: null }, stored).verification).toBe("unknown");
  });
  it("delete is blocked while the day is still planned", () => {
    const v = verifyCopy({ status: 200, data: graphEvent() }, stored);
    expect(mutationGate("delete", v, planned)).toBe("delete_requires_unplan");
    expect(mutationGate("delete", v, { ...planned, dayStillPlanned: false })).toBeNull();
  });
  it("update needs a planned day, an actual change and no attendees", () => {
    const v = verifyCopy({ status: 200, data: graphEvent() }, stored);
    expect(mutationGate("update", v, planned)).toBeNull();
    expect(mutationGate("update", v, { ...planned, desired: payload })).toBe("no_change_needed");
    expect(mutationGate("update", v, { ...planned, dayStillPlanned: false })).toBe("update_requires_planned_day");
    expect(mutationGate("update", verifyCopy({ status: 200, data: graphEvent({ attendees: [{}] }) }, stored), planned)).toBe("attendees_present");
  });
  it("patch never carries attendees or other fields", () => {
    expect(patchDiff({ ...planned.desired, attendees: [{ a: 1 }], isOnlineMeeting: true }, payload)).toEqual({ end: planned.desired.end });
  });
  it("status classification fails closed", () => {
    expect(classifyMutationStatus("update", 200)).toBe("succeeded");
    expect(classifyMutationStatus("delete", 204)).toBe("succeeded");
    expect(classifyMutationStatus("delete", 404)).toBe("uncertain");
    expect(classifyMutationStatus("update", 412)).toBe("changed_in_outlook");
    expect(classifyMutationStatus("delete", 409)).toBe("changed_in_outlook");
    expect(classifyMutationStatus("update", 401)).toBe("rejected");
    expect(classifyMutationStatus("delete", 403)).toBe("rejected");
    expect(classifyMutationStatus("update", 429)).toBe("throttled_uncertain");
    expect(classifyMutationStatus("delete", 503)).toBe("uncertain");
  });
  it("execute stops before claim and before any write while locked", async () => {
    const graph = vi.fn(async (m: string, _p?: string) => m === "GET" ? { status: 200, data: graphEvent() } : { status: 204, data: null });
    const claim = vi.fn(async () => true), receipt = vi.fn(async () => {});
    expect((await executeMutation("delete", graph as any, stored, { ...planned, dayStillPlanned: false }, claim, receipt)).state).toBe("not_approved");
    expect((await executeMutation("update", graph as any, stored, planned, claim, receipt)).state).toBe("not_approved");
    expect(graph.mock.calls.every(c => c[0] === "GET" && c[1] === exactGetPath("AAMk-mats"))).toBe(true);
    expect(claim).not.toHaveBeenCalled(); expect(receipt).not.toHaveBeenCalled();
  });
  it("execute refuses delete of a still-planned day without any write", async () => {
    const graph = vi.fn(async () => ({ status: 200, data: graphEvent() }));
    expect((await executeMutation("delete", graph as any, stored, planned, async () => true, async () => {})).state).toBe("delete_requires_unplan");
  });
  it("reconcile is GET-only and never retries", async () => {
    const g404 = vi.fn(async () => ({ status: 404, data: null }));
    expect(await reconcileMutation("delete", g404 as any, stored, payload)).toBe("confirmed_absent");
    expect(await reconcileMutation("delete", (async () => ({ status: 200, data: graphEvent() })) as any, stored, payload)).toBe("still_present_no_retry");
    expect(await reconcileMutation("delete", (async () => ({ status: 500, data: null })) as any, stored, payload)).toBe("unresolved_no_retry");
    expect(await reconcileMutation("update", (async () => ({ status: 200, data: graphEvent() })) as any, stored, payload)).toBe("confirmed_updated");
    expect(await reconcileMutation("update", (async () => ({ status: 200, data: graphEvent() })) as any, stored, planned.desired)).toBe("not_updated_no_retry");
    expect(g404.mock.calls.every(c => (c as any)[0] === "GET")).toBe(true);
  });
});
