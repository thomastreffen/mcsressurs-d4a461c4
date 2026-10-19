// Hub <-> Tripletex TEST project create/link. super_admin only. Never logs tokens or personal data.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { TRIPLETEX_BASE, assertAllowed, assertTripletexCompany, GuardError, type Connection } from "../_shared/tripletex-guard.ts";
import { runCreate, runLinkExisting, assertProjectWritable, createKey, type EventRow, type Store, type TtApi, type TtProject, type Link } from "../_shared/tripletex-project-core.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const reqId = (r: Response) => r.headers.get("x-tlx-request-id") || r.headers.get("x-request-id") || null;
const PROJECT_FIELDS = "id,number,name,version,customer(id,name)";
const CUSTOMER_FIELDS = "id,name,organizationNumber,customerNumber,isInactive";

async function openSession(conn: Connection) {
  const base = TRIPLETEX_BASE[conn.environment];
  if (!base || conn.environment !== "test") throw new GuardError("env_blocked", "Kun Tripletex TEST er tillatt.");
  const token = Deno.env.get(conn.secret_name);
  if (!token) throw new GuardError("not_configured", "API-nøkkelen for tilkoblingen mangler.");
  const s = await fetch(`${base}/token/session/:createFromRefreshToken`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refreshToken: token, ttlSeconds: 900 }), signal: AbortSignal.timeout(15000),
  });
  const sb: any = await s.json().catch(() => null);
  const session = sb?.value?.token;
  if (!s.ok || !session) throw new GuardError("auth_failed", "Innlogging mot Tripletex feilet.");
  const auth = "Basic " + btoa(`0:${session}`);
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, {
      method, headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
    });
    return { r, b: await r.json().catch(() => null) as any, request_id: reqId(r) };
  };
  const who = await call("GET", "/token/session/%3EwhoAmI?fields=companyId,employeeId");
  assertTripletexCompany(conn, who.b?.value?.companyId);
  return { call, employeeId: who.b?.value?.employeeId as number | undefined };
}

function ttApi(call: Awaited<ReturnType<typeof openSession>>["call"]): TtApi {
  return {
    findProjectsByNumber: async (n) => {
      const x = await call("GET", `/project?number=${encodeURIComponent(n)}&count=20&fields=${PROJECT_FIELDS}`);
      if (!x.r.ok) throw new Error(`search ${x.r.status}`);
      return (x.b?.values ?? []).filter((p: TtProject) => p.number === n);
    },
    getProject: async (id) => {
      const x = await call("GET", `/project/${id}?fields=${PROJECT_FIELDS}`);
      return x.r.ok ? x.b?.value ?? null : null;
    },
    createProject: async (body) => {
      const x = await call("POST", "/project?fields=id", body);
      return { ok: x.r.ok, status: x.r.status, id: x.b?.value?.id, request_id: x.request_id };
    },
  };
}

function dbStore(db: SupabaseClient, conn: Connection, ev: EventRow, actor: string): Store {
  const linkSel = "id,status,tripletex_id,tripletex_number,mcs_entity_id";
  const getLink = async (eventId: string) => {
    const { data } = await db.from("tripletex_links").select(linkSel).eq("connection_id", conn.id).eq("mcs_entity_type", "project")
      .eq("mcs_entity_id", eventId).neq("status", "inactive").maybeSingle();
    return (data as Link) ?? null;
  };
  return {
    getOp: async (k) => (await db.from("tripletex_operations").select("idempotency_key,status,attempts,error_code").eq("idempotency_key", k).maybeSingle()).data as any,
    insertOp: async (k) => {
      await db.from("tripletex_operations").upsert({ connection_id: conn.id, operation: "create_project", idempotency_key: k, mcs_entity_type: "project", mcs_entity_id: ev.id, actor }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    },
    claimOp: async (k, prev) => {
      const { data } = await db.from("tripletex_operations").update({ status: "running", attempts: prev + 1, actor, updated_at: new Date().toISOString() })
        .eq("idempotency_key", k).eq("attempts", prev).in("status", ["pending", "failed"]).select("id");
      return (data ?? []).length > 0;
    },
    updateOp: async (k, p) => { await db.from("tripletex_operations").update({ ...p, updated_at: new Date().toISOString() }).eq("idempotency_key", k); },
    getProjectLink: getLink,
    reserveProjectLink: async (eventId, source) => {
      const cur = await getLink(eventId);
      if (cur) {
        if (cur.status === "failed") await db.from("tripletex_links").update({ status: "pending" }).eq("id", cur.id);
        return cur;
      }
      const { data, error } = await db.from("tripletex_links").insert({
        connection_id: conn.id, company_id: conn.company_id, environment: conn.environment, tripletex_company_id: conn.expected_tripletex_company_id,
        mcs_entity_type: "project", mcs_entity_id: eventId, link_source: source, status: "pending", created_by: actor,
      }).select(linkSel).single();
      if (error) { const again = await getLink(eventId); if (again) return again; throw new Error("link_reserve_failed"); }
      return data as Link;
    },
    activateLink: async (id, p) => {
      const { error } = await db.from("tripletex_links").update({ status: "active", tripletex_id: p.id, tripletex_number: p.number, tripletex_name: p.name, tripletex_version: p.version ?? null, last_verified_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new GuardError("link_conflict", "Tripletex-prosjektet er allerede koblet i Hub.");
    },
    failLink: async (id) => { await db.from("tripletex_links").update({ status: "failed" }).eq("id", id).neq("status", "active"); },
    findActiveLinkByTripletexId: async (tid) => (await db.from("tripletex_links").select(linkSel).eq("connection_id", conn.id).eq("mcs_entity_type", "project").eq("tripletex_id", tid).eq("status", "active").maybeSingle()).data as any,
  };
}

async function logActivity(db: SupabaseClient, eventId: string, actor: string, action: string, description: string) {
  const { error } = await db.from("activity_log").insert({ entity_type: "project", entity_id: eventId, action, description, performed_by: actor, title: "Tripletex TEST" });
  if (error) console.log(JSON.stringify({ fn: "tripletex-project", activity_log_error: error.code }));
}

async function logOp(db: SupabaseClient, conn: Connection, op: string, ev: EventRow, actor: string, status: string, error_code: string | null = null) {
  await db.from("tripletex_operations").insert({ connection_id: conn.id, operation: op, idempotency_key: `${op}:${conn.id}:${ev.id}:${Date.now()}`, mcs_entity_type: "project", mcs_entity_id: ev.id, status, error_code, actor, attempts: 1 });
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
  const eventId = typeof body?.event_id === "string" ? body.event_id : "";
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return json({ error: "event_id mangler" }, 400);

  try {
    const { data: evData } = await db.from("events").select("id,company_id,entity_type,project_number,title,start_time,customer_id").eq("id", eventId).maybeSingle();
    if (!evData) return json({ error: "Fant ikke prosjektet" }, 404);
    const ev = evData as EventRow;
    const { data: connData } = await db.from("tripletex_connections").select("*").eq("company_id", ev.company_id).eq("environment", "test").maybeSingle();
    const conn = connData as Connection | null;

    const { data: projLink } = conn ? await db.from("tripletex_links").select("id,status,tripletex_id,tripletex_number,tripletex_name,last_verified_at,link_source").eq("connection_id", conn.id).eq("mcs_entity_type", "project").eq("mcs_entity_id", ev.id).neq("status", "inactive").maybeSingle() : { data: null };
    const { data: cust } = ev.customer_id ? await db.from("customers").select("id,name,org_number,company_id").eq("id", ev.customer_id).maybeSingle() : { data: null };
    const { data: custLink } = conn && cust ? await db.from("tripletex_links").select("id,status,tripletex_id,tripletex_number,tripletex_name").eq("connection_id", conn.id).eq("mcs_entity_type", "customer").eq("mcs_entity_id", cust.id).eq("status", "active").maybeSingle() : { data: null };
    const { data: lastOp } = await db.from("tripletex_operations").select("operation,status,error_code,attempts,http_status,updated_at").eq("mcs_entity_id", ev.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();

    if (action === "status") {
      return json({ entity_type: ev.entity_type, connection: conn ? { id: conn.id, environment: conn.environment, mode: conn.mode, capabilities: conn.capabilities, tripletex_company_id: conn.expected_tripletex_company_id } : null, project_link: projLink, customer: cust ? { id: cust.id, name: cust.name, org_number: cust.org_number } : null, customer_link: custLink, last_operation: lastOp });
    }
    if (!conn) throw new GuardError("no_connection", "Selskapet har ingen Tripletex TEST-tilkobling.");
    if (ev.entity_type !== "financial_project") throw new GuardError("not_financial", "Kun bekreftede økonomiske prosjekter kan kobles til Tripletex.");
    assertAllowed(conn, { sourceCompanyId: ev.company_id ?? "__none__", capability: "projects_read" });

    // --- read-only preview ---
    if (action === "preview") {
      const s = await openSession(conn); const tt = ttApi(s.call);
      const number = ev.project_number?.trim() || null;
      const existing = number ? await tt.findProjectsByNumber(number) : [];
      let suggestions: unknown[] = [];
      if (!custLink && cust?.org_number) {
        const org = cust.org_number.replace(/\s/g, "");
        const x = await s.call("GET", `/customer?organizationNumber=${encodeURIComponent(org)}&count=10&fields=${CUSTOMER_FIELDS}`);
        suggestions = (x.b?.values ?? []).filter((c: any) => (c.organizationNumber ?? "").replace(/\s/g, "") === org);
      }
      let pm: { id: number; name: string } | null = null;
      if (s.employeeId) {
        const e = await s.call("GET", `/employee/${s.employeeId}?fields=id,firstName,lastName`);
        pm = { id: s.employeeId, name: [e.b?.value?.firstName, e.b?.value?.lastName].filter(Boolean).join(" ") || "API-testbruker" };
      }
      const { data: profile } = await db.from("planning_projects").select("billing_model,contract_form").eq("financial_project_id", ev.id).is("deleted_at", null).maybeSingle();
      const { data: company } = await db.from("internal_companies").select("name").eq("id", conn.company_id).maybeSingle();
      return json({
        company: company?.name, number, name: ev.title, start_date: ev.start_time?.slice(0, 10) ?? null,
        billing_model: profile?.billing_model ?? null, customer: cust ? { name: cust.name, org_number: cust.org_number } : null,
        customer_link: custLink, customer_suggestions: suggestions, existing_projects: existing, pm_fallback: pm,
        connection: { environment: conn.environment, mode: conn.mode, tripletex_company_id: conn.expected_tripletex_company_id },
      });
    }
    if (action === "search_customers") {
      assertAllowed(conn, { sourceCompanyId: ev.company_id!, capability: "customers_read" });
      const q = String(body.query ?? "").trim().slice(0, 80);
      if (q.length < 2) return json({ results: [] });
      const s = await openSession(conn);
      const param = /^\d{9}$/.test(q.replace(/\s/g, "")) ? `organizationNumber=${q.replace(/\s/g, "")}` : /^\d+$/.test(q) ? `customerNumber=${q}` : `name=${encodeURIComponent(q)}`;
      const x = await s.call("GET", `/customer?${param}&count=20&fields=${CUSTOMER_FIELDS}`);
      return json({ results: x.b?.values ?? [] });
    }
    if (action === "search_projects") {
      const q = String(body.query ?? ev.project_number ?? "").trim().slice(0, 80);
      const s = await openSession(conn);
      const param = /^\d+$/.test(q) ? `number=${q}` : `name=${encodeURIComponent(q)}`;
      const x = await s.call("GET", `/project?${param}&count=20&fields=${PROJECT_FIELDS}`);
      const results = (x.b?.values ?? []) as TtProject[];
      const ids = results.map((r) => r.id);
      const { data: taken } = ids.length ? await db.from("tripletex_links").select("tripletex_id,mcs_entity_id").eq("connection_id", conn.id).eq("mcs_entity_type", "project").eq("status", "active").in("tripletex_id", ids) : { data: [] };
      return json({ results: results.map((r) => ({ ...r, linked_to: (taken ?? []).find((t: any) => t.tripletex_id === r.id)?.mcs_entity_id ?? null })) });
    }

    // --- writes (all re-check write mode + capability) ---
    assertProjectWritable(conn, ev, { capability: "projects_write" });

    if (action === "link_customer") {
      if (!cust || cust.company_id !== conn.company_id) throw new GuardError("customer_company", "Kunden tilhører ikke samme Hub-selskap.");
      const tid = Number(body.tripletex_customer_id);
      if (!Number.isInteger(tid) || tid <= 0) return json({ error: "Ugyldig kunde" }, 400);
      const s = await openSession(conn);
      const x = await s.call("GET", `/customer/${tid}?fields=${CUSTOMER_FIELDS}`);
      const tc = x.b?.value;
      if (!x.r.ok || !tc) throw new GuardError("not_found", "Fant ikke kunden i Tripletex.");
      const { data: taken } = await db.from("tripletex_links").select("mcs_entity_id").eq("connection_id", conn.id).eq("mcs_entity_type", "customer").eq("tripletex_id", tid).eq("status", "active").maybeSingle();
      if (taken && taken.mcs_entity_id !== cust.id) throw new GuardError("already_linked_elsewhere", "Tripletex-kunden er allerede koblet til en annen Hub-kunde.");
      const orgMatch = !!cust.org_number && (tc.organizationNumber ?? "").replace(/\s/g, "") === cust.org_number.replace(/\s/g, "");
      const row = { connection_id: conn.id, company_id: conn.company_id, environment: conn.environment, tripletex_company_id: conn.expected_tripletex_company_id, mcs_entity_type: "customer", mcs_entity_id: cust.id, tripletex_id: tc.id, tripletex_number: tc.customerNumber != null ? String(tc.customerNumber) : null, tripletex_name: tc.name, link_source: orgMatch ? "auto_match" : "manual", status: "active", created_by: user.id, last_verified_at: new Date().toISOString() };
      const { data: cur } = await db.from("tripletex_links").select("id").eq("connection_id", conn.id).eq("mcs_entity_type", "customer").eq("mcs_entity_id", cust.id).neq("status", "inactive").maybeSingle();
      const { error } = cur ? await db.from("tripletex_links").update(row).eq("id", cur.id) : await db.from("tripletex_links").insert(row);
      if (error) throw new GuardError("link_conflict", "Kunne ikke lagre kundekoblingen.");
      await logOp(db, conn, "link_customer", ev, user.id, "succeeded");
      await logActivity(db, ev.id, user.id, "tripletex_customer_linked", `Kunde koblet til Tripletex TEST (ID ${tc.id})`);
      return json({ result: "linked", tripletex_id: tc.id });
    }

    if (action === "create") {
      if (body.confirm_pm_fallback !== true) throw new GuardError("pm_unconfirmed", "Bekreft prosjektleder (testbruker) før opprettelse.");
      const s = await openSession(conn);
      const r = await runCreate({ conn, ev, customerTtId: custLink?.tripletex_id ?? null, pmId: s.employeeId ?? null, name: (ev.project_number && ev.title.startsWith(ev.project_number + " ")) ? ev.title.slice(ev.project_number.length + 1).trim() : ev.title, store: dbStore(db, conn, ev, user.id), tt: ttApi(s.call) });
      console.log(JSON.stringify({ fn: "tripletex-project", action, key: createKey(conn.id, ev.id), result: r.result }));
      if (r.result === "created" || r.result === "adopted") await logActivity(db, ev.id, user.id, "tripletex_project_created", `Prosjekt ${r.number} opprettet i Tripletex TEST (ID ${r.tripletex_id})`);
      return json(r);
    }

    if (action === "link_project") {
      const tid = Number(body.tripletex_project_id);
      if (!Number.isInteger(tid) || tid <= 0) return json({ error: "Ugyldig prosjekt" }, 400);
      const s = await openSession(conn);
      try {
        const r = await runLinkExisting({ conn, ev, tripletexId: tid, store: dbStore(db, conn, ev, user.id), tt: ttApi(s.call) });
        await logOp(db, conn, "link_project", ev, user.id, "succeeded");
        await logActivity(db, ev.id, user.id, "tripletex_project_linked", `Koblet til Tripletex TEST-prosjekt ${r.number} (ID ${r.tripletex_id})`);
        return json(r);
      } catch (e) {
        await logOp(db, conn, "link_project", ev, user.id, "failed", e instanceof GuardError ? e.code : "error");
        throw e;
      }
    }
    return json({ error: "Ukjent handling" }, 400);
  } catch (e) {
    if (e instanceof GuardError) return json({ error: e.message, code: e.code }, 422);
    console.log(JSON.stringify({ fn: "tripletex-project", action, error: e instanceof Error ? e.name : "unknown" }));
    return json({ error: "Tripletex svarte ikke som forventet. Prøv igjen.", code: "api_error" }, 502);
  }
});
