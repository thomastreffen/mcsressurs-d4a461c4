CREATE TABLE public.tripletex_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  environment text NOT NULL CHECK (environment IN ('test','production')),
  secret_name text NOT NULL CHECK (secret_name ~ '^TRIPLETEX_[A-Z0-9_]+$'),
  expected_tripletex_company_id bigint,
  mode text NOT NULL DEFAULT 'off' CHECK (mode IN ('off','read_only','write_enabled')),
  capabilities text[] NOT NULL DEFAULT '{}',
  last_health_status text, last_health_at timestamptz, last_health_request_id text,
  enabled_by uuid, enabled_at timestamptz, disabled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, environment),
  CHECK (mode = 'off' OR expected_tripletex_company_id IS NOT NULL)
);
CREATE UNIQUE INDEX tripletex_connections_one_tpx_company ON public.tripletex_connections (environment, expected_tripletex_company_id) WHERE expected_tripletex_company_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.tripletex_connections TO authenticated;
GRANT ALL ON public.tripletex_connections TO service_role;
ALTER TABLE public.tripletex_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage tripletex connections" ON public.tripletex_connections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.tripletex_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.tripletex_connections(id),
  operation text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  mcs_entity_type text, mcs_entity_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed','dead')),
  attempts int NOT NULL DEFAULT 0,
  http_status int, request_id text, error_code text, payload_hash text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tripletex_operations TO authenticated;
GRANT ALL ON public.tripletex_operations TO service_role;
ALTER TABLE public.tripletex_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read tripletex operations" ON public.tripletex_operations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

ALTER TABLE public.tripletex_links ADD COLUMN connection_id uuid REFERENCES public.tripletex_connections(id);

INSERT INTO public.tripletex_connections (company_id, environment, secret_name, expected_tripletex_company_id, mode, capabilities)
VALUES ('a0000000-0000-0000-0000-000000000001','test','TRIPLETEX_TEST_API_TOKEN',88777230,'read_only','{customers_read,projects_read}')
ON CONFLICT DO NOTHING;
UPDATE public.tripletex_links l SET connection_id = c.id FROM public.tripletex_connections c
 WHERE l.connection_id IS NULL AND c.company_id = l.company_id AND c.environment = l.environment;

CREATE OR REPLACE FUNCTION public.enforce_tripletex_link_connection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  IF NEW.connection_id IS NULL THEN RAISE EXCEPTION 'tripletex_links.connection_id is required'; END IF;
  SELECT * INTO c FROM tripletex_connections WHERE id = NEW.connection_id;
  IF c.company_id <> NEW.company_id OR c.environment <> NEW.environment
     OR (NEW.tripletex_company_id IS NOT NULL AND c.expected_tripletex_company_id IS DISTINCT FROM NEW.tripletex_company_id) THEN
    RAISE EXCEPTION 'Tripletex link does not match its connection (company/environment/Tripletex company)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tripletex_link_connection BEFORE INSERT OR UPDATE ON public.tripletex_links
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tripletex_link_connection();

ALTER TABLE public.planning_projects
  ADD COLUMN billing_model text CHECK (billing_model IN ('fixed_price','time_and_material','service_framework','internal')),
  ADD COLUMN customer_reference text,
  ADD COLUMN project_manager_person_id uuid,
  ADD COLUMN economic_state text NOT NULL DEFAULT 'draft' CHECK (economic_state IN ('draft','needs_review','ready_to_link','linked','conflict')),
  ADD COLUMN ready_for_invoicing_at timestamptz,
  ADD COLUMN ready_for_invoicing_by uuid;
COMMENT ON COLUMN public.planning_projects.contract_form IS 'DEPRECATED: replaced by billing_model';

CREATE OR REPLACE FUNCTION public.enforce_planning_billing_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ready_for_invoicing_at IS NOT NULL THEN
    IF NEW.economic_state <> 'linked' OR NEW.billing_model IS NULL THEN
      RAISE EXCEPTION 'Prosjektet må være koblet og ha faktureringsmodell før det er klart for fakturering';
    END IF;
    IF NEW.billing_model = 'fixed_price' AND coalesce(NEW.contract_value,0) <= 0 THEN
      RAISE EXCEPTION 'Fastprisprosjekt krever kontraktsverdi';
    END IF;
    IF NEW.billing_model = 'time_and_material' AND coalesce(NEW.hourly_rate,0) <= 0 THEN
      RAISE EXCEPTION 'Prosjekt på medgått tid krever timesats';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_planning_billing_rules BEFORE INSERT OR UPDATE ON public.planning_projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_planning_billing_rules();