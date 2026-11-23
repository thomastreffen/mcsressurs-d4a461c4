ALTER TABLE public.contract_watch_commitments
  ADD COLUMN IF NOT EXISTS pilot_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS action_status text,
  ADD COLUMN IF NOT EXISTS task_summary text CHECK (task_summary IS NULL OR length(task_summary) <= 160),
  ADD COLUMN IF NOT EXISTS counterparty_domain text,
  ADD COLUMN IF NOT EXISTS link_suggestions jsonb,
  ADD COLUMN IF NOT EXISTS related_refs jsonb;
ALTER TABLE public.contract_watch_scan_runs
  ADD COLUMN IF NOT EXISTS pilot_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS discard_reasons jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.contract_watch_scan_runs DROP CONSTRAINT IF EXISTS contract_watch_scan_runs_mode_check;
ALTER TABLE public.contract_watch_scan_runs ADD CONSTRAINT contract_watch_scan_runs_mode_check CHECK (mode IN ('historical_test','lookup'));

CREATE OR REPLACE FUNCTION public.cw_link_customer(_commitment_id uuid, _customer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.contract_watch_commitments; ok boolean;
BEGIN
  IF NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.contract_watch_commitments WHERE id = _commitment_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'commitment_not_found'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id AND company_id = c.company_id AND deleted_at IS NULL) INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'customer_not_in_company'; END IF;
  UPDATE public.contract_watch_commitments
    SET customer_id = _customer_id, uncertainty = NULLIF(uncertainty, 'customer_unknown'),
        history = history || jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'action', 'link_customer', 'from', c.customer_id, 'to', _customer_id)),
        updated_at = now()
    WHERE id = c.id;
  INSERT INTO public.contract_watch_audit(actor, action, details) VALUES (auth.uid(), 'link_customer', jsonb_build_object('commitment', c.id, 'customer', _customer_id));
END $$;
REVOKE ALL ON FUNCTION public.cw_link_customer(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cw_link_customer(uuid, uuid) TO authenticated;