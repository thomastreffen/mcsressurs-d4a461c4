-- A1.5: Company-scoped documentation requirement matrix, job snapshots, audited exceptions.
-- No enforcement: doc_company_settings.enforcement_enabled defaults to false and has no write path yet.

CREATE TABLE public.doc_company_settings (
  company_id uuid PRIMARY KEY,
  enforcement_enabled boolean NOT NULL DEFAULT false,
  rules_version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.doc_company_settings TO authenticated;
GRANT ALL ON public.doc_company_settings TO service_role;
ALTER TABLE public.doc_company_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.doc_job_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX doc_job_categories_company_name ON public.doc_job_categories(company_id, lower(name));
GRANT SELECT, INSERT, UPDATE ON public.doc_job_categories TO authenticated;
GRANT ALL ON public.doc_job_categories TO service_role;
ALTER TABLE public.doc_job_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.doc_requirement_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.doc_job_categories(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('risk_assessment','closing_documentation','additional')),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 200),
  template_id uuid REFERENCES public.form_templates(id) ON DELETE RESTRICT,
  condition text NOT NULL DEFAULT 'always' CHECK (condition IN ('always','installation_change','deviation_found')),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  approved_at timestamptz,
  approved_by uuid,
  rule_version integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX doc_requirement_rules_category ON public.doc_requirement_rules(category_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_requirement_rules TO authenticated;
GRANT ALL ON public.doc_requirement_rules TO service_role;
ALTER TABLE public.doc_requirement_rules ENABLE ROW LEVEL SECURITY;

-- Job classification lives in its own table so writes never fire events triggers (calendar/M365 sync, notifications).
CREATE TABLE public.doc_job_profiles (
  job_id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  category_id uuid REFERENCES public.doc_job_categories(id) ON DELETE RESTRICT,
  conditions text[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.doc_job_profiles TO authenticated;
GRANT ALL ON public.doc_job_profiles TO service_role;
ALTER TABLE public.doc_job_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.doc_job_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  company_id uuid NOT NULL,
  rule_id uuid REFERENCES public.doc_requirement_rules(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('risk_assessment','closing_documentation','additional')),
  label text NOT NULL,
  template_id uuid,
  condition text NOT NULL DEFAULT 'always',
  rules_version integer NOT NULL,
  status text NOT NULL DEFAULT 'required' CHECK (status IN ('required','waived','substituted')),
  substitute_template_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX doc_job_requirements_job_rule ON public.doc_job_requirements(job_id, rule_id);
GRANT SELECT ON public.doc_job_requirements TO authenticated;
GRANT ALL ON public.doc_job_requirements TO service_role;
ALTER TABLE public.doc_job_requirements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.doc_exception_approvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  auth_user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid
);
CREATE UNIQUE INDEX doc_exception_approvers_active ON public.doc_exception_approvers(company_id, auth_user_id) WHERE revoked_at IS NULL;
GRANT SELECT ON public.doc_exception_approvers TO authenticated;
GRANT ALL ON public.doc_exception_approvers TO service_role;
ALTER TABLE public.doc_exception_approvers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.doc_requirement_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_requirement_id uuid NOT NULL REFERENCES public.doc_job_requirements(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  company_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('not_relevant','substitute')),
  substitute_template_id uuid,
  reason text NOT NULL,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  rules_version integer NOT NULL
);
CREATE UNIQUE INDEX doc_requirement_exceptions_open ON public.doc_requirement_exceptions(job_requirement_id) WHERE status = 'requested';
GRANT SELECT ON public.doc_requirement_exceptions TO authenticated;
GRANT ALL ON public.doc_requirement_exceptions TO service_role;
ALTER TABLE public.doc_requirement_exceptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.doc_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  job_id uuid,
  entity text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  actor uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.doc_audit_log TO authenticated;
GRANT ALL ON public.doc_audit_log TO service_role;
ALTER TABLE public.doc_audit_log ENABLE ROW LEVEL SECURITY;

-- Helpers ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.doc_can_manage(_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND _company IS NOT NULL
    AND (public.legacy_admin_in_company(_company) OR public.is_global_superadmin(auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.is_doc_exception_approver(_uid uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.doc_exception_approvers
    WHERE auth_user_id = _uid AND company_id = _company AND revoked_at IS NULL)
$$;

CREATE OR REPLACE FUNCTION public.doc_can_view(_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND _company IS NOT NULL AND (
    public.user_has_company_access(auth.uid(), _company) OR public.legacy_admin_in_company(_company)
    OR public.is_global_superadmin(auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.doc_can_view_job(_job uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _job AND auth.uid() IS NOT NULL AND (
    public.is_project_member(auth.uid(), e.id) OR public.doc_can_view(e.company_id)))
$$;

CREATE OR REPLACE FUNCTION public.doc_audit(_company uuid, _job uuid, _entity text, _entity_id uuid, _action text, _details jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.doc_audit_log(company_id, job_id, entity, entity_id, action, actor, details)
  VALUES (_company, _job, _entity, _entity_id, _action, auth.uid(), coalesce(_details, '{}'::jsonb))
$$;

-- Guards -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.doc_rules_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cc uuid; tc uuid;
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.approved_at IS NOT NULL THEN RAISE EXCEPTION 'doc_rule_history_protected' USING ERRCODE = '42501'; END IF;
    RETURN OLD;
  END IF;
  SELECT company_id INTO cc FROM public.doc_job_categories WHERE id = NEW.category_id;
  IF cc IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'doc_company_mismatch' USING ERRCODE = '42501'; END IF;
  IF NEW.template_id IS NOT NULL THEN
    SELECT company_id INTO tc FROM public.form_templates WHERE id = NEW.template_id;
    IF tc IS NOT NULL AND tc <> NEW.company_id THEN RAISE EXCEPTION 'doc_company_mismatch' USING ERRCODE = '42501'; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.approved_at := NULL; NEW.approved_by := NULL; NEW.rule_version := NULL; NEW.created_by := auth.uid();
  ELSE
    IF NEW.company_id <> OLD.company_id THEN RAISE EXCEPTION 'doc_company_mismatch' USING ERRCODE = '42501'; END IF;
    IF NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.rule_version IS DISTINCT FROM OLD.rule_version THEN
      RAISE EXCEPTION 'doc_approval_requires_rpc' USING ERRCODE = '42501';
    END IF;
    IF (NEW.kind, NEW.label, NEW.template_id, NEW.condition, NEW.category_id, NEW.is_active)
       IS DISTINCT FROM (OLD.kind, OLD.label, OLD.template_id, OLD.condition, OLD.category_id, OLD.is_active) THEN
      NEW.approved_at := NULL; NEW.approved_by := NULL; NEW.rule_version := NULL;
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER doc_rules_guard BEFORE INSERT OR UPDATE OR DELETE ON public.doc_requirement_rules
  FOR EACH ROW EXECUTE FUNCTION public.doc_rules_guard();

CREATE OR REPLACE FUNCTION public.doc_categories_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); END IF;
    IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN RAISE EXCEPTION 'doc_company_mismatch' USING ERRCODE = '42501'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER doc_categories_guard BEFORE INSERT OR UPDATE ON public.doc_job_categories
  FOR EACH ROW EXECUTE FUNCTION public.doc_categories_guard();

-- Policies ---------------------------------------------------------------------
CREATE POLICY doc_settings_read ON public.doc_company_settings FOR SELECT TO authenticated USING (public.doc_can_view(company_id));
CREATE POLICY doc_categories_read ON public.doc_job_categories FOR SELECT TO authenticated USING (public.doc_can_view(company_id));
CREATE POLICY doc_categories_insert ON public.doc_job_categories FOR INSERT TO authenticated WITH CHECK (public.doc_can_manage(company_id));
CREATE POLICY doc_categories_update ON public.doc_job_categories FOR UPDATE TO authenticated USING (public.doc_can_manage(company_id)) WITH CHECK (public.doc_can_manage(company_id));
CREATE POLICY doc_rules_read ON public.doc_requirement_rules FOR SELECT TO authenticated USING (public.doc_can_view(company_id));
CREATE POLICY doc_rules_insert ON public.doc_requirement_rules FOR INSERT TO authenticated WITH CHECK (public.doc_can_manage(company_id));
CREATE POLICY doc_rules_update ON public.doc_requirement_rules FOR UPDATE TO authenticated USING (public.doc_can_manage(company_id)) WITH CHECK (public.doc_can_manage(company_id));
CREATE POLICY doc_rules_delete ON public.doc_requirement_rules FOR DELETE TO authenticated USING (public.doc_can_manage(company_id));
CREATE POLICY doc_job_profiles_read ON public.doc_job_profiles FOR SELECT TO authenticated USING (public.doc_can_view_job(job_id));
CREATE POLICY doc_job_requirements_read ON public.doc_job_requirements FOR SELECT TO authenticated USING (public.doc_can_view_job(job_id));
CREATE POLICY doc_approvers_read ON public.doc_exception_approvers FOR SELECT TO authenticated USING (public.doc_can_view(company_id));
CREATE POLICY doc_exceptions_read ON public.doc_requirement_exceptions FOR SELECT TO authenticated USING (public.doc_can_view_job(job_id));
CREATE POLICY doc_audit_read ON public.doc_audit_log FOR SELECT TO authenticated USING (public.doc_can_manage(company_id));

-- RPCs -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_doc_rule(_rule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.doc_requirement_rules%ROWTYPE; v integer; ok_tpl boolean;
BEGIN
  SELECT * INTO r FROM public.doc_requirement_rules WHERE id = _rule_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (public.is_doc_exception_approver(auth.uid(), r.company_id) OR public.is_global_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'doc_access_denied' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.form_templates t WHERE t.id = r.template_id AND t.deleted_at IS NULL
    AND t.is_active AND t.active_version_id IS NOT NULL AND (t.company_id IS NULL OR t.company_id = r.company_id)) INTO ok_tpl;
  IF NOT ok_tpl THEN RAISE EXCEPTION 'doc_template_not_ready' USING ERRCODE = '22023'; END IF;
  IF NOT r.is_active THEN RAISE EXCEPTION 'doc_rule_inactive' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.doc_company_settings(company_id) VALUES (r.company_id) ON CONFLICT (company_id) DO NOTHING;
  UPDATE public.doc_company_settings SET rules_version = rules_version + 1, updated_at = now(), updated_by = auth.uid()
    WHERE company_id = r.company_id RETURNING rules_version INTO v;
  UPDATE public.doc_requirement_rules SET approved_at = now(), approved_by = auth.uid(), rule_version = v WHERE id = _rule_id;
  PERFORM public.doc_audit(r.company_id, NULL, 'rule', _rule_id, 'approved', jsonb_build_object('rules_version', v, 'template_id', r.template_id));
  RETURN jsonb_build_object('rules_version', v);
END $$;

CREATE OR REPLACE FUNCTION public.set_doc_exception_approver(_company uuid, _user uuid, _active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'doc_access_denied' USING ERRCODE = '42501'; END IF;
  IF _active THEN
    INSERT INTO public.doc_exception_approvers(company_id, auth_user_id, granted_by)
    SELECT _company, _user, auth.uid() WHERE NOT public.is_doc_exception_approver(_user, _company);
  ELSE
    UPDATE public.doc_exception_approvers SET revoked_at = now(), revoked_by = auth.uid()
    WHERE company_id = _company AND auth_user_id = _user AND revoked_at IS NULL;
  END IF;
  PERFORM public.doc_audit(_company, NULL, 'approver', _user, CASE WHEN _active THEN 'granted' ELSE 'revoked' END, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.set_job_doc_category(_job_id uuid, _category_id uuid, _conditions text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE jc uuid; cc uuid; conds text[] := coalesce(_conditions, '{}');
BEGIN
  SELECT company_id INTO jc FROM public.events WHERE id = _job_id;
  IF jc IS NULL OR NOT (public.doc_can_manage(jc) OR public.is_doc_exception_approver(auth.uid(), jc)) THEN
    RAISE EXCEPTION 'doc_access_denied' USING ERRCODE = '42501';
  END IF;
  IF _category_id IS NOT NULL THEN
    SELECT company_id INTO cc FROM public.doc_job_categories WHERE id = _category_id AND is_active;
    IF cc IS DISTINCT FROM jc THEN RAISE EXCEPTION 'doc_company_mismatch' USING ERRCODE = '42501'; END IF;
  END IF;
  IF NOT conds <@ ARRAY['installation_change','deviation_found'] THEN RAISE EXCEPTION 'doc_invalid_condition' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.doc_job_profiles(job_id, company_id, category_id, conditions, updated_by)
  VALUES (_job_id, jc, _category_id, conds, auth.uid())
  ON CONFLICT (job_id) DO UPDATE SET category_id = EXCLUDED.category_id, conditions = EXCLUDED.conditions,
    updated_by = EXCLUDED.updated_by, updated_at = now();
  PERFORM public.doc_audit(jc, _job_id, 'job', _job_id, 'category_set', jsonb_build_object('category_id', _category_id, 'conditions', conds));
END $$;

-- Snapshot approved rules onto the job; later rule changes never apply retroactively.
CREATE OR REPLACE FUNCTION public.snapshot_job_doc_requirements(_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e record; v integer; n integer; has_risk boolean; has_close boolean;
BEGIN
  SELECT ev.id, ev.company_id, p.category_id AS doc_category_id, coalesce(p.conditions, '{}') AS doc_conditions
    INTO e FROM public.events ev LEFT JOIN public.doc_job_profiles p ON p.job_id = ev.id WHERE ev.id = _job_id;
  PERFORM 1 FROM public.doc_job_profiles WHERE job_id = _job_id FOR UPDATE;
  IF e.company_id IS NULL OR NOT (public.doc_can_manage(e.company_id) OR public.is_doc_exception_approver(auth.uid(), e.company_id)) THEN
    RAISE EXCEPTION 'doc_access_denied' USING ERRCODE = '42501';
  END IF;
  IF e.doc_category_id IS NULL THEN RAISE EXCEPTION 'doc_category_missing' USING ERRCODE = '22023'; END IF;
  SELECT bool_or(kind = 'risk_assessment'), bool_or(kind = 'closing_documentation') INTO has_risk, has_close
  FROM public.doc_requirement_rules r WHERE r.category_id = e.doc_category_id AND r.is_active AND r.approved_at IS NOT NULL
    AND (r.condition = 'always' OR r.condition = ANY(e.doc_conditions));
  IF NOT coalesce(has_risk, false) OR NOT coalesce(has_close, false) THEN
    RAISE EXCEPTION 'doc_requirements_must_be_configured' USING ERRCODE = '22023';
  END IF;
  SELECT rules_version INTO v FROM public.doc_company_settings WHERE company_id = e.company_id;
  INSERT INTO public.doc_job_requirements(job_id, company_id, rule_id, kind, label, template_id, condition, rules_version, created_by)
  SELECT _job_id, e.company_id, r.id, r.kind, r.label, r.template_id, r.condition, coalesce(v, 0), auth.uid()
  FROM public.doc_requirement_rules r
  WHERE r.category_id = e.doc_category_id AND r.is_active AND r.approved_at IS NOT NULL
    AND (r.condition = 'always' OR r.condition = ANY(e.doc_conditions))
  ON CONFLICT (job_id, rule_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public.doc_audit(e.company_id, _job_id, 'job', _job_id, 'requirements_snapshot', jsonb_build_object('added', n, 'rules_version', v));
  RETURN jsonb_build_object('added', n, 'rules_version', coalesce(v, 0));
END $$;

-- Idempotent: returns the existing form for this requirement or creates exactly one.
CREATE OR REPLACE FUNCTION public.start_requirement_form(_requirement_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record; tpl uuid; ver uuid; fid uuid;
BEGIN
  SELECT * INTO q FROM public.doc_job_requirements WHERE id = _requirement_id FOR UPDATE;
  IF NOT FOUND OR NOT public.doc_can_view_job(q.job_id) THEN RAISE EXCEPTION 'doc_access_denied' USING ERRCODE = '42501'; END IF;
  tpl := coalesce(q.substitute_template_id, q.template_id);
  IF tpl IS NULL THEN RAISE EXCEPTION 'doc_template_not_ready' USING ERRCODE = '22023'; END IF;
  SELECT id INTO fid FROM public.form_instances WHERE project_id = q.job_id AND template_id = tpl
    ORDER BY (status = 'signed') DESC, (status = 'completed') DESC, created_at DESC LIMIT 1;
  IF fid IS NOT NULL THEN RETURN fid; END IF;
  SELECT active_version_id INTO ver FROM public.form_templates WHERE id = tpl AND deleted_at IS NULL AND is_active;
  IF ver IS NULL THEN RAISE EXCEPTION 'doc_template_not_ready' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.form_instances(template_id, version_id, project_id, company_id, created_by, assigned_to, status)
  VALUES (tpl, ver, q.job_id, q.company_id, auth.uid(), auth.uid(), 'not_started') RETURNING id INTO fid;
  RETURN fid;
END $$;

CREATE OR REPLACE FUNCTION public.request_doc_exception(_requirement_id uuid, _kind text, _reason text, _substitute_template_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record; rs text := btrim(coalesce(_reason, '')); xid uuid; v integer; tc uuid;
BEGIN
  SELECT * INTO q FROM public.doc_job_requirements WHERE id = _requirement_id FOR UPDATE;
  IF NOT FOUND OR NOT public.doc_can_view_job(q.job_id) THEN RAISE EXCEPTION 'doc_access_denied' USING ERRCODE = '42501'; END IF;
  IF q.status <> 'required' THEN RAISE EXCEPTION 'doc_requirement_closed' USING ERRCODE = '22023'; END IF;
  IF length(rs) < 10 OR length(rs) > 1000 THEN RAISE EXCEPTION 'doc_invalid_reason' USING ERRCODE = '22023'; END IF;
  IF _kind NOT IN ('not_relevant','substitute') THEN RAISE EXCEPTION 'doc_invalid_kind' USING ERRCODE = '22023'; END IF;
  -- The two basis categories can only be replaced by equivalent documentation, never waived.
  IF _kind = 'not_relevant' AND q.kind IN ('risk_assessment','closing_documentation') THEN
    RAISE EXCEPTION 'doc_basis_requirement_cannot_be_waived' USING ERRCODE = '22023';
  END IF;
  IF _kind = 'substitute' THEN
    SELECT company_id INTO tc FROM public.form_templates WHERE id = _substitute_template_id AND deleted_at IS NULL AND is_active AND active_version_id IS NOT NULL;
    IF NOT FOUND OR (tc IS NOT NULL AND tc <> q.company_id) THEN RAISE EXCEPTION 'doc_template_not_ready' USING ERRCODE = '22023'; END IF;
  END IF;
  SELECT rules_version INTO v FROM public.doc_company_settings WHERE company_id = q.company_id;
  INSERT INTO public.doc_requirement_exceptions(job_requirement_id, job_id, company_id, kind, substitute_template_id, reason, requested_by, rules_version)
  VALUES (_requirement_id, q.job_id, q.company_id, _kind, CASE WHEN _kind = 'substitute' THEN _substitute_template_id END, rs, auth.uid(), coalesce(v, q.rules_version))
  RETURNING id INTO xid;
  PERFORM public.doc_audit(q.company_id, q.job_id, 'exception', xid, 'requested', jsonb_build_object('kind', _kind, 'requirement_id', _requirement_id));
  RETURN xid;
END $$;

CREATE OR REPLACE FUNCTION public.decide_doc_exception(_exception_id uuid, _approve boolean, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE x public.doc_requirement_exceptions%ROWTYPE;
BEGIN
  SELECT * INTO x FROM public.doc_requirement_exceptions WHERE id = _exception_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_doc_exception_approver(auth.uid(), x.company_id) THEN
    RAISE EXCEPTION 'doc_access_denied' USING ERRCODE = '42501';
  END IF;
  IF x.status <> 'requested' THEN RAISE EXCEPTION 'doc_exception_closed' USING ERRCODE = '22023'; END IF;
  IF x.requested_by = auth.uid() THEN RAISE EXCEPTION 'doc_self_approval_forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.doc_requirement_exceptions SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(_note, '')), '')
  WHERE id = _exception_id;
  IF _approve THEN
    UPDATE public.doc_job_requirements SET status = CASE WHEN x.kind = 'substitute' THEN 'substituted' ELSE 'waived' END,
      substitute_template_id = x.substitute_template_id
    WHERE id = x.job_requirement_id;
  END IF;
  PERFORM public.doc_audit(x.company_id, x.job_id, 'exception', _exception_id, CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    jsonb_build_object('rules_version', x.rules_version, 'note', _note));
END $$;

-- Read-only progress; never changes job state. Unknown/misconfigured = needs clarification, never passes.
CREATE OR REPLACE FUNCTION public.get_job_doc_progress(_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e record; s record; steps jsonb := '[]'::jsonb; q record; inst record; st text; tpl uuid;
  has_risk boolean; has_close boolean; state text; open_req boolean; n_done int := 0; n_total int := 0;
BEGIN
  IF NOT public.doc_can_view_job(_job_id) THEN RAISE EXCEPTION 'doc_access_denied' USING ERRCODE = '42501'; END IF;
  SELECT ev.id, ev.company_id, ev.status, p.category_id AS doc_category_id, coalesce(p.conditions, '{}') AS doc_conditions, c.name AS category_name
    INTO e FROM public.events ev LEFT JOIN public.doc_job_profiles p ON p.job_id = ev.id
    LEFT JOIN public.doc_job_categories c ON c.id = p.category_id WHERE ev.id = _job_id;
  SELECT * INTO s FROM public.doc_company_settings WHERE company_id = e.company_id;

  IF EXISTS (SELECT 1 FROM public.doc_job_requirements WHERE job_id = _job_id) THEN
    state := 'active';
    FOR q IN SELECT * FROM public.doc_job_requirements WHERE job_id = _job_id
             ORDER BY CASE kind WHEN 'risk_assessment' THEN 0 WHEN 'closing_documentation' THEN 2 ELSE 1 END, created_at LOOP
      tpl := coalesce(q.substitute_template_id, q.template_id);
      SELECT fi.id, fi.status, fi.validated_at INTO inst FROM public.form_instances fi
        WHERE fi.project_id = _job_id AND fi.template_id = tpl
        ORDER BY (fi.validated_at IS NOT NULL) DESC, fi.updated_at DESC LIMIT 1;
      SELECT EXISTS (SELECT 1 FROM public.doc_requirement_exceptions x WHERE x.job_requirement_id = q.id AND x.status = 'requested') INTO open_req;
      st := CASE
        WHEN q.status = 'waived' THEN 'waived'
        WHEN inst.id IS NULL THEN 'missing'
        WHEN inst.status IN ('completed','signed') AND inst.validated_at IS NOT NULL THEN 'delivered'
        WHEN inst.status IN ('completed','signed') THEN 'needs_review'
        ELSE 'in_progress' END;
      n_total := n_total + 1;
      IF st IN ('delivered','waived') THEN n_done := n_done + 1; END IF;
      steps := steps || jsonb_build_object('requirement_id', q.id, 'kind', q.kind, 'label', q.label, 'template_id', tpl,
        'instance_id', inst.id, 'instance_status', inst.status, 'status', st, 'requirement_status', q.status,
        'exception_requested', open_req, 'rules_version', q.rules_version);
      inst := NULL;
    END LOOP;
  ELSIF s.company_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.doc_job_categories WHERE company_id = e.company_id) THEN
    state := 'company_not_configured';
  ELSIF e.doc_category_id IS NULL THEN
    state := 'needs_clarification';
  ELSE
    SELECT bool_or(kind = 'risk_assessment'), bool_or(kind = 'closing_documentation') INTO has_risk, has_close
    FROM public.doc_requirement_rules r WHERE r.category_id = e.doc_category_id AND r.is_active AND r.approved_at IS NOT NULL
      AND (r.condition = 'always' OR r.condition = ANY(e.doc_conditions));
    state := CASE WHEN coalesce(has_risk, false) AND coalesce(has_close, false) THEN 'not_snapshotted' ELSE 'requirements_must_be_configured' END;
  END IF;

  RETURN jsonb_build_object(
    'job_id', _job_id, 'state', state, 'category_id', e.doc_category_id, 'category_name', e.category_name,
    'conditions', to_jsonb(e.doc_conditions), 'enforcement_enabled', coalesce(s.enforcement_enabled, false),
    'work_status', e.status, 'steps', steps, 'done', n_done, 'total', n_total,
    'documentation_status', CASE WHEN state <> 'active' THEN NULL WHEN n_done = n_total THEN 'delivered' ELSE 'pending' END,
    -- Approval (A4) and invoice readiness (A1.7) are not implemented; never reported as satisfied.
    'approval_status', 'not_available', 'invoice_ready', false);
END $$;

REVOKE ALL ON FUNCTION public.doc_can_manage(uuid), public.is_doc_exception_approver(uuid, uuid), public.doc_can_view(uuid),
  public.doc_can_view_job(uuid), public.doc_audit(uuid, uuid, text, uuid, text, jsonb), public.approve_doc_rule(uuid),
  public.set_doc_exception_approver(uuid, uuid, boolean), public.set_job_doc_category(uuid, uuid, text[]),
  public.snapshot_job_doc_requirements(uuid), public.start_requirement_form(uuid),
  public.request_doc_exception(uuid, text, text, uuid), public.decide_doc_exception(uuid, boolean, text),
  public.get_job_doc_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doc_can_manage(uuid), public.is_doc_exception_approver(uuid, uuid), public.doc_can_view(uuid), public.doc_can_view_job(uuid), public.approve_doc_rule(uuid),
  public.set_doc_exception_approver(uuid, uuid, boolean), public.set_job_doc_category(uuid, uuid, text[]),
  public.snapshot_job_doc_requirements(uuid), public.start_requirement_form(uuid),
  public.request_doc_exception(uuid, text, text, uuid), public.decide_doc_exception(uuid, boolean, text),
  public.get_job_doc_progress(uuid) TO authenticated;
