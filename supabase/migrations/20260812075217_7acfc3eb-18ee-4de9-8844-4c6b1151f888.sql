ALTER TABLE public.compliance_findings
  ADD COLUMN IF NOT EXISTS report_reference text,
  ADD COLUMN IF NOT EXISTS authority_requirement text,
  ADD COLUMN IF NOT EXISTS internal_category text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS proposed_solution text,
  ADD COLUMN IF NOT EXISTS responsible_role_id uuid REFERENCES public.compliance_org_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_deadline date,
  ADD COLUMN IF NOT EXISTS match_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_suggestions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_suggestion_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS response_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_approved_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.compliance_findings'::regclass AND conname = 'compliance_findings_priority_check'
  ) THEN
    ALTER TABLE public.compliance_findings
      ADD CONSTRAINT compliance_findings_priority_check
      CHECK (priority = ANY (ARRAY['critical'::text, 'high'::text, 'normal'::text, 'low'::text]));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS compliance_findings_responsible_role_idx
  ON public.compliance_findings (responsible_role_id);