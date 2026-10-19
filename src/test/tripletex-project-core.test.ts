import { describe, it, expect, vi } from "vitest";
import { runCreate, runLinkExisting, type Store, type TtApi, type Op, type Link, type TtProject, type EventRow } from "../../supabase/functions/_shared/tripletex-project-core";

const MCS = "a0000000-0000-0000-0000-000000000001";
const conn = { id: "c1", company_id: MCS, environment: "test", secret_name: "TRIPLETEX_TEST_API_TOKEN", expected_tripletex_company_id: 88777230, mode: "write_enabled", capabilities: ["customers_read", "projects_read", "projects_write"] };
const ev: EventRow = { id: "e1", company_id: MCS, entity_type: "financial_project", project_number: "70001", title: "70001 Test", start_time: "2026-11-01T08:00:00Z", customer_id: "cu1" };

function fakes(remote: TtProject[] = []) {
  const ops = new Map<string, Op>(); const links: (Link & { event: string })[] = [];
  const store: Store = {
    getOp: async k => ops.get(k) ? { ...ops.get(k)! } : null,
    insertOp: async k => { if (!ops.has(k)) ops.set(k, { idempotency_key: k, status: "pending", attempts: 0, error_code: null }); },
    claimOp: async (k, prev) => { const o = ops.get(k)!; if (!["pending", "failed"].includes(o.status) || o.attempts !== prev) return false; o.status = "running"; o.attempts++; return true; },
    updateOp: async (k, p) => { Object.assign(ops.get(k)!, p); },
    getProjectLink: async e => links.find(l => l.event === e && l.status !== "inactive") ?? null,
    reserveProjectLink: async e => { let l = links.find(x => x.event === e && x.status !== "inactive"); if (!l) { l = { id: `l${links.length}`, event: e, mcs_entity_id: e, status: "pending", tripletex_id: null, tripletex_number: null }; links.push(l); } else if (l.status === "failed") l.status = "pending"; return l; },
    activateLink: async (id, p) => { const l = links.find(x => x.id === id)!; l.status = "active"; l.tripletex_id = p.id; l.tripletex_number = p.number; },
    failLink: async id => { links.find(x => x.id === id)!.status = "failed"; },
    findActiveLinkByTripletexId: async t => links.find(l => l.tripletex_id === t && l.status === "active") ?? null,
  };
  const tt: TtApi = {
    findProjectsByNumber: async n => remote.filter(p => p.number === n),
    getProject: async id => remote.find(p => p.id === id) ?? null,
    createProject: vi.fn(async (b: any) => { const p = { id: 900 + remote.length, number: b.number, name: b.name, customer: b.customer }; remote.push(p); return { ok: true, status: 201, id: p.id }; }),
  };
  return { store, tt, ops, links, remote };
}
const base = (f: ReturnType<typeof fakes>) => ({ conn, ev, customerTtId: 55, pmId: 7, name: "Test", store: f.store, tt: f.tt });

describe("Tripletex project create/link", () => {
  it("rejects non-financial projects", async () => {
    const f = fakes();
    await expect(runCreate({ ...base(f), ev: { ...ev, entity_type: "service" } })).rejects.toThrow(/økonomiske/);
    expect(f.tt.createProject).not.toHaveBeenCalled();
  });
  it("rejects cross-company before network", async () => {
    const f = fakes();
    await expect(runCreate({ ...base(f), ev: { ...ev, company_id: "busbar" } })).rejects.toThrow(/annet selskap/);
    expect(f.tt.createProject).not.toHaveBeenCalled();
  });
  it("rejects environment other than test", async () => {
    const f = fakes();
    await expect(runCreate({ ...base(f), conn: { ...conn, environment: "production" } })).rejects.toThrow();
  });
  it("rejects read_only and off connections", async () => {
    const f = fakes();
    await expect(runCreate({ ...base(f), conn: { ...conn, mode: "read_only" } })).rejects.toThrow();
    await expect(runCreate({ ...base(f), conn: { ...conn, mode: "off" } })).rejects.toThrow();
  });
  it("rejects create without customer link", async () => {
    const f = fakes();
    await expect(runCreate({ ...base(f), customerTtId: null })).rejects.toThrow(/Kunden/);
    expect(f.tt.createProject).not.toHaveBeenCalled();
  });
  it("does not create when the number already exists in Tripletex", async () => {
    const f = fakes([{ id: 1, number: "70001", name: "Other", customer: { id: 99 } }]);
    const r = await runCreate(base(f));
    expect(r.result).toBe("number_exists");
    expect(f.tt.createProject).not.toHaveBeenCalled();
  });
  it("running create twice gives one Tripletex project and one active link", async () => {
    const f = fakes();
    expect((await runCreate(base(f))).result).toBe("created");
    expect((await runCreate(base(f))).result).toBe("already_linked");
    expect(f.tt.createProject).toHaveBeenCalledTimes(1);
    expect(f.links.filter(l => l.status === "active")).toHaveLength(1);
  });
  it("concurrent double click creates only one project", async () => {
    const f = fakes();
    const [a, b] = await Promise.all([runCreate(base(f)), runCreate(base(f))]);
    expect([a.result, b.result].sort()).toEqual(["created", "in_progress"]);
    expect(f.tt.createProject).toHaveBeenCalledTimes(1);
  });
  it("a timed-out create is retried by adopting the project instead of creating again", async () => {
    const f = fakes();
    (f.tt.createProject as any).mockImplementationOnce(async (b: any) => { f.remote.push({ id: 500, number: b.number, name: b.name, customer: b.customer }); throw new Error("timeout"); });
    expect((await runCreate(base(f))).result).toBe("failed");
    const r = await runCreate(base(f));
    expect(r).toMatchObject({ result: "adopted", tripletex_id: 500 });
    expect(f.tt.createProject).toHaveBeenCalledTimes(1);
  });
  it("a rejected create can be retried and creates exactly one", async () => {
    const f = fakes();
    (f.tt.createProject as any).mockImplementationOnce(async () => ({ ok: false, status: 422 }));
    expect((await runCreate(base(f))).result).toBe("failed");
    expect((await runCreate(base(f))).result).toBe("created");
    expect(f.remote).toHaveLength(1);
  });
  it("an existing Tripletex project cannot be linked to two Hub projects", async () => {
    const f = fakes([{ id: 77, number: "70001", name: "X", customer: { id: 55 } }]);
    await runLinkExisting({ conn, ev, tripletexId: 77, store: f.store, tt: f.tt });
    await expect(runLinkExisting({ conn, ev: { ...ev, id: "e2" }, tripletexId: 77, store: f.store, tt: f.tt })).rejects.toThrow(/annet Hub-prosjekt/);
  });
});
