// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const company = "00000000-0000-0000-0000-000000000001";
const person = "00000000-0000-0000-0000-000000000002";
const requirement = "00000000-0000-0000-0000-000000000003";
const actor = "00000000-0000-0000-0000-000000000004";
let assessmentId = "";
const call = async (reason: string, requestId: string, revokeId: string | null = null, validUntil: string | null = null) => db.query<{ id: string }>("select public.assess_person_requirement($1,$2,$3,$4,$5,$6,$7) id", [company, person, requirement, reason, validUntil, revokeId, requestId]);
const status = async () => (await db.query<{ status: string }>("select status from public.compliance_requirement_status($1,$2)", [company, person])).rows[0]?.status;

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION public.has_company_access(uuid,uuid,text,text DEFAULT 'view') RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1='${actor}'::uuid AND $2='${company}'::uuid $$;
    CREATE TABLE public.internal_companies(id uuid PRIMARY KEY);
    CREATE TABLE public.people(id uuid PRIMARY KEY,full_name text,is_active boolean DEFAULT true);
    CREATE TABLE public.employment_profiles(id uuid PRIMARY KEY,company_id uuid,person_id uuid,department_id uuid,job_role_id uuid,archived_at timestamptz,include_in_hms_people boolean);
    CREATE TABLE public.user_accounts(person_id uuid,auth_user_id uuid,is_active boolean);
    CREATE TABLE public.compliance_competence_types(id uuid PRIMARY KEY);
    CREATE TABLE public.compliance_competence_requirements(id uuid PRIMARY KEY,company_id uuid,competence_type_id uuid,updated_at timestamptz NOT NULL DEFAULT now(),required boolean);
    CREATE TABLE public.compliance_competences(id uuid,company_id uuid,person_id uuid,competence_type_id uuid,document_id uuid,expires_at date,deleted_at timestamptz);
    CREATE TABLE public.hms_audit_log(id uuid DEFAULT gen_random_uuid(),company_id uuid,entity_type text,entity_id uuid,action text,performed_by uuid,payload jsonb);
    CREATE FUNCTION public.compliance_effective_requirements(_company_id uuid,_person_id uuid DEFAULT NULL) RETURNS TABLE(person_id uuid,competence_type_id uuid,requirement_id uuid,required boolean,document_required boolean,validity_months integer,warning_days integer,reason text,source_scope text,source_label text) LANGUAGE sql STABLE AS $$
      SELECT ep.person_id,r.competence_type_id,r.id,r.required,true,12,90,'Krav','company','Virksomhet' FROM public.employment_profiles ep JOIN public.compliance_competence_requirements r ON r.company_id=ep.company_id WHERE ep.company_id=_company_id AND (_person_id IS NULL OR ep.person_id=_person_id) AND ep.archived_at IS NULL;
    $$;
  `);
  await db.exec(readFileSync("drizzle/migrations/0060_individual_requirement_relevance.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0061_requirement_assessment_status_details.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0062_requirement_assessment_explicit_grants.sql", "utf8"));
  await db.exec(`
    INSERT INTO public.internal_companies VALUES ('${company}');
    INSERT INTO public.people(id,full_name) VALUES ('${person}','Isolert person'),('${actor}','Isolert HMS-leder');
    INSERT INTO public.compliance_competence_types VALUES ('00000000-0000-0000-0000-000000000005');
    INSERT INTO public.compliance_competence_requirements(id,company_id,competence_type_id,required) VALUES ('${requirement}','${company}','00000000-0000-0000-0000-000000000005',true);
    INSERT INTO public.employment_profiles(id,company_id,person_id,include_in_hms_people) VALUES ('00000000-0000-0000-0000-000000000006','${company}','${person}',true);
    INSERT INTO public.user_accounts VALUES ('${actor}','${actor}',true);
    SELECT set_config('test.uid','${actor}',false);
  `);
}, 30000);
afterAll(async () => { await db.close(); });

describe.sequential("Real assessment SQL in an isolated database", () => {
  it("starts with missing, leaving original requirement/competence untouched", async () => expect(await status()).toBe("missing"));
  it("rejects missing rationale", async () => await expect(call(" ", "10000000-0000-0000-0000-000000000001")).rejects.toThrow("Begrunnelse"));
  it("rejects unauthorised users", async () => {
    await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000009',false)");
    await expect(call("Begrunnelse", "10000000-0000-0000-0000-000000000002")).rejects.toThrow("Ingen tilgang");
    await db.exec(`select set_config('test.uid','${actor}',false)`);
  });
  it("rejects a past review date", async () => await expect(call("Begrunnelse", "10000000-0000-0000-0000-000000000003", null, "2000-01-01")).rejects.toThrow("passert"));
  it("creates one audited decision with server-derived actor and metadata", async () => {
    assessmentId = (await call("Dokumentert rolle-/risikovurdering", "10000000-0000-0000-0000-000000000004")).rows[0].id;
    expect(await status()).toBe("not_relevant");
    const rows = (await db.query<{ assessor_name: string; assessed_by: string; decision: string }>("select * from public.compliance_requirement_assessments")).rows;
    expect(rows).toHaveLength(1); expect(rows[0].assessor_name).toBe("Isolert HMS-leder"); expect(rows[0].assessed_by).toBe(actor);
    expect((await db.query("select * from public.hms_audit_log")).rows).toHaveLength(1);
    expect((await db.query("select * from public.compliance_requirement_status_details($1,$2)", [company, person])).rows[0]).toBeDefined();
  });
  it("retries idempotently without duplicating assessments or audit entries", async () => {
    expect((await call("Dokumentert rolle-/risikovurdering", "10000000-0000-0000-0000-000000000004")).rows[0].id).toBe(assessmentId);
    expect((await db.query("select * from public.hms_audit_log")).rows).toHaveLength(1);
  });
  it("rejects changed payload with the same request ID", async () => await expect(call("Annet innhold", "10000000-0000-0000-0000-000000000004")).rejects.toThrow("allerede brukt"));
  it("prevents mutation/deletion of assessment history", async () => {
    await expect(db.exec("update public.compliance_requirement_assessments set reason='endret'")).rejects.toThrow("kan ikke endres");
    await expect(db.exec("delete from public.compliance_requirement_assessments")).rejects.toThrow("kan ikke endres");
  });
  it("invalidates an assessment on a job-role change", async () => {
    await db.exec("update public.employment_profiles set job_role_id='00000000-0000-0000-0000-000000000010'");
    expect(await status()).toBe("missing");
    await db.exec("update public.employment_profiles set job_role_id=null");
  });
  it("invalidates an assessment on a requirement change", async () => {
    await db.exec("update public.compliance_competence_requirements set updated_at=updated_at+interval '1 second'");
    expect(await status()).toBe("missing");
    await db.exec("update public.compliance_competence_requirements set updated_at=updated_at-interval '1 second'");
  });
  it("revokes append-only, restores the missing gap, and logs the actor", async () => {
    await call("Opphevet etter ny vurdering", "10000000-0000-0000-0000-000000000005", assessmentId);
    expect(await status()).toBe("missing");
    expect((await db.query("select * from public.compliance_requirement_assessments")).rows).toHaveLength(2);
    expect((await db.query("select action from public.hms_audit_log where action='requirement.relevance_revoked'")).rows).toHaveLength(1);
    expect((await db.query<{ required: boolean }>("select required from public.compliance_competence_requirements")).rows[0].required).toBe(true);
    expect((await db.query("select * from public.compliance_competences")).rows).toHaveLength(0);
  });
  it("grants authenticated users read only, never direct assessment writes", async () => {
    const rights = (await db.query<{ write: boolean; read: boolean }>("select has_table_privilege('authenticated','public.compliance_requirement_assessments','INSERT') write, has_table_privilege('authenticated','public.compliance_requirement_assessments','SELECT') read")).rows[0];
    expect(rights).toEqual({ write: false, read: true });
  });
  it("automatically stops using an expired assessment while retaining history", async () => {
    await db.exec(`INSERT INTO public.compliance_requirement_assessments(company_id,person_id,requirement_id,competence_type_id,decision,reason,assessed_by,assessor_name,valid_until,requirement_updated_at,employment_context,client_request_id)
      SELECT company_id,person_id,requirement_id,competence_type_id,decision,'Expired isolated fixture',assessed_by,assessor_name,current_date-1,requirement_updated_at,employment_context,'10000000-0000-0000-0000-000000000006'::uuid FROM public.compliance_requirement_assessments WHERE id='${assessmentId}'`);
    expect(await status()).toBe("missing");
    expect((await db.query("select * from public.compliance_requirement_assessments")).rows).toHaveLength(3);
  });
  it("enforces company-scoped read access with RLS", async () => {
    await db.exec("GRANT USAGE ON SCHEMA auth TO authenticated; SET ROLE authenticated");
    expect((await db.query("select * from public.compliance_requirement_assessments")).rows).toHaveLength(3);
    await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000009',false)");
    expect((await db.query("select * from public.compliance_requirement_assessments")).rows).toHaveLength(0);
    await db.exec(`RESET ROLE; select set_config('test.uid','${actor}',false)`);
  });
});