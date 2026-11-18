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
  IF auth.uid() IS NOT NULL AND NOT (public.is_super_admin(auth.uid()) OR public.has_company_access(auth.uid(), c_company, 'customers', 'view')) THEN
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