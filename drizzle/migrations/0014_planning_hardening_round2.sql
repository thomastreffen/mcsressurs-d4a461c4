-- 1) Historikk: fyll inn faktisk navn på den som utførte handlingen
CREATE OR REPLACE FUNCTION public.planning_activity_fill_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.performed_by IS NULL THEN NEW.performed_by := auth.uid(); END IF;
  IF NEW.performed_by IS NOT NULL AND (NEW.performed_by_name IS NULL OR NEW.performed_by_name = '') THEN
    SELECT name INTO NEW.performed_by_name FROM public.technicians WHERE user_id = NEW.performed_by AND name IS NOT NULL LIMIT 1;
    IF NEW.performed_by_name IS NULL THEN
      SELECT pe.full_name INTO NEW.performed_by_name FROM public.user_accounts ua JOIN public.people pe ON pe.id = ua.person_id
       WHERE ua.auth_user_id = NEW.performed_by LIMIT 1;
    END IF;
    IF NEW.performed_by_name IS NULL THEN
      SELECT email INTO NEW.performed_by_name FROM auth.users WHERE id = NEW.performed_by;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_planning_activity_fill_actor ON public.planning_activity;
CREATE TRIGGER trg_planning_activity_fill_actor BEFORE INSERT ON public.planning_activity
  FOR EACH ROW EXECUTE FUNCTION public.planning_activity_fill_actor();

-- Backfill eksisterende rader som har bruker men mangler navn
UPDATE public.planning_activity a SET performed_by_name = t.name
  FROM public.technicians t WHERE a.performed_by_name IS NULL AND a.performed_by = t.user_id AND t.name IS NOT NULL;

-- 2) Bemanningsstatus fra ressursplanen (source of truth: events + event_technicians)
CREATE OR REPLACE FUNCTION public.get_planning_wp_staffing(_project_id uuid)
RETURNS TABLE(work_package_id uuid, event_id uuid, project_number text, assigned_count int, needed int,
              event_start timestamptz, event_end timestamptz, date_mismatch boolean, event_missing boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_planning_project_access(_project_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT w.id, e.id, e.project_number::text,
    (SELECT count(DISTINCT x.tid)::int FROM (
       SELECT et.technician_id AS tid FROM public.event_technicians et WHERE et.event_id = e.id
       UNION SELECT e.technician_id WHERE e.technician_id IS NOT NULL) x),
    w.resource_count::int,
    e.start_time, e.end_time,
    CASE WHEN e.id IS NULL OR w.planned_start IS NULL THEN false
         ELSE (e.start_time AT TIME ZONE 'Europe/Oslo')::date <> w.planned_start
           OR (e.end_time AT TIME ZONE 'Europe/Oslo')::date <> COALESCE(w.planned_end, w.planned_start) END,
    (w.linked_event_id IS NOT NULL AND e.id IS NULL)
  FROM public.planning_work_packages w
  LEFT JOIN public.events e ON e.id = w.linked_event_id AND e.deleted_at IS NULL
  WHERE w.planning_project_id = _project_id;
END $$;
GRANT EXECUTE ON FUNCTION public.get_planning_wp_staffing(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_planning_wp_staffing(uuid) FROM anon, public;

-- 3) Personregister: ingen global tilgang for vanlig admin, kun superadmin
DROP POLICY IF EXISTS "Users can read people in their companies" ON public.people;
CREATE POLICY "Users can read people in their companies" ON public.people FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.employment_profiles ep WHERE ep.person_id = people.id AND public.is_company_member(auth.uid(), ep.company_id))
  OR EXISTS (SELECT 1 FROM public.user_accounts ua WHERE ua.person_id = people.id AND ua.auth_user_id = auth.uid())
  OR (public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.employment_profiles ep2 WHERE ep2.person_id = people.id))
);
DROP POLICY IF EXISTS "Admins can manage people" ON public.people;
CREATE POLICY "Admins can manage people" ON public.people FOR ALL TO authenticated
USING (public.is_admin() AND (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.employment_profiles ep WHERE ep.person_id = people.id AND public.is_active_member_of(ep.company_id))
  OR NOT EXISTS (SELECT 1 FROM public.employment_profiles ep2 WHERE ep2.person_id = people.id)))
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read own or same-company accounts" ON public.user_accounts;
CREATE POLICY "Users read own or same-company accounts" ON public.user_accounts FOR SELECT TO authenticated
USING (
  auth_user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_memberships um WHERE um.user_id = auth.uid() AND um.is_active = true AND um.company_id = user_accounts.company_id)
);
DROP POLICY IF EXISTS "Admins can manage user_accounts" ON public.user_accounts;
CREATE POLICY "Admins can manage user_accounts" ON public.user_accounts FOR ALL TO authenticated
USING (public.is_admin() AND (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id)))
WITH CHECK (public.is_admin() AND (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id)));

-- Montørregister: 'scope.view.all' ga global innsyn for planlegger-rollen; nå kun superadmin globalt
DROP POLICY IF EXISTS "Company-scoped technician access" ON public.technicians;
CREATE POLICY "Company-scoped technician access" ON public.technicians FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.employment_profiles ep
    JOIN public.user_memberships um ON um.company_id = ep.company_id AND um.user_id = auth.uid() AND um.is_active = true
    WHERE ep.archived_at IS NULL AND ep.person_id = (
      SELECT ua.person_id FROM public.user_accounts ua WHERE ua.auth_user_id = technicians.user_id AND ua.is_active = true LIMIT 1))
);

-- 4) Privat fillager for nye Planlegging-filer: sti = {prosjekt-id}/...
CREATE OR REPLACE FUNCTION public.planning_storage_access(_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pid uuid;
BEGIN
  BEGIN pid := split_part(_name, '/', 1)::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  RETURN public.has_planning_project_access(pid);
END $$;
GRANT EXECUTE ON FUNCTION public.planning_storage_access(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.planning_storage_access(text) FROM anon, public;

DROP POLICY IF EXISTS planning_files_read ON storage.objects;
DROP POLICY IF EXISTS planning_files_insert ON storage.objects;
DROP POLICY IF EXISTS planning_files_delete ON storage.objects;
CREATE POLICY planning_files_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'planning-files' AND public.planning_storage_access(name));
CREATE POLICY planning_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'planning-files' AND public.planning_storage_access(name));
CREATE POLICY planning_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'planning-files' AND public.planning_storage_access(name));

ALTER TABLE public.planning_files ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'job-attachments';
COMMENT ON COLUMN public.planning_files.storage_bucket IS 'job-attachments = legacy offentlig; planning-files = privat med signerte lenker';
GRANT SELECT (storage_bucket), INSERT (storage_bucket) ON public.planning_files TO authenticated;