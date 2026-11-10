// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, existsSync } from "node:fs";

// Isolated Postgres only: no real jobs, technicians, notifications, emails or Tripletex.
const SERVICE = "00000000-0000-0000-0000-00000000000a";
const BUSBAR = "00000000-0000-0000-0000-00000000000b";
const TECH = "10000000-0000-0000-0000-000000000001";
const ADMIN = "10000000-0000-0000-0000-000000000002"; // company admin, not approver
const INSTALLER = "10000000-0000-0000-0000-000000000003"; // explicit exception approver
const SUPER = "10000000-0000-0000-0000-000000000004";
const BB_ADMIN = "10000000-0000-0000-0000-000000000005";
const JOB = "20000000-0000-0000-0000-000000000001";
const JOB2 = "20000000-0000-0000-0000-000000000002";
const BB_JOB = "20000000-0000-0000-0000-000000000003";
const LEGACY_JOB = "20000000-0000-0000-0000-000000000004";
const T_SJA = "30000000-0000-0000-0000-000000000001";
const T_RAPPORT = "30000000-0000-0000-0000-000000000002";
const T_DRAFT = "30000000-0000-0000-0000-000000000003";
const T_ALT = "30000000-0000-0000-0000-000000000004";

let db: PGlite;
const findMigration = (key: string, fallback: string) => {
  const f = readdirSync("drizzle/migrations").find((n) => n.includes(key));
  const p = f ? `drizzle/migrations/${f}` : fallback;
  if (!existsSync(p)) throw new Error(`missing ${key}`);
  return readFileSync(p, "utf8").replace(/--> statement-breakpoint/g, "");
};
const docSql = () => findMigration("doc_requirement_matrix", "/tmp/doc_mig.sql");
async function as(user: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',true)`);
    return tx.query<any>(sql, params);
  });
}
const rpc = async (user: string, fn: string, args: string, params: unknown[] = []) =>
  (await as(user, `SELECT public.${fn}(${args}) AS r`, params)).rows[0].r;

let catService = ""; let catBefaring = "";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE TABLE memberships(user_id uuid, company_id uuid); CREATE TABLE admins(user_id uuid, company_id uuid); CREATE TABLE members(user_id uuid, project_id uuid);
    INSERT INTO memberships VALUES ('${TECH}','${SERVICE}'),('${ADMIN}','${SERVICE}'),('${INSTALLER}','${SERVICE}'),('${BB_ADMIN}','${BUSBAR}');
    INSERT INTO admins VALUES ('${ADMIN}','${SERVICE}'),('${BB_ADMIN}','${BUSBAR}');
    INSERT INTO members VALUES ('${TECH}','${JOB}');
    CREATE FUNCTION user_has_company_access(_auth_user_id uuid,_company_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.memberships WHERE user_id=_auth_user_id AND company_id=_company_id) $$;
    CREATE FUNCTION legacy_admin_in_company(_company uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.admins WHERE user_id=auth.uid() AND company_id=_company) $$;
    CREATE FUNCTION is_project_member(_auth_user_id uuid,_project_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.members WHERE user_id=_auth_user_id AND project_id=_project_id) $$;
    CREATE FUNCTION is_global_superadmin(_auth_user_id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT _auth_user_id='${SUPER}'::uuid $$;
    CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid, status text DEFAULT 'scheduled', project_type text, deleted_at timestamptz, updated_count int DEFAULT 0);
    CREATE FUNCTION events_touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_count := OLD.updated_count + 1; RETURN NEW; END $$;
    CREATE TRIGGER events_touch BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION events_touch();
    INSERT INTO events(id,company_id) VALUES ('${JOB}','${SERVICE}'),('${JOB2}','${SERVICE}'),('${BB_JOB}','${BUSBAR}'),('${LEGACY_JOB}','${SERVICE}');
    CREATE TABLE form_templates(id uuid PRIMARY KEY, title text, active_version_id uuid, company_id uuid, deleted_at timestamptz, archived_at timestamptz,
      is_active boolean DEFAULT true, available_in_projects boolean DEFAULT true, required_before_completion boolean DEFAULT false,
      required_before_billing boolean DEFAULT false, required_for_job_types text[] DEFAULT '{}');
    CREATE TABLE form_template_versions(id uuid PRIMARY KEY, template_id uuid, fields jsonb, rules jsonb DEFAULT '[]');
    CREATE TABLE form_instances(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid NOT NULL, version_id uuid NOT NULL, project_id uuid,
      activity_id uuid, status text NOT NULL DEFAULT 'not_started', assigned_to uuid, answers jsonb NOT NULL DEFAULT '{}', locked_at timestamptz,
      locked_by uuid, unlock_reason text, company_id uuid, created_by uuid NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE form_signatures(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid NOT NULL, signer_name text NOT NULL, signer_role text,
      signature_data text NOT NULL, signed_at timestamptz DEFAULT now(), ip_address text);
    GRANT SELECT,INSERT,UPDATE,DELETE ON form_instances, form_signatures TO authenticated; GRANT SELECT ON form_templates, form_template_versions, events TO authenticated;
    ALTER TABLE form_instances ENABLE ROW LEVEL SECURITY; ALTER TABLE form_signatures ENABLE ROW LEVEL SECURITY;
    CREATE POLICY sel ON form_instances FOR SELECT TO authenticated USING (true);
    INSERT INTO form_template_versions VALUES ('31000000-0000-0000-0000-000000000001','${T_SJA}','[{"id":"y","type":"checkbox_yes_no","label":"Risiko vurdert","required":true}]'),
      ('31000000-0000-0000-0000-000000000002','${T_RAPPORT}','[{"id":"t","type":"textarea","label":"Funn","required":true}]'),
      ('31000000-0000-0000-0000-000000000004','${T_ALT}','[]');
    INSERT INTO form_templates(id,title,active_version_id,company_id) VALUES ('${T_SJA}','SJA','31000000-0000-0000-0000-000000000001','${SERVICE}'),
      ('${T_RAPPORT}','Servicerapport','31000000-0000-0000-0000-000000000002','${SERVICE}'),
      ('${T_DRAFT}','Utkast uten versjon',null,null),
      ('${T_ALT}','Alternativ risikovurdering','31000000-0000-0000-0000-000000000004','${SERVICE}');`);
  await db.exec(findMigration("form_server_validation", "/tmp/form_mig.sql"));
  // Legacy signed form on a job before any requirement matrix existed.
  await db.exec(`INSERT INTO form_instances(template_id,version_id,project_id,company_id,created_by,status,locked_at)
    VALUES ('${T_RAPPORT}','31000000-0000-0000-0000-000000000002','${LEGACY_JOB}','${SERVICE}','${TECH}','signed',now())`);
  await db.exec(docSql());
});
afterAll(async () => { await db?.close(); });

describe("documentation requirement matrix (A1.5)", () => {
  it("existing jobs are untouched: no categories = company_not_configured, enforcement off", async () => {
    const p = await rpc(ADMIN, "get_job_doc_progress", `'${LEGACY_JOB}'`);
    expect(p).toMatchObject({ state: "company_not_configured", enforcement_enabled: false, invoice_ready: false, approval_status: "not_available", documentation_status: null });
    expect((await as(ADMIN, `SELECT status, locked_at IS NOT NULL l FROM form_instances WHERE project_id='${LEGACY_JOB}'`)).rows[0]).toEqual({ status: "signed", l: true });
  });

  it("company admin creates categories and draft rules; technician and BusBar cannot", async () => {
    catService = (await as(ADMIN, `INSERT INTO doc_job_categories(company_id,name) VALUES ('${SERVICE}','Service / feilsøking') RETURNING id`)).rows[0].id;
    catBefaring = (await as(ADMIN, `INSERT INTO doc_job_categories(company_id,name) VALUES ('${SERVICE}','Befaring / inspeksjon') RETURNING id`)).rows[0].id;
    await expect(as(TECH, `INSERT INTO doc_job_categories(company_id,name) VALUES ('${SERVICE}','Hack')`)).rejects.toThrow(/row-level/);
    await expect(as(BB_ADMIN, `INSERT INTO doc_requirement_rules(company_id,category_id,kind,label) VALUES ('${BUSBAR}','${catService}','risk_assessment','x')`)).rejects.toThrow(/doc_company_mismatch/);
    await as(ADMIN, `INSERT INTO doc_requirement_rules(company_id,category_id,kind,label,template_id,approved_at) VALUES
      ('${SERVICE}','${catService}','risk_assessment','Risikovurdering','${T_SJA}',now()),
      ('${SERVICE}','${catService}','closing_documentation','Servicerapport','${T_RAPPORT}',null),
      ('${SERVICE}','${catBefaring}','risk_assessment','Kort risikovurdering','${T_DRAFT}',null)`);
    const rows = (await as(ADMIN, `SELECT approved_at FROM doc_requirement_rules`)).rows;
    expect(rows.every((r: any) => r.approved_at === null)).toBe(true); // no auto-approved defaults
    expect((await as(BB_ADMIN, `SELECT count(*)::int c FROM doc_requirement_rules`)).rows[0].c).toBe(0);
  });

  it("job without category needs clarification; unapproved rules = must be configured", async () => {
    expect((await rpc(ADMIN, "get_job_doc_progress", `'${JOB}'`)).state).toBe("needs_clarification");
    await rpc(ADMIN, "set_job_doc_category", `'${JOB}','${catService}','{}'`);
    expect((await rpc(ADMIN, "get_job_doc_progress", `'${JOB}'`)).state).toBe("requirements_must_be_configured");
    await expect(rpc(ADMIN, "snapshot_job_doc_requirements", `'${JOB}'`)).rejects.toThrow(/doc_requirements_must_be_configured/);
    expect((await as(ADMIN, `SELECT updated_count FROM events WHERE id='${JOB}'`)).rows[0].updated_count).toBe(0); // events never written
  });

  it("only explicit approver or superadmin approves rules; template must have an active version", async () => {
    await expect(rpc(ADMIN, "approve_doc_rule", `(SELECT id FROM doc_requirement_rules WHERE label='Risikovurdering')`)).rejects.toThrow(/doc_access_denied/);
    await expect(rpc(ADMIN, "set_doc_exception_approver", `'${SERVICE}','${INSTALLER}',true`)).rejects.toThrow(/doc_access_denied/);
    await rpc(SUPER, "set_doc_exception_approver", `'${SERVICE}','${INSTALLER}',true`);
    await rpc(INSTALLER, "approve_doc_rule", `(SELECT id FROM doc_requirement_rules WHERE label='Risikovurdering')`);
    await rpc(INSTALLER, "approve_doc_rule", `(SELECT id FROM doc_requirement_rules WHERE label='Servicerapport')`);
    await expect(rpc(INSTALLER, "approve_doc_rule", `(SELECT id FROM doc_requirement_rules WHERE label='Kort risikovurdering')`)).rejects.toThrow(/doc_template_not_ready/);
    await expect(as(ADMIN, `UPDATE doc_requirement_rules SET approved_at=now() WHERE label='Kort risikovurdering'`)).rejects.toThrow(/doc_approval_requires_rpc/);
    expect((await rpc(ADMIN, "get_job_doc_progress", `'${JOB}'`)).state).toBe("not_snapshotted");
  });

  it("snapshot is idempotent and later rule edits do not apply retroactively", async () => {
    expect(await rpc(ADMIN, "snapshot_job_doc_requirements", `'${JOB}'`)).toMatchObject({ added: 2, rules_version: 2 });
    expect((await rpc(ADMIN, "snapshot_job_doc_requirements", `'${JOB}'`)).added).toBe(0);
    await as(ADMIN, `UPDATE doc_requirement_rules SET label='Endret rapport' WHERE label='Servicerapport'`);
    const p = await rpc(TECH, "get_job_doc_progress", `'${JOB}'`);
    expect(p.state).toBe("active");
    expect(p.steps.map((s: any) => [s.kind, s.label, s.status])).toEqual([
      ["risk_assessment", "Risikovurdering", "missing"], ["closing_documentation", "Servicerapport", "missing"]]);
    expect((await as(ADMIN, `SELECT approved_at FROM doc_requirement_rules WHERE label='Endret rapport'`)).rows[0].approved_at).toBeNull();
    expect(p.documentation_status).toBe("pending");
  });

  it("start_requirement_form never duplicates forms; delivery requires server validation", async () => {
    const p = await rpc(TECH, "get_job_doc_progress", `'${JOB}'`);
    const req = p.steps[0].requirement_id;
    const a = await rpc(TECH, "start_requirement_form", `'${req}'`);
    const b = await rpc(TECH, "start_requirement_form", `'${req}'`);
    expect(a).toBe(b);
    expect((await as(TECH, `SELECT count(*)::int c FROM form_instances WHERE project_id='${JOB}'`)).rows[0].c).toBe(1);
    expect((await rpc(TECH, "get_job_doc_progress", `'${JOB}'`)).steps[0].status).toBe("in_progress");
    await rpc(TECH, "save_form_answers", `'${a}',$1::jsonb,0`, [JSON.stringify({ y: "yes" })]);
    expect((await rpc(TECH, "complete_form_instance", `'${a}',1`)).ok).toBe(true);
    expect((await rpc(TECH, "get_job_doc_progress", `'${JOB}'`)).steps[0].status).toBe("delivered");
  });

  it("basis categories cannot be waived; technician may request substitute; only another approver decides", async () => {
    const p = await rpc(TECH, "get_job_doc_progress", `'${JOB}'`);
    const closing = p.steps[1].requirement_id;
    await expect(rpc(TECH, "request_doc_exception", `'${closing}','not_relevant','Ikke relevant for denne jobben',null`)).rejects.toThrow(/doc_basis_requirement_cannot_be_waived/);
    await expect(rpc(TECH, "request_doc_exception", `'${closing}','substitute','kort',$1`, [T_ALT])).rejects.toThrow(/doc_invalid_reason/);
    const x = await rpc(TECH, "request_doc_exception", `'${closing}','substitute','Kunden krever eget rapportformat',$1`, [T_ALT]);
    expect((await rpc(TECH, "get_job_doc_progress", `'${JOB}'`)).steps[1]).toMatchObject({ status: "missing", exception_requested: true });
    await expect(rpc(ADMIN, "decide_doc_exception", `'${x}',true,null`)).rejects.toThrow(/doc_access_denied/);
    await expect(rpc(SUPER, "decide_doc_exception", `'${x}',true,null`)).rejects.toThrow(/doc_access_denied/);
    await rpc(INSTALLER, "decide_doc_exception", `'${x}',true,'OK'`);
    const after = (await rpc(TECH, "get_job_doc_progress", `'${JOB}'`)).steps[1];
    expect(after).toMatchObject({ requirement_status: "substituted", template_id: T_ALT, status: "missing" }); // still must deliver equivalent doc
    const audit = (await as(ADMIN, `SELECT action FROM doc_audit_log WHERE entity='exception' ORDER BY created_at`)).rows.map((r: any) => r.action);
    expect(audit).toEqual(["requested", "approved"]);
  });

  it("approver cannot approve own request", async () => {
    await as(ADMIN, `INSERT INTO doc_requirement_rules(company_id,category_id,kind,label,template_id) VALUES ('${SERVICE}','${catService}','additional','Bilder','${T_ALT}')`);
    await rpc(INSTALLER, "approve_doc_rule", `(SELECT id FROM doc_requirement_rules WHERE label='Bilder')`);
    await rpc(ADMIN, "set_job_doc_category", `'${JOB2}','${catService}','{}'`);
    await rpc(ADMIN, "snapshot_job_doc_requirements", `'${JOB2}'`);
    const req = (await as(ADMIN, `SELECT id FROM doc_job_requirements WHERE job_id='${JOB2}' AND kind='additional'`)).rows[0].id;
    const x = await rpc(INSTALLER, "request_doc_exception", `'${req}','not_relevant','Ingen bilder mulig på stedet',null`);
    await expect(rpc(INSTALLER, "decide_doc_exception", `'${x}',true,null`)).rejects.toThrow(/doc_self_approval_forbidden/);
  });

  it("BusBar is isolated: cannot see or use Service matrix, own job unaffected", async () => {
    await expect(rpc(BB_ADMIN, "get_job_doc_progress", `'${JOB}'`)).rejects.toThrow(/doc_access_denied/);
    await expect(rpc(BB_ADMIN, "set_job_doc_category", `'${BB_JOB}','${catService}','{}'`)).rejects.toThrow(/doc_company_mismatch/);
    expect((await rpc(BB_ADMIN, "get_job_doc_progress", `'${BB_JOB}'`)).state).toBe("company_not_configured");
    expect((await as(BB_ADMIN, `SELECT count(*)::int c FROM doc_job_requirements`)).rows[0].c).toBe(0);
  });

  it("direct writes to snapshots/exceptions/audit are impossible", async () => {
    await expect(as(ADMIN, `INSERT INTO doc_job_requirements(job_id,company_id,kind,label,rules_version) VALUES ('${JOB}','${SERVICE}','additional','x',0)`)).rejects.toThrow(/permission denied/);
    await expect(as(ADMIN, `UPDATE doc_job_requirements SET status='waived'`)).rejects.toThrow(/permission denied/);
    await expect(as(ADMIN, `INSERT INTO doc_audit_log(company_id,entity,action) VALUES ('${SERVICE}','x','y')`)).rejects.toThrow(/permission denied/);
    await expect(as(ADMIN, `UPDATE doc_company_settings SET enforcement_enabled=true`)).rejects.toThrow(/permission denied/);
    expect((await as(ADMIN, `SELECT enforcement_enabled FROM doc_company_settings`)).rows[0].enforcement_enabled).toBe(false);
  });

  it("migration has no Tripletex, mail, notification or events writes", () => {
    expect(docSql()).not.toMatch(/tripletex|net\.http|send_email|INSERT INTO public\.notifications|UPDATE public\.events/i);
  });
});
