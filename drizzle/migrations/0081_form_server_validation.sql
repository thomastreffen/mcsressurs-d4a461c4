-- Phase A0/A1/A3: server-authoritative form validation, completion, signing and evidence.
ALTER TABLE public.form_instances
  ADD COLUMN IF NOT EXISTS answers_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validated_by uuid,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid;
COMMENT ON COLUMN public.form_instances.validated_at IS 'Set only by server RPC after server-side validation. NULL on completed/signed rows = legacy history, never treated as validated.';

-- Access helpers -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.form_instance_can_edit(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = _id AND auth.uid() IS NOT NULL AND (
      fi.assigned_to = auth.uid() OR fi.created_by = auth.uid()
      OR public.legacy_admin_in_company(fi.company_id)
      OR (fi.project_id IS NOT NULL AND public.is_project_member(auth.uid(), fi.project_id))
    ))
$$;

CREATE OR REPLACE FUNCTION public.form_instance_id_from_path(_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN split_part(_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_name, '/', 1)::uuid END
$$;

CREATE OR REPLACE FUNCTION public.form_evidence_count(_instance uuid, _prefix text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
  SELECT count(*)::int FROM storage.objects o
  WHERE o.bucket_id = 'form-evidence'
    AND left(o.name, length(_instance::text || '/' || _prefix || '/')) = _instance::text || '/' || _prefix || '/'
$$;

-- Shared server validator ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.form_validate_answers(_instance uuid, _fields jsonb, _rules jsonb, _answers jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f jsonb; r jsonb; t text; fid text; lbl text; req boolean; v jsonb; s text;
  issues jsonb := '[]'::jsonb; opt record; item jsonb; st text; rg text; cm text;
BEGIN
  _answers := coalesce(_answers, '{}'::jsonb);
  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(_fields, '[]'::jsonb)) LOOP
    t := f->>'type'; fid := f->>'id'; lbl := coalesce(f->>'label', fid);
    req := coalesce((f->>'required')::boolean, false);
    IF t IS NULL OR fid IS NULL OR t = 'section_header' OR t = 'signature' OR t LIKE 'smart\_%' THEN CONTINUE; END IF;
    v := _answers->fid;
    s := CASE WHEN v IS NULL OR jsonb_typeof(v) = 'null' THEN NULL
              WHEN jsonb_typeof(v) = 'string' THEN nullif(btrim(v #>> '{}'), '')
              WHEN jsonb_typeof(v) IN ('number','boolean') THEN v #>> '{}'
              ELSE NULL END;

    IF t = 'checkbox_list' THEN
      FOR opt IN SELECT value #>> '{}' AS label, (ordinality - 1)::int AS idx
                 FROM jsonb_array_elements(coalesce(f->'options','[]'::jsonb)) WITH ORDINALITY LOOP
        item := CASE WHEN jsonb_typeof(v) = 'object' THEN v->(opt.idx::text) END;
        st := item->>'status'; rg := item->>'risk_grade'; cm := nullif(btrim(coalesce(item->>'comment','')), '');
        IF st IS NULL OR st NOT IN ('ok','avvik','ikke_relevant') THEN
          issues := issues || jsonb_build_object('field_id', fid, 'item_index', opt.idx, 'message', format('«%s» er ikke besvart', opt.label));
          CONTINUE;
        END IF;
        IF st = 'avvik' AND coalesce((f->>'require_photo_on_deviation')::boolean, false)
           AND public.form_evidence_count(_instance, fid || '/' || opt.idx) < 1 THEN
          issues := issues || jsonb_build_object('field_id', fid, 'item_index', opt.idx, 'message', format('«%s»: avvik krever bilde', opt.label));
        END IF;
        IF st = 'avvik' AND coalesce((f->>'enable_risk_grading')::boolean, false)
           AND (rg IS NULL OR rg NOT IN ('lav','middels','hoy','kritisk')) THEN
          issues := issues || jsonb_build_object('field_id', fid, 'item_index', opt.idx, 'message', format('«%s»: velg risikograd', opt.label));
        END IF;
        IF st = 'avvik' AND rg = 'kritisk' AND cm IS NULL THEN
          issues := issues || jsonb_build_object('field_id', fid, 'item_index', opt.idx, 'message', format('«%s»: kritisk avvik krever kommentar', opt.label));
        END IF;
      END LOOP;
      CONTINUE;
    END IF;

    IF t IN ('photo_upload','file_upload') THEN
      IF req AND public.form_evidence_count(_instance, fid) < 1 THEN
        issues := issues || jsonb_build_object('field_id', fid, 'message', format('«%s» krever opplastet fil', lbl));
      END IF;
      CONTINUE;
    END IF;

    IF s IS NULL THEN
      IF req THEN issues := issues || jsonb_build_object('field_id', fid, 'message', format('«%s» må fylles ut', lbl)); END IF;
      CONTINUE;
    END IF;

    IF (t = 'checkbox_yes_no' AND s NOT IN ('yes','no'))
       OR (t = 'number' AND s !~ '^-?[0-9]+([.,][0-9]+)?$')
       OR (t = 'email' AND s !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
       OR (t = 'date' AND s !~ '^\d{4}-\d{2}-\d{2}')
       OR (t = 'time' AND s !~ '^\d{2}:\d{2}')
       OR (t IN ('dropdown','radio') AND NOT (coalesce(f->'options','[]'::jsonb) ? s)) THEN
      issues := issues || jsonb_build_object('field_id', fid, 'message', format('«%s» har ugyldig verdi', lbl));
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(_rules, '[]'::jsonb)) LOOP
    IF r->>'action' = 'require_comment' AND (_answers->>(r->>'field_id')) = r->>'value'
       AND nullif(btrim(coalesce(_answers->>((r->>'field_id') || '_comment'), '')), '') IS NULL THEN
      issues := issues || jsonb_build_object('field_id', r->>'field_id', 'message', 'Kommentar påkrevd for valgt svar');
    END IF;
  END LOOP;
  RETURN issues;
END $$;

-- Guards: direct client writes cannot fake state ------------------------------
CREATE OR REPLACE FUNCTION public.form_instances_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE pc uuid; tc uuid;
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked_at IS NOT NULL OR OLD.status IN ('completed','signed') THEN
      RAISE EXCEPTION 'form_history_protected' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('not_started','in_progress') OR NEW.locked_at IS NOT NULL OR NEW.validated_at IS NOT NULL THEN
      RAISE EXCEPTION 'form_state_requires_rpc' USING ERRCODE = '42501';
    END IF;
    NEW.answers_revision := 0; NEW.completed_at := NULL; NEW.completed_by := NULL; NEW.validated_by := NULL; NEW.locked_by := NULL;
    IF NEW.project_id IS NOT NULL THEN
      SELECT company_id INTO pc FROM public.events WHERE id = NEW.project_id;
      IF NEW.company_id IS NULL THEN NEW.company_id := pc;
      ELSIF pc IS NOT NULL AND pc <> NEW.company_id THEN RAISE EXCEPTION 'form_company_mismatch' USING ERRCODE = '42501'; END IF;
    END IF;
    SELECT company_id INTO tc FROM public.form_templates WHERE id = NEW.template_id;
    IF tc IS NOT NULL AND tc IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'form_template_company_mismatch' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE
  IF OLD.locked_at IS NOT NULL THEN RAISE EXCEPTION 'form_locked' USING ERRCODE = '42501'; END IF;
  IF NEW.answers IS DISTINCT FROM OLD.answers OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.locked_at IS DISTINCT FROM OLD.locked_at OR NEW.locked_by IS DISTINCT FROM OLD.locked_by
     OR NEW.validated_at IS DISTINCT FROM OLD.validated_at OR NEW.validated_by IS DISTINCT FROM OLD.validated_by
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.completed_by IS DISTINCT FROM OLD.completed_by
     OR NEW.answers_revision IS DISTINCT FROM OLD.answers_revision OR NEW.unlock_reason IS DISTINCT FROM OLD.unlock_reason
     OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.version_id IS DISTINCT FROM OLD.version_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'form_state_requires_rpc' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS form_instances_guard ON public.form_instances;
CREATE TRIGGER form_instances_guard BEFORE INSERT OR UPDATE OR DELETE ON public.form_instances
  FOR EACH ROW EXECUTE FUNCTION public.form_instances_guard();

CREATE OR REPLACE FUNCTION public.form_signatures_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    RAISE EXCEPTION 'form_signature_requires_rpc' USING ERRCODE = '42501';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND current_user <> 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'form_signature_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS form_signatures_guard ON public.form_signatures;
CREATE TRIGGER form_signatures_guard BEFORE INSERT OR UPDATE OR DELETE ON public.form_signatures
  FOR EACH ROW EXECUTE FUNCTION public.form_signatures_guard();

DROP POLICY IF EXISTS "Users insert form_signatures" ON public.form_signatures;
DROP POLICY IF EXISTS "Authenticated users can create form_instances" ON public.form_instances;
CREATE POLICY "Users create own form_instances in accessible company" ON public.form_instances
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (company_id IS NULL
    OR public.user_has_company_access(auth.uid(), company_id) OR public.legacy_admin_in_company(company_id)));

-- RPCs ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_form_answers(_id uuid, _answers jsonb, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fi public.form_instances%ROWTYPE;
BEGIN
  IF NOT public.form_instance_can_edit(_id) THEN RAISE EXCEPTION 'form_access_denied' USING ERRCODE = '42501'; END IF;
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'object' OR octet_length(_answers::text) > 1000000 THEN
    RAISE EXCEPTION 'form_invalid_answers' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO fi FROM public.form_instances WHERE id = _id FOR UPDATE;
  IF fi.locked_at IS NOT NULL OR fi.status = 'signed' THEN RAISE EXCEPTION 'form_locked' USING ERRCODE = '42501'; END IF;
  IF fi.answers_revision <> _expected_revision THEN RAISE EXCEPTION 'form_revision_conflict' USING ERRCODE = '40001'; END IF;
  UPDATE public.form_instances SET answers = _answers, answers_revision = fi.answers_revision + 1,
    status = 'in_progress', validated_at = NULL, validated_by = NULL, completed_at = NULL, completed_by = NULL
  WHERE id = _id RETURNING * INTO fi;
  RETURN jsonb_build_object('revision', fi.answers_revision, 'status', fi.status, 'updated_at', fi.updated_at);
END $$;

CREATE OR REPLACE FUNCTION public.form_instance_issues(_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.form_validate_answers(fi.id, v.fields, v.rules, fi.answers)
  FROM public.form_instances fi JOIN public.form_template_versions v ON v.id = fi.version_id
  WHERE fi.id = _id
$$;

CREATE OR REPLACE FUNCTION public.complete_form_instance(_id uuid, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fi public.form_instances%ROWTYPE; issues jsonb;
BEGIN
  IF NOT public.form_instance_can_edit(_id) THEN RAISE EXCEPTION 'form_access_denied' USING ERRCODE = '42501'; END IF;
  SELECT * INTO fi FROM public.form_instances WHERE id = _id FOR UPDATE;
  IF fi.locked_at IS NOT NULL OR fi.status = 'signed' THEN RAISE EXCEPTION 'form_locked' USING ERRCODE = '42501'; END IF;
  IF fi.answers_revision <> _expected_revision THEN RAISE EXCEPTION 'form_revision_conflict' USING ERRCODE = '40001'; END IF;
  issues := public.form_instance_issues(_id);
  IF issues IS NULL THEN RAISE EXCEPTION 'form_version_missing' USING ERRCODE = 'P0002'; END IF;
  IF jsonb_array_length(issues) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'issues', issues, 'revision', fi.answers_revision, 'status', fi.status);
  END IF;
  UPDATE public.form_instances SET status = 'completed', validated_at = now(), validated_by = auth.uid(),
    completed_at = now(), completed_by = auth.uid()
  WHERE id = _id RETURNING * INTO fi;
  RETURN jsonb_build_object('ok', true, 'issues', '[]'::jsonb, 'revision', fi.answers_revision, 'status', fi.status);
END $$;

CREATE OR REPLACE FUNCTION public.sign_form_instance(_id uuid, _expected_revision integer, _signer_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fi public.form_instances%ROWTYPE; issues jsonb; nm text := btrim(coalesce(_signer_name, ''));
BEGIN
  IF NOT public.form_instance_can_edit(_id) THEN RAISE EXCEPTION 'form_access_denied' USING ERRCODE = '42501'; END IF;
  IF length(nm) < 2 OR length(nm) > 120 THEN RAISE EXCEPTION 'form_invalid_signer' USING ERRCODE = '22023'; END IF;
  SELECT * INTO fi FROM public.form_instances WHERE id = _id FOR UPDATE;
  IF fi.locked_at IS NOT NULL OR fi.status = 'signed' THEN RAISE EXCEPTION 'form_locked' USING ERRCODE = '42501'; END IF;
  IF fi.answers_revision <> _expected_revision THEN RAISE EXCEPTION 'form_revision_conflict' USING ERRCODE = '40001'; END IF;
  issues := public.form_instance_issues(_id);
  IF issues IS NULL THEN RAISE EXCEPTION 'form_version_missing' USING ERRCODE = 'P0002'; END IF;
  IF jsonb_array_length(issues) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'issues', issues, 'revision', fi.answers_revision, 'status', fi.status);
  END IF;
  INSERT INTO public.form_signatures(instance_id, signer_name, signer_role, signature_data)
  VALUES (_id, nm, CASE WHEN public.legacy_admin_in_company(fi.company_id) THEN 'admin' ELSE 'user' END,
    format('Signert av %s (bruker %s) %s, revisjon %s', nm, auth.uid(), to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), fi.answers_revision));
  UPDATE public.form_instances SET status = 'signed', locked_at = now(), locked_by = auth.uid(),
    validated_at = now(), validated_by = auth.uid(), completed_at = coalesce(fi.completed_at, now()), completed_by = coalesce(fi.completed_by, auth.uid())
  WHERE id = _id RETURNING * INTO fi;
  RETURN jsonb_build_object('ok', true, 'issues', '[]'::jsonb, 'revision', fi.answers_revision, 'status', fi.status);
END $$;

CREATE OR REPLACE FUNCTION public.unlock_form_instance(_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fi public.form_instances%ROWTYPE; rs text := btrim(coalesce(_reason, ''));
BEGIN
  SELECT * INTO fi FROM public.form_instances WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.legacy_admin_in_company(fi.company_id) THEN
    RAISE EXCEPTION 'form_access_denied' USING ERRCODE = '42501';
  END IF;
  IF length(rs) < 5 OR length(rs) > 500 THEN RAISE EXCEPTION 'form_invalid_reason' USING ERRCODE = '22023'; END IF;
  IF fi.locked_at IS NULL THEN RAISE EXCEPTION 'form_not_locked' USING ERRCODE = '22023'; END IF;
  -- Signatures stay as immutable history; the form must be re-validated and re-signed.
  UPDATE public.form_instances SET locked_at = NULL, locked_by = NULL, unlock_reason = rs, status = 'in_progress',
    validated_at = NULL, validated_by = NULL, answers_revision = fi.answers_revision + 1
  WHERE id = _id RETURNING * INTO fi;
  RETURN jsonb_build_object('revision', fi.answers_revision, 'status', fi.status);
END $$;

CREATE OR REPLACE FUNCTION public.check_required_forms(_project_id uuid, _rule text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pc uuid; ptype text; t record; missing jsonb := '[]'::jsonb; done boolean; needs_sig boolean; reason text; fi record;
BEGIN
  IF _rule NOT IN ('required_before_completion','required_before_billing') THEN RAISE EXCEPTION 'invalid_rule' USING ERRCODE = '22023'; END IF;
  SELECT company_id, project_type INTO pc, ptype FROM public.events WHERE id = _project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    public.is_project_member(auth.uid(), _project_id)
    OR (pc IS NOT NULL AND (public.user_has_company_access(auth.uid(), pc) OR public.legacy_admin_in_company(pc)))) THEN
    RAISE EXCEPTION 'form_access_denied' USING ERRCODE = '42501';
  END IF;
  FOR t IN
    SELECT ft.id, ft.title, ft.active_version_id FROM public.form_templates ft
    WHERE ft.deleted_at IS NULL AND ft.archived_at IS NULL AND ft.is_active AND ft.available_in_projects
      AND (ft.company_id IS NULL OR ft.company_id = pc)
      AND (cardinality(ft.required_for_job_types) = 0 OR ptype = ANY(ft.required_for_job_types))
      AND CASE _rule WHEN 'required_before_completion' THEN ft.required_before_completion ELSE ft.required_before_billing END
  LOOP
    SELECT EXISTS (SELECT 1 FROM public.form_template_versions v, jsonb_array_elements(v.fields) e
      WHERE v.id = t.active_version_id AND e->>'type' = 'signature' AND coalesce((e->>'required')::boolean, false)) INTO needs_sig;
    done := false; reason := 'not_done';
    FOR fi IN SELECT id, status, validated_at FROM public.form_instances
      WHERE project_id = _project_id AND template_id = t.id AND status IN ('completed','signed')
      ORDER BY (validated_at IS NOT NULL) DESC, updated_at DESC LOOP
      IF needs_sig AND fi.status <> 'signed' THEN reason := 'signature_missing'; CONTINUE; END IF;
      IF fi.validated_at IS NOT NULL OR jsonb_array_length(coalesce(public.form_instance_issues(fi.id), '[{}]'::jsonb)) = 0 THEN
        done := true; EXIT;
      END IF;
      IF reason = 'not_done' THEN reason := 'legacy_unvalidated'; END IF;
    END LOOP;
    IF NOT done THEN missing := missing || jsonb_build_object('template_id', t.id, 'title', t.title, 'reason', reason); END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', jsonb_array_length(missing) = 0, 'missing', missing);
END $$;

REVOKE ALL ON FUNCTION public.form_instance_can_edit(uuid), public.form_evidence_count(uuid, text),
  public.form_validate_answers(uuid, jsonb, jsonb, jsonb), public.save_form_answers(uuid, jsonb, integer),
  public.form_instance_issues(uuid), public.complete_form_instance(uuid, integer),
  public.sign_form_instance(uuid, integer, text), public.unlock_form_instance(uuid, text),
  public.check_required_forms(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.form_instance_can_edit(uuid), public.save_form_answers(uuid, jsonb, integer),
  public.form_instance_issues(uuid), public.complete_form_instance(uuid, integer),
  public.sign_form_instance(uuid, integer, text), public.unlock_form_instance(uuid, text),
  public.check_required_forms(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.form_instance_id_from_path(text) TO authenticated;

-- Private evidence bucket policies (bucket created separately) -----------------
DROP POLICY IF EXISTS "form evidence read" ON storage.objects;
DROP POLICY IF EXISTS "form evidence insert" ON storage.objects;
DROP POLICY IF EXISTS "form evidence delete" ON storage.objects;
CREATE POLICY "form evidence read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'form-evidence' AND public.form_instance_can_edit(public.form_instance_id_from_path(name)));
CREATE POLICY "form evidence insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'form-evidence' AND public.form_instance_can_edit(public.form_instance_id_from_path(name))
    AND EXISTS (SELECT 1 FROM public.form_instances fi WHERE fi.id = public.form_instance_id_from_path(name) AND fi.locked_at IS NULL));
CREATE POLICY "form evidence delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'form-evidence' AND public.form_instance_can_edit(public.form_instance_id_from_path(name))
    AND EXISTS (SELECT 1 FROM public.form_instances fi WHERE fi.id = public.form_instance_id_from_path(name) AND fi.locked_at IS NULL AND fi.status <> 'signed'));
