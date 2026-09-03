-- Obligatoriske kapitler
ALTER TABLE public.hms_handbook_sections
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT false;

-- Utsendinger (batch)
CREATE TABLE IF NOT EXISTS public.hms_handbook_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  handbook_id uuid NOT NULL REFERENCES public.hms_handbooks(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.hms_handbook_versions(id) ON DELETE CASCADE,
  version_number integer,
  section_ids uuid[] NOT NULL DEFAULT '{}',
  scope text NOT NULL DEFAULT 'full',
  channels text[] NOT NULL DEFAULT ARRAY['email'],
  subject text,
  message text,
  kind text NOT NULL DEFAULT 'distribution',
  recipient_count integer NOT NULL DEFAULT 0,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_handbook_distributions TO authenticated;
GRANT ALL ON public.hms_handbook_distributions TO service_role;
ALTER TABLE public.hms_handbook_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hms distributions view" ON public.hms_handbook_distributions
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "hms distributions manage" ON public.hms_handbook_distributions
  FOR ALL TO authenticated
  USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

-- Mottakere med sikker lenke
CREATE TABLE IF NOT EXISTS public.hms_handbook_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id uuid NOT NULL REFERENCES public.hms_handbook_distributions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  handbook_id uuid NOT NULL REFERENCES public.hms_handbooks(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.hms_handbook_versions(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  user_id uuid,
  full_name text,
  email text,
  phone text,
  share_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
  channel text NOT NULL DEFAULT 'email',
  delivery_status text NOT NULL DEFAULT 'pending',
  delivery_error text,
  sent_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  acknowledged_at timestamptz,
  ack_method text,
  reminder_count integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hms_handbook_recipients_token_key ON public.hms_handbook_recipients(share_token);
CREATE INDEX IF NOT EXISTS hms_handbook_recipients_dist_idx ON public.hms_handbook_recipients(distribution_id);
CREATE INDEX IF NOT EXISTS hms_handbook_recipients_person_idx ON public.hms_handbook_recipients(company_id, person_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_handbook_recipients TO authenticated;
GRANT ALL ON public.hms_handbook_recipients TO service_role;
ALTER TABLE public.hms_handbook_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hms recipients view" ON public.hms_handbook_recipients
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "hms recipients manage" ON public.hms_handbook_recipients
  FOR ALL TO authenticated
  USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

-- Bekreftelser: kapittelnivå, person og metode
ALTER TABLE public.hms_handbook_acknowledgements
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.hms_handbook_sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.hms_handbook_recipients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'system';

ALTER TABLE public.hms_handbook_acknowledgements ALTER COLUMN user_id DROP NOT NULL;

-- Åpne håndbok via lenke (anonymt, token-scoped)
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

  INSERT INTO public.hms_audit_log (company_id, entity_type, entity_id, action, payload)
  VALUES (r.company_id, 'hms_handbook', r.handbook_id, 'distribution.opened',
          jsonb_build_object('recipient_id', r.id, 'version_id', r.version_id, 'channel', r.channel));

  RETURN jsonb_build_object(
    'recipient', jsonb_build_object(
      'id', r.id, 'full_name', r.full_name, 'channel', r.channel,
      'acknowledged_at', r.acknowledged_at, 'expires_at', r.expires_at),
    'handbook', jsonb_build_object('id', hb.id, 'title', hb.title, 'description', hb.description),
    'version', jsonb_build_object('id', ver.id, 'version_number', ver.version_number,
                                  'requires_acknowledgement', ver.requires_acknowledgement,
                                  'published_at', ver.published_at),
    'sections', secs
  );
END;
$$;

-- Bekreft lest via lenke
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
BEGIN
  SELECT * INTO r FROM public.hms_handbook_recipients WHERE share_token = p_token;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF r.expires_at < now() THEN RETURN jsonb_build_object('error', 'expired'); END IF;

  INSERT INTO public.hms_handbook_acknowledgements
    (handbook_id, version_id, company_id, user_id, person_id, recipient_id, section_id,
     confirmation_text, user_agent, method)
  VALUES (r.handbook_id, r.version_id, r.company_id, r.user_id, r.person_id, r.id, p_section_id,
          p_confirmation_text, left(COALESCE(p_user_agent, ''), 250), r.channel);

  UPDATE public.hms_handbook_recipients
     SET acknowledged_at = COALESCE(acknowledged_at, now()),
         ack_method = COALESCE(ack_method, r.channel)
   WHERE id = r.id;

  INSERT INTO public.hms_audit_log (company_id, entity_type, entity_id, action, payload)
  VALUES (r.company_id, 'hms_handbook', r.handbook_id, 'acknowledgement.recorded',
          jsonb_build_object('recipient_id', r.id, 'version_id', r.version_id,
                             'section_id', p_section_id, 'method', r.channel));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hms_handbook_open_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hms_handbook_ack_by_token(text, uuid, text, text) TO anon, authenticated;