CREATE TABLE IF NOT EXISTS public.hms_chemicals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  product_name text NOT NULL,
  supplier text,
  manufacturer text,
  category text,
  usage_area text,
  locations text[] NOT NULL DEFAULT '{}',
  hms_areas text[] NOT NULL DEFAULT '{}',
  pictograms text[] NOT NULL DEFAULT '{}',
  h_statements text[] NOT NULL DEFAULT '{}',
  p_statements text[] NOT NULL DEFAULT '{}',
  ppe_requirements text,
  ventilation_requirements text,
  first_aid text,
  storage_requirements text,
  waste_handling text,
  sds_path text,
  sds_filename text,
  sds_revision_date date,
  sds_version text,
  sds_uploaded_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'under_review')),
  is_high_risk boolean NOT NULL DEFAULT false,
  requires_training boolean NOT NULL DEFAULT false,
  requires_acknowledgement boolean NOT NULL DEFAULT false,
  requires_sja boolean NOT NULL DEFAULT false,
  requires_special_ppe boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);

CREATE INDEX IF NOT EXISTS hms_chemicals_company_idx ON public.hms_chemicals(company_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_chemicals TO authenticated;
GRANT ALL ON public.hms_chemicals TO service_role;
ALTER TABLE public.hms_chemicals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hms chemicals view" ON public.hms_chemicals
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "hms chemicals manage" ON public.hms_chemicals
  FOR ALL TO authenticated
  USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE TABLE IF NOT EXISTS public.hms_chemical_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  chemical_id uuid NOT NULL REFERENCES public.hms_chemicals(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.hms_handbook_sections(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chemical_id, section_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_chemical_sections TO authenticated;
GRANT ALL ON public.hms_chemical_sections TO service_role;
ALTER TABLE public.hms_chemical_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hms chemical sections view" ON public.hms_chemical_sections
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "hms chemical sections manage" ON public.hms_chemical_sections
  FOR ALL TO authenticated
  USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE TABLE IF NOT EXISTS public.hms_chemical_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  chemical_id uuid NOT NULL REFERENCES public.hms_chemicals(id) ON DELETE CASCADE,
  section_ids uuid[] NOT NULL DEFAULT '{}',
  section_titles text[] NOT NULL DEFAULT '{}',
  sds_revision_date date,
  sds_version text,
  channels text[] NOT NULL DEFAULT ARRAY['email'],
  subject text,
  message text,
  kind text NOT NULL DEFAULT 'distribution',
  recipient_count integer NOT NULL DEFAULT 0,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_chemical_distributions TO authenticated;
GRANT ALL ON public.hms_chemical_distributions TO service_role;
ALTER TABLE public.hms_chemical_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hms chem dist view" ON public.hms_chemical_distributions
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "hms chem dist manage" ON public.hms_chemical_distributions
  FOR ALL TO authenticated
  USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE TABLE IF NOT EXISTS public.hms_chemical_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id uuid NOT NULL REFERENCES public.hms_chemical_distributions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  chemical_id uuid NOT NULL REFERENCES public.hms_chemicals(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  user_id uuid,
  full_name text,
  email text,
  phone text,
  share_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
  section_ids uuid[] NOT NULL DEFAULT '{}',
  section_titles text[] NOT NULL DEFAULT '{}',
  sds_revision_date date,
  sds_version text,
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

CREATE UNIQUE INDEX IF NOT EXISTS hms_chemical_recipients_token_key ON public.hms_chemical_recipients(share_token);
CREATE INDEX IF NOT EXISTS hms_chemical_recipients_dist_idx ON public.hms_chemical_recipients(distribution_id);
CREATE INDEX IF NOT EXISTS hms_chemical_recipients_person_idx ON public.hms_chemical_recipients(company_id, person_id);
CREATE INDEX IF NOT EXISTS hms_chemical_recipients_chem_idx ON public.hms_chemical_recipients(chemical_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_chemical_recipients TO authenticated;
GRANT ALL ON public.hms_chemical_recipients TO service_role;
ALTER TABLE public.hms_chemical_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hms chem rec view" ON public.hms_chemical_recipients
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "hms chem rec manage" ON public.hms_chemical_recipients
  FOR ALL TO authenticated
  USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE TABLE IF NOT EXISTS public.hms_chemical_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  chemical_id uuid NOT NULL REFERENCES public.hms_chemicals(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.hms_chemical_recipients(id) ON DELETE SET NULL,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  user_id uuid,
  full_name text,
  section_ids uuid[] NOT NULL DEFAULT '{}',
  section_titles text[] NOT NULL DEFAULT '{}',
  sds_revision_date date,
  sds_version text,
  confirmation_text text,
  method text NOT NULL DEFAULT 'system',
  user_agent text,
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hms_chemical_ack_person_idx ON public.hms_chemical_acknowledgements(company_id, person_id, chemical_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_chemical_acknowledgements TO authenticated;
GRANT ALL ON public.hms_chemical_acknowledgements TO service_role;
ALTER TABLE public.hms_chemical_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hms chem ack view" ON public.hms_chemical_acknowledgements
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "hms chem ack manage" ON public.hms_chemical_acknowledgements
  FOR ALL TO authenticated
  USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

ALTER TABLE public.hms_incidents
  ADD COLUMN IF NOT EXISTS chemical_id uuid REFERENCES public.hms_chemicals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chemical_issue_type text;

CREATE INDEX IF NOT EXISTS hms_incidents_chemical_idx ON public.hms_incidents(chemical_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.hms_chemical_open_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.hms_chemical_recipients;
  c public.hms_chemicals;
  secs jsonb;
BEGIN
  SELECT * INTO r FROM public.hms_chemical_recipients WHERE share_token = p_token;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF r.expires_at < now() THEN RETURN jsonb_build_object('error', 'expired'); END IF;

  UPDATE public.hms_chemical_recipients
     SET first_opened_at = COALESCE(first_opened_at, now()),
         last_opened_at = now(),
         open_count = open_count + 1
   WHERE id = r.id;

  SELECT * INTO c FROM public.hms_chemicals WHERE id = r.chemical_id;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'ordering'), '[]'::jsonb) INTO secs
  FROM (
    SELECT jsonb_build_object(
      'id', s.id, 'heading', s.heading, 'body', s.body,
      'ordering', lpad(s.ordering::text, 6, '0')
    ) AS x
    FROM public.hms_handbook_sections s
    WHERE s.id = ANY (r.section_ids)
  ) t;

  INSERT INTO public.hms_audit_log (company_id, entity_type, entity_id, action, payload)
  VALUES (r.company_id, 'hms_chemical', r.chemical_id, 'chemical.opened',
          jsonb_build_object('recipient_id', r.id, 'channel', r.channel,
                             'sds_revision_date', r.sds_revision_date));

  RETURN jsonb_build_object(
    'recipient', jsonb_build_object(
      'id', r.id, 'full_name', r.full_name, 'channel', r.channel,
      'acknowledged_at', r.acknowledged_at, 'expires_at', r.expires_at,
      'sds_revision_date', r.sds_revision_date, 'sds_version', r.sds_version),
    'chemical', jsonb_build_object(
      'id', c.id, 'product_name', c.product_name, 'supplier', c.supplier,
      'manufacturer', c.manufacturer, 'category', c.category, 'usage_area', c.usage_area,
      'pictograms', c.pictograms, 'h_statements', c.h_statements, 'p_statements', c.p_statements,
      'ppe_requirements', c.ppe_requirements, 'ventilation_requirements', c.ventilation_requirements,
      'first_aid', c.first_aid, 'storage_requirements', c.storage_requirements,
      'waste_handling', c.waste_handling, 'status', c.status,
      'is_high_risk', c.is_high_risk, 'requires_training', c.requires_training,
      'requires_sja', c.requires_sja, 'requires_special_ppe', c.requires_special_ppe,
      'sds_path', c.sds_path, 'sds_filename', c.sds_filename,
      'sds_revision_date', c.sds_revision_date, 'sds_version', c.sds_version),
    'sections', secs
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hms_chemical_ack_by_token(
  p_token text,
  p_user_agent text DEFAULT NULL,
  p_confirmation_text text DEFAULT 'Jeg har lest og forstått rutine og sikkerhetsdatablad for dette produktet.'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.hms_chemical_recipients;
BEGIN
  SELECT * INTO r FROM public.hms_chemical_recipients WHERE share_token = p_token;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF r.expires_at < now() THEN RETURN jsonb_build_object('error', 'expired'); END IF;

  INSERT INTO public.hms_chemical_acknowledgements
    (company_id, chemical_id, recipient_id, person_id, user_id, full_name,
     section_ids, section_titles, sds_revision_date, sds_version,
     confirmation_text, method, user_agent)
  VALUES (r.company_id, r.chemical_id, r.id, r.person_id, r.user_id, r.full_name,
          r.section_ids, r.section_titles, r.sds_revision_date, r.sds_version,
          p_confirmation_text, r.channel, left(COALESCE(p_user_agent, ''), 250));

  UPDATE public.hms_chemical_recipients
     SET acknowledged_at = COALESCE(acknowledged_at, now()),
         ack_method = COALESCE(ack_method, r.channel)
   WHERE id = r.id;

  INSERT INTO public.hms_audit_log (company_id, entity_type, entity_id, action, payload)
  VALUES (r.company_id, 'hms_chemical', r.chemical_id, 'chemical.acknowledged',
          jsonb_build_object('recipient_id', r.id, 'method', r.channel,
                             'section_ids', r.section_ids,
                             'sds_revision_date', r.sds_revision_date,
                             'sds_version', r.sds_version));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hms_chemical_open_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hms_chemical_ack_by_token(text, text, text) TO anon, authenticated;