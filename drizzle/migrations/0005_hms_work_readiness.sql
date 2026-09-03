-- Risikotagger på planlagt aktivitet/jobb
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS risk_tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_events_risk_tags ON public.events USING GIN (risk_tags);

-- Overstyring / vurdering av manglende krav (historikk bevares, ingen sletting)
CREATE TABLE IF NOT EXISTS public.hms_readiness_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  person_id uuid,
  user_id uuid,
  technician_name text,
  requirement_key text NOT NULL,
  requirement_label text,
  risk_tags text[] NOT NULL DEFAULT '{}',
  decision text NOT NULL DEFAULT 'accepted',
  comment text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_readiness_overrides_event ON public.hms_readiness_overrides (event_id);
CREATE INDEX IF NOT EXISTS idx_readiness_overrides_company ON public.hms_readiness_overrides (company_id, created_at DESC);

GRANT SELECT, INSERT ON public.hms_readiness_overrides TO authenticated;
GRANT ALL ON public.hms_readiness_overrides TO service_role;

ALTER TABLE public.hms_readiness_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS readiness_overrides_select ON public.hms_readiness_overrides;
CREATE POLICY readiness_overrides_select ON public.hms_readiness_overrides
  FOR SELECT TO authenticated
  USING (public.has_hms_view(auth.uid(), company_id));

DROP POLICY IF EXISTS readiness_overrides_insert ON public.hms_readiness_overrides;
CREATE POLICY readiness_overrides_insert ON public.hms_readiness_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public.has_hms_view(auth.uid(), company_id));

-- Revisjonsspor: HMS-managere må kunne skrive auditlogg fra klienten
GRANT INSERT ON public.hms_audit_log TO authenticated;
DROP POLICY IF EXISTS hms_audit_log_insert ON public.hms_audit_log;
CREATE POLICY hms_audit_log_insert ON public.hms_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_hms_view(auth.uid(), company_id));