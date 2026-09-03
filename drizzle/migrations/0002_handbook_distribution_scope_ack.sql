ALTER TABLE public.hms_handbook_distributions
  ADD COLUMN IF NOT EXISTS section_titles text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.hms_handbook_recipients
  ADD COLUMN IF NOT EXISTS section_titles text[] NOT NULL DEFAULT '{}';

-- Bekreftelse skal gjelde nøyaktig det som ble sendt:
-- hele håndboken -> én samlet bekreftelse
-- valgte kapitler -> bekreftelse per sendt kapittel
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
BEGIN
  SELECT * INTO r FROM public.hms_handbook_recipients WHERE share_token = p_token;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF r.expires_at < now() THEN RETURN jsonb_build_object('error', 'expired'); END IF;

  v_scoped := cardinality(COALESCE(r.section_ids, '{}'::uuid[])) > 0;

  IF p_section_id IS NOT NULL THEN
    INSERT INTO public.hms_handbook_acknowledgements
      (handbook_id, version_id, company_id, user_id, person_id, recipient_id, section_id,
       confirmation_text, user_agent, method)
    VALUES (r.handbook_id, r.version_id, r.company_id, r.user_id, r.person_id, r.id, p_section_id,
            p_confirmation_text, left(COALESCE(p_user_agent, ''), 250), r.channel);
  ELSIF v_scoped THEN
    -- samlet bekreftelse på en kapittelutsending gjelder hvert sendt kapittel
    INSERT INTO public.hms_handbook_acknowledgements
      (handbook_id, version_id, company_id, user_id, person_id, recipient_id, section_id,
       confirmation_text, user_agent, method)
    SELECT r.handbook_id, r.version_id, r.company_id, r.user_id, r.person_id, r.id, s.id,
           p_confirmation_text, left(COALESCE(p_user_agent, ''), 250), r.channel
    FROM public.hms_handbook_sections s
    WHERE s.id = ANY (r.section_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.hms_handbook_acknowledgements a
        WHERE a.version_id = r.version_id AND a.section_id = s.id AND a.recipient_id = r.id
      );
  ELSE
    INSERT INTO public.hms_handbook_acknowledgements
      (handbook_id, version_id, company_id, user_id, person_id, recipient_id, section_id,
       confirmation_text, user_agent, method)
    VALUES (r.handbook_id, r.version_id, r.company_id, r.user_id, r.person_id, r.id, NULL,
            p_confirmation_text, left(COALESCE(p_user_agent, ''), 250), r.channel);
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
                             'section_id', p_section_id,
                             'section_ids', to_jsonb(COALESCE(r.section_ids, '{}'::uuid[])),
                             'scope', CASE WHEN v_scoped THEN 'chapters' ELSE 'full' END,
                             'method', r.channel,
                             'remaining_sections', v_missing));

  RETURN jsonb_build_object('ok', true, 'remaining_sections', v_missing);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hms_handbook_ack_by_token(text, uuid, text, text) TO anon, authenticated;