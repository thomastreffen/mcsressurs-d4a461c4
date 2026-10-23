CREATE OR REPLACE FUNCTION public.user_accounts_auto_verify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Clients may never self-verify; only exact unambiguous match or admin RPC.
  IF TG_OP = 'UPDATE' AND (NEW.person_id IS DISTINCT FROM OLD.person_id OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id) THEN
    NEW.verified_at := NULL; NEW.verified_by := NULL; NEW.link_source := 'legacy';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.verified_at := NULL; NEW.verified_by := NULL; NEW.link_source := 'legacy'; END IF;
  IF NEW.is_active AND NEW.verified_at IS NULL AND EXISTS (
       SELECT 1 FROM public.people p JOIN auth.users u ON u.id = NEW.auth_user_id
        WHERE p.id = NEW.person_id AND p.is_active AND lower(trim(p.email)) = lower(trim(u.email))
          AND EXISTS (SELECT 1 FROM public.employment_profiles e WHERE e.person_id = p.id AND e.archived_at IS NULL
                        AND coalesce(e.relationship_type,'employee') = 'employee')) THEN
    NEW.verified_at := now(); NEW.link_source := 'auto_exact_email';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_user_accounts_auto_verify ON public.user_accounts;
CREATE TRIGGER trg_user_accounts_auto_verify
  BEFORE INSERT OR UPDATE OF person_id, auth_user_id, is_active ON public.user_accounts
  FOR EACH ROW EXECUTE FUNCTION public.user_accounts_auto_verify();