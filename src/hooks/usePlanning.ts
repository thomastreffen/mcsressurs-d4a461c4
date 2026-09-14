import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeStorageFileName } from "@/lib/storage-path";

const sb = supabase as any;
const BUCKET = "job-attachments";

export interface PlanningProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  company_id: string | null;
  department_id: string | null;
  customer_id: string | null;
  customer_contact_id: string | null;
  owner_user_id: string | null;
  expected_start: string | null;
  expected_end: string | null;
  period_label: string | null;
  contract_form: string;
  invoicing_company_id: string | null;
  invoice_recipient: string | null;
  contract_value: number | null;
  budget_value: number | null;
  hourly_rate: number | null;
  estimated_hours: number | null;
  estimated_material_cost: number | null;
  linked_event_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanningWorkPackage {
  id: string;
  planning_project_id: string;
  name: string;
  description: string | null;
  status: string;
  responsible_company_id: string | null;
  responsible_department_id: string | null;
  responsible_person_id: string | null;
  external_vendor_name: string | null;
  planned_start: string | null;
  planned_end: string | null;
  resource_count: number | null;
  estimated_hours: number | null;
  price_form: string;
  agreed_price: number | null;
  hourly_rate: number | null;
  billing_from_company_id: string | null;
  billing_to_company_id: string | null;
  assignment_state: string;
  linked_event_id: string | null;
  comment: string | null;
  sort_order: number;
}

export interface PlanningTask {
  id: string;
  planning_project_id: string;
  work_package_id: string | null;
  title: string;
  description: string | null;
  status: string;
  department_id: string | null;
  assignee_person_id: string | null;
  due_date: string | null;
  completed_at: string | null;
}

export interface PlanningContact {
  id: string;
  name: string;
  company_name: string | null;
  department_name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  contact_type: string;
  notes: string | null;
}

export interface PlanningExternalRef {
  id: string;
  system: string;
  reference: string | null;
  url: string | null;
  notes: string | null;
}

export interface PlanningFile {
  id: string;
  category: string;
  display_name: string;
  original_file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface PlanningMessage {
  id: string;
  author_id: string | null;
  author_name: string | null;
  author_company: string | null;
  author_department: string | null;
  body: string;
  attachments: { path: string; name: string }[];
  reply_to_id: string | null;
  is_important: boolean;
  created_at: string;
}

export interface PlanningActivityRow {
  id: string;
  action: string;
  summary: string;
  performed_by_name: string | null;
  created_at: string;
}

/* ── Oppslag: selskaper, avdelinger, personer, kunder ── */

export function usePlanningLookups() {
  return useQuery({
    queryKey: ["planning-lookups"],
    queryFn: async () => {
      const [companies, departments, customers, users, people] = await Promise.all([
        sb.from("internal_companies").select("id, name").eq("is_active", true).order("name"),
        sb.from("departments").select("id, name, company_id").eq("is_active", true).order("name"),
        sb.from("customers").select("id, name").is("deleted_at", null).order("name").limit(1000),
        sb.from("technicians").select("user_id, name").not("user_id", "is", null).order("name"),
        sb
          .from("employment_profiles")
          .select("person_id, company_id, department_id, people(full_name)")
          .is("archived_at", null),
      ]);
      return {
        companies: (companies.data ?? []) as { id: string; name: string }[],
        departments: (departments.data ?? []) as { id: string; name: string; company_id: string }[],
        customers: (customers.data ?? []) as { id: string; name: string }[],
        users: (users.data ?? []) as { user_id: string; name: string | null }[],
        people: ((people.data ?? []) as any[])
          .filter((p) => p.person_id && p.people?.full_name)
          .map((p) => ({
            id: p.person_id as string,
            name: p.people.full_name as string,
            company_id: p.company_id as string | null,
            department_id: p.department_id as string | null,
          })),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* ── Board ── */

export function usePlanningProjects() {
  const { activeCompanyId, isAllCompanies } = useCompanyContext();
  return useQuery<PlanningProject[]>({
    queryKey: ["planning-projects", isAllCompanies ? "all" : activeCompanyId],
    queryFn: async () => {
      let q = sb
        .from("planning_projects")
        .select("*")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (!isAllCompanies && activeCompanyId) q = q.eq("company_id", activeCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PlanningProject[];
    },
  });
}

export function usePlanningProject(id: string | undefined) {
  return useQuery<PlanningProject | null>({
    queryKey: ["planning-project", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("planning_projects").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as PlanningProject | null;
    },
  });
}

/* ── Aktivitetslogg ── */

export function usePlanningActivity(projectId: string | undefined) {
  return useQuery<PlanningActivityRow[]>({
    queryKey: ["planning-activity", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("planning_activity")
        .select("id, action, summary, performed_by_name, created_at")
        .eq("planning_project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as PlanningActivityRow[];
    },
  });
}

/** Navn på innlogget bruker, brukt i logg og meldinger. */
export function useMyDisplayName() {
  const { user } = useAuth();
  return useQuery<string>({
    queryKey: ["planning-my-name", user?.id],
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await sb.from("technicians").select("name").eq("user_id", user!.id).maybeSingle();
      return data?.name || user!.email || "Ukjent bruker";
    },
  });
}

export function usePlanningMutations(projectId?: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: myName } = useMyDisplayName();

  const invalidate = (pid?: string) => {
    const id = pid ?? projectId;
    qc.invalidateQueries({ queryKey: ["planning-projects"] });
    if (id) {
      qc.invalidateQueries({ queryKey: ["planning-project", id] });
      qc.invalidateQueries({ queryKey: ["planning-children", id] });
      qc.invalidateQueries({ queryKey: ["planning-activity", id] });
    }
  };

  const log = async (pid: string, action: string, summary: string, metadata: any = {}) => {
    await sb.from("planning_activity").insert({
      planning_project_id: pid,
      action,
      summary,
      metadata,
      performed_by: user?.id ?? null,
      performed_by_name: myName ?? null,
    });
  };

  const createProject = useMutation({
    mutationFn: async (input: Partial<PlanningProject>) => {
      const { data, error } = await sb
        .from("planning_projects")
        .insert({ ...input, created_by: user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      await log(data.id, "project_created", `Prosjekt opprettet: ${input.name}`);
      return data.id as string;
    },
    onSuccess: (id) => invalidate(id),
  });

  const updateProject = useMutation({
    mutationFn: async ({
      id,
      patch,
      logSummary,
    }: {
      id: string;
      patch: Partial<PlanningProject>;
      logSummary?: string;
    }) => {
      const { error } = await sb
        .from("planning_projects")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      if (logSummary) await log(id, "project_updated", logSummary, patch);
    },
    onSuccess: (_d, v) => invalidate(v.id),
  });

  const saveWorkPackage = useMutation({
    mutationFn: async ({ id, patch }: { id?: string; patch: Partial<PlanningWorkPackage> }) => {
      if (id) {
        const { error } = await sb
          .from("planning_work_packages")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
        await log(projectId!, "work_package_updated", `Arbeidspakke oppdatert: ${patch.name ?? ""}`.trim());
      } else {
        const { error } = await sb
          .from("planning_work_packages")
          .insert({ ...patch, planning_project_id: projectId, created_by: user?.id ?? null });
        if (error) throw error;
        await log(projectId!, "work_package_created", `Arbeidspakke opprettet: ${patch.name}`);
      }
    },
    onSuccess: () => invalidate(),
  });

  const deleteWorkPackage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("planning_work_packages").delete().eq("id", id);
      if (error) throw error;
      await log(projectId!, "work_package_deleted", "Arbeidspakke slettet");
    },
    onSuccess: () => invalidate(),
  });

  const saveTask = useMutation({
    mutationFn: async ({ id, patch }: { id?: string; patch: Partial<PlanningTask> }) => {
      if (id) {
        const { error } = await sb
          .from("planning_tasks")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
        if (patch.status === "done") await log(projectId!, "task_completed", `Oppgave ferdigstilt: ${patch.title ?? ""}`.trim());
      } else {
        const { error } = await sb
          .from("planning_tasks")
          .insert({ ...patch, planning_project_id: projectId, created_by: user?.id ?? null });
        if (error) throw error;
        await log(projectId!, "task_created", `Oppgave opprettet: ${patch.title}`);
      }
    },
    onSuccess: () => invalidate(),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("planning_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const saveContact = useMutation({
    mutationFn: async ({ id, patch }: { id?: string; patch: Partial<PlanningContact> }) => {
      if (id) {
        const { error } = await sb.from("planning_contacts").update(patch).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("planning_contacts")
          .insert({ ...patch, planning_project_id: projectId, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("planning_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const saveExternalRef = useMutation({
    mutationFn: async (patch: Partial<PlanningExternalRef>) => {
      const { error } = await sb
        .from("planning_external_refs")
        .insert({ ...patch, planning_project_id: projectId, created_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const deleteExternalRef = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("planning_external_refs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const uploadFile = useMutation({
    mutationFn: async ({
      file,
      category,
      displayName,
    }: {
      file: File;
      category: string;
      displayName: string;
    }) => {
      const path = `planning/${projectId}/${crypto.randomUUID()}-${sanitizeStorageFileName(file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw upErr;
      const { error } = await sb.from("planning_files").insert({
        planning_project_id: projectId,
        category,
        display_name: displayName || file.name,
        original_file_name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        file_size: file.size,
        uploaded_by: user?.id ?? null,
        uploaded_by_name: myName ?? null,
      });
      if (error) throw error;
      await log(projectId!, "file_uploaded", `Fil lastet opp: ${displayName || file.name}`, { category });
    },
    onSuccess: () => invalidate(),
  });

  const deleteFile = useMutation({
    mutationFn: async (f: PlanningFile) => {
      await supabase.storage.from(BUCKET).remove([f.storage_path]);
      const { error } = await sb.from("planning_files").delete().eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const sendMessage = useMutation({
    mutationFn: async ({
      body,
      replyToId,
      isImportant,
      attachments,
      mentionedUserIds,
    }: {
      body: string;
      replyToId?: string | null;
      isImportant?: boolean;
      attachments?: { path: string; name: string }[];
      mentionedUserIds?: string[];
    }) => {
      const { error } = await sb.from("planning_messages").insert({
        planning_project_id: projectId,
        author_id: user?.id ?? null,
        author_name: myName ?? null,
        body,
        reply_to_id: replyToId ?? null,
        is_important: !!isImportant,
        attachments: attachments ?? [],
        mentioned_user_ids: mentionedUserIds ?? [],
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  return {
    createProject,
    updateProject,
    saveWorkPackage,
    deleteWorkPackage,
    saveTask,
    deleteTask,
    saveContact,
    deleteContact,
    saveExternalRef,
    deleteExternalRef,
    uploadFile,
    deleteFile,
    sendMessage,
    logActivity: log,
  };
}

/** Alt innhold i prosjektrommet i én spørring-runde. */
export function usePlanningChildren(projectId: string | undefined) {
  return useQuery({
    queryKey: ["planning-children", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const [wp, tasks, contacts, refs, files, messages] = await Promise.all([
        sb
          .from("planning_work_packages")
          .select("*")
          .eq("planning_project_id", projectId)
          .order("sort_order")
          .order("created_at"),
        sb
          .from("planning_tasks")
          .select("*")
          .eq("planning_project_id", projectId)
          .order("due_date", { nullsFirst: false }),
        sb.from("planning_contacts").select("*").eq("planning_project_id", projectId).order("created_at"),
        sb.from("planning_external_refs").select("*").eq("planning_project_id", projectId).order("created_at"),
        sb.from("planning_files").select("*").eq("planning_project_id", projectId).order("created_at", { ascending: false }),
        sb
          .from("planning_messages")
          .select("*")
          .eq("planning_project_id", projectId)
          .is("deleted_at", null)
          .order("created_at"),
      ]);
      return {
        workPackages: (wp.data ?? []) as PlanningWorkPackage[],
        tasks: (tasks.data ?? []) as PlanningTask[],
        contacts: (contacts.data ?? []) as PlanningContact[],
        externalRefs: (refs.data ?? []) as PlanningExternalRef[],
        files: (files.data ?? []) as PlanningFile[],
        messages: (messages.data ?? []) as PlanningMessage[],
      };
    },
  });
}

export function planningFileUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
