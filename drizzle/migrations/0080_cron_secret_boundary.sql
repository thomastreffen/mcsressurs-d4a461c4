CREATE TABLE IF NOT EXISTS public.app_runtime_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_runtime_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_runtime_secrets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_cron_secret(_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _token IS NOT NULL
     AND length(_token) >= 32
     AND EXISTS (
           SELECT 1 FROM public.app_runtime_secrets
           WHERE key = 'cron_secret' AND value = _token
         );
$$;

REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;