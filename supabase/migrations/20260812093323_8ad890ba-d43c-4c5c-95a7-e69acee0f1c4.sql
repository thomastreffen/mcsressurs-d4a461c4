ALTER TABLE public.compliance_audits
  ADD COLUMN IF NOT EXISTS source_inspection_id uuid REFERENCES public.compliance_inspections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_finding_id uuid REFERENCES public.compliance_findings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checkpoints jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS system_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS report_markdown text,
  ADD COLUMN IF NOT EXISTS report_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid;

CREATE INDEX IF NOT EXISTS idx_compliance_audits_source_finding ON public.compliance_audits(source_finding_id);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_source_inspection ON public.compliance_audits(source_inspection_id);