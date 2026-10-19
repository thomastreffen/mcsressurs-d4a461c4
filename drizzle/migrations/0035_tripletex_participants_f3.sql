DROP INDEX IF EXISTS public.tripletex_links_one_per_mcs;
DROP INDEX IF EXISTS public.tripletex_links_one_per_tpx;
CREATE UNIQUE INDEX tripletex_links_one_per_mcs ON public.tripletex_links (connection_id, mcs_entity_type, mcs_entity_id) WHERE status <> 'inactive';
CREATE UNIQUE INDEX tripletex_links_one_per_tpx ON public.tripletex_links (connection_id, mcs_entity_type, tripletex_id) WHERE status <> 'inactive' AND tripletex_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_tripletex_link_entity()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c uuid;
BEGIN
  IF NEW.mcs_entity_type = 'project' AND NOT EXISTS (SELECT 1 FROM public.events WHERE id = NEW.mcs_entity_id AND entity_type = 'financial_project') THEN
    RAISE EXCEPTION 'Kun økonomiske prosjekter kan kobles til Tripletex';
  END IF;
  IF NEW.mcs_entity_type = 'employee' AND NOT EXISTS (
    SELECT 1 FROM public.technicians t JOIN public.employment_profiles ep ON ep.person_id = t.id
    WHERE t.id = NEW.mcs_entity_id AND t.deleted_at IS NULL AND ep.archived_at IS NULL AND ep.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Ansatt må ha aktivt ansettelsesforhold i samme selskap som Tripletex-tilkoblingen';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

UPDATE public.tripletex_connections
SET capabilities = (SELECT array_agg(DISTINCT c) FROM unnest(capabilities || ARRAY['employees_read','project_participants_write']) c), updated_at = now()
WHERE id = 'a0000000-0000-0000-0000-000000000001' AND environment = 'test';