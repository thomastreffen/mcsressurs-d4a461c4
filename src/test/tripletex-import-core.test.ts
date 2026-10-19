import { describe, it, expect } from "vitest";
import { runImport, shellTitle, type IStore, type ITtApi, type TtImportProject, type HubCustomer, type Op } from "../../supabase/functions/_shared/tripletex-import-core";
import type { Connection } from "../../supabase/functions/_shared/tripletex-guard";

const C = "co-1";
const conn = (p: Partial<Connection> = {}): Connection => ({ id: "conn", company_id: C, environment: "test", secret_name: "S", expected_tripletex_company_id: 1, mode: "write_enabled", capabilities: ["customers_read", "projects_read"], ...p });
const proj = (p: Partial<TtImportProject> = {}): TtImportProject => ({ id: 700, number: "70001", name: "70001 Ny tavle", isClosed: false, startDate: "2026-10-01", customer: { id: 90, name: "ACME AS", organizationNumber: "959 069 743" }, ...p });

function world(o: { project?: TtImportProject | null; hub?: HubCustomer[]; customerLinks?: Record<number, string>; projectLinks?: Record<number, string> } = {}) {
  const hub = o.hub ?? [{ id: "h1", company_id: C, org_number: "959069743" }];
  const custLinks = new Map<number, string>(Object.entries(o.customerLinks ?? {}).map(([k, v]) => [Number(k), v]));
  const projLinks = new Map<number, string>(Object.entries(o.projectLinks ?? {}).map(([k, v]) => [Number(k), v]));
  const ops = new Map<string, Op>();
  const events: { id: string; customerId: string; title: string }[] = [];
  let net = 0;
  const store: IStore = {
    findProjectLinkByTripletexId: async (t) => projLinks.has(t) ? { mcs_entity_id: projLinks.get(t)! } : null,
    findCustomerLinkByTripletexId: async (t) => custLinks.has(t) ? { mcs_entity_id: custLinks.get(t)! } : null,
    getCustomerLinkForHub: async (id) => { for (const [t, h] of custLinks) if (h === id) return { tripletex_id: t }; return null; },
    findHubCustomersByOrg: async (org) => hub.filter((h) => (h.org_number ?? "").replace(/\D/g, "") === org),
    getHubCustomer: async (id) => hub.find((h) => h.id === id) ?? null,
    linkCustomer: async (h, c) => { custLinks.set(c.id, h); },
    getOp: async (k) => ops.get(k) ?? null,
    insertOp: async (k) => { if (!ops.has(k)) ops.set(k, { idempotency_key: k, status: "pending", attempts: 0, error_code: null }); },
    claimOp: async (k, prev) => { const op = ops.get(k)!; if (op.attempts !== prev || !["pending", "failed"].includes(op.status)) return false; op.status = "running"; op.attempts++; return true; },
    updateOp: async (k, p) => { Object.assign(ops.get(k)!, p); },
    createShell: async (p) => { // mirrors the atomic RPC: existing link wins
      if (projLinks.has(p.ttId)) return { event_id: projLinks.get(p.ttId)!, created: false };
      const id = `ev${events.length + 1}`; events.push({ id, customerId: p.customerId, title: p.name }); projLinks.set(p.ttId, id); return { event_id: id, created: true };
    },
  };
  const tt: ITtApi = { getProject: async (id) => { net++; const p = o.project === undefined ? proj() : o.project; return p && p.id === id ? p : null; } };
  return { store, tt, events, custLinks, projLinks, get net() { return net; } };
}
const imp = (w: ReturnType<typeof world>, o: Partial<Parameters<typeof runImport>[0]> = {}) =>
  runImport({ conn: conn(), sourceCompanyId: C, tripletexId: 700, confirmClosed: false, confirmCustomerId: null, store: w.store, tt: w.tt, ...o });

describe("TPX-F4 Tripletex-first import", () => {
  it("already linked Tripletex ID reuses the existing Hub financial project", async () => {
    const w = world({ projectLinks: { 700: "old-ev" } });
    expect(await imp(w)).toMatchObject({ result: "already_linked", event_id: "old-ev" });
    expect(w.events).toHaveLength(0);
  });
  it("double click / retry gives one Hub project and one link", async () => {
    const w = world({ customerLinks: { 90: "h1" } });
    const [a, b] = await Promise.all([imp(w), imp(w)]);
    const c = await imp(w);
    expect(w.events).toHaveLength(1);
    expect([a.result, b.result]).toContain("imported");
    expect(c).toMatchObject({ result: "already_linked", event_id: "ev1" });
    expect([...w.projLinks.values()]).toEqual(["ev1"]);
  });
  it("existing customer link is used", async () => {
    const w = world({ customerLinks: { 90: "h-linked" }, hub: [{ id: "h-linked", company_id: C, org_number: null }] });
    expect((await imp(w)).result).toBe("imported");
    expect(w.events[0].customerId).toBe("h-linked");
  });
  it("unique org.nr match without confirmation creates nothing", async () => {
    const w = world();
    expect(await imp(w)).toMatchObject({ result: "needs_customer_confirmation", suggestion: "h1" });
    expect(w.events).toHaveLength(0); expect(w.custLinks.size).toBe(0);
    expect((await imp(w, { confirmCustomerId: "h1" })).result).toBe("imported");
    expect(w.custLinks.get(90)).toBe("h1");
  });
  it("ambiguous or no customer match is blocked without guessing", async () => {
    const amb = world({ hub: [{ id: "h1", company_id: C, org_number: "959069743" }, { id: "h2", company_id: C, org_number: "959069743" }] });
    expect(await imp(amb)).toMatchObject({ result: "needs_customer_confirmation", suggestion: null, reason: "ambiguous" });
    const none = world({ hub: [] });
    expect(await imp(none)).toMatchObject({ result: "needs_customer_confirmation", reason: "no_match" });
    expect(amb.events.length + none.events.length).toBe(0);
  });
  it("name alone never auto-matches", async () => {
    const w = world({ project: proj({ customer: { id: 90, name: "ACME AS", organizationNumber: null } }), hub: [{ id: "h1", company_id: C, org_number: null }] });
    expect(await imp(w)).toMatchObject({ result: "needs_customer_confirmation", reason: "no_match" });
    expect(w.events).toHaveLength(0);
  });
  it("closed project imports only after explicit confirmation and is marked closed", async () => {
    const w = world({ project: proj({ isClosed: true }), customerLinks: { 90: "h1" } });
    expect((await imp(w)).result).toBe("needs_closed_confirmation");
    expect(w.events).toHaveLength(0);
    expect(await imp(w, { confirmClosed: true })).toMatchObject({ result: "imported", closed: true });
  });
  it("missing isClosed fails closed", async () => {
    const w = world({ project: proj({ isClosed: undefined }), customerLinks: { 90: "h1" } });
    await expect(imp(w)).rejects.toMatchObject({ code: "project_status_unknown" });
  });
  it("cross-company is blocked before network", async () => {
    const w = world();
    await expect(imp(w, { sourceCompanyId: "other" })).rejects.toMatchObject({ code: "company_mismatch" });
    const other = world({ hub: [{ id: "hx", company_id: "other", org_number: "959069743" }] });
    expect(await imp(other, { confirmCustomerId: "hx" })).toMatchObject({ result: "needs_customer_confirmation", reason: "customer_company" });
    expect(w.net).toBe(0);
  });
  it("TEST only: production environment is blocked", async () => {
    const w = world();
    await expect(imp(w, { conn: conn({ environment: "production" }) })).rejects.toMatchObject({ code: "env_blocked" });
    expect(w.net).toBe(0);
  });
  it("title is Tripletex name without duplicated number", () => {
    expect(shellTitle("70001", "70001 Ny tavle")).toBe("Ny tavle");
    expect(shellTitle("70001", "Ny tavle")).toBe("Ny tavle");
  });
});

import { readFileSync } from "node:fs";
import { resolveFinancialProject } from "../../supabase/functions/_shared/tripletex-participant-core";
describe("TPX-F4 jobs and legacy guard", () => {
  it("job created under an imported financial project resolves to the parent (Hub job, no Tripletex project)", () => {
    const fp = { id: "fp", company_id: C, entity_type: "financial_project", parent_project_id: null };
    const job = { id: "j", company_id: C, entity_type: "job", parent_project_id: "fp" };
    expect(resolveFinancialProject(job, fp).id).toBe("fp");
  });
  it("import path never calls Tripletex write endpoints", () => {
    for (const f of ["supabase/functions/tripletex-import/index.ts", "supabase/functions/_shared/tripletex-import-core.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/call\("(POST|PUT|DELETE)"/);
    }
  });
});
