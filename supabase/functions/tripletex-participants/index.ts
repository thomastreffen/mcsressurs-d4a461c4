// TPX-F3: Hub technician -> Tripletex TEST employee link and project participant. super_admin only, TEST only.
// Resource-plan source: event_technicians (event_id -> technicians.id). No calendar writes to Tripletex.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { assertAllowed, GuardError, type Connection } from "../_shared/tripletex-guard.ts";
import { openSession, type TtCall } from "../_shared/tripletex-session.ts";
import { runAddParticipant, runLinkEmployee, resolveFinancialProject, assertChain, participantKey, type JobRow, type PStore, type PTtApi, type Link } from "../_shared/tripletex-participant-core.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const EMP_FIELDS = "id,firstName,lastName,employeeNumber,email,version";
const UUID = /^[0-9a-f-]{36}$/;

function ttApi(call: TtCall): PTtApi {
  return {
    getEmployee: async (id) => { const x = await call("GET", `/employee/${id}?fields=${EMP_FIELDS}`); return x.r.ok ? x.b?.value ?? null : null; },
    listParticipantEmployeeIds: async (pid) => {
      const x = await call("GET", `/project/${pid}?fields=id,participants(id,employee(id))`);
      if (!x.r.ok) throw new Error(`participants ${x.r.status}`);
      return (x.b?.value?.participants ?? []).map((p: any) => p?.employee?.id).filter(Boolean);
    },
    addParticipant: async (body) => { const x = await call("POST", "/project/participant?fields=id", body); return { ok: x.r.ok, status: x.r.status, id: x.b?.value?.id, request_id: x.request_id }; },
  };
}

function dbStore(db: SupabaseClient, conn: Connection, actor: string): PStore {
  const sel = "id,status,tripletex_id,tripletex_number,mcs_entity_id";
  const getLink = async (type: string, id: string) => (await db.from("tripletex_links").select(sel).eq("connection_id", conn.id).eq("mcs_entity_type", type).eq("mcs_entity_id", id).neq("status", "inactive").maybeSingle()).data as Link | null;
  return {
    getOp: async (k) => (await db.from("tripletex_operations").select("idempotency_key,status,attempts,error_code").eq("idempotency_key", k).maybeSingle()).data as any,
    insertOp: async (k, op, t, id) => { await db.from("tripletex_operations").upsert({ connection_id: conn.id, operation: op, idempotency_key: k, mcs_entity_type: t, mcs_entity_id: id, actor }, { onConflict: "idempotency_key", ignoreDuplicates: true }); },
    claimOp: async (k, prev) => {
      const { data } = await db.from("tripletex_operations").update({ status: "running", attempts: prev + 1, actor, updated_at: new Date().toISOString() }).eq("idempotency_key", k).eq("attempts", prev).in("status", ["pending", "failed"]).select("id");
      return (data ?? []).length > 0;
    },
    updateOp: async (k, p) => { await db.from("tripletex_operations").update({ ...p, updated_at: new Date().toISOString() }).eq("idempotency_key", k); },
    getLink: getLink as any,
    findActiveByTripletexId: async (type, tid) => (await db.from("tripletex_links").select(sel).eq("connection_id", conn.id).eq("mcs_entity_type", type).eq("tripletex_id", tid).eq("status", "active").maybeSingle()).data as any,
    saveEmployeeLink: async (techId, e) => {
      const row = { connection_id: conn.id, company_id: conn.company_id, environment: conn.environment, tripletex_company_id: conn.expected_tripletex_company_id, mcs_entity_type: "employee", mcs_entity_id: techId, tripletex_id: e.id, tripletex_number: e.employeeNumber ?? null, tripletex_name: [e.firstName, e.lastName].filter(Boolean).join(" ") || null, tripletex_version: e.version ?? null, link_source: "manual", status: "active", created_by: actor, last_verified_at: new Date().toISOString() };
      const cur = await getLink("employee", techId);
      const { error } = cur ? await db.from("tripletex_links").update(row).eq("id", cur.id) : await db.from("tripletex_links").insert(row);
      if (error) throw new GuardError("link_conflict", "Koblingen er i konflikt med en eksisterende ansattkobling.");
    },
  };
}

async function activity(db: SupabaseClient, eventId: string, actor: string, action: string, description: string) {
  const { error } = await db.from("activity_log").insert({ entity_type: "project", entity_id: eventId, action, description, performed_by: actor, title: "Tripletex TEST" });
  if (error) console.log(JSON.stringify({ fn: "tripletex-participants", activity_log_error: error.code }));
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
  const eventId = String(body?.event_id ?? "");
  if (!UUID.test(eventId)) return json({ error: "event_id mangler" }, 400);
  const techId = typeof body?.technician_id === "string" && UUID.test(body.technician_id) ? body.technician_id : null;

  try {
    const evSel = "id,company_id,entity_type,parent_project_id,project_number";
    const { data: job } = await db.from("events").select(evSel).eq("id", eventId).maybeSingle();
    if (!job) return json({ error: "Fant ikke jobben" }, 404);
    const { data: parent } = job.parent_project_id ? await db.from("events").select(evSel).eq("id", job.parent_project_id).maybeSingle() : { data: null };
    let fp: JobRow;
    try { fp = resolveFinancialProject(job as JobRow, parent as JobRow | null); } catch { return json({ relevant: false }); }
    const { data: connData } = await db.from("tripletex_connections").select("*").eq("company_id", job.company_id).eq("environment", "test").maybeSingle();
    const conn = connData as Connection | null;
    if (!conn) return json({ relevant: false });
    const store = dbStore(db, conn, user.id);
    const { data: assigns } = await db.from("event_technicians").select("technician_id, technicians(id,name,email,deleted_at)").eq("event_id", job.id);
    const techs = (assigns ?? []).map((a: any) => a.technicians).filter((t: any) => t && !t.deleted_at);
    const companiesOf = async (id: string) => ((await db.from("employment_profiles").select("company_id").eq("person_id", id).is("archived_at", null)).data ?? []).map((r: any) => r.company_id);

    if (action === "status") {
      const pl = await store.getLink("project", fp.id);
      let participants: number[] | null = null;
      if (pl?.status === "active" && pl.tripletex_id) {
        try { const s = await openSession(conn); participants = await ttApi(s.call).listParticipantEmployeeIds(pl.tripletex_id); } catch { participants = null; }
      }
      const rows = [];
      for (const t of techs) {
        const el = await store.getLink("employee", t.id);
        const op = el?.tripletex_id && pl?.tripletex_id ? await store.getOp(participantKey(conn.id, pl.tripletex_id, el.tripletex_id)) : null;
        const isP = !!(el?.tripletex_id && participants?.includes(el.tripletex_id));
        const sameCompany = (await companiesOf(t.id)).includes(conn.company_id);
        const state = !sameCompany ? "wrong_company" : el?.status !== "active" ? "not_linked" : isP ? "participant" : op?.status === "failed" ? "error" : "ready";
        rows.push({ technician_id: t.id, name: t.name, email: t.email, state, employee_link: el?.status === "active" ? { tripletex_id: el.tripletex_id, number: el.tripletex_number } : null, last_error: op?.status === "failed" ? op.error_code : null });
      }
      return json({ relevant: true, is_self: fp.id === job.id, financial_project: { id: fp.id, project_number: fp.project_number }, project_link: pl?.status === "active" ? { tripletex_id: pl.tripletex_id, number: pl.tripletex_number } : null, participants_known: participants !== null, technicians: rows, connection: { mode: conn.mode, capabilities: conn.capabilities } });
    }

    if (!techId || !techs.some((t: any) => t.id === techId)) throw new GuardError("not_assigned", "Montøren er ikke tildelt denne jobben i ressursplanen.");
    const techCompanies = await companiesOf(techId);

    if (action === "search_employees") {
      assertAllowed(conn, { capability: "employees_read" });
      assertChain(conn, job as JobRow, fp, techCompanies, { write: false, capability: "employees_read" });
      const q = String(body.query ?? "").trim().slice(0, 80);
      if (q.length < 2) return json({ results: [] });
      const param = q.includes("@") ? `email=${encodeURIComponent(q)}` : /^\d+$/.test(q) ? `employeeNumber=${q}` : (() => { const [f, ...l] = q.split(/\s+/); return `firstName=${encodeURIComponent(f)}${l.length ? `&lastName=${encodeURIComponent(l.join(" "))}` : ""}`; })();
      const s = await openSession(conn);
      const x = await s.call("GET", `/employee?${param}&count=20&fields=${EMP_FIELDS}`);
      const results = (x.b?.values ?? []) as any[];
      const ids = results.map((r) => r.id);
      const { data: taken } = ids.length ? await db.from("tripletex_links").select("tripletex_id,mcs_entity_id").eq("connection_id", conn.id).eq("mcs_entity_type", "employee").eq("status", "active").in("tripletex_id", ids) : { data: [] };
      return json({ results: results.map((r) => ({ ...r, linked_to: (taken ?? []).find((t: any) => t.tripletex_id === r.id)?.mcs_entity_id ?? null })) });
    }

    if (action === "link_employee") {
      const tid = Number(body.tripletex_employee_id);
      if (!Number.isInteger(tid) || tid <= 0) return json({ error: "Ugyldig ansatt" }, 400);
      assertChain(conn, job as JobRow, fp, techCompanies, { write: true, capability: "employees_read" });
      const s = await openSession(conn);
      const r = await runLinkEmployee({ conn, technicianId: techId, technicianCompanyIds: techCompanies, tripletexEmployeeId: tid, store, tt: ttApi(s.call) });
      await db.from("tripletex_operations").insert({ connection_id: conn.id, operation: "link_employee", idempotency_key: `link_employee:${conn.id}:${techId}:${Date.now()}`, mcs_entity_type: "employee", mcs_entity_id: techId, status: "succeeded", actor: user.id, attempts: 1 });
      if (r.result === "linked") await activity(db, job.id, user.id, "tripletex_employee_linked", `Montør koblet til Tripletex TEST-ansatt ID ${tid}`);
      return json(r);
    }

    if (action === "add_participant") {
      const s = await openSession(conn);
      const r = await runAddParticipant({ conn, job: job as JobRow, parent: parent as JobRow | null, technicianId: techId, assigned: true, technicianCompanyIds: techCompanies, store, tt: ttApi(s.call) });
      console.log(JSON.stringify({ fn: "tripletex-participants", action, result: r.result }));
      if (r.result === "added") await activity(db, job.id, user.id, "tripletex_participant_added", `Tripletex TEST-ansatt ${r.tripletex_employee_id} lagt til som deltaker på prosjekt ${fp.project_number ?? r.tripletex_project_id}`);
      return json(r);
    }
    return json({ error: "Ukjent handling" }, 400);
  } catch (e) {
    if (e instanceof GuardError) return json({ error: e.message, code: e.code }, 422);
    console.log(JSON.stringify({ fn: "tripletex-participants", action, error: e instanceof Error ? e.name : "unknown" }));
    return json({ error: "Tripletex svarte ikke som forventet. Prøv igjen.", code: "api_error" }, 502);
  }
});
