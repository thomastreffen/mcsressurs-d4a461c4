-- Audit trail for the read-only central calendar app connection test.
-- Written and read ONLY by the hub-calendar-diagnostics edge function (service role, superadmin-verified).
-- Stores pass/fail per check, HTTP status and Graph error codes; never tokens, secrets or calendar content.
CREATE TABLE public.hub_calendar_diagnostic_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  run_by uuid NOT NULL,
  overall text NOT NULL CHECK (overall IN ('pass','fail','inconclusive','not_configured')),
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  app_roles text[] NOT NULL DEFAULT '{}'
);
GRANT ALL ON public.hub_calendar_diagnostic_runs TO service_role;
ALTER TABLE public.hub_calendar_diagnostic_runs ENABLE ROW LEVEL SECURITY;
-- No policies: no direct client access.
CREATE INDEX hub_calendar_diagnostic_runs_run_at_idx ON public.hub_calendar_diagnostic_runs (run_at DESC);