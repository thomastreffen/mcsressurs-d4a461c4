CREATE TABLE public.compliance_response_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  inspection_id uuid NOT NULL REFERENCES public.compliance_inspections(id) ON DELETE CASCADE,
  package_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  subject text,
  recipient_name text,
  recipient_email text,
  cc_emails text[] NOT NULL DEFAULT '{}',
  intro_text text,
  closing_text text,
  manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_body_snapshot text,
  exported_at timestamptz,
  sent_at timestamptz,
  sent_by uuid,
  send_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.compliance_response_package_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  package_id uuid NOT NULL REFERENCES public.compliance_response_packages(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.compliance_findings(id) ON DELETE SET NULL,
  finding_number integer,
  finding_type text,
  finding_title text,
  original_text_snapshot text,
  response_text_snapshot text,
  actions_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.compliance_response_package_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  package_id uuid NOT NULL REFERENCES public.compliance_response_packages(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.compliance_findings(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  evidence_id uuid,
  export_name text NOT NULL,
  file_name text,
  mime_type text,
  file_size bigint,
  storage_bucket text,
  file_path text,
  source_kind text,
  source_label text,
  document_created_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crp_inspection ON public.compliance_response_packages(inspection_id, package_number);
CREATE INDEX idx_crpf_package ON public.compliance_response_package_findings(package_id);
CREATE INDEX idx_crpa_package ON public.compliance_response_package_attachments(package_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_response_packages TO authenticated;
GRANT ALL ON public.compliance_response_packages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_response_package_findings TO authenticated;
GRANT ALL ON public.compliance_response_package_findings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_response_package_attachments TO authenticated;
GRANT ALL ON public.compliance_response_package_attachments TO service_role;

ALTER TABLE public.compliance_response_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_response_package_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_response_package_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY crp_select ON public.compliance_response_packages FOR SELECT TO authenticated
  USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY crp_manage ON public.compliance_response_packages FOR ALL TO authenticated
  USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE POLICY crpf_select ON public.compliance_response_package_findings FOR SELECT TO authenticated
  USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY crpf_manage ON public.compliance_response_package_findings FOR ALL TO authenticated
  USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE POLICY crpa_select ON public.compliance_response_package_attachments FOR SELECT TO authenticated
  USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY crpa_manage ON public.compliance_response_package_attachments FOR ALL TO authenticated
  USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE OR REPLACE FUNCTION public.set_response_package_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.package_number IS NULL OR NEW.package_number <= 1 THEN
    SELECT COALESCE(MAX(package_number), 0) + 1 INTO NEW.package_number
    FROM public.compliance_response_packages
    WHERE inspection_id = NEW.inspection_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_response_package_number
BEFORE INSERT ON public.compliance_response_packages
FOR EACH ROW EXECUTE FUNCTION public.set_response_package_number();

CREATE TRIGGER trg_crp_updated_at
BEFORE UPDATE ON public.compliance_response_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();