-- ===== Elsikkerhet & Compliance =====

CREATE TABLE public.compliance_competence_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'kurs',
  description text,
  default_validity_months integer,
  requires_document boolean NOT NULL DEFAULT true,
  required_for_all boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_competence_types TO authenticated;
GRANT ALL ON public.compliance_competence_types TO service_role;
ALTER TABLE public.compliance_competence_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_types_select" ON public.compliance_competence_types
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "compliance_types_manage" ON public.compliance_competence_types
  FOR ALL TO authenticated USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE TABLE public.compliance_competences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  competence_type_id uuid REFERENCES public.compliance_competence_types(id) ON DELETE SET NULL,
  type_label text,
  description text,
  issuer text,
  reference_number text,
  issued_at date,
  valid_from date,
  expires_at date,
  comment text,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  verified_by uuid,
  verified_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
CREATE INDEX idx_compliance_competences_person ON public.compliance_competences(person_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_compliance_competences_company ON public.compliance_competences(company_id, expires_at) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_competences TO authenticated;
GRANT ALL ON public.compliance_competences TO service_role;
ALTER TABLE public.compliance_competences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_competences_select" ON public.compliance_competences
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "compliance_competences_manage" ON public.compliance_competences
  FOR ALL TO authenticated USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE TABLE public.compliance_regulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  short_name text,
  reg_type text NOT NULL DEFAULT 'forskrift',
  description text,
  relevance text,
  source_url text,
  responsible_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  responsible_role text,
  last_reviewed_at date,
  next_review_at date,
  review_interval_months integer DEFAULT 12,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_regulations TO authenticated;
GRANT ALL ON public.compliance_regulations TO service_role;
ALTER TABLE public.compliance_regulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_regulations_select" ON public.compliance_regulations
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "compliance_regulations_manage" ON public.compliance_regulations
  FOR ALL TO authenticated USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE TABLE public.compliance_org_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  role_type text NOT NULL DEFAULT 'other',
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  deputy_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  reports_to_id uuid REFERENCES public.compliance_org_roles(id) ON DELETE SET NULL,
  responsibilities text,
  tasks text,
  authority text,
  valid_from date,
  valid_to date,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_org_roles TO authenticated;
GRANT ALL ON public.compliance_org_roles TO service_role;
ALTER TABLE public.compliance_org_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_org_roles_select" ON public.compliance_org_roles
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "compliance_org_roles_manage" ON public.compliance_org_roles
  FOR ALL TO authenticated USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE TABLE public.compliance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  audit_type text NOT NULL DEFAULT 'internal_control',
  planned_date date,
  performed_at date,
  responsible_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  participants text[] NOT NULL DEFAULT '{}',
  areas text[] NOT NULL DEFAULT '{}',
  findings text,
  deviations text,
  improvements text,
  conclusion text,
  status text NOT NULL DEFAULT 'planned',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_audits TO authenticated;
GRANT ALL ON public.compliance_audits TO service_role;
ALTER TABLE public.compliance_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_audits_select" ON public.compliance_audits
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY "compliance_audits_manage" ON public.compliance_audits
  FOR ALL TO authenticated USING (public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

-- reuse existing action/deviation system
ALTER TABLE public.hms_action_items
  ADD COLUMN IF NOT EXISTS compliance_audit_id uuid REFERENCES public.compliance_audits(id) ON DELETE SET NULL;

-- notification queue (prepared for later email/push delivery)
CREATE TABLE public.compliance_notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  threshold_days integer,
  channel text NOT NULL DEFAULT 'in_app',
  recipient_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  recipient_email text,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, threshold_days, channel)
);
GRANT SELECT ON public.compliance_notification_queue TO authenticated;
GRANT ALL ON public.compliance_notification_queue TO service_role;
ALTER TABLE public.compliance_notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_notif_select" ON public.compliance_notification_queue
  FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));

-- ===== status computation =====
CREATE OR REPLACE FUNCTION public.compliance_competence_status(
  _expires_at date,
  _has_document boolean,
  _requires_document boolean
) RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN COALESCE(_requires_document, true) AND NOT COALESCE(_has_document, false) THEN 'missing_document'
    WHEN _expires_at IS NULL THEN 'valid'
    WHEN _expires_at < CURRENT_DATE THEN 'expired'
    WHEN _expires_at <= CURRENT_DATE + 90 THEN 'expiring_soon'
    ELSE 'valid'
  END
$$;

CREATE OR REPLACE VIEW public.v_compliance_competence_status
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.company_id,
  c.person_id,
  c.competence_type_id,
  COALESCE(t.name, c.type_label) AS type_name,
  t.category,
  t.requires_document,
  c.expires_at,
  c.verified_at,
  (c.document_id IS NOT NULL) AS has_document,
  CASE WHEN c.expires_at IS NULL THEN NULL ELSE (c.expires_at - CURRENT_DATE) END AS days_to_expiry,
  public.compliance_competence_status(c.expires_at, c.document_id IS NOT NULL, COALESCE(t.requires_document, true)) AS status
FROM public.compliance_competences c
LEFT JOIN public.compliance_competence_types t ON t.id = c.competence_type_id
WHERE c.deleted_at IS NULL;

GRANT SELECT ON public.v_compliance_competence_status TO authenticated, service_role;

-- updated_at triggers
CREATE TRIGGER trg_compliance_types_updated BEFORE UPDATE ON public.compliance_competence_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_compliance_competences_updated BEFORE UPDATE ON public.compliance_competences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_compliance_regulations_updated BEFORE UPDATE ON public.compliance_regulations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_compliance_org_roles_updated BEFORE UPDATE ON public.compliance_org_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_compliance_audits_updated BEFORE UPDATE ON public.compliance_audits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();