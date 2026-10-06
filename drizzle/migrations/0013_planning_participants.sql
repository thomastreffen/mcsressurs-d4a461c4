-- Prosjektdeltakere = interne brukere i planning_members (member_type='internal').
-- Kunde og kundekontakter gir aldri deltakelse/tilgang.
CREATE UNIQUE INDEX IF NOT EXISTS planning_members_project_user_uniq
  ON public.planning_members (planning_project_id, user_id) WHERE user_id IS NOT NULL;

-- Hvem innlogget bruker har lov til å se/legge til som deltaker:
-- aktive brukere i selskaper der innlogget bruker selv er aktivt medlem (super admin: alle). Kundeportalbrukere utelates.
CREATE OR REPLACE FUNCTION public.planning_eligible_participants()
RETURNS TABLE (user_id uuid, full_name text, company_id uuid, company_name text, department_id uuid, department_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT ON (um.user_id, um.company_id)
    um.user_id, COALESCE(pe.full_name, t.name, 'Ukjent') AS full_name,
    um.company_id, c.name, um.department_id, d.name
  FROM public.user_memberships um
  JOIN public.internal_companies c ON c.id = um.company_id
  LEFT JOIN public.departments d ON d.id = um.department_id
  LEFT JOIN public.user_accounts ua ON ua.auth_user_id = um.user_id
  LEFT JOIN public.people pe ON pe.id = ua.person_id
  LEFT JOIN public.technicians t ON t.user_id = um.user_id
  WHERE um.is_active = true
    AND NOT public.has_role(um.user_id, 'customer_user')
    AND (public.is_super_admin(auth.uid()) OR public.is_active_member_of(um.company_id))
  ORDER BY um.user_id, um.company_id
$$;
GRANT EXECUTE ON FUNCTION public.planning_eligible_participants() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.planning_eligible_participants() FROM anon;

-- Håndhev i databasen: kun brukere du har lov til å se, og sett lagt-til-av / firma / avdeling
CREATE OR REPLACE FUNCTION public.planning_members_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m record;
BEGIN
  IF NEW.member_type = 'internal' AND NEW.user_id IS NOT NULL AND auth.uid() IS NOT NULL THEN
    SELECT * INTO m FROM public.planning_eligible_participants() e
      WHERE e.user_id = NEW.user_id
      ORDER BY (e.company_id = NEW.company_id) DESC NULLS LAST LIMIT 1;
    IF m.user_id IS NULL THEN
      RAISE EXCEPTION 'Du kan ikke legge til denne personen som deltaker' USING ERRCODE = '42501';
    END IF;
    NEW.company_id := COALESCE(NEW.company_id, m.company_id);
    NEW.department_id := COALESCE(NEW.department_id, m.department_id);
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_planning_members_validate ON public.planning_members;
CREATE TRIGGER trg_planning_members_validate BEFORE INSERT OR UPDATE ON public.planning_members
  FOR EACH ROW EXECUTE FUNCTION public.planning_members_validate();

-- Overordnet ansvarlig er alltid deltaker med rolle 'owner'
CREATE OR REPLACE FUNCTION public.planning_sync_owner_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.owner_user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_user_id IS NOT DISTINCT FROM OLD.owner_user_id THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.owner_user_id IS NOT NULL THEN
    UPDATE public.planning_members SET role = 'member'
     WHERE planning_project_id = NEW.id AND user_id = OLD.owner_user_id AND role = 'owner';
  END IF;
  INSERT INTO public.planning_members (planning_project_id, user_id, role, member_type, created_by)
  VALUES (NEW.id, NEW.owner_user_id, 'owner', 'internal', auth.uid())
  ON CONFLICT (planning_project_id, user_id) WHERE user_id IS NOT NULL DO UPDATE SET role = 'owner';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_planning_sync_owner_member ON public.planning_projects;
CREATE TRIGGER trg_planning_sync_owner_member AFTER INSERT OR UPDATE OF owner_user_id ON public.planning_projects
  FOR EACH ROW EXECUTE FUNCTION public.planning_sync_owner_member();

-- Backfill eiere på eksisterende prosjekter
INSERT INTO public.planning_members (planning_project_id, user_id, role, member_type, created_by)
SELECT p.id, p.owner_user_id, 'owner', 'internal', p.created_by FROM public.planning_projects p
WHERE p.owner_user_id IS NOT NULL
ON CONFLICT (planning_project_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;