CREATE OR REPLACE FUNCTION public.enforce_tripletex_link_entity()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.mcs_entity_type = 'project' AND NOT EXISTS (SELECT 1 FROM public.events WHERE id = NEW.mcs_entity_id AND entity_type = 'financial_project') THEN
    RAISE EXCEPTION 'Kun økonomiske prosjekter kan kobles til Tripletex';
  END IF;
  -- Employee links point at the canonical Hub person (people.id), never a technicians.id.
  IF NEW.mcs_entity_type = 'employee' AND NEW.status <> 'inactive' AND NOT EXISTS (
    SELECT 1 FROM public.people p JOIN public.employment_profiles ep ON ep.person_id = p.id
    WHERE p.id = NEW.mcs_entity_id AND ep.archived_at IS NULL AND ep.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Ansattkobling må peke på en Hub-person med aktivt ansettelsesforhold i samme selskap som tilkoblingen';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;
COMMENT ON COLUMN public.tripletex_links.mcs_entity_id IS 'project/customer: events.id/customers.id. employee: people.id (canonical person, resolved from technicians.user_id -> user_accounts.auth_user_id -> person_id).';