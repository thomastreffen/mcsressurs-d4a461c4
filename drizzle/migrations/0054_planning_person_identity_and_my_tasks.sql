-- 1) Person <-> login: audit trail + uniqueness
ALTER TABLE public.user_accounts
  ADD COLUMN IF NOT EXISTS link_source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid;

COMMENT ON COLUMN public.user_accounts.link_source IS 'How the person<->login link was established: legacy | auto_exact_email | admin';
COMMENT ON COLUMN public.user_accounts.company_id IS 'Access scope for admin of the account row only. NOT an organisational responsibility line; use employment_profiles / task company_id.';

-- Backfill: unambiguous existing links (active, same normalised email, active employee employment)
UPDATE public.user_accounts ua
   SET link_source = 'auto_exact_email', verified_at = now()
  FROM public.people p, auth.users u
 WHERE ua.is_active AND ua.verified_at IS NULL
   AND p.id = ua.person_id AND p.is_active
   AND u.id = ua.auth_user_id
   AND lower(trim(p.email)) = lower(trim(u.email))
   AND EXISTS (SELECT 1 FROM public.employment_profiles e
                WHERE e.person_id = p.id AND e.archived_at IS NULL AND coalesce(e.relationship_type,'employee') = 'employee');

CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_one_active_per_person
  ON public.user_accounts (person_id) WHERE is_active;

-- 2) Verified recipient helper
CREATE OR REPLACE FUNCTION public.person_has_verified_login(_person_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_accounts ua
                  WHERE ua.person_id = _person_id AND ua.is_active AND ua.verified_at IS NOT NULL)
$$;

-- 3) Cross-MCS person directory (names + org context only)
CREATE OR REPLACE FUNCTION public.planning_person_directory()
RETURNS TABLE (person_id uuid, full_name text, company_id uuid, company_name text,
               department_id uuid, department_name text, is_primary boolean, can_notify boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, e.company_id, c.name, e.department_id, d.name,
         coalesce(e.is_primary, false), public.person_has_verified_login(p.id)
    FROM public.employment_profiles e
    JOIN public.people p ON p.id = e.person_id AND p.is_active
    JOIN public.internal_companies c ON c.id = e.company_id AND c.is_active
    LEFT JOIN public.departments d ON d.id = e.department_id
   WHERE e.archived_at IS NULL
     AND coalesce(e.relationship_type,'employee') = 'employee'
     AND EXISTS (SELECT 1 FROM public.user_memberships m WHERE m.user_id = auth.uid() AND m.is_active)
   ORDER BY p.full_name, e.is_primary DESC NULLS LAST, c.name
$$;
REVOKE ALL ON FUNCTION public.planning_person_directory() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.planning_person_directory() TO authenticated;

-- 4) Server-side validation of assignee org context on planning_tasks
CREATE OR REPLACE FUNCTION public.validate_planning_task_assignee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prim record;
BEGIN
  IF NEW.assignee_person_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.assignee_person_id IS NOT DISTINCT FROM OLD.assignee_person_id
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN
    SELECT e.company_id, e.department_id INTO prim FROM public.employment_profiles e
     WHERE e.person_id = NEW.assignee_person_id AND e.archived_at IS NULL
       AND coalesce(e.relationship_type,'employee') = 'employee'
     ORDER BY e.is_primary DESC NULLS LAST, e.created_at LIMIT 1;
    IF prim.company_id IS NULL THEN
      RAISE EXCEPTION 'Personen har ingen aktiv ansettelse' USING ERRCODE = '23514';
    END IF;
    NEW.company_id := prim.company_id;
    NEW.department_id := coalesce(NEW.department_id, prim.department_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employment_profiles e
                  WHERE e.person_id = NEW.assignee_person_id AND e.archived_at IS NULL
                    AND coalesce(e.relationship_type,'employee') = 'employee'
                    AND e.company_id = NEW.company_id
                    AND (NEW.department_id IS NULL OR e.department_id = NEW.department_id)) THEN
    RAISE EXCEPTION 'Personen er ikke ansatt i valgt selskap/avdeling' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_planning_task_assignee ON public.planning_tasks;
CREATE TRIGGER trg_validate_planning_task_assignee
  BEFORE INSERT OR UPDATE ON public.planning_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_planning_task_assignee();

-- 5) Recipient's own planning tasks (read-only, no economy)
CREATE OR REPLACE FUNCTION public.my_planning_tasks()
RETURNS TABLE (id uuid, title text, description text, status text, due_date date,
               planning_project_id uuid, project_name text, work_package_name text,
               company_name text, department_name text, can_open_project boolean, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.title, t.description, t.status, t.due_date,
         p.id, p.name, w.name, c.name, d.name,
         public.has_planning_project_access(p.id), t.updated_at
    FROM public.user_accounts ua
    JOIN public.planning_tasks t ON t.assignee_person_id = ua.person_id
    JOIN public.planning_projects p ON p.id = t.planning_project_id AND p.deleted_at IS NULL
    LEFT JOIN public.planning_work_packages w ON w.id = t.work_package_id
    LEFT JOIN public.internal_companies c ON c.id = t.company_id
    LEFT JOIN public.departments d ON d.id = t.department_id
   WHERE ua.auth_user_id = auth.uid() AND ua.is_active
   ORDER BY (t.status = 'done'), t.due_date NULLS LAST, t.created_at
$$;
REVOKE ALL ON FUNCTION public.my_planning_tasks() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_planning_tasks() TO authenticated;

-- 6) Admin review of uncertain/missing links (super admin only)
CREATE OR REPLACE FUNCTION public.person_login_link_review()
RETURNS TABLE (person_id uuid, full_name text, email text, issue text, companies text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Mangler tilgang' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH emp AS (
    SELECT e.person_id, string_agg(DISTINCT c.name, ', ') AS companies, count(DISTINCT e.company_id) AS n
      FROM public.employment_profiles e JOIN public.internal_companies c ON c.id = e.company_id
     WHERE e.archived_at IS NULL AND coalesce(e.relationship_type,'employee') = 'employee'
     GROUP BY e.person_id
  )
  SELECT p.id, p.full_name, p.email,
         CASE
           WHEN ua.id IS NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE lower(trim(u.email)) = lower(trim(p.email)))
             THEN 'Innlogging finnes med samme e-post, men er ikke koblet'
           WHEN ua.id IS NULL THEN 'Mangler innlogging'
           WHEN u.id IS NULL OR lower(trim(u.email)) <> lower(trim(p.email)) THEN 'E-post på person og innlogging er ulik'
           WHEN ua.verified_at IS NULL THEN 'Kobling ikke bekreftet'
           ELSE 'Flere ansettelser – velg selskap per oppgave'
         END,
         emp.companies
    FROM public.people p
    JOIN emp ON emp.person_id = p.id
    LEFT JOIN public.user_accounts ua ON ua.person_id = p.id AND ua.is_active
    LEFT JOIN auth.users u ON u.id = ua.auth_user_id
   WHERE p.is_active
     AND (ua.id IS NULL OR ua.verified_at IS NULL OR u.id IS NULL
          OR lower(trim(u.email)) <> lower(trim(p.email)) OR emp.n > 1)
   ORDER BY p.full_name;
END $$;
REVOKE ALL ON FUNCTION public.person_login_link_review() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.person_login_link_review() TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_person_login_link(_person_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Mangler tilgang' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_accounts SET verified_at = now(), verified_by = auth.uid(), link_source = 'admin'
   WHERE person_id = _person_id AND is_active AND verified_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingen ubekreftet kobling for personen'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.confirm_person_login_link(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_person_login_link(uuid) TO authenticated;