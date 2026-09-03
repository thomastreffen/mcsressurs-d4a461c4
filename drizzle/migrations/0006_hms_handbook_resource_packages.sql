-- Koblede ressurser på HMS-kapitler + dekningsområder
ALTER TABLE public.hms_handbook_sections
  ADD COLUMN IF NOT EXISTS resource_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS coverage_areas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS chemical_ids uuid[] NOT NULL DEFAULT '{}';

-- Målgruppe/relevans for kjemikalier i HMS-pakken
ALTER TABLE public.hms_chemicals
  ADD COLUMN IF NOT EXISTS audience_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS relevant_for_all boolean NOT NULL DEFAULT false;

-- Pakkeinnhold på utsending
ALTER TABLE public.hms_handbook_distributions
  ADD COLUMN IF NOT EXISTS included_resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS chemical_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS chemical_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.hms_handbook_recipients
  ADD COLUMN IF NOT EXISTS included_resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS chemical_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS chemical_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.hms_handbook_acknowledgements
  ADD COLUMN IF NOT EXISTS resource_snapshot jsonb;

-- Åpne pakken via personlig lenke: kapitler + koblede ressurser + kjemikalier/SDS
CREATE OR REPLACE FUNCTION public.hms_handbook_open_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.hms_handbook_recipients;
  hb public.hms_handbooks;
  ver public.hms_handbook_versions;
  secs jsonb;
  chems jsonb;
BEGIN
  SELECT * INTO r FROM public.hms_handbook_recipients WHERE share_token = p_token;
  IF r.id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF r.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  UPDATE public.hms_handbook_recipients
     SET first_opened_at = COALESCE(first_opened_at, now()),
         last_opened_at = now(),
         open_count = open_count + 1
   WHERE id = r.id;

  SELECT * INTO hb FROM public.hms_handbooks WHERE id = r.handbook_id;
  SELECT * INTO ver FROM public.hms_handbook_versions WHERE id = r.version_id;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'ordering'), '[]'::jsonb) INTO secs
  FROM (
    SELECT jsonb_build_object(
      'id', s.id, 'heading', s.heading, 'body', s.body,
      'ordering', lpad(s.ordering::text, 6, '0'),
      'is_mandatory', s.is_mandatory,
      'resource_links', COALESCE(s.resource_links, '[]'::jsonb),
      'coverage_areas', COALESCE(s.coverage_areas, '{}'::text[]),
      'acknowledged_at', (
        SELECT max(a.acknowledged_at) FROM public.hms_handbook_acknowledgements a
        WHERE a.version_id = r.version_id AND a.section_id = s.id
          AND (a.person_id = r.person_id OR a.recipient_id = r.id)
      )
    ) AS x
    FROM public.hms_handbook_sections s
    WHERE s.version_id = r.version_id
      AND (cardinality(r.section_ids) = 0 OR s.id = ANY (r.section_ids))
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'product_name', c.product_name,
           'supplier', c.supplier,
           'category', c.category,
           'is_high_risk', c.is_high_risk,
           'requires_sja', c.requires_sja,
           'requires_special_ppe', c.requires_special_ppe,
           'ppe_requirements', c.ppe_requirements,
           'first_aid', c.first_aid,
           'sds_version', c.sds_version,
           'sds_revision_date', c.sds_revision_date,
           'has_sds', (c.sds_path IS NOT NULL)
         ) ORDER BY c.is_high_risk DESC, c.product_name), '[]'::jsonb) INTO chems
  FROM public.hms_chemicals c
  WHERE c.id = ANY (COALESCE(r.chemical_ids, '{}'::uuid[]))
    AND c.deleted_at IS NULL;

  INSERT INTO public.hms_audit_log (company_id, entity_type, entity_id, action, payload)
  VALUES (r.company_id, 'hms_handbook', r.handbook_id, 'distribution.opened',
          jsonb_build_object('recipient_id', r.id, 'version_id', r.version_id, 'channel', r.channel,
                             'chemical_count', cardinality(COALESCE(r.chemical_ids, '{}'::uuid[]))));

  RETURN jsonb_build_object(
    'recipient', jsonb_build_object(
      'id', r.id, 'full_name', r.full_name, 'channel', r.channel,
      'acknowledged_at', r.acknowledged_at, 'expires_at', r.expires_at),
    'handbook', jsonb_build_object('id', hb.id, 'title', hb.title, 'description', hb.description),
    'version', jsonb_build_object('id', ver.id, 'version_number', ver.version_number,
                                  'requires_acknowledgement', ver.requires_acknowledgement,
                                  'published_at', ver.published_at),
    'sections', secs,
    'resources', COALESCE(r.included_resources, '[]'::jsonb),
    'chemicals', chems
  );
END;
$$;

-- Bekreftelse dokumenterer nøyaktig innhold: kapitler + koblede ressurser + SDS-versjoner
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
       confirmation_text, user_agent, method, resource_snapshot)
    VALUES (r.handbook_id, r.version_id, r.company_id, r.user_id, r.person_id, r.id, p_section_id,
            p_confirmation_text, left(COALESCE(p_user_agent, ''), 250), r.channel, v_snapshot);
  ELSIF v_scoped THEN
    INSERT INTO public.hms_handbook_acknowledgements
      (handbook_id, version_id, company_id, user_id, person_id, recipient_id, section_id,
       confirmation_text, user_agent, method, resource_snapshot)
    SELECT r.handbook_id, r.version_id, r.company_id, r.user_id, r.person_id, r.id, s.id,
           p_confirmation_text, left(COALESCE(p_user_agent, ''), 250), r.channel, v_snapshot
    FROM public.hms_handbook_sections s
    WHERE s.id = ANY (r.section_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.hms_handbook_acknowledgements a
        WHERE a.version_id = r.version_id AND a.section_id = s.id AND a.recipient_id = r.id
      );
  ELSE
    INSERT INTO public.hms_handbook_acknowledgements
      (handbook_id, version_id, company_id, user_id, person_id, recipient_id, section_id,
       confirmation_text, user_agent, method, resource_snapshot)
    VALUES (r.handbook_id, r.version_id, r.company_id, r.user_id, r.person_id, r.id, NULL,
            p_confirmation_text, left(COALESCE(p_user_agent, ''), 250), r.channel, v_snapshot);
  END IF;

  IF v_scoped THEN
    SELECT count(*) INTO v_missing
    FROM unnest(r.section_ids) AS sid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.hms_handbook_acknowledgements a
      WHERE a.version_id = r.version_id AND a.section_id = sid
        AND (a.recipient_id = r.id OR (r.person_id IS NOT NULL AND a.person_id = r.person_id))
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
                             'resource_snapshot', v_snapshot));

  RETURN jsonb_build_object('ok', true, 'missing_sections', v_missing);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hms_handbook_open_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hms_handbook_ack_by_token(text, uuid, text, text) TO anon, authenticated;