CREATE TABLE public.tripletex_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  checked_by uuid,
  environment text NOT NULL DEFAULT 'test' CHECK (environment = 'test'),
  status text NOT NULL CHECK (status IN ('ok','not_configured','auth_failed','wrong_company','api_error','network_error')),
  http_status integer,
  request_id text,
  latency_ms integer,
  company_id bigint,
  company_name text,
  project_sample_count integer,
  message text
);
GRANT SELECT ON public.tripletex_health_checks TO authenticated;
GRANT ALL ON public.tripletex_health_checks TO service_role;
ALTER TABLE public.tripletex_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read tripletex health" ON public.tripletex_health_checks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));