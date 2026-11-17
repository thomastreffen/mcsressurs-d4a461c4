// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { ONE_SHOT as x, oneShotGate, oneShotPayload, oneShotConflictGuard, createOneShot, inspectMailbox, inspectOneShotEvents, diagnoseOneShotEvents, assertOneShotRequest, oneShotBase, oneShotView, type OneShotContext } from "../../supabase/functions/_shared/job-calendar-one-shot";
const now = new Date("2026-11-17T10:00:00Z");
const context = (): OneShotContext => ({ job: { id: x.event_id, company_id: x.company_id, title: "60570 Majorstua stasjon", address: null, deleted_at: null, status: "rejected", start_at: x.start, end_at: x.end }, target: { ...x, id: "test", expires_at: "2026-11-18T09:00:00Z", revoked_at: null }, assigned: true, identityActive: true, mailbox: x.mailbox, approval: "pending", blocks: [{ company_id: x.company_id, technician_id: x.technician_id, start_at: x.start, end_at: x.end }, { company_id: x.company_id, technician_id: x.technician_id, start_at: "2026-11-20T07:00:00Z", end_at: "2026-11-20T15:00:00Z" }], probe: { created_at: "2026-11-17T09:09:50Z", result: { pass: true, http: 200, tid_match: true, appid_match: true } }, settings: { enabled: false, dry_run: true, pilot_mailboxes: [], scope_verified_at: null } });
describe("exact one-shot gate", () => {
  it("global OFF, future Mats pending and aggregate rejected allow only this one day", () => { expect(oneShotGate(context(), now)).toBeNull(); });
  it.each(["company_id", "event_id", "technician_id", "work_date", "mailbox"] as const)("rejects a different %s", field => { const c = context(); c.target[field] = field === "work_date" ? "2026-11-20" : "other"; expect(oneShotGate(c, now)).toBe("exact_scope_mismatch"); });
  it.each(["rejected", "reschedule_requested", "unknown"])("own %s never silently overridden", approval => { const c = context(); c.approval = approval; expect(oneShotGate(c, now)).toBe("individual_response_blocks_pilot"); });
  it("expired target", () => { const c = context(); c.target.expires_at = now.toISOString(); expect(oneShotGate(c, now)).toBe("pilot_expired"); });
  it("missing or inactive assignment", () => { const c = context(); c.identityActive = false; expect(oneShotGate(c, now)).toBe("inactive_assignment_or_identity"); c.identityActive = true; c.assigned = false; expect(oneShotGate(c, now)).toBe("inactive_assignment_or_identity"); });
  it("stale and failed read probe", () => { const c = context(); c.probe = null; expect(oneShotGate(c, now)).toBe("fresh_200_required"); c.probe = { created_at: now.toISOString(), result: { pass: false, http: 403 } }; expect(oneShotGate(c, now)).toBe("fresh_200_required"); });
  it("changed schedule and changed global flags", () => { const c = context(); c.blocks[0].end_at = "2026-11-19T14:00:00Z"; expect(oneShotGate(c, now)).toBe("schedule_changed"); const d = context(); d.settings.enabled = true; expect(oneShotGate(d, now)).toBe("global_settings_changed"); });
  it("request transports prohibit other day, mailbox, mail, PATCH and DELETE", () => { expect(() => assertOneShotRequest("POST", oneShotBase())).not.toThrow(); expect(() => assertOneShotRequest("GET", oneShotView())).not.toThrow(); for (const method of ["PATCH", "DELETE", "PUT"]) expect(() => assertOneShotRequest(method, oneShotBase())).toThrow(); expect(() => assertOneShotRequest("POST", oneShotBase().replace(encodeURIComponent(x.mailbox), "other"))).toThrow(); expect(() => assertOneShotRequest("GET", oneShotView().replace("2026-11-19", "2026-11-20"))).toThrow(); });
});
describe("mock Graph one POST maximum", () => {
  it("201 stores exact event ID only after durable claim", async () => {
    const order: string[] = []; const graph = vi.fn(async (method: string) => { order.push(method); return method === "GET" ? { status: 200, data: { value: [] } } : { status: 201, data: { id: "exact-immutable-event", changeKey: "v1" } }; });
    const receipt = vi.fn(async () => {});
    expect(await createOneShot(graph, oneShotPayload(context().job), async () => { order.push("claim"); return true; }, receipt)).toEqual({ state: "succeeded" });
    expect(order).toEqual(["GET", "claim", "POST"]); expect(receipt).toHaveBeenCalledWith("succeeded", "exact-immutable-event", 201, "v1");
  });
  it("duplicate direct calendar event blocks claim and POST", async () => {
    const graph = vi.fn(async () => ({ status: 200, data: { value: [{ id: "existing", start: { dateTime: x.start, timeZone: "UTC" }, end: { dateTime: x.end, timeZone: "UTC" } }] } })); const claim = vi.fn();
    expect((await createOneShot(graph, {}, claim, vi.fn())).state).toBe("calendar_identity_unresolved"); expect(claim).not.toHaveBeenCalled(); expect(graph).toHaveBeenCalledTimes(1);
  });
  it.each([503, 408, 201, 403, 429])("HTTP %s is audited and consumed without blind retry", async http => {
    let consumed = false; const claim = async () => { if (consumed) return false; consumed = true; return true; };
    const graph = vi.fn(async (method: string) => method === "GET" ? { status: 200, data: { value: [] } } : { status: http, data: {} }); const receipt = vi.fn(async () => {});
    const r = await createOneShot(graph, {}, claim, receipt); expect(r.state).toBe([503, 408, 201].includes(http) ? "uncertain" : "failed");
    expect((await createOneShot(graph, {}, claim, receipt)).state).toBe("already_claimed"); expect(graph.mock.calls.filter(c => c[0] === "POST")).toHaveLength(1); expect(receipt).toHaveBeenCalledTimes(1);
  });
  it("timeout retained; GET reconciliation recognizes only exact marker/key/time", async () => {
    const graph = vi.fn(async (method: string) => { if (method === "POST") throw new TypeError("timeout"); return { status: 200, data: { value: [] } }; }); const receipt = vi.fn(async () => {});
    expect((await createOneShot(graph, {}, async () => true, receipt)).state).toBe("uncertain"); expect(receipt).toHaveBeenCalledWith("uncertain", null, null);
    const event = { id: "found", transactionId: x.key, start: { dateTime: x.start, timeZone: "UTC" }, end: { dateTime: x.end, timeZone: "UTC" }, body: { content: `MCS_EVENT_ID:${x.event_id} MCS_TECHNICIAN_ID:${x.technician_id} MCS_WORK_DATE:${x.work_date}` } };
    const read = vi.fn(async () => ({ status: 200, data: { value: [event] } })); expect((await inspectMailbox(read)).own?.id).toBe("found"); expect(read).toHaveBeenCalledWith("GET", oneShotView());
  });
  it("incomplete paged read or 403 never reaches POST", async () => { const graph = vi.fn(async () => ({ status: 200, data: { value: [], "@odata.nextLink": "untrusted" } })); const claim = vi.fn(); await expect(createOneShot(graph, {}, claim, vi.fn())).rejects.toThrow("mailbox_lookup_incomplete"); expect(claim).not.toHaveBeenCalled(); });
});
describe("read-only privacy-preserving conflict diagnosis", () => {
  const event = { id: "private-id", subject: "Private meeting", body: { content: "Private details" }, start: { dateTime: x.start, timeZone: "UTC" }, end: { dateTime: x.end, timeZone: "UTC" }, showAs: "busy", type: "singleInstance", isCancelled: false, isAllDay: false };
  it.each([
    [{ showAs: "free" }, "free_overlap"], [{ isCancelled: true }, "cancelled_overlap"],
    [{ type: "occurrence" }, "other_busy"], [{ showAs: "unknown" }, "unknown_availability"],
    [{ subject: "Majorstua" }, "same_title_unverified"],
    [{ body: { content: `MCS_EVENT_ID:${x.event_id} MCS_TECHNICIAN_ID:${x.technician_id} MCS_WORK_DATE:${x.work_date}` } }, "same_hub_day"],
    [{ body: { content: `MCS_EVENT_ID:${x.event_id}` } }, "related_hub_job"],
    [{ start: { dateTime: x.start, timeZone: "Europe/Oslo" } }, "unreadable_time"],
  ])("classifies %j without relaxing write gate", (override, classification) => {
    const e = { ...event, ...override };
    const d = diagnoseOneShotEvents([e], "Majorstua");
    expect(d.conflicts[0].classification).toBe(classification);
    expect(d.blocking_count).toBe(1);
    expect(inspectOneShotEvents([e]).blocked).toBe(true);
    expect(JSON.stringify(d)).not.toContain("private-id"); expect(JSON.stringify(d)).not.toContain("Private"); expect(JSON.stringify(d)).not.toContain(x.event_id);
  });
  it("clips all-day private intervals to 08–16 Oslo and ignores adjacent intervals", () => {
    const d = diagnoseOneShotEvents([{ ...event, isAllDay: true, start: { dateTime: "2026-11-18T23:00:00Z", timeZone: "UTC" }, end: { dateTime: "2026-11-19T23:00:00Z", timeZone: "UTC" } }, { ...event, start: { dateTime: x.end, timeZone: "UTC" }, end: { dateTime: "2026-11-19T16:00:00Z", timeZone: "UTC" } }], "Majorstua");
    expect(d.checked_count).toBe(2); expect(d.blocking_count).toBe(1); expect(d.conflicts[0].local_overlap).toBe("08:00–16:00");
  });
  it("same Hub markers remain duplicate evidence even when free or cancelled", () => {
    const d = diagnoseOneShotEvents([{ ...event, isCancelled: true, showAs: "free", body: { content: `MCS_EVENT_ID:${x.event_id} MCS_TECHNICIAN_ID:${x.technician_id} MCS_WORK_DATE:${x.work_date}` } }], "Majorstua");
    expect(d.same_hub_count).toBe(1); expect(d.non_busy_count).toBe(1); expect(d.conflicts[0].classification).toBe("same_hub_day");
  });
});
describe("Hub-authoritative explicit consent",()=>{
  const event={id:"other",subject:"Other appointment",body:{content:""},start:{dateTime:x.start,timeZone:"UTC"},end:{dateTime:x.end,timeZone:"UTC"},showAs:"tentative",type:"occurrence",isAllDay:false,isCancelled:false};
  it.each(["busy","tentative","free","oof"])("known %s allows only explicitly confirmed override",async showAs=>{
    const graph=vi.fn(async(method:string)=>method==="GET"?{status:200,data:{value:[{...event,showAs}]}}:{status:201,data:{id:"created"}});
    const seen=await inspectMailbox(graph,"Majorstua"),claim=vi.fn(async()=>true),receipt=vi.fn(async()=>{});
    expect(seen.diagnosis.category).toBe("other");expect(oneShotConflictGuard(seen.diagnosis,false)).toBe("conflict_override_required");
    expect((await createOneShot(graph,{subject:"Majorstua"},claim,receipt,{override:false,signature:seen.signature})).state).toBe("conflict_override_required");expect(claim).not.toHaveBeenCalled();
    expect((await createOneShot(graph,{subject:"Majorstua"},claim,receipt,{override:true,signature:seen.signature})).state).toBe("succeeded");expect(graph.mock.calls.filter(c=>c[0]==="POST")).toHaveLength(1);
  });
  it("full-day and recurring overlaps retain all warnings",()=>{const d=diagnoseOneShotEvents([{...event,isAllDay:true},{...event,id:"second"}],"Majorstua");expect(d.category).toBe("other");expect(d.blocking_count).toBe(2);expect(d.conflicts[0].local_overlap).toBe("08:00–16:00");});
  it.each(["body","id","type","showAs","isAllDay","isCancelled"])("missing %s never overrides",field=>{const missing={...event};delete(missing as Record<string,unknown>)[field];expect(oneShotConflictGuard(diagnoseOneShotEvents([missing],"Majorstua"),true)).toBe("calendar_identity_unresolved");});
  it("same job, unverified title and malformed transaction cannot override",()=>{
    expect(oneShotConflictGuard(diagnoseOneShotEvents([{...event,body:{content:`MCS_EVENT_ID:${x.event_id} MCS_TECHNICIAN_ID:${x.technician_id} MCS_WORK_DATE:${x.work_date}`}}],"Majorstua"),true)).toBe("same_hub_job_exists");
    expect(oneShotConflictGuard(diagnoseOneShotEvents([{...event,subject:"Majorstua"}],"Majorstua"),true)).toBe("calendar_identity_unresolved");
    expect(oneShotConflictGuard(diagnoseOneShotEvents([{...event,transactionId:x.key}],"Majorstua"),true)).toBe("calendar_identity_unresolved");
  });
  it("changed calendar stops before claim",async()=>{const graph=vi.fn(async()=>({status:200,data:{value:[event]}})),claim=vi.fn();expect((await createOneShot(graph,{subject:"Majorstua"},claim,vi.fn(),{override:true,signature:"old"})).state).toBe("calendar_changed_requires_preflight");expect(claim).not.toHaveBeenCalled();});
  it.each([403,500])("GET %s never claims/posts even with override",async status=>{const graph=vi.fn(async()=>({status,data:{value:[]}})),claim=vi.fn();await expect(createOneShot(graph,{},claim,vi.fn(),{override:true,signature:"old"})).rejects.toThrow("mailbox_lookup_incomplete");expect(claim).not.toHaveBeenCalled();expect(graph).toHaveBeenCalledTimes(1);});
});