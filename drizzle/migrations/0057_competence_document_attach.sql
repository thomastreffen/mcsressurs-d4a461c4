ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS client_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS documents_client_request_id_uniq ON public.documents(client_request_id) WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.competence_document_can_manage(_actor uuid, _competence_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.company_id FROM compliance_competences c
  WHERE c.id = _competence_id
    AND public.has_hms_manage(_actor, c.company_id)
    AND public.has_company_access(_actor, c.company_id, 'hms', 'edit')
$$;

CREATE OR REPLACE FUNCTION public.competence_document_can_view(_actor uuid, _competence_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM compliance_competences c
    WHERE c.id = _competence_id AND (
      (public.has_hms_view(_actor, c.company_id) AND public.has_company_access(_actor, c.company_id, 'hms', 'view'))
      OR c.person_id IN (SELECT ua.person_id FROM user_accounts ua WHERE ua.auth_user_id = _actor AND ua.is_active)))
$$;

CREATE OR REPLACE FUNCTION public.attach_competence_document(
  _actor uuid, _competence_id uuid, _path text, _file_name text, _file_size bigint, _client_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company uuid; _doc uuid;
BEGIN
  SELECT id INTO _doc FROM documents WHERE client_request_id = _client_request_id;
  IF _doc IS NOT NULL THEN RETURN _doc; END IF;
  _company := public.competence_document_can_manage(_actor, _competence_id);
  IF _company IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _path NOT LIKE 'compliance/' || _company || '/' || _competence_id || '/%' THEN
    RAISE EXCEPTION 'invalid path' USING ERRCODE = '22023';
  END IF;
  INSERT INTO documents(entity_type, entity_id, company_id, category, source_type, storage_bucket,
    file_path, file_name, file_size, mime_type, public_url, uploaded_by, client_request_id)
  VALUES ('compliance_competence', _competence_id, _company, 'kompetanse', 'api_upload', 'compliance-documents',
    _path, _file_name, _file_size, 'application/pdf', NULL, _actor, _client_request_id)
  RETURNING id INTO _doc;
  UPDATE compliance_competences SET document_id = _doc WHERE id = _competence_id;
  INSERT INTO activity_log(entity_type, entity_id, action, actor_id, payload)
  VALUES ('compliance_competence', _competence_id, 'document_attached', _actor,
    jsonb_build_object('summary', 'Dokumentasjon lastet opp: ' || _file_name, 'document_id', _doc));
  RETURN _doc;
END $$;

REVOKE ALL ON FUNCTION public.attach_competence_document(uuid,uuid,text,text,bigint,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.competence_document_can_manage(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.competence_document_can_view(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_competence_document(uuid,uuid,text,text,bigint,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.competence_document_can_manage(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.competence_document_can_view(uuid,uuid) TO service_role;