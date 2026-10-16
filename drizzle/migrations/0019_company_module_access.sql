ALTER TABLE public.employment_profiles ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
UPDATE public.employment_profiles ep SET is_primary = true
WHERE archived_at IS NULL AND (SELECT count(*) FROM public.employment_profiles x WHERE x.person_id = ep.person_id AND x.archived_at IS NULL) = 1;
CREATE UNIQUE INDEX IF NOT EXISTS employment_profiles_one_primary ON public.employment_profiles(person_id) WHERE is_primary AND archived_at IS NULL;

CREATE TABLE public.company_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('resource_plan','planning','customers','hms','finance','organisation','employees','documents')),
  level text NOT NULL CHECK (level IN ('view','edit','admin')),
  valid_from date,
  valid_to date,
  reason text,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid
);
CREATE UNIQUE INDEX company_module_access_active ON public.company_module_access(user_id, company_id, module) WHERE revoked_at IS NULL;

CREATE TABLE public.access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  home_company_id uuid,
  company_id uuid,
  module text,
  level text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.company_module_access TO authenticated;
GRANT ALL ON public.company_module_access TO service_role;
GRANT SELECT ON public.access_audit_log TO authenticated;
GRANT ALL ON public.access_audit_log TO service_role;
ALTER TABLE public.company_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY cma_select ON public.company_module_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY cma_insert ON public.company_module_access FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY cma_update ON public.company_module_access FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY aal_select ON public.access_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.home_company_of(_uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ep.company_id FROM public.user_accounts ua
  JOIN public.employment_profiles ep ON ep.person_id = ua.person_id
  WHERE ua.auth_user_id = _uid AND ep.archived_at IS NULL
  ORDER BY ep.is_primary DESC, ep.created_at LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_employee_of(_uid uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_accounts ua
    JOIN public.employment_profiles ep ON ep.person_id = ua.person_id
    WHERE ua.auth_user_id = _uid AND ep.company_id = _company AND ep.archived_at IS NULL
      AND ep.relationship_type = 'employee')
$$;

CREATE OR REPLACE FUNCTION public.has_company_access(_uid uuid, _company uuid, _module text, _level text DEFAULT 'view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND _company IS NOT NULL AND (
    public.has_role(_uid, 'super_admin')
    OR public.is_employee_of(_uid, _company)
    OR EXISTS (SELECT 1 FROM public.company_module_access g
      WHERE g.user_id = _uid AND g.company_id = _company AND g.module = _module AND g.revoked_at IS NULL
        AND (g.valid_from IS NULL OR g.valid_from <= current_date)
        AND (g.valid_to IS NULL OR g.valid_to >= current_date)
        AND (CASE g.level WHEN 'admin' THEN 3 WHEN 'edit' THEN 2 ELSE 1 END)
            >= (CASE _level WHEN 'admin' THEN 3 WHEN 'edit' THEN 2 ELSE 1 END))
  )
$$;
GRANT EXECUTE ON FUNCTION public.has_company_access(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_employee_of(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_company_module_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE act text;
BEGIN
  IF TG_OP = 'INSERT' THEN act := 'granted';
  ELSIF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN act := 'revoked';
  ELSE act := 'changed'; END IF;
  INSERT INTO public.access_audit_log(user_id, home_company_id, company_id, module, level, action, details, performed_by)
  VALUES (NEW.user_id, public.home_company_of(NEW.user_id), NEW.company_id, NEW.module, NEW.level, act,
    jsonb_build_object('reason', NEW.reason, 'valid_from', NEW.valid_from, 'valid_to', NEW.valid_to,
      'old_level', CASE WHEN TG_OP = 'UPDATE' THEN OLD.level END),
    COALESCE(auth.uid(), NEW.granted_by));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_log_company_module_access AFTER INSERT OR UPDATE ON public.company_module_access
FOR EACH ROW EXECUTE FUNCTION public.log_company_module_access();