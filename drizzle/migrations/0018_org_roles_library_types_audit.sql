ALTER TABLE public.compliance_org_roles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS additional_person_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS template_id uuid;

CREATE TABLE public.compliance_responsibility_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_responsibility_types TO authenticated;
GRANT ALL ON public.compliance_responsibility_types TO service_role;
ALTER TABLE public.compliance_responsibility_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY crt_select ON public.compliance_responsibility_types FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY crt_manage ON public.compliance_responsibility_types FOR ALL TO authenticated USING (public.has_hms_manage(auth.uid(), company_id)) WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE TABLE public.compliance_role_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  role_type text NOT NULL DEFAULT 'other',
  responsibilities text,
  tasks text,
  authority text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_role_templates TO authenticated;
GRANT ALL ON public.compliance_role_templates TO service_role;
ALTER TABLE public.compliance_role_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY crtpl_select ON public.compliance_role_templates FOR SELECT TO authenticated USING (public.has_hms_view(auth.uid(), company_id));
CREATE POLICY crtpl_manage ON public.compliance_role_templates FOR ALL TO authenticated USING (public.has_hms_manage(auth.uid(), company_id)) WITH CHECK (public.has_hms_manage(auth.uid(), company_id));

CREATE OR REPLACE FUNCTION public.log_org_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  changes jsonb := '{}'::jsonb;
  col text;
  act text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    act := 'created';
    changes := jsonb_build_object('title', NEW.title, 'person_id', NEW.person_id, 'role_type', NEW.role_type);
  ELSE
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      act := 'deleted';
    ELSE
      act := 'updated';
      FOREACH col IN ARRAY ARRAY['title','role_type','person_id','deputy_person_id','reports_to_id','responsibilities','tasks','authority','valid_from','valid_to','is_active','additional_person_ids'] LOOP
        IF (to_jsonb(OLD)->col) IS DISTINCT FROM (to_jsonb(NEW)->col) THEN
          changes := changes || jsonb_build_object(col, jsonb_build_object('old', to_jsonb(OLD)->col, 'new', to_jsonb(NEW)->col));
        END IF;
      END LOOP;
      IF changes = '{}'::jsonb THEN RETURN NEW; END IF;
    END IF;
  END IF;
  INSERT INTO public.hms_audit_log(company_id, entity_type, entity_id, action, performed_by, payload)
  VALUES (NEW.company_id, 'org_role', NEW.id, act, auth.uid(), jsonb_build_object('title', NEW.title, 'changes', changes));
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_org_role_change
AFTER INSERT OR UPDATE ON public.compliance_org_roles
FOR EACH ROW EXECUTE FUNCTION public.log_org_role_change();