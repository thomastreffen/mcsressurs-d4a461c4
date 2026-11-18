ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS customer_account_id uuid REFERENCES public.customer_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON public.leads(customer_id);

CREATE OR REPLACE FUNCTION public.validate_lead_customer_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c_company uuid; c_deleted timestamptz; a_customer uuid; a_deleted timestamptz;
BEGIN
  IF NEW.customer_account_id IS NOT NULL AND NEW.customer_id IS NULL THEN
    RAISE EXCEPTION 'lead_account_requires_customer' USING ERRCODE = '22023';
  END IF;
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.customer_account_id IS NOT DISTINCT FROM OLD.customer_account_id
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN RETURN NEW; END IF;
  SELECT company_id, deleted_at INTO c_company, c_deleted FROM public.customers WHERE id = NEW.customer_id;
  IF NOT FOUND OR c_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'lead_customer_not_available' USING ERRCODE = '22023';
  END IF;
  IF NEW.company_id IS NULL THEN NEW.company_id := c_company; END IF;
  IF NEW.company_id IS DISTINCT FROM c_company THEN
    RAISE EXCEPTION 'lead_customer_not_available' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_company_access(auth.uid(), c_company, 'customers', 'view')) THEN
    RAISE EXCEPTION 'lead_customer_not_available' USING ERRCODE = '22023';
  END IF;
  IF NEW.customer_account_id IS NOT NULL THEN
    SELECT customer_id, deleted_at INTO a_customer, a_deleted FROM public.customer_accounts WHERE id = NEW.customer_account_id;
    IF NOT FOUND OR a_deleted IS NOT NULL OR a_customer IS DISTINCT FROM NEW.customer_id THEN
      RAISE EXCEPTION 'lead_account_not_available' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_validate_customer_link ON public.leads;
CREATE TRIGGER trg_leads_validate_customer_link BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.validate_lead_customer_link();

CREATE OR REPLACE FUNCTION public.lead_customer_search(_company_id uuid, _q text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q text := lower(coalesce(trim(_q), ''));
BEGIN
  IF auth.uid() IS NULL OR _company_id IS NULL OR NOT (public.is_super_admin(auth.uid())
     OR public.has_company_access(auth.uid(), _company_id, 'customers', 'view')) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.rank, r.name)
    FROM (
      SELECT c.id, c.name, c.org_number,
        CASE WHEN lower(c.name) LIKE q || '%' THEN 0 ELSE 1 END AS rank,
        coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'org_number', a.org_number) ORDER BY a.name)
          FROM public.customer_accounts a WHERE a.customer_id = c.id AND a.deleted_at IS NULL), '[]'::jsonb) AS accounts,
        coalesce((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'email', k.email, 'phone', k.phone, 'role', k.role) ORDER BY k.name)
          FROM public.customer_contacts k WHERE k.customer_id = c.id), '[]'::jsonb) AS contacts
      FROM public.customers c
      WHERE c.company_id = _company_id AND c.deleted_at IS NULL
        AND (q = '' OR lower(c.name) LIKE '%' || q || '%' OR replace(coalesce(c.org_number,''),' ','') LIKE '%' || replace(q,' ','') || '%')
      ORDER BY rank, c.name
      LIMIT 20
    ) r), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.lead_customer_search(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lead_customer_search(uuid, text) TO authenticated;