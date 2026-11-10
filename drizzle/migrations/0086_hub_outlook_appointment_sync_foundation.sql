CREATE TABLE public.hub_outlook_sync_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  dry_run boolean NOT NULL DEFAULT true,
  pilot_mailboxes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.hub_outlook_sync_settings TO authenticated;
GRANT ALL ON public.hub_outlook_sync_settings TO service_role;
ALTER TABLE public.hub_outlook_sync_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin reads hub outlook sync settings" ON public.hub_outlook_sync_settings
  FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()));
INSERT INTO public.hub_outlook_sync_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.hub_outlook_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  task_id uuid NOT NULL,
  mailbox text NOT NULL,
  dedup_key text NOT NULL UNIQUE,
  outlook_event_id text,
  outlook_change_key text,
  hub_version text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','synced','conflict','failed','deleted','dry_run')),
  last_error text,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, mailbox)
);
GRANT ALL ON public.hub_outlook_event_links TO service_role;
ALTER TABLE public.hub_outlook_event_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hub_outlook_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid,
  company_id uuid,
  task_id uuid,
  mailbox text,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  action text NOT NULL,
  dry_run boolean NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hub_outlook_sync_log TO service_role;
ALTER TABLE public.hub_outlook_sync_log ENABLE ROW LEVEL SECURITY;