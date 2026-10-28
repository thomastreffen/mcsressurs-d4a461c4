// Runs the actual draft handler with isolated read-only Cloud and AI mocks. No production/network calls.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { activeOrganizationRoles } from "../../supabase/functions/_shared/organization-coverage";
import { buildDraftContext, finalizeDraft, SYSTEM_PROMPT } from "../../supabase/functions/finding-response-draft/context";

const caseId = "11111111-1111-4111-8111-111111111111";
const findingId = "22222222-2222-4222-8222-222222222222";
type Options = { linked?: boolean; roles?: number; roleError?: boolean; allowed?: boolean; unavailable?: boolean; foreignEvidence?: boolean; open?: boolean; cancelled?: boolean; aiText?: string };
function fixture(options: Options = {}) {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const reads: { table: string; field: string; value: unknown }[] = [];
  const writes = vi.fn(() => { throw new Error("Forbidden write"); });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "reviewer" } }, error: null }) },
    rpc: vi.fn(async () => ({ data: options.allowed !== false, error: null })),
    from(table: string) {
      const data = () => {
        if (table === "compliance_inspections") return options.unavailable ? null : { id: caseId, company_id: "service", title: "63210", authority_name: "DLE" };
        if (table === "compliance_findings") return { id: findingId, title: "Organisasjonskart med ansvarsmatrise", proposed_solution: "Arbeider med å utarbeide organisasjonskart", internal_assessment: "Mangler frist for ferdigstillelse", responsible_person_id: null, response_approved_at: null, condition_corrected_at: null, documentation_complete_at: null };
        if (table === "compliance_finding_evidence") return options.linked === false ? [] : [{ source_kind: "organization_overview", ref_id: options.foreignEvidence ? "other-company" : "service", label: "Organisasjonsoversikt", note: "Historisk antall: 99" }];
        if (table === "compliance_org_roles") return Array.from({ length: options.roles ?? 7 }, (_, i) => ({ title: `Rolle ${i}`, sort_order: i, is_active: true, valid_from: null, valid_to: null }));
        if (table === "hms_action_items") return [...(options.open ? [{ title: "Kontrollere stedfortreder", status: "open", due_date: "2026-11-08" }] : []), ...(options.cancelled ? [{ title: "Gammelt avlyst tiltak", status: "cancelled" }] : [])];
        throw new Error(`Unexpected table ${table}`);
      };
      const result = () => ({ data: data(), error: options.roleError && table === "compliance_org_roles" ? { message: "Unavailable" } : null });
      const chain = {
        select: () => chain,
        eq: (field: string, value: unknown) => { reads.push({ table, field, value }); return chain; },
        is: (field: string, value: unknown) => { reads.push({ table, field, value }); return chain; },
        maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        insert: writes, update: writes, delete: writes, upsert: writes,
      };
      return chain;
    },
  };
  let aiPrompt: Record<string, any> | undefined;
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    aiPrompt = JSON.parse(body.messages[1].content);
    const text = options.aiText ?? (aiPrompt?.dokumentasjonsdekning.organization_overview.startsWith("dekket")
      ? options.open ? "Gjenstående arbeid er å kontrollere stedfortreder, med frist 2026-11-08." : ""
      : "Virksomheten planlegger å utarbeide organisasjonskart.");
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ response_text: text, missing_information: [] }) } }] } }] }));
  });
  const source = readFileSync(`${process.cwd()}/supabase/functions/finding-response-draft/index.ts`, "utf8").replace(/^import .*;\s*$/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(js, { Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: () => "mock-config" } }, createClient: () => client,
    activeOrganizationRoles, buildDraftContext, finalizeDraft, SYSTEM_PROMPT, Response, Request, Date, crypto: { randomUUID: () => "mock-request" }, console: { error() {} }, fetch });
  if (!handler) throw new Error("Handler not registered");
  const call = (extra = {}) => handler?.(new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer mock-user" },
    body: JSON.stringify({ inspection_id: caseId, finding_id: findingId, ...extra }) }));
  return { call, reads, writes, fetch, client, prompt: () => aiPrompt };
}

describe("Read-only DLE response draft from current evidence", () => {
  it("uses live linked organization evidence as established despite historical future plans and missing confirmations", async () => {
    const f = fixture(); const response = await f.call(); const data = await response?.json();
    expect(response?.status).toBe(200);
    expect(data.response_text).toContain("Virksomheten har etablert en organisasjonsoversikt med 7 aktive roller");
    expect(data.response_text).toContain("koblet som dokumentasjon");
    expect(data.response_text).not.toMatch(/utarbeide|mangler frist/);
    expect(f.prompt()?.manuelle_behandlingssteg.mangler).toHaveLength(4);
    expect(f.prompt()?.faktisk_apne_tiltak).toEqual([]);
    expect(f.writes).not.toHaveBeenCalled();
  });
  it("allows planned language without linked coverage", async () => {
    const f = fixture({ linked: false }); const data = await (await f.call())?.json();
    expect(data.response_text).toContain("planlegger å utarbeide");
    expect(data.response_text).not.toContain("har etablert");
  });
  it("mentions an actual open action separately, never resurrecting a cancelled action", async () => {
    const f = fixture({ open: true, cancelled: true }); const data = await (await f.call())?.json();
    expect(data.response_text).toContain("har etablert");
    expect(data.response_text).toContain("Gjenstående arbeid");
    expect(f.prompt()?.faktisk_apne_tiltak).toEqual([{ title: "Kontrollere stedfortreder", status: "open", due_date: "2026-11-08" }]);
    expect(f.writes).not.toHaveBeenCalled();
  });
  it.each([{ roles: 0 }, { foreignEvidence: true }])("does not infer coverage from historical labels or a foreign company (%j)", async (options) => {
    const f = fixture(options); const data = await (await f.call())?.json();
    expect(data.response_text).not.toContain("har etablert");
    expect(f.prompt()?.koblede_bevis).toEqual([]);
  });
  it("rejects contradictory model output rather than returning future organization work", async () => {
    const f = fixture({ aiText: "Virksomheten skal utarbeide organisasjonskart." });
    expect((await f.call())?.status).toBe(502); expect(f.writes).not.toHaveBeenCalled();
  });
  it("fails closed when the live register cannot be read", async () => {
    const f = fixture({ roleError: true }); expect((await f.call())?.status).toBe(503);
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.writes).not.toHaveBeenCalled();
  });
  it.each([{ allowed: false }, { unavailable: true }])("denies inaccessible company/case before AI (%j)", async (options) => {
    const f = fixture(options); expect((await f.call())?.status).toBe(403); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("pins source queries to the authorized inspection company and ignores spoofed client finding/evidence/actions", async () => {
    const f = fixture(); const data = await (await f.call({ finding: { title: "Spoof" }, evidence: ["Spoof"], actions: [{ title: "Spoof", status: "completed" }], company_id: "other" }))?.json();
    expect(data.response_text).toContain("7 aktive roller");
    for (const table of ["compliance_findings", "compliance_finding_evidence", "hms_action_items", "compliance_org_roles"]) {
      expect(f.reads).toContainEqual({ table, field: "company_id", value: "service" });
    }
    expect(f.client.rpc).toHaveBeenCalledWith("has_company_access", { _uid: "reviewer", _company: "service", _module: "hms", _level: "edit" });
    expect(f.prompt()?.faktisk_utforte_tiltak).toEqual([]);
    expect(f.writes).not.toHaveBeenCalled();
  });
});