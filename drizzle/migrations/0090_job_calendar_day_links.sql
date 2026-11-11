-- Per-day Outlook mapping: one calendar event per (job, technician, workday).
-- Deterministic idempotency key blocks duplicate Graph events on retry/double-click.

CREATE TABLE public.job_calendar_day_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  work_date date NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  outlook_event_id text,
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX job_calendar_day_links_idem_key ON public.job_calendar_day_links (idempotency_key);
CREATE UNIQUE INDEX job_calendar_day_links_unique_day ON public.job_calendar_day_links (event_id, technician_id, work_date);
CREATE INDEX job_calendar_day_links_event_idx ON public.job_calendar_day_links (event_id);

GRANT SELECT ON public.job_calendar_day_links TO authenticated;
GRANT ALL ON public.job_calendar_day_links TO service_role;

ALTER TABLE public.job_calendar_day_links ENABLE ROW LEVEL SECURITY;

-- Planners/admins in the event's company see all day links; technicians see their own.
CREATE POLICY "Company members can view day links"
  ON public.job_calendar_day_links FOR SELECT TO authenticated
  USING (legacy_admin_in_company(event_company_id(event_id)));

CREATE POLICY "Technicians can view own day links"
  ON public.job_calendar_day_links FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.id = technician_id AND t.user_id = auth.uid()
  ));