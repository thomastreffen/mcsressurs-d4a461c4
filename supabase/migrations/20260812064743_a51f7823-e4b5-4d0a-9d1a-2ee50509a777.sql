-- 1. Stillinger / roller (brukes av ansattkortet, ikke bare kompetansekrav)
CREATE TABLE public.compliance_job_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_field_role boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX compliance_job_roles_company_name_key ON public.compliance_job_roles (company_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_job_roles TO authenticated;
GRANT ALL ON public.compliance_job_roles TO service_role;
ALTER TABLE public.compliance_job_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_roles_select" ON public.compliance_job_roles
  FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "job_roles_manage" ON public.compliance_job_roles
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND public.has_hms_manage(auth.uid(), company_id));

ALTER TABLE public.employment_profiles ADD COLUMN IF NOT EXISTS job_role_id uuid REFERENCES public.compliance_job_roles(id) ON DELETE SET NULL;

-- 2. Kompetansekrav
CREATE TABLE public.compliance_competence_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  competence_type_id uuid NOT NULL REFERENCES public.compliance_competence_types(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('company','department','role','person')),
  scope_id uuid,
  required boolean NOT NULL DEFAULT true,
  document_required boolean NOT NULL DEFAULT true,
  validity_months integer,
  warning_days integer DEFAULT 90,
  description text,
  reason text,
  active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_to date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requirement_scope_id_check CHECK (
    (scope_type = 'company' AND scope_id IS NULL) OR (scope_type <> 'company' AND scope_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX competence_requirements_unique_scope
  ON public.compliance_competence_requirements (company_id, competence_type_id, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX competence_requirements_company_idx ON public.compliance_competence_requirements (company_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_competence_requirements TO authenticated;
GRANT ALL ON public.compliance_competence_requirements TO service_role;
ALTER TABLE public.compliance_competence_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competence_requirements_select" ON public.compliance_competence_requirements
  FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "competence_requirements_manage" ON public.compliance_competence_requirements
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.has_hms_manage(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND public.has_hms_manage(auth.uid(), company_id));

CREATE TRIGGER trg_job_roles_updated_at BEFORE UPDATE ON public.compliance_job_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_competence_requirements_updated_at BEFORE UPDATE ON public.compliance_competence_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Migrer eksisterende "required_for_all" til virksomhetskrav
INSERT INTO public.compliance_competence_requirements
  (company_id, competence_type_id, scope_type, scope_id, required, document_required, validity_months, reason)
SELECT t.company_id, t.id, 'company', NULL, true, COALESCE(t.requires_document, true), t.default_validity_months,
       'Overført fra kompetansetypens standardinnstilling'
FROM public.compliance_competence_types t
WHERE t.required_for_all = true AND t.is_active = true
ON CONFLICT DO NOTHING;

-- 4. Gjeldende krav per ansatt (arv + overstyring)
CREATE OR REPLACE FUNCTION public.compliance_effective_requirements(_company_id uuid, _person_id uuid DEFAULT NULL)
RETURNS TABLE (
  person_id uuid,
  competence_type_id uuid,
  requirement_id uuid,
  required boolean,
  document_required boolean,
  validity_months integer,
  warning_days integer,
  reason text,
  source_scope text,
  source_label text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH emp AS (
    SELECT ep.person_id, ep.department_id, ep.job_role_id
    FROM public.employment_profiles ep
    WHERE ep.company_id = _company_id
      AND ep.archived_at IS NULL
      AND ep.include_in_hms_people = true
      AND (_person_id IS NULL OR ep.person_id = _person_id)
  ),
  req AS (
    SELECT r.* FROM public.compliance_competence_requirements r
    WHERE r.company_id = _company_id
      AND r.active = true
      AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE)
      AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
  ),
  matched AS (
    SELECT e.person_id, r.*,
      CASE r.scope_type WHEN 'person' THEN 4 WHEN 'role' THEN 3 WHEN 'department' THEN 2 ELSE 1 END AS prio
    FROM emp e
    JOIN req r ON (
      r.scope_type = 'company'
      OR (r.scope_type = 'department' AND r.scope_id = e.department_id)
      OR (r.scope_type = 'role' AND r.scope_id = e.job_role_id)
      OR (r.scope_type = 'person' AND r.scope_id = e.person_id)
    )
  ),
  ranked AS (
    SELECT m.*, ROW_NUMBER() OVER (
      PARTITION BY m.person_id, m.competence_type_id ORDER BY m.prio DESC, m.updated_at DESC
    ) AS rn
    FROM matched m
  )
  SELECT
    k.person_id,
    k.competence_type_id,
    k.id AS requirement_id,
    k.required,
    k.document_required,
    COALESCE(k.validity_months, ct.default_validity_months) AS validity_months,
    COALESCE(k.warning_days, 90) AS warning_days,
    k.reason,
    k.scope_type AS source_scope,
    CASE k.scope_type
      WHEN 'company' THEN 'Hele virksomheten'
      WHEN 'department' THEN COALESCE(d.name, 'Avdeling')
      WHEN 'role' THEN COALESCE(jr.name, 'Stilling')
      WHEN 'person' THEN COALESCE(p.full_name, 'Person')
    END AS source_label
  FROM ranked k
  JOIN public.compliance_competence_types ct ON ct.id = k.competence_type_id
  LEFT JOIN public.departments d ON d.id = k.scope_id AND k.scope_type = 'department'
  LEFT JOIN public.compliance_job_roles jr ON jr.id = k.scope_id AND k.scope_type = 'role'
  LEFT JOIN public.people p ON p.id = k.scope_id AND k.scope_type = 'person'
  WHERE k.rn = 1;
$$;

GRANT EXECUTE ON FUNCTION public.compliance_effective_requirements(uuid, uuid) TO authenticated, service_role;

-- 5. Kravstatus per ansatt
CREATE OR REPLACE FUNCTION public.compliance_requirement_status(_company_id uuid, _person_id uuid DEFAULT NULL)
RETURNS TABLE (
  person_id uuid,
  competence_type_id uuid,
  requirement_id uuid,
  required boolean,
  document_required boolean,
  validity_months integer,
  warning_days integer,
  reason text,
  source_scope text,
  source_label text,
  competence_id uuid,
  expires_at date,
  has_document boolean,
  days_until integer,
  status text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH eff AS (
    SELECT * FROM public.compliance_effective_requirements(_company_id, _person_id)
  ),
  best AS (
    SELECT DISTINCT ON (e.person_id, e.competence_type_id)
      e.person_id, e.competence_type_id, c.id AS competence_id, c.expires_at,
      (c.document_id IS NOT NULL) AS has_document
    FROM eff e
    JOIN public.compliance_competences c
      ON c.person_id = e.person_id
     AND c.competence_type_id = e.competence_type_id
     AND c.company_id = _company_id
     AND c.deleted_at IS NULL
    ORDER BY e.person_id, e.competence_type_id,
      (c.document_id IS NOT NULL) DESC,
      (c.expires_at IS NULL) DESC,
      c.expires_at DESC NULLS LAST
  )
  SELECT
    e.person_id, e.competence_type_id, e.requirement_id, e.required, e.document_required,
    e.validity_months, e.warning_days, e.reason, e.source_scope, e.source_label,
    b.competence_id, b.expires_at, COALESCE(b.has_document, false) AS has_document,
    CASE WHEN b.expires_at IS NULL THEN NULL ELSE (b.expires_at - CURRENT_DATE)::int END AS days_until,
    CASE
      WHEN e.required = false THEN 'not_required'
      WHEN b.competence_id IS NULL THEN 'missing'
      WHEN e.document_required AND NOT COALESCE(b.has_document, false) THEN 'missing_document'
      WHEN b.expires_at IS NOT NULL AND b.expires_at < CURRENT_DATE THEN 'expired'
      WHEN b.expires_at IS NOT NULL AND b.expires_at <= CURRENT_DATE + e.warning_days THEN 'expiring_soon'
      ELSE 'fulfilled'
    END AS status
  FROM eff e
  LEFT JOIN best b ON b.person_id = e.person_id AND b.competence_type_id = e.competence_type_id;
$$;

GRANT EXECUTE ON FUNCTION public.compliance_requirement_status(uuid, uuid) TO authenticated, service_role;

-- 6. Hvor mange ansatte påvirkes av hvert krav
CREATE OR REPLACE FUNCTION public.compliance_requirement_impact(_company_id uuid)
RETURNS TABLE (requirement_id uuid, affected_people integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT e.requirement_id, COUNT(DISTINCT e.person_id)::int
  FROM public.compliance_effective_requirements(_company_id, NULL) e
  GROUP BY e.requirement_id;
$$;

GRANT EXECUTE ON FUNCTION public.compliance_requirement_impact(uuid) TO authenticated, service_role;