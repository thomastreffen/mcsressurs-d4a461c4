-- 1. Tilsynssaker
CREATE TABLE public.compliance_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  inspection_type text NOT NULL DEFAULT 'dle',
  authority_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  case_number text,
  inspection_date date,
  response_deadline date,
  responsible_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  description text,
  status text NOT NULL DEFAULT 'planned',
  submitted_at timestamptz,
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT compliance_inspections_type_check CHECK (inspection_type IN ('dle','dsb','arbeidstilsynet','customer','main_contractor','internal_audit','other')),
  CONSTRAINT compliance_inspections_status_check CHECK (status IN ('planned','ongoing','awaiting_report','actions_in_progress','ready_for_response','submitted','closed'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_inspections TO authenticated;
GRANT ALL ON public.compliance_inspections TO service_role;
ALTER TABLE public.compliance_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_inspections_select ON public.compliance_inspections FOR SELECT TO authenticated USING (has_hms_view(auth.uid(), company_id));
CREATE POLICY compliance_inspections_manage ON public.compliance_inspections FOR ALL TO authenticated USING (has_hms_manage(auth.uid(), company_id)) WITH CHECK (has_hms_manage(auth.uid(), company_id));
CREATE TRIGGER trg_compliance_inspections_updated_at BEFORE UPDATE ON public.compliance_inspections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_compliance_inspections_company ON public.compliance_inspections(company_id, status);

-- 2. Funn og avvik
CREATE TABLE public.compliance_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES public.compliance_inspections(id) ON DELETE CASCADE,
  finding_number integer NOT NULL DEFAULT 1,
  finding_type text NOT NULL DEFAULT 'deviation',
  title text NOT NULL,
  original_text text,
  legal_basis_text text,
  authority_comment text,
  deadline date,
  responsible_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new',
  internal_assessment text,
  response_text text,
  internal_notes text,
  documentation_status text NOT NULL DEFAULT 'none',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT compliance_findings_type_check CHECK (finding_type IN ('deviation','remark','observation')),
  CONSTRAINT compliance_findings_status_check CHECK (status IN ('new','under_review','actions_in_progress','documentation_ready','submitted','approved','disputed')),
  CONSTRAINT compliance_findings_doc_status_check CHECK (documentation_status IN ('none','incomplete','complete','gaps'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_findings TO authenticated;
GRANT ALL ON public.compliance_findings TO service_role;
ALTER TABLE public.compliance_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_findings_select ON public.compliance_findings FOR SELECT TO authenticated USING (has_hms_view(auth.uid(), company_id));
CREATE POLICY compliance_findings_manage ON public.compliance_findings FOR ALL TO authenticated USING (has_hms_manage(auth.uid(), company_id)) WITH CHECK (has_hms_manage(auth.uid(), company_id));
CREATE TRIGGER trg_compliance_findings_updated_at BEFORE UPDATE ON public.compliance_findings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_compliance_findings_inspection ON public.compliance_findings(inspection_id, finding_number);

-- 3. Regelverkskoblinger
CREATE TABLE public.compliance_finding_regulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  finding_id uuid NOT NULL REFERENCES public.compliance_findings(id) ON DELETE CASCADE,
  regulation_id uuid REFERENCES public.compliance_regulations(id) ON DELETE CASCADE,
  clause text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_finding_regulations TO authenticated;
GRANT ALL ON public.compliance_finding_regulations TO service_role;
ALTER TABLE public.compliance_finding_regulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cfr_select ON public.compliance_finding_regulations FOR SELECT TO authenticated USING (has_hms_view(auth.uid(), company_id));
CREATE POLICY cfr_manage ON public.compliance_finding_regulations FOR ALL TO authenticated USING (has_hms_manage(auth.uid(), company_id)) WITH CHECK (has_hms_manage(auth.uid(), company_id));
CREATE INDEX idx_cfr_finding ON public.compliance_finding_regulations(finding_id);

-- 4. Dokumentasjon / bevis (referanser til eksisterende data)
CREATE TABLE public.compliance_finding_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES public.compliance_inspections(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.compliance_findings(id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  competence_type_id uuid REFERENCES public.compliance_competence_types(id) ON DELETE SET NULL,
  ref_id uuid,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  label text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cfe_source_kind_check CHECK (source_kind IN ('competence_requirement','competence','regulation','org_role','internal_audit','hms_incident','action_item','document','other'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_finding_evidence TO authenticated;
GRANT ALL ON public.compliance_finding_evidence TO service_role;
ALTER TABLE public.compliance_finding_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY cfe_select ON public.compliance_finding_evidence FOR SELECT TO authenticated USING (has_hms_view(auth.uid(), company_id));
CREATE POLICY cfe_manage ON public.compliance_finding_evidence FOR ALL TO authenticated USING (has_hms_manage(auth.uid(), company_id)) WITH CHECK (has_hms_manage(auth.uid(), company_id));
CREATE TRIGGER trg_cfe_updated_at BEFORE UPDATE ON public.compliance_finding_evidence FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_cfe_finding ON public.compliance_finding_evidence(finding_id);
CREATE INDEX idx_cfe_inspection ON public.compliance_finding_evidence(inspection_id);

-- 5. Korrespondanse
CREATE TABLE public.compliance_correspondence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES public.compliance_inspections(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  direction text NOT NULL DEFAULT 'note',
  contact_name text,
  subject text,
  notes text,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cc_direction_check CHECK (direction IN ('in','out','meeting','phone','note'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_correspondence TO authenticated;
GRANT ALL ON public.compliance_correspondence TO service_role;
ALTER TABLE public.compliance_correspondence ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_select ON public.compliance_correspondence FOR SELECT TO authenticated USING (has_hms_view(auth.uid(), company_id));
CREATE POLICY cc_manage ON public.compliance_correspondence FOR ALL TO authenticated USING (has_hms_manage(auth.uid(), company_id)) WITH CHECK (has_hms_manage(auth.uid(), company_id));
CREATE TRIGGER trg_cc_updated_at BEFORE UPDATE ON public.compliance_correspondence FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_cc_inspection ON public.compliance_correspondence(inspection_id, occurred_at DESC);

-- 6. Historikk
CREATE TABLE public.compliance_inspection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES public.compliance_inspections(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.compliance_findings(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.compliance_inspection_events TO authenticated;
GRANT ALL ON public.compliance_inspection_events TO service_role;
ALTER TABLE public.compliance_inspection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY cie_select ON public.compliance_inspection_events FOR SELECT TO authenticated USING (has_hms_view(auth.uid(), company_id));
CREATE POLICY cie_insert ON public.compliance_inspection_events FOR INSERT TO authenticated WITH CHECK (has_hms_manage(auth.uid(), company_id));
CREATE INDEX idx_cie_inspection ON public.compliance_inspection_events(inspection_id, created_at DESC);

-- 7. Gjenbruk av eksisterende tiltakssystem
ALTER TABLE public.hms_action_items
  ADD COLUMN IF NOT EXISTS compliance_inspection_id uuid REFERENCES public.compliance_inspections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compliance_finding_id uuid REFERENCES public.compliance_findings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hms_action_items_finding ON public.hms_action_items(compliance_finding_id);
CREATE INDEX IF NOT EXISTS idx_hms_action_items_inspection ON public.hms_action_items(compliance_inspection_id);