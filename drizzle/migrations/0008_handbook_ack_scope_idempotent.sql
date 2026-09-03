-- 1) Scope- og opphavsfelter på bekreftelser
ALTER TABLE public.hms_handbook_acknowledgements
  ADD COLUMN IF NOT EXISTS ack_scope text,
  ADD COLUMN IF NOT EXISTS confirmed_via text;

UPDATE public.hms_handbook_acknowledgements
   SET ack_scope = COALESCE(ack_scope, CASE WHEN section_id IS NULL THEN 'whole_handbook' ELSE 'chapter' END),
       confirmed_via = COALESCE(confirmed_via, CASE WHEN recipient_id IS NOT NULL THEN 'token' ELSE 'internal' END);

CREATE OR REPLACE FUNCTION public.hms_handbook_ack_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.ack_scope := CASE WHEN NEW.section_id IS NULL THEN 'whole_handbook' ELSE 'chapter' END;
  IF NEW.confirmed_via IS NULL THEN
    NEW.confirmed_via := CASE WHEN NEW.recipient_id IS NOT NULL THEN 'token' ELSE 'internal' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hms_handbook_ack_defaults ON public.hms_handbook_acknowledgements;
CREATE TRIGGER trg_hms_handbook_ack_defaults
BEFORE INSERT OR UPDATE ON public.hms_handbook_acknowledgements
FOR EACH ROW EXECUTE FUNCTION public.hms_handbook_ack_defaults();

-- 2) Feil unique-constraint: samlet bekreftelse og kapittelbekreftelser kolliderte
ALTER TABLE public.hms_handbook_acknowledgements
  DROP CONSTRAINT IF EXISTS hms_handbook_acknowledgements_version_id_user_id_key;

-- Dedupe slik at de nye scope-riktige indeksene kan opprettes
DELETE FROM public.hms_handbook_acknowledgements a
USING public.hms_handbook_acknowledgements b
WHERE a.ctid > b.ctid
  AND a.version_id = b.version_id
  AND a.section_id IS NOT DISTINCT FROM b.section_id
  AND a.user_id IS NOT DISTINCT FROM b.user_id
  AND a.person_id IS NOT DISTINCT FROM b.person_id
  AND a.recipient_id IS NOT DISTINCT FROM b.recipient_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hb_ack_user_whole
  ON public.hms_handbook_acknowledgements (version_id, user_id)
  WHERE section_id IS NULL AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hb_ack_user_chapter
  ON public.hms_handbook_acknowledgements (version_id, user_id, section_id)
  WHERE section_id IS NOT NULL AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hb_ack_person_whole
  ON public.hms_handbook_acknowledgements (version_id, person_id)
  WHERE section_id IS NULL AND user_id IS NULL AND person_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hb_ack_person_chapter
  ON public.hms_handbook_acknowledgements (version_id, person_id, section_id)
  WHERE section_id IS NOT NULL AND user_id IS NULL AND person_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hb_ack_recipient_whole
  ON public.hms_handbook_acknowledgements (version_id, recipient_id)
  WHERE section_id IS NULL AND user_id IS NULL AND person_id IS NULL AND recipient_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hb_ack_recipient_chapter
  ON public.hms_handbook_acknowledgements (version_id, recipient_id, section_id)
  WHERE section_id IS NOT NULL AND user_id IS NULL AND person_id IS NULL AND recipient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hb_ack_version_person ON public.hms_handbook_acknowledgements (version_id, person_id);
CREATE INDEX IF NOT EXISTS idx_hb_ack_version_user ON public.hms_handbook_acknowledgements (version_id, user_id);

-- 3) Idempotent tokenbekreftelse
CREATE OR REPLACE FUNCTION public.hms_handbook_ack_by_token(
  p_token text,
  p_section_id uuid DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_confirmation_text text DEFAULT 'Jeg har lest og forstått.'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.hms_handbook_recipients;
  v_scoped boolean;
  v_missing int;
  v_snapshot jsonb;
BEGIN
  SELECT * INTO r FROM public.hms_handbook_recipients WHERE share_token = p_token;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF r.expires_at < now() THEN RETURN jsonb_build_object('error', 'expired'); END IF;

  v_scoped := cardinality(COALESCE(r.section_ids, '{}'::uuid[])) > 0;

  v_snapshot := jsonb_build_object(
    'section_ids', to_jsonb(COALESCE(r.section_ids, '{}'::uuid[])),
    'section_titles', to_jsonb(COALESCE(r.section_titles, '{}'::text[])),
    'resources', COALESCE(r.included_resources, '[]'::jsonb),
    'chemicals', COALESCE(r.chemical_snapshot, '[]'::jsonb),
    'sent_at', r.sent_at,
    'first_opened_at', r.first_opened_at
  );

  IF p_section_id IS NOT NULL THEN
    INSERT INTO public.hms_handbook_acknowledgements
      (handbook_id, version_id, company_id, user_id, person_id, recipient_id, section_id,
       confirmation_text, user_agent, method, resource_snapshot, confirmed_via)
    VALUES (r.handbook_id, r.version_id, r.company_id, r.user_id, r.person_id, r.id, p_section_id,
            p_confirmation_text, left(COALESCE(p_user_agent, ''), 250), r.channel, v_snapshot, 'token')
    ON CONFLICT DO NOTHING;
  ELSIF v_scoped THEN
    INSERT INTO public.hms_handbook_acknowledgements
      (handbook_id, version_id, company_id, user_id, person_id, recipient_id, section_id,
       confirmation_text, user_agent, method, resource_snapshot, confirmed_via)
    SELECT r.handbook_id, r.version_id, r.company_id, r.user_id, r.person_id, r.id, s.id,
           p_confirmation_text, left(COALESCE(p_user_agent, ''), 250), r.channel, v_snapshot, 'token'
    FROM public.hms_handbook_sections s
    WHERE s.id = ANY (r.section_ids)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.hms_handbook_acknowledgements
      (handbook_id, version_id, company_id, user_id, person_id, recipient_id, section_id,
       confirmation_text, user_agent, method, resource_snapshot, confirmed_via)
    VALUES (r.handbook_id, r.version_id, r.company_id, r.user_id, r.person_id, r.id, NULL,
            p_confirmation_text, left(COALESCE(p_user_agent, ''), 250), r.channel, v_snapshot, 'token')
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_scoped THEN
    SELECT count(*) INTO v_missing
    FROM unnest(r.section_ids) AS sid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.hms_handbook_acknowledgements a
      WHERE a.version_id = r.version_id AND a.section_id = sid
        AND (a.recipient_id = r.id
             OR (r.person_id IS NOT NULL AND a.person_id = r.person_id)
             OR (r.user_id IS NOT NULL AND a.user_id = r.user_id))
    );
  ELSE
    v_missing := 0;
  END IF;

  IF v_missing = 0 THEN
    UPDATE public.hms_handbook_recipients
       SET acknowledged_at = COALESCE(acknowledged_at, now()),
           ack_method = COALESCE(ack_method, r.channel)
     WHERE id = r.id;
  END IF;

  INSERT INTO public.hms_audit_log (company_id, entity_type, entity_id, action, payload)
  VALUES (r.company_id, 'hms_handbook', r.handbook_id, 'acknowledgement.recorded',
          jsonb_build_object('recipient_id', r.id, 'version_id', r.version_id,
                             'section_id', p_section_id, 'channel', r.channel,
                             'confirmed_via', 'token',
                             'resource_snapshot', v_snapshot));

  RETURN jsonb_build_object('ok', true, 'missing_sections', v_missing,
                            'acknowledged_at', (SELECT acknowledged_at FROM public.hms_handbook_recipients WHERE id = r.id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.hms_handbook_ack_by_token(text, uuid, text, text) TO anon, authenticated;

-- 4) Intern bekreftelse: idempotent RPC som også kobler person_id og oppdaterer mottakerrad
CREATE OR REPLACE FUNCTION public.hms_handbook_ack_internal(
  p_version_id uuid,
  p_section_id uuid DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_confirmation_text text DEFAULT 'Jeg har lest og forstått.'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ver public.hms_handbook_versions;
  v_person uuid;
  v_recipient uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('error', 'unauthenticated'); END IF;
  SELECT * INTO ver FROM public.hms_handbook_versions WHERE id = p_version_id;
  IF ver.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF NOT public.is_company_member(auth.uid(), ver.company_id) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT ua.person_id INTO v_person
  FROM public.user_accounts ua
  WHERE ua.auth_user_id = auth.uid() AND ua.company_id = ver.company_id
  LIMIT 1;

  SELECT r.id INTO v_recipient
  FROM public.hms_handbook_recipients r
  WHERE r.version_id = p_version_id
    AND (r.user_id = auth.uid() OR (v_person IS NOT NULL AND r.person_id = v_person))
  ORDER BY r.sent_at DESC NULLS LAST
  LIMIT 1;

  INSERT INTO public.hms_handbook_acknowledgements
    (handbook_id, version_id, company_id, user_id, person_id, recipient_id, section_id,
     confirmation_text, user_agent, method, confirmed_via)
  VALUES (ver.handbook_id, ver.id, ver.company_id, auth.uid(), v_person, v_recipient, p_section_id,
          p_confirmation_text, left(COALESCE(p_user_agent, ''), 250), 'system', 'internal')
  ON CONFLICT DO NOTHING;

  IF v_recipient IS NOT NULL AND p_section_id IS NULL THEN
    UPDATE public.hms_handbook_recipients
       SET acknowledged_at = COALESCE(acknowledged_at, now()),
           ack_method = COALESCE(ack_method, 'system')
     WHERE id = v_recipient;
  END IF;

  INSERT INTO public.hms_audit_log (company_id, entity_type, entity_id, action, payload)
  VALUES (ver.company_id, 'hms_handbook', ver.handbook_id, 'acknowledgement.recorded',
          jsonb_build_object('version_id', ver.id, 'section_id', p_section_id,
                             'confirmed_via', 'internal', 'person_id', v_person,
                             'recipient_id', v_recipient));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hms_handbook_ack_internal(uuid, uuid, text, text) TO authenticated;