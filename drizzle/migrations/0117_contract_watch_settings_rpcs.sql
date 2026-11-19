ALTER TABLE public.contract_watch_settings
  ADD COLUMN IF NOT EXISTS retention_days integer NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 7 AND 365),
  ADD COLUMN IF NOT EXISTS dismissed_retention_days integer NOT NULL DEFAULT 30 CHECK (dismissed_retention_days BETWEEN 1 AND 365),
  ADD COLUMN IF NOT EXISTS consent_revoked_at timestamptz;

CREATE OR REPLACE FUNCTION public.contract_watch_update(_action text, _consent_text text DEFAULT NULL, _retention integer DEFAULT NULL, _dismissed integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.contract_watch_settings; last_ok boolean;
BEGIN
  IF NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.contract_watch_settings WHERE id FOR UPDATE;
  IF _action = 'kill' THEN
    UPDATE public.contract_watch_settings SET enabled = false, updated_at = now() WHERE id;
  ELSIF _action = 'consent' THEN
    IF coalesce(length(trim(_consent_text)),0) < 20 THEN RAISE EXCEPTION 'consent_text_required'; END IF;
    UPDATE public.contract_watch_settings SET consent_by = auth.uid(), consent_at = now(), consent_text = _consent_text, consent_revoked_at = NULL, updated_at = now() WHERE id;
  ELSIF _action = 'revoke_consent' THEN
    UPDATE public.contract_watch_settings SET enabled = false, consent_at = NULL, consent_revoked_at = now(), updated_at = now() WHERE id;
  ELSIF _action = 'retention' THEN
    UPDATE public.contract_watch_settings SET retention_days = coalesce(_retention, retention_days), dismissed_retention_days = coalesce(_dismissed, dismissed_retention_days), updated_at = now() WHERE id;
  ELSIF _action = 'verify_scope' THEN
    SELECT overall = 'pass' INTO last_ok FROM public.contract_watch_diagnostic_runs WHERE run_at > now() - interval '24 hours' ORDER BY run_at DESC LIMIT 1;
    IF NOT coalesce(last_ok, false) THEN RAISE EXCEPTION 'diagnostic_not_passed'; END IF;
    UPDATE public.contract_watch_settings SET scope_verified_at = now(), allowed_mailboxes = ARRAY['thomas.treffen@mcsservice.no'], updated_at = now() WHERE id;
  ELSIF _action = 'enable' THEN
    IF s.scope_verified_at IS NULL OR s.consent_at IS NULL OR array_length(s.allowed_mailboxes,1) IS NULL THEN RAISE EXCEPTION 'gates_not_met'; END IF;
    UPDATE public.contract_watch_settings SET enabled = true, updated_at = now() WHERE id;
  ELSE RAISE EXCEPTION 'invalid_action';
  END IF;
  INSERT INTO public.contract_watch_audit(actor, action, details) VALUES (auth.uid(), _action, jsonb_build_object('retention', _retention, 'dismissed', _dismissed));
  SELECT * INTO s FROM public.contract_watch_settings WHERE id;
  RETURN to_jsonb(s) - 'consent_by';
END $$;
REVOKE ALL ON FUNCTION public.contract_watch_update(text, text, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.contract_watch_update(text, text, integer, integer) TO authenticated;