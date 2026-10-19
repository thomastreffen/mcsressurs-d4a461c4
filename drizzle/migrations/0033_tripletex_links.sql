CREATE TABLE public.tripletex_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('test','production')),
  tripletex_company_id bigint NOT NULL,
  mcs_entity_type text NOT NULL CHECK (mcs_entity_type IN ('customer','project','employee')),
  mcs_entity_id uuid NOT NULL,
  tripletex_id bigint,
  tripletex_number text,
  tripletex_name text,
  tripletex_version integer,
  link_source text NOT NULL CHECK (link_source IN ('created_from_mcs','auto_match','manual','migration')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','needs_confirmation','inactive','failed')),
  last_verified_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending','failed') OR tripletex_id IS NOT NULL)
);
CREATE UNIQUE INDEX tripletex_links_one_per_mcs ON public.tripletex_links (environment, mcs_entity_type, mcs_entity_id) WHERE status <> 'inactive';
CREATE UNIQUE INDEX tripletex_links_one_per_tpx ON public.tripletex_links (environment, tripletex_company_id, mcs_entity_type, tripletex_id) WHERE status <> 'inactive' AND tripletex_id IS NOT NULL;
GRANT SELECT ON public.tripletex_links TO authenticated;
GRANT ALL ON public.tripletex_links TO service_role;
ALTER TABLE public.tripletex_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read tripletex links" ON public.tripletex_links FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE OR REPLACE FUNCTION public.enforce_tripletex_link_entity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.mcs_entity_type = 'project' AND NOT EXISTS (SELECT 1 FROM public.events WHERE id = NEW.mcs_entity_id AND entity_type = 'financial_project') THEN
    RAISE EXCEPTION 'Kun økonomiske prosjekter kan kobles til Tripletex';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tripletex_link_entity BEFORE INSERT OR UPDATE ON public.tripletex_links FOR EACH ROW EXECUTE FUNCTION public.enforce_tripletex_link_entity();