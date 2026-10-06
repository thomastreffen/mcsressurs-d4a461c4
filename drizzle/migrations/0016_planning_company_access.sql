CREATE TABLE public.planning_company_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  granted_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);
COMMENT ON TABLE public.planning_company_access IS 'Explicit right to create/administer planning projects for a company. Does NOT grant access to employees, technicians, customers or finance in that company.';
GRANT SELECT ON public.planning_company_access TO authenticated;
GRANT ALL ON public.planning_company_access TO service_role;
ALTER TABLE public.planning_company_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY pca_select ON public.planning_company_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.can_plan_for_company(_uid uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND _company_id IS NOT NULL AND (
    public.is_super_admin(_uid)
    OR public.is_company_member(_uid, _company_id)
    OR EXISTS (SELECT 1 FROM public.planning_company_access a WHERE a.user_id = _uid AND a.company_id = _company_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.planning_companies()
RETURNS TABLE(id uuid, name text, is_active boolean, can_plan boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.is_active, public.can_plan_for_company(auth.uid(), c.id)
  FROM public.internal_companies c
  WHERE auth.uid() IS NOT NULL
  ORDER BY c.name
$$;
GRANT EXECUTE ON FUNCTION public.planning_companies() TO authenticated;

CREATE OR REPLACE FUNCTION public.has_planning_project_access(_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.planning_projects p
    WHERE p.id = _project_id AND p.deleted_at IS NULL
      AND (
        public.is_super_admin(auth.uid())
        OR p.created_by = auth.uid()
        OR (p.company_id IS NOT NULL AND public.can_plan_for_company(auth.uid(), p.company_id))
        OR EXISTS (SELECT 1 FROM public.planning_members m WHERE m.planning_project_id = p.id AND m.user_id = auth.uid())
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_planning_member(_project_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.planning_members m WHERE m.planning_project_id = _project_id AND m.user_id = _uid)
$$;

DROP POLICY IF EXISTS planning_projects_select ON public.planning_projects;
CREATE POLICY planning_projects_select ON public.planning_projects FOR SELECT TO authenticated USING (
  public.is_super_admin(auth.uid()) OR created_by = auth.uid()
  OR (company_id IS NOT NULL AND public.can_plan_for_company(auth.uid(), company_id))
  OR public.is_planning_member(id, auth.uid())
);
DROP POLICY IF EXISTS planning_projects_insert ON public.planning_projects;
CREATE POLICY planning_projects_insert ON public.planning_projects FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid() AND (company_id IS NULL OR public.can_plan_for_company(auth.uid(), company_id))
);
DROP POLICY IF EXISTS planning_projects_update ON public.planning_projects;
CREATE POLICY planning_projects_update ON public.planning_projects FOR UPDATE TO authenticated
  USING (public.has_planning_project_access(id))
  WITH CHECK (
    public.is_super_admin(auth.uid()) OR created_by = auth.uid()
    OR (company_id IS NOT NULL AND public.can_plan_for_company(auth.uid(), company_id))
    OR public.is_planning_member(id, auth.uid())
  );

-- Validate company/department choices against planning access
CREATE OR REPLACE FUNCTION public.planning_validate_company_choices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); co uuid; dept uuid; inv uuid;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'planning_projects' THEN
    co := NEW.company_id; dept := NEW.department_id; inv := NEW.invoicing_company_id;
    IF co IS NOT NULL AND (TG_OP = 'INSERT' OR co IS DISTINCT FROM OLD.company_id) AND NOT public.can_plan_for_company(uid, co) THEN
      RAISE EXCEPTION 'Du har ikke planleggingstilgang til valgt ansvarlig firma';
    END IF;
    IF inv IS NOT NULL AND (TG_OP = 'INSERT' OR inv IS DISTINCT FROM OLD.invoicing_company_id) AND NOT public.can_plan_for_company(uid, inv) THEN
      RAISE EXCEPTION 'Du har ikke planleggingstilgang til valgt fakturerende firma';
    END IF;
  ELSE
    co := NEW.responsible_company_id; dept := NEW.responsible_department_id; inv := NEW.billing_from_company_id;
    IF co IS NOT NULL AND (TG_OP = 'INSERT' OR co IS DISTINCT FROM OLD.responsible_company_id) AND NOT public.can_plan_for_company(uid, co) THEN
      RAISE EXCEPTION 'Du har ikke planleggingstilgang til valgt ansvarlig firma';
    END IF;
    IF inv IS NOT NULL AND (TG_OP = 'INSERT' OR inv IS DISTINCT FROM OLD.billing_from_company_id) AND NOT public.can_plan_for_company(uid, inv) THEN
      RAISE EXCEPTION 'Du har ikke planleggingstilgang til valgt fakturerende firma';
    END IF;
  END IF;
  IF dept IS NOT NULL AND co IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = dept AND d.company_id = co) THEN
    RAISE EXCEPTION 'Valgt avdeling tilhører ikke valgt firma';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_planning_projects_company_choices ON public.planning_projects;
CREATE TRIGGER trg_planning_projects_company_choices BEFORE INSERT OR UPDATE ON public.planning_projects
  FOR EACH ROW EXECUTE FUNCTION public.planning_validate_company_choices();
DROP TRIGGER IF EXISTS trg_planning_wp_company_choices ON public.planning_work_packages;
CREATE TRIGGER trg_planning_wp_company_choices BEFORE INSERT OR UPDATE ON public.planning_work_packages
  FOR EACH ROW EXECUTE FUNCTION public.planning_validate_company_choices();