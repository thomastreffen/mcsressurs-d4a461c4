import { describe, it, expect } from "vitest";
import { runAddParticipant, runLinkEmployee, resolveAssigneeIdentity, type Identity, type PStore, type PTtApi, type Link, type Op, type JobRow } from "../../supabase/functions/_shared/tripletex-participant-core";
import type { Connection } from "../../supabase/functions/_shared/tripletex-guard";

const C = "co-1";
const conn = (p: Partial<Connection> = {}): Connection => ({ id: "conn", company_id: C, environment: "test", secret_name: "S", expected_tripletex_company_id: 1, mode: "write_enabled", capabilities: ["employees_read", "project_participants_write"], ...p });
const fp: JobRow = { id: "fp", company_id: C, entity_type: "financial_project", parent_project_id: null, project_number: "60488" };
const child: JobRow = { id: "job", company_id: C, entity_type: "job", parent_project_id: "fp" };

function world(opts: { projectLinked?: boolean; employees?: Record<string, number> } = {}) {
  const ops = new Map<string, Op>();
  const links: (Link & { type: string })[] = [];
  if (opts.projectLinked !== false) links.push({ id: "pl", type: "project", status: "active", tripletex_id: 500, tripletex_number: "60488", mcs_entity_id: "fp" });
  for (const [t, e] of Object.entries(opts.employees ?? { p1: 11 })) links.push({ id: `el${t}`, type: "employee", status: "active", tripletex_id: e, tripletex_number: null, mcs_entity_id: t });
  const participants: number[] = [];
  let posts = 0; let failNext = 0; let net = 0; let closed: boolean | null | "error" = false;
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
    getProjectClosed: async () => { net++; if (closed === "error") throw new Error("500"); return closed; },
    listParticipantEmployeeIds: async () => { net++; return [...participants]; },
    addParticipant: async (b: any) => { net++; posts++; if (failNext-- > 0) return { ok: false, status: 500 }; participants.push(b.employee.id); return { ok: true, status: 201, id: 1 }; },
  };
  return { store, tt, participants, ops, get posts() { return posts; }, get net() { return net; }, failOnce: () => { failNext = 1; }, setClosed: (v: boolean | null | "error") => { closed = v; } };
}
const who = (personId: string, companyIds = [C], technicianId = "t-" + personId): Identity => ({ status: "resolved", technicianId, personId, companyIds });
const add = (w: ReturnType<typeof world>, o: Partial<Parameters<typeof runAddParticipant>[0]> = {}) =>
  runAddParticipant({ conn: conn(), job: child, parent: fp, identity: who("p1"), assigned: true, store: w.store, tt: w.tt, ...o });

describe("TPX-F3 participant core", () => {
  it("rejects non-financial job without financial parent before network", async () => {
    const w = world();
    await expect(add(w, { job: { ...child, entity_type: "service", parent_project_id: null }, parent: null })).rejects.toMatchObject({ code: "not_financial" });
    expect(w.net).toBe(0);
  });
  it("rejects cross-company before network", async () => {
    const w = world();
    await expect(add(w, { job: { ...child, company_id: "other" } })).rejects.toMatchObject({ code: "company_mismatch" });
    await expect(add(w, { identity: who("p1", ["other"]) })).rejects.toMatchObject({ code: "employee_company" });
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
    const w = world({ employees: { p1: 11 } });
    await expect(runLinkEmployee({ conn: conn(), identity: who("p2"), tripletexEmployeeId: 11, store: w.store, tt: w.tt })).rejects.toMatchObject({ code: "already_linked_elsewhere" });
    await expect(runLinkEmployee({ conn: conn(), identity: who("p1"), tripletexEmployeeId: 12, store: w.store, tt: w.tt })).rejects.toMatchObject({ code: "employee_already_linked" });
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
    const w = world({ employees: { p1: 11, p2: 22 } });
    expect((await add(w, { identity: who("p1") })).result).toBe("added");
    await expect(add(w, { identity: who("p3") })).rejects.toMatchObject({ code: "employee_not_linked" });
    expect((await add(w, { identity: who("p2") })).result).toBe("added");
    expect((await add(w, { identity: who("p1") })).result).toBe("already_participant");
    expect(w.participants).toEqual([11, 22]);
  });
});

describe("TPX-F3.1 canonical identity", () => {
  const tech = (id: string, user_id: string | null = "u1") => ({ id, user_id, deleted_at: null });
  it("technician.id == person.id still resolves", () => {
    expect(resolveAssigneeIdentity("x", { technician: tech("x"), account: { person_id: "x" }, peopleRowWithTechnicianId: true, activeEmploymentCompanyIds: [C] })).toMatchObject({ status: "resolved", personId: "x" });
  });
  it("technician.id != person.id with explicit account chain uses canonical person", () => {
    expect(resolveAssigneeIdentity("t9", { technician: tech("t9"), account: { person_id: "p9" }, peopleRowWithTechnicianId: false, activeEmploymentCompanyIds: [C] })).toMatchObject({ status: "resolved", personId: "p9" });
  });
  it("no deterministic relation is unresolved and blocked before network", async () => {
    const noAcc = resolveAssigneeIdentity("t9", { technician: tech("t9"), account: null, peopleRowWithTechnicianId: true, activeEmploymentCompanyIds: [] });
    expect(noAcc).toMatchObject({ status: "unresolved", reason: "no_user_account" });
    expect(resolveAssigneeIdentity("t9", { technician: tech("t9", null), account: null, peopleRowWithTechnicianId: false, activeEmploymentCompanyIds: [] })).toMatchObject({ reason: "no_auth_user" });
    const w = world();
    await expect(add(w, { identity: noAcc })).rejects.toMatchObject({ code: "employee_identity_unresolved" });
    await expect(runLinkEmployee({ conn: conn(), identity: noAcc, tripletexEmployeeId: 11, store: w.store, tt: w.tt })).rejects.toMatchObject({ code: "employee_identity_unresolved" });
    expect(w.net).toBe(0);
  });
  it("shared UUID pointing at a different person than the account chain is never picked", () => {
    expect(resolveAssigneeIdentity("t9", { technician: tech("t9"), account: { person_id: "p9" }, peopleRowWithTechnicianId: true, activeEmploymentCompanyIds: [C] })).toMatchObject({ status: "unresolved", reason: "id_conflict" });
  });
  it("cross-company employment is blocked before network", async () => {
    const w = world();
    const idn = resolveAssigneeIdentity("t9", { technician: tech("t9"), account: { person_id: "p1" }, peopleRowWithTechnicianId: false, activeEmploymentCompanyIds: ["other"] });
    await expect(add(w, { identity: idn })).rejects.toMatchObject({ code: "employee_company" });
    expect(w.net).toBe(0);
  });
  it("employee-link lookup uses canonical person id, not technician id", async () => {
    const w = world({ employees: { "t-res": 99, p1: 11 } }); // decoy link keyed by technician id
    const idn = resolveAssigneeIdentity("t-res", { technician: tech("t-res"), account: { person_id: "p1" }, peopleRowWithTechnicianId: false, activeEmploymentCompanyIds: [C] });
    expect(await add(w, { identity: idn })).toMatchObject({ result: "added", tripletex_employee_id: 11 });
    expect(w.participants).toEqual([11]);
  });
  it("identity ignores name and e-mail entirely", () => {
    const f = { technician: tech("t9"), account: { person_id: "p9" }, peopleRowWithTechnicianId: false, activeEmploymentCompanyIds: [C] };
    const withNoise = { ...f, technician: { ...f.technician, name: "Ola", email: "ola@x.no" } } as any;
    expect(resolveAssigneeIdentity("t9", withNoise)).toEqual(resolveAssigneeIdentity("t9", f));
  });
});

describe("TPX-F3.2 closed-project guard", () => {
  it("closed Tripletex project returns project_closed before participant POST", async () => {
    const w = world(); w.setClosed(true);
    await expect(add(w)).rejects.toMatchObject({ code: "project_closed" });
    expect(w.posts).toBe(0);
  });
  it("open project keeps the existing participant flow", async () => {
    const w = world(); w.setClosed(false);
    expect((await add(w)).result).toBe("added");
    expect((await add(w)).result).toBe("already_participant");
    expect(w.posts).toBe(1);
  });
  it("existing participant on a closed project triggers no write", async () => {
    const w = world(); expect((await add(w)).result).toBe("added");
    w.setClosed(true);
    await expect(add(w)).rejects.toMatchObject({ code: "project_closed" });
    expect(w.posts).toBe(1);
  });
  it("status read error or missing isClosed fails closed", async () => {
    const w = world(); w.setClosed("error");
    await expect(add(w)).rejects.toMatchObject({ code: "project_status_unknown" });
    w.setClosed(null);
    await expect(add(w)).rejects.toMatchObject({ code: "project_status_unknown" });
    expect(w.posts).toBe(0);
  });
});
