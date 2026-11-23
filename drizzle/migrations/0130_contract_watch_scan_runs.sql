CREATE TABLE IF NOT EXISTS public.contract_watch_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'historical_test' CHECK (mode IN ('historical_test')),
  mailbox text NOT NULL,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed','blocked')),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_detail text CHECK (error_detail IS NULL OR length(error_detail) <= 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS contract_watch_scan_one_running ON public.contract_watch_scan_runs ((true)) WHERE status = 'running';
ALTER TABLE public.contract_watch_scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY cw_scan_runs_superadmin ON public.contract_watch_scan_runs FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()));
GRANT SELECT ON public.contract_watch_scan_runs TO authenticated;
GRANT ALL ON public.contract_watch_scan_runs TO service_role;

ALTER TABLE public.contract_watch_commitments
  ADD COLUMN IF NOT EXISTS source_folder text,
  ADD COLUMN IF NOT EXISTS source_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_run_id uuid,
  ADD COLUMN IF NOT EXISTS coverage_detail jsonb,
  ADD COLUMN IF NOT EXISTS uncertainty text;