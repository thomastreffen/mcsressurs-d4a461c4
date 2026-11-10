// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, existsSync } from "node:fs";

// Isolated Postgres: no real technicians, jobs, notifications, emails, Tripletex or invoice calls.
const SERVICE = "00000000-0000-0000-0000-00000000000a";
const BUSBAR = "00000000-0000-0000-0000-00000000000b";
const TECH = "10000000-0000-0000-0000-000000000001";
const OTHER = "10000000-0000-0000-0000-000000000002";
const ADMIN = "10000000-0000-0000-0000-000000000003";
const BB_TECH = "10000000-0000-0000-0000-000000000004";
const JOB = "20000000-0000-0000-0000-000000000001";
const BB_JOB = "20000000-0000-0000-0000-000000000002";
const LEGACY_JOB = "20000000-0000-0000-0000-000000000003";
const TPL = "30000000-0000-0000-0000-000000000001";
const VER = "31000000-0000-0000-0000-000000000001";

const fields = [
  { id: "c", type: "checkbox_list", label: "Sjekk", options: ["Jording", "Merking"], order: 0, require_photo_on_deviation: true, enable_risk_grading: true },
  { id: "n", type: "number", label: "Måling", required: true, order: 1 },
  { id: "y", type: "checkbox_yes_no", label: "Testet", required: true, order: 2 },
  { id: "s", type: "signature", label: "Signatur", required: true, order: 3 },
];

let db: PGlite;
const migrationSql = () => {
  const dir = "drizzle/migrations";
  const f = readdirSync(dir).find((n) => n.includes("form_server_validation"));
  const path = f ? `${dir}/${f}` : "/tmp/form_mig.sql";
  if (!existsSync(path)) throw new Error("migration not found");
  return readFileSync(path, "utf8").replace(/--> statement-breakpoint/g, "");
};
async function as(user: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',true)`);
    return tx.query<any>(sql, params);
  });
}
const rpc = async (user: string, fn: string, args: string, params: unknown[] = []) =>
  (await as(user, `SELECT public.${fn}(${args}) AS r`, params)).rows[0].r;
const newInstance = async (user: string, project: string) =>
  (await as(user, `INSERT INTO form_instances(template_id,version_id,project_id,created_by,assigned_to,status) VALUES ('${TPL}','${VER}','${project}','${user}','${user}','not_started') RETURNING id`)).rows[0].id as string;

const validAnswers = { c: { "0": { status: "ok" }, "1": { status: "ikke_relevant" } }, n: "12.5", y: "yes" };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
    GRANT USAGE ON SCHEMA storage TO authenticated; GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE TABLE memberships(user_id uuid, company_id uuid); CREATE TABLE admins(user_id uuid, company_id uuid); CREATE TABLE members(user_id uuid, project_id uuid);
    INSERT INTO memberships VALUES ('${TECH}','${SERVICE}'),('${OTHER}','${SERVICE}'),('${ADMIN}','${SERVICE}'),('${BB_TECH}','${BUSBAR}');
    INSERT INTO admins VALUES ('${ADMIN}','${SERVICE}');
    CREATE FUNCTION user_has_company_access(_auth_user_id uuid,_company_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.memberships WHERE user_id=_auth_user_id AND company_id=_company_id) $$;
    CREATE FUNCTION legacy_admin_in_company(_company uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.admins WHERE user_id=auth.uid() AND company_id=_company) $$;
    CREATE FUNCTION is_project_member(_auth_user_id uuid,_project_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.members WHERE user_id=_auth_user_id AND project_id=_project_id) $$;
    CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid, project_type text, deleted_at timestamptz);
    INSERT INTO events VALUES ('${JOB}','${SERVICE}','service',null),('${BB_JOB}','${BUSBAR}','service',null),('${LEGACY_JOB}','${SERVICE}','service',null);
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
    CREATE POLICY "Authenticated users can create form_instances" ON form_instances FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY sel ON form_instances FOR SELECT TO authenticated USING (assigned_to=auth.uid() OR created_by=auth.uid() OR legacy_admin_in_company(company_id));
    CREATE POLICY upd ON form_instances FOR UPDATE TO authenticated USING (assigned_to=auth.uid() AND locked_at IS NULL);
    CREATE POLICY adm ON form_instances FOR ALL TO authenticated USING (legacy_admin_in_company(company_id)) WITH CHECK (legacy_admin_in_company(company_id));
    CREATE POLICY "Users insert form_signatures" ON form_signatures FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY sigsel ON form_signatures FOR SELECT TO authenticated USING (true);
    INSERT INTO form_templates(id,title,active_version_id,company_id,required_before_completion) VALUES ('${TPL}','Sluttkontroll','${VER}',null,true);
    INSERT INTO form_template_versions VALUES ('${VER}','${TPL}','${JSON.stringify(fields)}','[]');`);
  // Legacy completed + signed history created before the guard existed.
  await db.exec(`INSERT INTO form_instances(id,template_id,version_id,project_id,company_id,created_by,status,answers,locked_at)
    VALUES ('40000000-0000-0000-0000-000000000001','${TPL}','${VER}','${LEGACY_JOB}','${SERVICE}','${TECH}','signed','{}',now());
    INSERT INTO form_signatures(instance_id,signer_name,signature_data) VALUES ('40000000-0000-0000-0000-000000000001','Gammel','legacy');`);
  await db.exec(migrationSql());
});
afterAll(async () => { await db?.close(); });

describe("server-authoritative form completion", () => {
  it("unanswered checklist items are never OK and block completion", async () => {
    const id = await newInstance(TECH, JOB);
    const r = await rpc(TECH, "complete_form_instance", `'${id}',0`);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i: any) => i.message)).toEqual(expect.arrayContaining(["«Jording» er ikke besvart", "«Merking» er ikke besvart", "«Måling» må fylles ut"]));
    const row = (await as(TECH, `SELECT status, validated_at FROM form_instances WHERE id='${id}'`)).rows[0];
    expect(row).toEqual({ status: "not_started", validated_at: null });
  });

  it("type-correct validation: invalid number and yes/no are rejected", async () => {
    const id = await newInstance(TECH, JOB);
    await rpc(TECH, "save_form_answers", `'${id}',$1::jsonb,0`, [JSON.stringify({ ...validAnswers, n: "abc", y: "maybe" })]);
    const r = await rpc(TECH, "complete_form_instance", `'${id}',1`);
    expect(r.issues.map((i: any) => i.message)).toEqual(["«Måling» har ugyldig verdi", "«Testet» har ugyldig verdi"]);
  });

  it("deviation photo requires a real stored file, client photo_count is ignored", async () => {
    const id = await newInstance(TECH, JOB);
    const ans = { ...validAnswers, c: { "0": { status: "avvik", risk_grade: "lav", photo_count: 5 }, "1": { status: "ok" } } };
    await rpc(TECH, "save_form_answers", `'${id}',$1::jsonb,0`, [JSON.stringify(ans)]);
    expect((await rpc(TECH, "complete_form_instance", `'${id}',1`)).issues.map((i: any) => i.message)).toEqual(["«Jording»: avvik krever bilde"]);
    await as(TECH, `INSERT INTO storage.objects(bucket_id,name) VALUES ('form-evidence','${id}/c/0/foto.jpg')`);
    expect((await rpc(TECH, "complete_form_instance", `'${id}',1`)).ok).toBe(true);
  });

  it("critical risk requires comment", async () => {
    const id = await newInstance(TECH, JOB);
    await as(TECH, `INSERT INTO storage.objects(bucket_id,name) VALUES ('form-evidence','${id}/c/0/a.jpg')`);
    const ans = { ...validAnswers, c: { "0": { status: "avvik", risk_grade: "kritisk" }, "1": { status: "ok" } } };
    await rpc(TECH, "save_form_answers", `'${id}',$1::jsonb,0`, [JSON.stringify(ans)]);
    expect((await rpc(TECH, "complete_form_instance", `'${id}',1`)).issues[0].message).toMatch(/kritisk avvik krever kommentar/);
  });

  it("stale revision is rejected (concurrent writes cannot overwrite)", async () => {
    const id = await newInstance(TECH, JOB);
    await rpc(TECH, "save_form_answers", `'${id}',$1::jsonb,0`, [JSON.stringify({ n: "1" })]);
    await expect(rpc(TECH, "save_form_answers", `'${id}',$1::jsonb,0`, [JSON.stringify({ n: "2" })])).rejects.toThrow(/form_revision_conflict/);
    await expect(rpc(TECH, "complete_form_instance", `'${id}',0`)).rejects.toThrow(/form_revision_conflict/);
    expect((await as(TECH, `SELECT answers->>'n' n FROM form_instances WHERE id='${id}'`)).rows[0].n).toBe("1");
  });

  it("direct API client cannot fake completed/signed, change answers or insert signatures", async () => {
    const id = await newInstance(TECH, JOB);
    await expect(as(TECH, `UPDATE form_instances SET status='completed' WHERE id='${id}'`)).rejects.toThrow(/form_state_requires_rpc/);
    await expect(as(TECH, `UPDATE form_instances SET status='signed', locked_at=now() WHERE id='${id}'`)).rejects.toThrow(/form_state_requires_rpc/);
    await expect(as(TECH, `UPDATE form_instances SET answers='{"n":"9"}' WHERE id='${id}'`)).rejects.toThrow(/form_state_requires_rpc/);
    await expect(as(TECH, `INSERT INTO form_instances(template_id,version_id,project_id,created_by,status) VALUES ('${TPL}','${VER}','${JOB}','${TECH}','signed')`)).rejects.toThrow(/form_state_requires_rpc/);
    await expect(as(TECH, `INSERT INTO form_signatures(instance_id,signer_name,signature_data) VALUES ('${id}','x','y')`)).rejects.toThrow(/form_signature_requires_rpc|row-level/);
    await expect(as(TECH, `INSERT INTO form_instances(template_id,version_id,project_id,created_by) VALUES ('${TPL}','${VER}','${JOB}','${OTHER}')`)).rejects.toThrow(/row-level/);
  });

  it("sign is atomic: validated, signature written server-side, locked and immutable", async () => {
    const id = await newInstance(TECH, JOB);
    await rpc(TECH, "save_form_answers", `'${id}',$1::jsonb,0`, [JSON.stringify(validAnswers)]);
    await expect(rpc(TECH, "sign_form_instance", `'${id}',1,' '`)).rejects.toThrow(/form_invalid_signer/);
    const r = await rpc(TECH, "sign_form_instance", `'${id}',1,'Ola Montør'`);
    expect(r).toMatchObject({ ok: true, status: "signed" });
    const sig = (await as(TECH, `SELECT signer_role, signature_data FROM form_signatures WHERE instance_id='${id}'`)).rows;
    expect(sig).toHaveLength(1);
    expect(sig[0].signer_role).toBe("user");
    await expect(rpc(TECH, "save_form_answers", `'${id}',$1::jsonb,1`, [JSON.stringify({})])).rejects.toThrow(/form_locked/);
    await expect(as(ADMIN, `UPDATE form_signatures SET signer_name='x' WHERE instance_id='${id}'`)).rejects.toThrow(/form_signature/);
    await expect(as(ADMIN, `DELETE FROM form_instances WHERE id='${id}'`)).rejects.toThrow(/form_locked|form_history_protected/);
    await expect(as(TECH, `INSERT INTO storage.objects(bucket_id,name) VALUES ('form-evidence','${id}/c/0/late.jpg')`)).rejects.toThrow(/row-level/);
    // Unlock: only company admin, keeps signature history, requires re-sign.
    await expect(rpc(TECH, "unlock_form_instance", `'${id}','feil måling'`)).rejects.toThrow(/form_access_denied/);
    expect(await rpc(ADMIN, "unlock_form_instance", `'${id}','feil måling'`)).toMatchObject({ status: "in_progress" });
    expect((await as(ADMIN, `SELECT count(*)::int c FROM form_signatures WHERE instance_id='${id}'`)).rows[0].c).toBe(1);
  });

  it("legacy signed records are preserved and not silently treated as validated", async () => {
    const row = (await as(ADMIN, `SELECT status, locked_at IS NOT NULL locked, validated_at FROM form_instances WHERE id='40000000-0000-0000-0000-000000000001'`)).rows[0];
    expect(row).toEqual({ status: "signed", locked: true, validated_at: null });
    const r = await rpc(ADMIN, "check_required_forms", `'${LEGACY_JOB}','required_before_completion'`);
    expect(r).toEqual({ ok: false, missing: [{ template_id: TPL, title: "Sluttkontroll", reason: "legacy_unvalidated" }] });
  });

  it("required check: signed+validated passes; company scoped; outsiders blocked", async () => {
    expect((await rpc(TECH, "check_required_forms", `'${JOB}','required_before_completion'`)).ok).toBe(true);
    expect((await rpc(TECH, "check_required_forms", `'${JOB}','required_before_billing'`)).ok).toBe(true);
    await expect(rpc(BB_TECH, "check_required_forms", `'${JOB}','required_before_completion'`)).rejects.toThrow(/form_access_denied/);
    await db.exec(`UPDATE form_templates SET company_id='${SERVICE}' WHERE id='${TPL}'`);
    expect(await rpc(BB_TECH, "check_required_forms", `'${BB_JOB}','required_before_completion'`)).toEqual({ ok: true, missing: [] });
    await db.exec(`UPDATE form_templates SET company_id=null WHERE id='${TPL}'`);
  });

  it("BusBar user cannot read/edit/complete Service form or create one on a Service job", async () => {
    const id = await newInstance(TECH, JOB);
    await expect(rpc(BB_TECH, "save_form_answers", `'${id}',$1::jsonb,0`, [JSON.stringify({})])).rejects.toThrow(/form_access_denied/);
    await expect(rpc(BB_TECH, "complete_form_instance", `'${id}',0`)).rejects.toThrow(/form_access_denied/);
    await expect(as(BB_TECH, `INSERT INTO form_instances(template_id,version_id,project_id,created_by) VALUES ('${TPL}','${VER}','${JOB}','${BB_TECH}')`)).rejects.toThrow(/row-level/);
    const bb = await newInstance(BB_TECH, BB_JOB);
    expect((await as(BB_TECH, `SELECT company_id FROM form_instances WHERE id='${bb}'`)).rows[0].company_id).toBe(BUSBAR);
  });

  it("required signature field means completed-only is not enough", async () => {
    const id = await newInstance(TECH, LEGACY_JOB);
    await rpc(TECH, "save_form_answers", `'${id}',$1::jsonb,0`, [JSON.stringify(validAnswers)]);
    expect((await rpc(TECH, "complete_form_instance", `'${id}',1`)).ok).toBe(true);
    const r = await rpc(ADMIN, "check_required_forms", `'${LEGACY_JOB}','required_before_completion'`);
    expect(r.missing[0].reason).toBe("signature_missing");
  });

  it("migration contains no Tripletex, invoice or mail side-effects", () => {
    expect(migrationSql()).not.toMatch(/tripletex|invoice_basis|net\.http|send_email|notifications/i);
  });
});
