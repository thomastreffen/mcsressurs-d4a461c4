CREATE TABLE public.job_outlook_app_sync_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  dry_run boolean NOT NULL DEFAULT true,
  pilot_mailboxes text[] NOT NULL DEFAULT '{}',
  scope_verified_at timestamptz,
  scope_verified_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.job_outlook_app_sync_settings TO authenticated;
GRANT ALL ON public.job_outlook_app_sync_settings TO service_role;
ALTER TABLE public.job_outlook_app_sync_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin reads job outlook app settings" ON public.job_outlook_app_sync_settings
  FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()));
INSERT INTO public.job_outlook_app_sync_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.job_outlook_app_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  mailbox text NOT NULL,
  dedup_key text NOT NULL UNIQUE,
  outlook_event_id text,
  outlook_change_key text,
  hub_version text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','synced','conflict','failed','deleted','dry_run')),
  last_error text,
  attempt_count int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, technician_id, mailbox)
);
GRANT ALL ON public.job_outlook_app_links TO service_role;
ALTER TABLE public.job_outlook_app_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.job_outlook_app_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  event_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','superseded','skipped')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 1,
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE UNIQUE INDEX job_outlook_app_queue_one_open
  ON public.job_outlook_app_queue (event_id, technician_id) WHERE status IN ('pending','processing');
GRANT ALL ON public.job_outlook_app_queue TO service_role;
ALTER TABLE public.job_outlook_app_queue ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.job_outlook_app_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid,
  company_id uuid,
  event_id uuid,
  technician_id uuid,
  mailbox text,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound','queue')),
  action text NOT NULL,
  dry_run boolean NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.job_outlook_app_log TO service_role;
ALTER TABLE public.job_outlook_app_log ENABLE ROW LEVEL SECURITY;