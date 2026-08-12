ALTER TABLE public.compliance_findings
  ADD COLUMN IF NOT EXISTS condition_corrected_at timestamptz,
  ADD COLUMN IF NOT EXISTS condition_corrected_by uuid,
  ADD COLUMN IF NOT EXISTS documentation_complete_at timestamptz,
  ADD COLUMN IF NOT EXISTS documentation_complete_by uuid;