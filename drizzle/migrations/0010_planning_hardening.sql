-- 1) Prosjekter uten selskap: kun oppretter, medlemmer og super admin (tidligere: alle innloggede)
CREATE OR REPLACE FUNCTION public.has_planning_project_access(_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.planning_projects p
    WHERE p.id = _project_id AND p.deleted_at IS NULL
      AND (
        public.is_super_admin(auth.uid())
        OR (p.company_id IS NULL AND p.created_by = auth.uid())
        OR (p.company_id IS NOT NULL AND public.is_company_member(auth.uid(), p.company_id))
        OR EXISTS (SELECT 1 FROM public.planning_members m WHERE m.planning_project_id = p.id AND m.user_id = auth.uid())
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_planning_finance()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_admin() OR public.check_permission_v2(auth.uid(), 'jobs.view_pricing')
$$;

DROP POLICY IF EXISTS planning_projects_select ON public.planning_projects;
DROP POLICY IF EXISTS planning_projects_update ON public.planning_projects;
DROP POLICY IF EXISTS planning_projects_delete ON public.planning_projects;
DROP POLICY IF EXISTS planning_projects_insert ON public.planning_projects;

CREATE POLICY planning_projects_select ON public.planning_projects FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
    OR (company_id IS NULL AND created_by = auth.uid())
    OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id))
    OR EXISTS (SELECT 1 FROM public.planning_members m WHERE m.planning_project_id = id AND m.user_id = auth.uid()));
CREATE POLICY planning_projects_insert ON public.planning_projects FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.is_super_admin(auth.uid()) OR company_id IS NULL OR public.is_company_member(auth.uid(), company_id)));
CREATE POLICY planning_projects_update ON public.planning_projects FOR UPDATE TO authenticated
  USING (public.has_planning_project_access(id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (company_id IS NULL AND created_by = auth.uid()) OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id)) OR EXISTS (SELECT 1 FROM public.planning_members m WHERE m.planning_project_id = id AND m.user_id = auth.uid()));
CREATE POLICY planning_projects_delete ON public.planning_projects FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR created_by = auth.uid());

-- 2) Økonomikolonner: ikke lesbare/skrivbare direkte; kun via RPC med prisrettighet
REVOKE SELECT, INSERT, UPDATE ON public.planning_projects FROM authenticated;
GRANT SELECT (id,name,description,status,company_id,department_id,customer_id,customer_contact_id,owner_user_id,expected_start,expected_end,period_label,contract_form,invoicing_company_id,invoice_recipient,estimated_hours,linked_event_id,visibility,created_by,created_at,updated_at,deleted_at,deleted_by) ON public.planning_projects TO authenticated;
GRANT INSERT (id,name,description,status,company_id,department_id,customer_id,customer_contact_id,owner_user_id,expected_start,expected_end,period_label,contract_form,invoicing_company_id,invoice_recipient,estimated_hours,visibility,created_by) ON public.planning_projects TO authenticated;
GRANT UPDATE (name,description,status,company_id,department_id,customer_id,customer_contact_id,owner_user_id,expected_start,expected_end,period_label,contract_form,invoicing_company_id,invoice_recipient,estimated_hours,linked_event_id,visibility,updated_at,deleted_at,deleted_by) ON public.planning_projects TO authenticated;

REVOKE SELECT, INSERT, UPDATE ON public.planning_work_packages FROM authenticated;
GRANT SELECT (id,planning_project_id,name,description,status,responsible_company_id,responsible_department_id,responsible_person_id,external_vendor_name,planned_start,planned_end,resource_count,estimated_hours,price_form,billing_from_company_id,billing_to_company_id,assignment_state,linked_event_id,comment,sort_order,created_by,created_at,updated_at) ON public.planning_work_packages TO authenticated;
GRANT INSERT (id,planning_project_id,name,description,status,responsible_company_id,responsible_department_id,responsible_person_id,external_vendor_name,planned_start,planned_end,resource_count,estimated_hours,price_form,billing_from_company_id,billing_to_company_id,assignment_state,comment,sort_order,created_by) ON public.planning_work_packages TO authenticated;
GRANT UPDATE (name,description,status,responsible_company_id,responsible_department_id,responsible_person_id,external_vendor_name,planned_start,planned_end,resource_count,estimated_hours,price_form,billing_from_company_id,billing_to_company_id,assignment_state,comment,sort_order,updated_at) ON public.planning_work_packages TO authenticated;

CREATE OR REPLACE FUNCTION public.get_planning_finance(_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_planning_project_access(_project_id) OR NOT public.can_view_planning_finance() THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object(
    'contract_value', p.contract_value, 'budget_value', p.budget_value,
    'hourly_rate', p.hourly_rate, 'estimated_material_cost', p.estimated_material_cost,
    'work_packages', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', w.id, 'agreed_price', w.agreed_price, 'hourly_rate', w.hourly_rate))
       FROM public.planning_work_packages w WHERE w.planning_project_id = p.id), '[]'::jsonb))
  INTO r FROM public.planning_projects p WHERE p.id = _project_id;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.set_planning_project_finance(_project_id uuid, _patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_planning_project_access(_project_id) OR NOT public.can_view_planning_finance() THEN
    RAISE EXCEPTION 'Mangler tilgang til prosjektøkonomi' USING ERRCODE = '42501';
  END IF;
  UPDATE public.planning_projects SET
    contract_value = CASE WHEN _patch ? 'contract_value' THEN NULLIF(_patch->>'contract_value','')::numeric ELSE contract_value END,
    budget_value = CASE WHEN _patch ? 'budget_value' THEN NULLIF(_patch->>'budget_value','')::numeric ELSE budget_value END,
    hourly_rate = CASE WHEN _patch ? 'hourly_rate' THEN NULLIF(_patch->>'hourly_rate','')::numeric ELSE hourly_rate END,
    estimated_material_cost = CASE WHEN _patch ? 'estimated_material_cost' THEN NULLIF(_patch->>'estimated_material_cost','')::numeric ELSE estimated_material_cost END,
    updated_at = now()
  WHERE id = _project_id;
END $$;

CREATE OR REPLACE FUNCTION public.set_planning_wp_finance(_wp_id uuid, _patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pid uuid;
BEGIN
  SELECT planning_project_id INTO pid FROM public.planning_work_packages WHERE id = _wp_id;
  IF pid IS NULL OR NOT public.has_planning_project_access(pid) OR NOT public.can_view_planning_finance() THEN
    RAISE EXCEPTION 'Mangler tilgang til prosjektøkonomi' USING ERRCODE = '42501';
  END IF;
  UPDATE public.planning_work_packages SET
    agreed_price = CASE WHEN _patch ? 'agreed_price' THEN NULLIF(_patch->>'agreed_price','')::numeric ELSE agreed_price END,
    hourly_rate = CASE WHEN _patch ? 'hourly_rate' THEN NULLIF(_patch->>'hourly_rate','')::numeric ELSE hourly_rate END,
    updated_at = now()
  WHERE id = _wp_id;
END $$;

-- 3) Kobling tilbake fra ressursplan
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS planning_project_id uuid REFERENCES public.planning_projects(id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS planning_work_package_id uuid REFERENCES public.planning_work_packages(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS events_planning_wp_active_uniq ON public.events (planning_work_package_id)
  WHERE planning_work_package_id IS NOT NULL AND deleted_at IS NULL;

-- 4) Idempotent «Send til ressursplan»
CREATE OR REPLACE FUNCTION public.send_planning_wp_to_resource_plan(_wp_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE w record; p record; ev record; new_id uuid; cust text;
BEGIN
  SELECT * INTO w FROM public.planning_work_packages WHERE id = _wp_id FOR UPDATE;
  IF w.id IS NULL OR NOT public.has_planning_project_access(w.planning_project_id) THEN
    RAISE EXCEPTION 'Mangler tilgang' USING ERRCODE = '42501';
  END IF;
  IF w.planned_start IS NULL THEN
    RAISE EXCEPTION 'Sett planlagt start før arbeidspakken sendes til ressursplan';
  END IF;

  -- Allerede sendt og fortsatt aktiv: returner eksisterende
  SELECT id, project_number INTO ev FROM public.events
   WHERE deleted_at IS NULL AND (id = w.linked_event_id OR planning_work_package_id = w.id) LIMIT 1;
  IF ev.id IS NOT NULL THEN
    UPDATE public.planning_work_packages SET linked_event_id = ev.id,
      assignment_state = CASE WHEN assignment_state = 'not_assigned' THEN 'in_resource_plan' ELSE assignment_state END
     WHERE id = w.id;
    RETURN jsonb_build_object('event_id', ev.id, 'project_number', ev.project_number, 'created', false);
  END IF;

  SELECT * INTO p FROM public.planning_projects WHERE id = w.planning_project_id;
  SELECT name INTO cust FROM public.customers WHERE id = p.customer_id;

  INSERT INTO public.events (title, description, start_time, end_time, status, project_type,
     company_id, department_id, customer, customer_id, created_by,
     planning_project_id, planning_work_package_id)
  VALUES (
     p.name || ' – ' || w.name,
     concat_ws(E'\n\n', w.description,
       CASE WHEN w.resource_count IS NOT NULL OR w.estimated_hours IS NOT NULL THEN
         'Ressursbehov: ' || concat_ws(' · ', CASE WHEN w.resource_count IS NOT NULL THEN w.resource_count || ' personer' END,
                                             CASE WHEN w.estimated_hours IS NOT NULL THEN w.estimated_hours || ' timer' END) END),
     ((w.planned_start::text || ' 07:00')::timestamp AT TIME ZONE 'Europe/Oslo'),
     ((COALESCE(w.planned_end, w.planned_start)::text || ' 15:00')::timestamp AT TIME ZONE 'Europe/Oslo'),
     'requested', 'project',
     COALESCE(w.responsible_company_id, p.company_id), COALESCE(w.responsible_department_id, p.department_id),
     cust, p.customer_id, auth.uid(), p.id, w.id)
  RETURNING id INTO new_id;

  UPDATE public.planning_work_packages SET linked_event_id = new_id, assignment_state = 'in_resource_plan', updated_at = now() WHERE id = w.id;
  INSERT INTO public.planning_activity (planning_project_id, action, summary, performed_by, metadata)
  VALUES (p.id, 'sent_to_resource_plan', 'Ressursbehov sendt til ressursplan: ' || w.name, auth.uid(), jsonb_build_object('event_id', new_id, 'work_package_id', w.id));

  SELECT project_number INTO ev FROM public.events WHERE id = new_id;
  RETURN jsonb_build_object('event_id', new_id, 'project_number', ev.project_number, 'created', true);
END $$;

-- 5) Datoendring på arbeidspakke: flytt ressursbehovet bare før personer er tildelt
CREATE OR REPLACE FUNCTION public.planning_wp_sync_dates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE assigned int;
BEGIN
  IF NEW.linked_event_id IS NULL OR NEW.planned_start IS NULL THEN RETURN NEW; END IF;
  IF NEW.planned_start IS NOT DISTINCT FROM OLD.planned_start AND NEW.planned_end IS NOT DISTINCT FROM OLD.planned_end THEN RETURN NEW; END IF;
  SELECT count(*) INTO assigned FROM public.event_technicians WHERE event_id = NEW.linked_event_id;
  IF assigned = 0 THEN
    UPDATE public.events SET
      start_time = ((NEW.planned_start::text || ' 07:00')::timestamp AT TIME ZONE 'Europe/Oslo'),
      end_time = ((COALESCE(NEW.planned_end, NEW.planned_start)::text || ' 15:00')::timestamp AT TIME ZONE 'Europe/Oslo')
    WHERE id = NEW.linked_event_id AND deleted_at IS NULL AND technician_id IS NULL;
    INSERT INTO public.planning_activity (planning_project_id, action, summary, performed_by)
    VALUES (NEW.planning_project_id, 'resource_dates_synced', 'Datoer oppdatert i ressursplan: ' || NEW.name, auth.uid());
  ELSE
    INSERT INTO public.planning_activity (planning_project_id, action, summary, performed_by)
    VALUES (NEW.planning_project_id, 'resource_dates_mismatch', 'Dato endret på ' || NEW.name || ' – personer er allerede tildelt, så ressursplanen må justeres der', auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_planning_wp_sync_dates ON public.planning_work_packages;
CREATE TRIGGER trg_planning_wp_sync_dates AFTER UPDATE OF planned_start, planned_end ON public.planning_work_packages
  FOR EACH ROW EXECUTE FUNCTION public.planning_wp_sync_dates();

GRANT EXECUTE ON FUNCTION public.get_planning_finance(uuid), public.set_planning_project_finance(uuid, jsonb), public.set_planning_wp_finance(uuid, jsonb), public.send_planning_wp_to_resource_plan(uuid), public.can_view_planning_finance() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_planning_finance(uuid), public.set_planning_project_finance(uuid, jsonb), public.set_planning_wp_finance(uuid, jsonb), public.send_planning_wp_to_resource_plan(uuid) FROM anon;