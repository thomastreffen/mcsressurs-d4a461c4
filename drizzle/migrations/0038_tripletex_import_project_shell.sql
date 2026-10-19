ALTER TABLE public.tripletex_links DROP CONSTRAINT IF EXISTS tripletex_links_link_source_check;
ALTER TABLE public.tripletex_links ADD CONSTRAINT tripletex_links_link_source_check
  CHECK (link_source = ANY (ARRAY['created_from_mcs','auto_match','manual','migration','imported_from_tripletex']));

-- Atomic, idempotent Tripletex -> Hub import: one financial_project shell + one active project link.
-- Called only by the tripletex-import edge function (service_role) after Tripletex read-back and customer confirmation.
CREATE OR REPLACE FUNCTION public.tripletex_import_project_shell(
  _connection_id uuid, _tripletex_id bigint, _number text, _name text, _version integer,
  _customer_id uuid, _start date, _end date, _actor uuid)
RETURNS TABLE(event_id uuid, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c record; existing uuid; ev uuid;
BEGIN
  SELECT * INTO c FROM tripletex_connections WHERE id = _connection_id;
  IF c.id IS NULL OR c.environment <> 'test' THEN RAISE EXCEPTION 'Kun Tripletex TEST er tillatt'; END IF;
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = _customer_id AND company_id = c.company_id) THEN
    RAISE EXCEPTION 'Kunden tilhører ikke selskapet til tilkoblingen';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('tpx_import:' || _connection_id::text || ':' || _tripletex_id::text, 0));
  SELECT mcs_entity_id INTO existing FROM tripletex_links
   WHERE connection_id = _connection_id AND mcs_entity_type = 'project' AND tripletex_id = _tripletex_id AND status <> 'inactive';
  IF existing IS NOT NULL THEN RETURN QUERY SELECT existing, false; RETURN; END IF;
  INSERT INTO events (title, project_number, entity_type, classification_status, project_type, company_id, customer_id,
                      start_time, end_time, created_by)
  VALUES (_name, _number, 'financial_project', 'confirmed', 'project', c.company_id, _customer_id,
          coalesce(_start, current_date)::timestamptz, coalesce(_end, _start, current_date)::timestamptz, _actor)
  RETURNING id INTO ev;
  INSERT INTO tripletex_links (connection_id, company_id, environment, tripletex_company_id, mcs_entity_type, mcs_entity_id,
                               tripletex_id, tripletex_number, tripletex_name, tripletex_version, link_source, status, created_by, last_verified_at)
  VALUES (_connection_id, c.company_id, c.environment, c.expected_tripletex_company_id, 'project', ev,
          _tripletex_id, _number, _name, _version, 'imported_from_tripletex', 'active', _actor, now());
  RETURN QUERY SELECT ev, true;
END $$;
REVOKE ALL ON FUNCTION public.tripletex_import_project_shell(uuid,bigint,text,text,integer,uuid,date,date,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tripletex_import_project_shell(uuid,bigint,text,text,integer,uuid,date,date,uuid) TO service_role;