CREATE TABLE public.contract_watch_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  allowed_mailboxes text[] NOT NULL DEFAULT '{}',
  scope_verified_at timestamptz,
  consent_by uuid, consent_at timestamptz, consent_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.contract_watch_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE public.contract_watch_diagnostic_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_at timestamptz NOT NULL DEFAULT now(),
  run_by uuid, overall text NOT NULL, checks jsonb NOT NULL DEFAULT '[]', app_roles text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE public.contract_watch_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), at timestamptz NOT NULL DEFAULT now(),
  actor uuid, action text NOT NULL, details jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE public.contract_watch_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, mailbox text NOT NULL,
  dedupe_key text NOT NULL, conversation_id text, internet_message_id text, message_hash text,
  excerpt text CHECK (excerpt IS NULL OR length(excerpt) <= 500),
  customer_id uuid, customer_account_id uuid, promised_date date, promised_time text, date_certain boolean NOT NULL DEFAULT false,
  confidence numeric NOT NULL DEFAULT 0, confidence_class text NOT NULL DEFAULT 'uncertain',
  coverage text, status text NOT NULL DEFAULT 'open', is_test boolean NOT NULL DEFAULT true,
  history jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox, dedupe_key)
);
GRANT SELECT ON public.contract_watch_settings, public.contract_watch_diagnostic_runs, public.contract_watch_audit, public.contract_watch_commitments TO authenticated;
GRANT ALL ON public.contract_watch_settings, public.contract_watch_diagnostic_runs, public.contract_watch_audit, public.contract_watch_commitments TO service_role;
ALTER TABLE public.contract_watch_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_watch_diagnostic_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_watch_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_watch_commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY cw_settings_superadmin ON public.contract_watch_settings FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()));
CREATE POLICY cw_runs_superadmin ON public.contract_watch_diagnostic_runs FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()));
CREATE POLICY cw_audit_superadmin ON public.contract_watch_audit FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()));
CREATE POLICY cw_commit_superadmin ON public.contract_watch_commitments FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()));
CREATE OR REPLACE FUNCTION public.contract_watch_audit_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'contract_watch_audit is append-only'; END $$;
CREATE TRIGGER trg_cw_audit_append_only BEFORE UPDATE OR DELETE ON public.contract_watch_audit FOR EACH ROW EXECUTE FUNCTION public.contract_watch_audit_append_only();