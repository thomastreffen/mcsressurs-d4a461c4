// TPX-F4: Tripletex TEST -> Hub financial project import (Tripletex-first). super_admin only. Reads Tripletex only.
// Never creates Tripletex projects. Only Hub writes: optional confirmed customer link + one project shell + link (atomic RPC).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { GuardError, type Connection } from "../_shared/tripletex-guard.ts";
import { openSession, type TtCall } from "../_shared/tripletex-session.ts";
import { runImport, assertImportAllowed, decideCustomer, importKey, normOrg, shellTitle, type IStore, type ITtApi, type TtImportProject } from "../_shared/tripletex-import-core.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/;
const FIELDS = "id,number,name,version,isClosed,startDate,endDate,customer(id,name,customerNumber,organizationNumber),projectManager(id,firstName,lastName)";

const ttApi = (call: TtCall): ITtApi => ({
  getProject: async (id) => { const x = await call("GET", `/project/${id}?fields=${FIELDS}`); return x.r.ok ? x.b?.value ?? null : null; },
});

function dbStore(db: SupabaseClient, conn: Connection, actor: string): IStore {
  const link = (type: string) => db.from("tripletex_links").select("mcs_entity_id,tripletex_id").eq("connection_id", conn.id).eq("mcs_entity_type", type).neq("status", "inactive");
  return {
    findProjectLinkByTripletexId: async (tid) => (await link("project").eq("tripletex_id", tid).maybeSingle()).data as any,
    findCustomerLinkByTripletexId: async (tid) => (await link("customer").eq("tripletex_id", tid).eq("status", "active").maybeSingle()).data as any,
    getCustomerLinkForHub: async (id) => (await link("customer").eq("mcs_entity_id", id).maybeSingle()).data as any,
    findHubCustomersByOrg: async (org) => {
      const { data } = await db.from("customers").select("id,company_id,org_number").eq("company_id", conn.company_id).not("org_number", "is", null);
      return (data ?? []).filter((c: any) => normOrg(c.org_number) === org) as any;
    },
    getHubCustomer: async (id) => (await db.from("customers").select("id,company_id,org_number").eq("id", id).maybeSingle()).data as any,
    linkCustomer: async (hubId, c, source) => {
      const row = { connection_id: conn.id, company_id: conn.company_id, environment: conn.environment, tripletex_company_id: conn.expected_tripletex_company_id, mcs_entity_type: "customer", mcs_entity_id: hubId, tripletex_id: c.id, tripletex_number: c.customerNumber != null ? String(c.customerNumber) : null, tripletex_name: c.name ?? null, link_source: source, status: "active", created_by: actor, last_verified_at: new Date().toISOString() };
      const { data: cur } = await db.from("tripletex_links").select("id,tripletex_id").eq("connection_id", conn.id).eq("mcs_entity_type", "customer").eq("mcs_entity_id", hubId).neq("status", "inactive").maybeSingle();
      if (cur?.tripletex_id === c.id) return;
      const { error } = cur ? await db.from("tripletex_links").update(row).eq("id", cur.id) : await db.from("tripletex_links").insert(row);
      if (error) throw new GuardError("customer_link_conflict", "Kundekoblingen er i konflikt med en eksisterende kobling.");
    },
    getOp: async (k) => (await db.from("tripletex_operations").select("idempotency_key,status,attempts,error_code").eq("idempotency_key", k).maybeSingle()).data as any,
    insertOp: async (k) => { await db.from("tripletex_operations").upsert({ connection_id: conn.id, operation: "import_project", idempotency_key: k, mcs_entity_type: "project", actor }, { onConflict: "idempotency_key", ignoreDuplicates: true }); },
    claimOp: async (k, prev) => {
      const { data } = await db.from("tripletex_operations").update({ status: "running", attempts: prev + 1, actor, updated_at: new Date().toISOString() }).eq("idempotency_key", k).eq("attempts", prev).in("status", ["pending", "failed"]).select("id");
      return (data ?? []).length > 0;
    },
    updateOp: async (k, p) => { await db.from("tripletex_operations").update({ ...p, updated_at: new Date().toISOString() }).eq("idempotency_key", k); },
    createShell: async (p) => {
      const { data, error } = await db.rpc("tripletex_import_project_shell", { _connection_id: conn.id, _tripletex_id: p.ttId, _number: p.number, _name: p.name, _version: p.version, _customer_id: p.customerId, _start: p.start, _end: p.end, _actor: actor });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.event_id) throw new GuardError("import_conflict", "Kunne ikke opprette prosjektet i Hub (konflikt med eksisterende kobling).");
      return row;
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const uc = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await uc.auth.getUser(authHeader.slice(7));
  if (!user) return json({ error: "Unauthorized" }, 401);
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: isSuper } = await db.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
  if (!isSuper) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const companyId = String(body?.company_id ?? "");
  if (!UUID.test(companyId)) return json({ error: "Velg selskap først" }, 400);

  try {
    const { data: connData } = await db.from("tripletex_connections").select("*").eq("company_id", companyId).eq("environment", "test").maybeSingle();
    if (!connData) return json({ error: "Selskapet har ingen Tripletex TEST-tilkobling.", code: "no_connection" }, 422);
    const conn = connData as Connection;
    assertImportAllowed(conn, companyId);
    const store = dbStore(db, conn, user.id);

    if (action === "search") {
      const q = String(body.query ?? "").trim().slice(0, 80);
      const by = ["number", "name", "customer"].includes(body.by) ? body.by : "name";
      const closed = body.include_closed === true ? "" : "&isClosed=false";
      const s = await openSession(conn);
      let param = "";
      if (q) {
        if (by === "number") param = `&number=${encodeURIComponent(q)}`;
        else if (by === "name") param = `&name=${encodeURIComponent(q)}`;
        else {
          const cp = /^\d{9}$/.test(q.replace(/\s/g, "")) ? `organizationNumber=${q.replace(/\s/g, "")}` : `name=${encodeURIComponent(q)}`;
          const cx = await s.call("GET", `/customer?${cp}&count=10&fields=id`);
          const ids = (cx.b?.values ?? []).map((c: any) => c.id);
          if (!ids.length) return json({ results: [] });
          param = `&customerId=${ids.join(",")}`;
        }
      }
      const x = await s.call("GET", `/project?count=50${closed}${param}&fields=${FIELDS}`);
      if (!x.r.ok) throw new Error(`search ${x.r.status}`);
      const res = (x.b?.values ?? []) as TtImportProject[];
      const ids = res.map((r) => r.id);
      const { data: taken } = ids.length ? await db.from("tripletex_links").select("tripletex_id,mcs_entity_id").eq("connection_id", conn.id).eq("mcs_entity_type", "project").neq("status", "inactive").in("tripletex_id", ids) : { data: [] };
      return json({ results: res.map((r) => ({ ...r, linked_event_id: (taken ?? []).find((t: any) => t.tripletex_id === r.id)?.mcs_entity_id ?? null })) });
    }

    const tid = Number(body.tripletex_project_id);
    if (!Number.isInteger(tid) || tid <= 0) return json({ error: "Ugyldig prosjekt" }, 400);

    if (action === "preview") {
      const s = await openSession(conn);
      const p = await ttApi(s.call).getProject(tid);
      if (!p) throw new GuardError("not_found", "Fant ikke prosjektet i Tripletex.");
      const linked = await store.findProjectLinkByTripletexId(tid);
      const cd = await decideCustomer(conn, p.customer, null, store);
      const hubId = cd.kind === "linked" || cd.kind === "suggested" ? cd.hubCustomerId : null;
      const { data: hubCust } = hubId ? await db.from("customers").select("id,name,org_number").eq("id", hubId).maybeSingle() : { data: null };
      return json({ project: p, title: shellTitle(p.number, p.name), linked_event_id: linked?.mcs_entity_id ?? null, customer_decision: cd.kind, customer_reason: cd.kind === "blocked" ? cd.reason : null, hub_customer: hubCust });
    }

    if (action === "search_hub_customers") {
      const q = String(body.query ?? "").trim().slice(0, 80);
      if (q.length < 2) return json({ results: [] });
      const { data } = await db.from("customers").select("id,name,org_number").eq("company_id", conn.company_id).ilike("name", `%${q.replace(/[%_]/g, "")}%`).limit(20);
      return json({ results: data ?? [] });
    }

    if (action === "import") {
      const confirmCustomerId = typeof body.confirm_customer_id === "string" && UUID.test(body.confirm_customer_id) ? body.confirm_customer_id : null;
      const s = await openSession(conn);
      const r = await runImport({ conn, sourceCompanyId: companyId, tripletexId: tid, confirmClosed: body.confirm_closed === true, confirmCustomerId, store, tt: ttApi(s.call) });
      console.log(JSON.stringify({ fn: "tripletex-import", key: importKey(conn.id, tid), result: r.result }));
      if (r.result === "imported") {
        await db.from("activity_log").insert({ entity_type: "project", entity_id: r.event_id, action: "tripletex_project_imported", description: `Importert fra Tripletex TEST (prosjekt-ID ${tid})${r.closed ? " – avsluttet i Tripletex" : ""}`, performed_by: user.id, title: "Tripletex TEST" });
      }
      return json(r);
    }
    return json({ error: "Ukjent handling" }, 400);
  } catch (e) {
    if (e instanceof GuardError) return json({ error: e.message, code: e.code }, 422);
    console.log(JSON.stringify({ fn: "tripletex-import", action, error: e instanceof Error ? e.name : "unknown" }));
    return json({ error: "Tripletex svarte ikke som forventet. Prøv igjen.", code: "api_error" }, 502);
  }
});
