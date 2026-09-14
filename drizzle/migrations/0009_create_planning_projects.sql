CREATE TABLE public.planning_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'early_planning',
  company_id uuid REFERENCES public.internal_companies(id),
  department_id uuid REFERENCES public.departments(id),
  customer_id uuid REFERENCES public.customers(id),
  customer_contact_id uuid REFERENCES public.customer_contacts(id),
  owner_user_id uuid,
  expected_start date,
  expected_end date,
  period_label text,
  contract_form text NOT NULL DEFAULT 'unclear',
  invoicing_company_id uuid REFERENCES public.internal_companies(id),
  invoice_recipient text,
  contract_value numeric,
  budget_value numeric,
  hourly_rate numeric,
  estimated_hours numeric,
  estimated_material_cost numeric,
  linked_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'internal',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_projects TO authenticated;
GRANT ALL ON public.planning_projects TO service_role;
ALTER TABLE public.planning_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planning_projects_select" ON public.planning_projects FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR company_id IS NULL OR public.is_company_member(auth.uid(), company_id));
CREATE POLICY "planning_projects_insert" ON public.planning_projects FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()) OR company_id IS NULL OR public.is_company_member(auth.uid(), company_id));
CREATE POLICY "planning_projects_update" ON public.planning_projects FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()) OR company_id IS NULL OR public.is_company_member(auth.uid(), company_id))
WITH CHECK (public.is_super_admin(auth.uid()) OR company_id IS NULL OR public.is_company_member(auth.uid(), company_id));
CREATE POLICY "planning_projects_delete" ON public.planning_projects FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()) OR company_id IS NULL OR public.is_company_member(auth.uid(), company_id));
CREATE INDEX idx_planning_projects_company ON public.planning_projects(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_planning_projects_status ON public.planning_projects(status) WHERE deleted_at IS NULL;

CREATE TABLE public.planning_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_project_id uuid NOT NULL REFERENCES public.planning_projects(id) ON DELETE CASCADE,
  user_id uuid,
  person_id uuid REFERENCES public.people(id),
  department_id uuid REFERENCES public.departments(id),
  company_id uuid REFERENCES public.internal_companies(id),
  role text NOT NULL DEFAULT 'member',
  member_type text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_members TO authenticated;
GRANT ALL ON public.planning_members TO service_role;
ALTER TABLE public.planning_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_planning_members_project ON public.planning_members(planning_project_id);

CREATE OR REPLACE FUNCTION public.has_planning_project_access(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.planning_projects p
    WHERE p.id = _project_id
      AND (
        public.is_super_admin(auth.uid())
        OR p.company_id IS NULL
        OR public.is_company_member(auth.uid(), p.company_id)
        OR EXISTS (
          SELECT 1 FROM public.planning_members m
          WHERE m.planning_project_id = p.id AND m.user_id = auth.uid()
        )
      )
  )
$$;

CREATE POLICY "planning_members_all" ON public.planning_members FOR ALL TO authenticated
USING (public.has_planning_project_access(planning_project_id))
WITH CHECK (public.has_planning_project_access(planning_project_id));

CREATE TABLE public.planning_work_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_project_id uuid NOT NULL REFERENCES public.planning_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'planned',
  responsible_company_id uuid REFERENCES public.internal_companies(id),
  responsible_department_id uuid REFERENCES public.departments(id),
  responsible_person_id uuid REFERENCES public.people(id),
  external_vendor_name text,
  planned_start date,
  planned_end date,
  resource_count integer,
  estimated_hours numeric,
  price_form text NOT NULL DEFAULT 'unclear',
  agreed_price numeric,
  hourly_rate numeric,
  billing_from_company_id uuid REFERENCES public.internal_companies(id),
  billing_to_company_id uuid REFERENCES public.internal_companies(id),
  assignment_state text NOT NULL DEFAULT 'not_assigned',
  linked_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  comment text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_work_packages TO authenticated;
GRANT ALL ON public.planning_work_packages TO service_role;
ALTER TABLE public.planning_work_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planning_wp_all" ON public.planning_work_packages FOR ALL TO authenticated
USING (public.has_planning_project_access(planning_project_id))
WITH CHECK (public.has_planning_project_access(planning_project_id));
CREATE INDEX idx_planning_wp_project ON public.planning_work_packages(planning_project_id);

CREATE TABLE public.planning_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_project_id uuid NOT NULL REFERENCES public.planning_projects(id) ON DELETE CASCADE,
  work_package_id uuid REFERENCES public.planning_work_packages(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  department_id uuid REFERENCES public.departments(id),
  company_id uuid REFERENCES public.internal_companies(id),
  assignee_person_id uuid REFERENCES public.people(id),
  due_date date,
  completed_at timestamptz,
  completed_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_tasks TO authenticated;
GRANT ALL ON public.planning_tasks TO service_role;
ALTER TABLE public.planning_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planning_tasks_all" ON public.planning_tasks FOR ALL TO authenticated
USING (public.has_planning_project_access(planning_project_id))
WITH CHECK (public.has_planning_project_access(planning_project_id));
CREATE INDEX idx_planning_tasks_project ON public.planning_tasks(planning_project_id);

CREATE TABLE public.planning_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_project_id uuid NOT NULL REFERENCES public.planning_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  company_name text,
  department_name text,
  role text,
  phone text,
  email text,
  contact_type text NOT NULL DEFAULT 'internal',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_contacts TO authenticated;
GRANT ALL ON public.planning_contacts TO service_role;
ALTER TABLE public.planning_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planning_contacts_all" ON public.planning_contacts FOR ALL TO authenticated
USING (public.has_planning_project_access(planning_project_id))
WITH CHECK (public.has_planning_project_access(planning_project_id));
CREATE INDEX idx_planning_contacts_project ON public.planning_contacts(planning_project_id);

CREATE TABLE public.planning_external_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_project_id uuid NOT NULL REFERENCES public.planning_projects(id) ON DELETE CASCADE,
  system text NOT NULL,
  reference text,
  url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_external_refs TO authenticated;
GRANT ALL ON public.planning_external_refs TO service_role;
ALTER TABLE public.planning_external_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planning_refs_all" ON public.planning_external_refs FOR ALL TO authenticated
USING (public.has_planning_project_access(planning_project_id))
WITH CHECK (public.has_planning_project_access(planning_project_id));
CREATE INDEX idx_planning_refs_project ON public.planning_external_refs(planning_project_id);

CREATE TABLE public.planning_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_project_id uuid NOT NULL REFERENCES public.planning_projects(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'Generelt',
  display_name text NOT NULL,
  original_file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size bigint,
  revision integer NOT NULL DEFAULT 1,
  supersedes_file_id uuid REFERENCES public.planning_files(id) ON DELETE SET NULL,
  uploaded_by uuid,
  uploaded_by_name text,
  company_id uuid REFERENCES public.internal_companies(id),
  department_id uuid REFERENCES public.departments(id),
  visibility text NOT NULL DEFAULT 'project',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_files TO authenticated;
GRANT ALL ON public.planning_files TO service_role;
ALTER TABLE public.planning_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planning_files_all" ON public.planning_files FOR ALL TO authenticated
USING (public.has_planning_project_access(planning_project_id))
WITH CHECK (public.has_planning_project_access(planning_project_id));
CREATE INDEX idx_planning_files_project ON public.planning_files(planning_project_id);

CREATE TABLE public.planning_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_project_id uuid NOT NULL REFERENCES public.planning_projects(id) ON DELETE CASCADE,
  author_id uuid,
  author_name text,
  author_company text,
  author_department text,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  mentioned_user_ids uuid[] NOT NULL DEFAULT '{}',
  mentioned_department_ids uuid[] NOT NULL DEFAULT '{}',
  reply_to_id uuid REFERENCES public.planning_messages(id) ON DELETE SET NULL,
  is_important boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'project',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_messages TO authenticated;
GRANT ALL ON public.planning_messages TO service_role;
ALTER TABLE public.planning_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planning_messages_all" ON public.planning_messages FOR ALL TO authenticated
USING (public.has_planning_project_access(planning_project_id))
WITH CHECK (public.has_planning_project_access(planning_project_id));
CREATE INDEX idx_planning_messages_project ON public.planning_messages(planning_project_id, created_at);

CREATE TABLE public.planning_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_project_id uuid NOT NULL REFERENCES public.planning_projects(id) ON DELETE CASCADE,
  action text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid,
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.planning_activity TO authenticated;
GRANT ALL ON public.planning_activity TO service_role;
ALTER TABLE public.planning_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planning_activity_select" ON public.planning_activity FOR SELECT TO authenticated
USING (public.has_planning_project_access(planning_project_id));
CREATE POLICY "planning_activity_insert" ON public.planning_activity FOR INSERT TO authenticated
WITH CHECK (public.has_planning_project_access(planning_project_id));
CREATE INDEX idx_planning_activity_project ON public.planning_activity(planning_project_id, created_at DESC);
