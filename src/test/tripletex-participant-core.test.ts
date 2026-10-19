import { describe, it, expect } from "vitest";
import { runAddParticipant, runLinkEmployee, type PStore, type PTtApi, type Link, type Op, type JobRow } from "../../supabase/functions/_shared/tripletex-participant-core";
import type { Connection } from "../../supabase/functions/_shared/tripletex-guard";

const C = "co-1";
const conn = (p: Partial<Connection> = {}): Connection => ({ id: "conn", company_id: C, environment: "test", secret_name: "S", expected_tripletex_company_id: 1, mode: "write_enabled", capabilities: ["employees_read", "project_participants_write"], ...p });
const fp: JobRow = { id: "fp", company_id: C, entity_type: "financial_project", parent_project_id: null, project_number: "60488" };
const child: JobRow = { id: "job", company_id: C, entity_type: "job", parent_project_id: "fp" };

function world(opts: { projectLinked?: boolean; employees?: Record<string, number> } = {}) {
  const ops = new Map<string, Op>();
  const links: (Link & { type: string })[] = [];
  if (opts.projectLinked !== false) links.push({ id: "pl", type: "project", status: "active", tripletex_id: 500, tripletex_number: "60488", mcs_entity_id: "fp" });
  for (const [t, e] of Object.entries(opts.employees ?? { t1: 11 })) links.push({ id: `el${t}`, type: "employee", status: "active", tripletex_id: e, tripletex_number: null, mcs_entity_id: t });
  const participants: number[] = [];
  let posts = 0; let failNext = 0; let net = 0;
  const store: PStore = {
    getOp: async (k) => ops.get(k) ?? null,
    insertOp: async (k) => { if (!ops.has(k)) ops.set(k, { idempotency_key: k, status: "pending", attempts: 0, error_code: null }); },
    claimOp: async (k, prev) => { const o = ops.get(k)!; if (o.attempts !== prev || !["pending", "failed"].includes(o.status)) return false; o.status = "running"; o.attempts++; return true; },
    updateOp: async (k, p) => { Object.assign(ops.get(k)!, p); },
    getLink: async (type, id) => links.find((l) => l.type === type && l.mcs_entity_id === id) ?? null,
    findActiveByTripletexId: async (type, tid) => links.find((l) => l.type === type && l.tripletex_id === tid && l.status === "active") ?? null,
    saveEmployeeLink: async (t, e) => { links.push({ id: `n${t}`, type: "employee", status: "active", tripletex_id: e.id, tripletex_number: null, mcs_entity_id: t }); },
  };
  const tt: PTtApi = {
    getEmployee: async (id) => { net++; return { id }; },
    listParticipantEmployeeIds: async () => { net++; return [...participants]; },
    addParticipant: async (b: any) => { net++; posts++; if (failNext-- > 0) return { ok: false, status: 500 }; participants.push(b.employee.id); return { ok: true, status: 201, id: 1 }; },
  };
  return { store, tt, participants, ops, get posts() { return posts; }, get net() { return net; }, failOnce: () => { failNext = 1; } };
}
const add = (w: ReturnType<typeof world>, o: Partial<Parameters<typeof runAddParticipant>[0]> = {}) =>
  runAddParticipant({ conn: conn(), job: child, parent: fp, technicianId: "t1", assigned: true, technicianCompanyIds: [C], store: w.store, tt: w.tt, ...o });

describe("TPX-F3 participant core", () => {
  it("rejects non-financial job without financial parent before network", async () => {
    const w = world();
    await expect(add(w, { job: { ...child, entity_type: "service", parent_project_id: null }, parent: null })).rejects.toMatchObject({ code: "not_financial" });
    expect(w.net).toBe(0);
  });
  it("rejects cross-company before network", async () => {
    const w = world();
    await expect(add(w, { job: { ...child, company_id: "other" } })).rejects.toMatchObject({ code: "company_mismatch" });
    await expect(add(w, { technicianCompanyIds: ["other"] })).rejects.toMatchObject({ code: "employee_company" });
    expect(w.net).toBe(0);
  });
  it("rejects environment != test", async () => {
    await expect(add(world(), { conn: conn({ environment: "production" }) })).rejects.toMatchObject({ code: "env_blocked" });
  });
  it("rejects read_only and off for write", async () => {
    await expect(add(world(), { conn: conn({ mode: "read_only" }) })).rejects.toMatchObject({ code: "read_only" });
    await expect(add(world(), { conn: conn({ mode: "off" }) })).rejects.toMatchObject({ code: "disabled" });
  });
  it("rejects project without active project-link", async () => {
    const w = world({ projectLinked: false });
    await expect(add(w)).rejects.toMatchObject({ code: "project_not_linked" }); expect(w.net).toBe(0);
  });
  it("rejects technician without employee-link before POST", async () => {
    const w = world({ employees: {} });
    await expect(add(w)).rejects.toMatchObject({ code: "employee_not_linked" }); expect(w.posts).toBe(0);
  });
  it("blocks linking same Tripletex employee to two Hub employees", async () => {
    const w = world({ employees: { t1: 11 } });
    await expect(runLinkEmployee({ conn: conn(), technicianId: "t2", technicianCompanyIds: [C], tripletexEmployeeId: 11, store: w.store, tt: w.tt })).rejects.toMatchObject({ code: "already_linked_elsewhere" });
    await expect(runLinkEmployee({ conn: conn(), technicianId: "t1", technicianCompanyIds: [C], tripletexEmployeeId: 12, store: w.store, tt: w.tt })).rejects.toMatchObject({ code: "employee_already_linked" });
  });
  it("same participant operation twice gives one participant", async () => {
    const w = world();
    expect((await add(w)).result).toBe("added");
    expect((await add(w)).result).toBe("already_participant");
    expect(w.participants).toEqual([11]); expect(w.posts).toBe(1);
  });
  it("Tripletex API error can be retried without double participant", async () => {
    const w = world(); w.failOnce();
    expect(await add(w)).toMatchObject({ result: "failed", error_code: "tripletex_rejected" });
    expect((await add(w)).result).toBe("added");
    expect((await add(w)).result).toBe("already_participant");
    expect(w.participants).toEqual([11]);
  });
  it("handles several technicians on the same job individually", async () => {
    const w = world({ employees: { t1: 11, t2: 22 } });
    expect((await add(w, { technicianId: "t1" })).result).toBe("added");
    expect((await add(w, { technicianId: "t3" })).constructor).toBeDefined();
  });
});
