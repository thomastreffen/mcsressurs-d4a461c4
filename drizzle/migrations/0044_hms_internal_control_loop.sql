-- HMS internkontrollsløyfe: årshjul, virksomhetsrisikoregister, internkontrollgjennomgang
-- og koblinger fra hms_action_items (handlingsplanen) til nye kilder.

-- 1) HMS-årshjul: planlagte/tilbakevendende HMS-aktiviteter (leder/admin)
CREATE TABLE public.hms_year_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'annet',
  responsible_user_id uuid,
  deputy_user_id uuid,
  frequency text NOT NULL DEFAULT 'annual', -- monthly|quarterly|semiannual|annual|custom
  custom_interval_days integer,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned', -- planned|done|cancelled (forfalt utledes av due_date)
  completed_at timestamptz,
  completed_by uuid,
  documentation text,
  comment text,
  linked_template_id uuid,
  linked_audit_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_year_activities TO authenticated;
GRANT ALL ON public.hms_year_activities TO service_role;
ALTER TABLE public.hms_year_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY hms_year_activities_select ON public.hms_year_activities FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (has_hms_view(auth.uid(), company_id) OR responsible_user_id = auth.uid() OR deputy_user_id = auth.uid()));
CREATE POLICY hms_year_activities_write ON public.hms_year_activities FOR ALL TO authenticated
  USING (has_hms_manage(auth.uid(), company_id) OR responsible_user_id = auth.uid())
  WITH CHECK (has_hms_manage(auth.uid(), company_id) OR responsible_user_id = auth.uid());
CREATE POLICY phase2_module_view ON public.hms_year_activities AS RESTRICTIVE FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id, 'hms'::text, 'view'::text));
CREATE POLICY phase2_module_insert ON public.hms_year_activities AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_company_access(auth.uid(), company_id, 'hms'::text, 'edit'::text));
CREATE POLICY phase2_module_update ON public.hms_year_activities AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (has_company_access(auth.uid(), company_id, 'hms'::text, 'edit'::text));
CREATE POLICY phase2_module_delete ON public.hms_year_activities AS RESTRICTIVE FOR DELETE TO authenticated
  USING (has_company_access(auth.uid(), company_id, 'hms'::text, 'admin'::text));

-- 2) Virksomhetsrisikoregister: overordnet/tilbakevendende risiko, separat fra SJA
CREATE TABLE public.hms_risk_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  area text NOT NULL, -- arbeidsområde, f.eks. epoxy/herdeplast, tavlearbeid
  hazard text NOT NULL, -- fare
  event_description text, -- mulig hendelse
  probability integer NOT NULL DEFAULT 1, -- 1-5
  consequence integer NOT NULL DEFAULT 1, -- 1-5
  score integer GENERATED ALWAYS AS (probability * consequence) STORED,
  existing_measures text,
  new_measures text,
  responsible_user_id uuid,
  next_review_date date,
  status text NOT NULL DEFAULT 'active', -- active|mitigated|closed
  hms_areas text[] NOT NULL DEFAULT '{}',
  handbook_section_ids uuid[] NOT NULL DEFAULT '{}',
  chemical_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_risk_register TO authenticated;
GRANT ALL ON public.hms_risk_register TO service_role;
ALTER TABLE public.hms_risk_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY hms_risk_register_select ON public.hms_risk_register FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND has_hms_view(auth.uid(), company_id));
CREATE POLICY hms_risk_register_write ON public.hms_risk_register FOR ALL TO authenticated
  USING (has_hms_manage(auth.uid(), company_id))
  WITH CHECK (has_hms_manage(auth.uid(), company_id));
CREATE POLICY phase2_module_view ON public.hms_risk_register AS RESTRICTIVE FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id, 'hms'::text, 'view'::text));
CREATE POLICY phase2_module_insert ON public.hms_risk_register AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_company_access(auth.uid(), company_id, 'hms'::text, 'edit'::text));
CREATE POLICY phase2_module_update ON public.hms_risk_register AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (has_company_access(auth.uid(), company_id, 'hms'::text, 'edit'::text));
CREATE POLICY phase2_module_delete ON public.hms_risk_register AS RESTRICTIVE FOR DELETE TO authenticated
  USING (has_company_access(auth.uid(), company_id, 'hms'::text, 'admin'::text));

-- 3) Årlig internkontrollgjennomgang: versjonert, signert, kun leder/admin
CREATE TABLE public.hms_internal_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  title text NOT NULL,
  period_year integer NOT NULL,
  status text NOT NULL DEFAULT 'draft', -- draft|in_progress|completed
  version integer NOT NULL DEFAULT 1,
  auto_snapshot jsonb NOT NULL DEFAULT '{}', -- frosne systemfakta ved opprettelse
  answers jsonb NOT NULL DEFAULT '{}', -- kontrollpunkt -> {answer, comment, action_item_id}
  signed_by uuid,
  signed_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_internal_reviews TO authenticated;
GRANT ALL ON public.hms_internal_reviews TO service_role;
ALTER TABLE public.hms_internal_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY hms_internal_reviews_select ON public.hms_internal_reviews FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND has_hms_manage(auth.uid(), company_id));
CREATE POLICY hms_internal_reviews_write ON public.hms_internal_reviews FOR ALL TO authenticated
  USING (has_hms_manage(auth.uid(), company_id))
  WITH CHECK (has_hms_manage(auth.uid(), company_id));
CREATE POLICY phase2_module_view ON public.hms_internal_reviews AS RESTRICTIVE FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id, 'hms'::text, 'view'::text));
CREATE POLICY phase2_module_insert ON public.hms_internal_reviews AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_company_access(auth.uid(), company_id, 'hms'::text, 'edit'::text));
CREATE POLICY phase2_module_update ON public.hms_internal_reviews AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (has_company_access(auth.uid(), company_id, 'hms'::text, 'edit'::text));
CREATE POLICY phase2_module_delete ON public.hms_internal_reviews AS RESTRICTIVE FOR DELETE TO authenticated
  USING (has_company_access(auth.uid(), company_id, 'hms'::text, 'admin'::text));

-- 4) Handlingsplanen (hms_action_items) får koblinger til de nye kildene
ALTER TABLE public.hms_action_items ADD COLUMN source_type text; -- risk_register|year_activity|internal_review|incident|inspection|audit|manual
ALTER TABLE public.hms_action_items ADD COLUMN risk_register_id uuid REFERENCES public.hms_risk_register(id);
ALTER TABLE public.hms_action_items ADD COLUMN year_activity_id uuid REFERENCES public.hms_year_activities(id);
ALTER TABLE public.hms_action_items ADD COLUMN internal_review_id uuid REFERENCES public.hms_internal_reviews(id);
CREATE INDEX hms_action_items_risk_register_idx ON public.hms_action_items(risk_register_id) WHERE risk_register_id IS NOT NULL;
CREATE INDEX hms_action_items_year_activity_idx ON public.hms_action_items(year_activity_id) WHERE year_activity_id IS NOT NULL;
CREATE INDEX hms_action_items_internal_review_idx ON public.hms_action_items(internal_review_id) WHERE internal_review_id IS NOT NULL;
CREATE INDEX hms_year_activities_company_due_idx ON public.hms_year_activities(company_id, due_date) WHERE deleted_at IS NULL;
CREATE INDEX hms_risk_register_company_status_idx ON public.hms_risk_register(company_id, status) WHERE deleted_at IS NULL;