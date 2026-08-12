import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type {
  DocumentationStatus, EvidenceSourceKind, FindingStatus, FindingType, InspectionStatus, InspectionType,
} from "@/lib/inspections";

const sb = supabase as any;

export interface Inspection {
  id: string;
  company_id: string;
  title: string;
  inspection_type: InspectionType;
  authority_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  case_number: string | null;
  inspection_date: string | null;
  response_deadline: string | null;
  responsible_person_id: string | null;
  description: string | null;
  status: InspectionStatus;
  submitted_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Finding {
  id: string;
  inspection_id: string;
  finding_number: number;
  finding_type: FindingType;
  title: string;
  original_text: string | null;
  legal_basis_text: string | null;
  authority_comment: string | null;
  deadline: string | null;
  responsible_person_id: string | null;
  status: FindingStatus;
  internal_assessment: string | null;
  response_text: string | null;
  internal_notes: string | null;
  documentation_status: DocumentationStatus;
  created_at: string;
}

export interface FindingRegulationLink {
  id: string;
  finding_id: string;
  regulation_id: string | null;
  clause: string | null;
  note: string | null;
}

export interface FindingEvidence {
  id: string;
  inspection_id: string;
  finding_id: string | null;
  source_kind: EvidenceSourceKind;
  competence_type_id: string | null;
  ref_id: string | null;
  document_id: string | null;
  label: string | null;
  note: string | null;
  created_at: string;
}

export interface InspectionEvent {
  id: string;
  inspection_id: string;
  finding_id: string | null;
  event_type: string;
  summary: string | null;
  payload: Record<string, any>;
  actor_user_id: string | null;
  created_at: string;
}

export interface Correspondence {
  id: string;
  inspection_id: string;
  occurred_at: string;
  direction: string;
  contact_name: string | null;
  subject: string | null;
  notes: string | null;
  document_id: string | null;
}

function useCid() {
  const { activeCompanyId } = useCompanyContext();
  return activeCompanyId;
}

/* ---------------- Historikk / audit trail ---------------- */

export function useInspectionEvents(inspectionId?: string) {
  const cid = useCid();
  return useQuery<InspectionEvent[]>({
    queryKey: ["inspection-events", cid, inspectionId],
    enabled: !!cid && !!inspectionId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_inspection_events")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLogInspectionEvent() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  return async (input: {
    inspection_id: string;
    finding_id?: string | null;
    event_type: string;
    summary?: string;
    payload?: Record<string, any>;
  }) => {
    await sb.from("compliance_inspection_events").insert({
      company_id: cid,
      inspection_id: input.inspection_id,
      finding_id: input.finding_id ?? null,
      event_type: input.event_type,
      summary: input.summary ?? null,
      payload: input.payload ?? {},
      actor_user_id: user?.id ?? null,
    });
    qc.invalidateQueries({ queryKey: ["inspection-events"] });
  };
}

/* ---------------- Tilsynssaker ---------------- */

export function useInspections() {
  const cid = useCid();
  return useQuery<Inspection[]>({
    queryKey: ["inspections", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_inspections")
        .select("*")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("inspection_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Nøkkeltall per sak: antall funn, åpne tiltak og samlet dokumentasjonsstatus */
export function useInspectionSummaries() {
  const cid = useCid();
  return useQuery<Record<string, { findings: number; openActions: number; docStatuses: DocumentationStatus[]; closedFindings: number }>>({
    queryKey: ["inspection-summaries", cid],
    enabled: !!cid,
    queryFn: async () => {
      const [{ data: findings, error: fErr }, { data: actions, error: aErr }] = await Promise.all([
        sb.from("compliance_findings").select("inspection_id, status, documentation_status").eq("company_id", cid).is("deleted_at", null),
        sb.from("hms_action_items").select("compliance_inspection_id, status").eq("company_id", cid).is("deleted_at", null).not("compliance_inspection_id", "is", null),
      ]);
      if (fErr) throw fErr;
      if (aErr) throw aErr;
      const map: Record<string, { findings: number; openActions: number; docStatuses: DocumentationStatus[]; closedFindings: number }> = {};
      const ensure = (id: string) => (map[id] ??= { findings: 0, openActions: 0, docStatuses: [], closedFindings: 0 });
      for (const f of findings ?? []) {
        const e = ensure(f.inspection_id);
        e.findings += 1;
        e.docStatuses.push(f.documentation_status);
        if (f.status === "approved") e.closedFindings += 1;
      }
      for (const a of actions ?? []) {
        const e = ensure(a.compliance_inspection_id);
        if (["open", "in_progress"].includes(a.status)) e.openActions += 1;
      }
      return map;
    },
  });
}

export function useInspection(id?: string) {
  const cid = useCid();
  return useQuery<Inspection | null>({
    queryKey: ["inspection", cid, id],
    enabled: !!cid && !!id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_inspections")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useInspectionMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const log = useLogInspectionEvent();
  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["inspections"] });
    qc.invalidateQueries({ queryKey: ["inspection"] });
    qc.invalidateQueries({ queryKey: ["inspection-summaries"] });
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<Inspection>) => {
      if (payload.id) {
        const { id, ...rest } = payload as any;
        const { data, error } = await sb.from("compliance_inspections").update(rest).eq("id", id).select().single();
        if (error) throw error;
        await log({ inspection_id: id, event_type: "inspection_updated", summary: "Saken ble oppdatert" });
        return data as Inspection;
      }
      const { data, error } = await sb
        .from("compliance_inspections")
        .insert({ ...payload, company_id: cid, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      await log({ inspection_id: data.id, event_type: "inspection_created", summary: `Sak opprettet: ${data.title}` });
      return data as Inspection;
    },
    onSuccess: () => done("Tilsynssak lagret"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke lagre tilsynssaken"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InspectionStatus }) => {
      const patch: any = { status };
      if (status === "submitted") patch.submitted_at = new Date().toISOString();
      if (status === "closed") patch.closed_at = new Date().toISOString();
      const { error } = await sb.from("compliance_inspections").update(patch).eq("id", id);
      if (error) throw error;
      await log({
        inspection_id: id,
        event_type: status === "submitted" ? "inspection_submitted" : status === "closed" ? "inspection_closed" : "status_changed",
        summary: `Status endret til ${status}`,
        payload: { status },
      });
    },
    onSuccess: () => done("Status oppdatert"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke endre status"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("compliance_inspections")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => done("Tilsynssak fjernet"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke fjerne"),
  });

  return { save, setStatus, remove };
}

/* ---------------- Funn og avvik ---------------- */

export function useFindings(inspectionId?: string) {
  const cid = useCid();
  return useQuery<Finding[]>({
    queryKey: ["inspection-findings", cid, inspectionId],
    enabled: !!cid && !!inspectionId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_findings")
        .select("*")
        .eq("inspection_id", inspectionId)
        .is("deleted_at", null)
        .order("finding_number");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFindingMutations(inspectionId?: string) {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const log = useLogInspectionEvent();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inspection-findings"] });
    qc.invalidateQueries({ queryKey: ["inspection-summaries"] });
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<Finding> & { inspection_id?: string }) => {
      const insId = payload.inspection_id ?? inspectionId!;
      if (payload.id) {
        const { id, ...rest } = payload as any;
        const { error } = await sb.from("compliance_findings").update(rest).eq("id", id);
        if (error) throw error;
        const events: string[] = [];
        if (rest.status) events.push("finding_status_changed");
        if (rest.response_text !== undefined) events.push("response_text_changed");
        if (rest.documentation_status === "complete") events.push("documentation_marked_complete");
        for (const ev of events.length ? events : ["finding_updated"]) {
          await log({ inspection_id: insId, finding_id: id, event_type: ev, summary: labelForEvent(ev, rest) });
        }
        return id as string;
      }
      const { data, error } = await sb
        .from("compliance_findings")
        .insert({ ...payload, inspection_id: insId, company_id: cid, created_by: user?.id ?? null })
        .select("id, finding_number, title")
        .single();
      if (error) throw error;
      await log({
        inspection_id: insId,
        finding_id: data.id,
        event_type: "finding_created",
        summary: `Funn ${data.finding_number} registrert: ${data.title}`,
      });
      return data.id as string;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke lagre funnet"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("compliance_findings")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Funn fjernet");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke fjerne funnet"),
  });

  return { save, remove };
}

function labelForEvent(ev: string, patch: any): string {
  switch (ev) {
    case "finding_status_changed": return `Status på funn endret til ${patch.status}`;
    case "response_text_changed": return "Svartekst til tilsynsmyndigheten endret";
    case "documentation_marked_complete": return "Dokumentasjon markert komplett";
    default: return "Funn oppdatert";
  }
}

/* ---------------- Regelverksreferanser ---------------- */

export function useFindingRegulations(inspectionId?: string) {
  const cid = useCid();
  return useQuery<FindingRegulationLink[]>({
    queryKey: ["finding-regulations", cid, inspectionId],
    enabled: !!cid && !!inspectionId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_finding_regulations")
        .select("*, compliance_findings!inner(inspection_id)")
        .eq("compliance_findings.inspection_id", inspectionId);
      if (error) throw error;
      return (data ?? []).map(({ compliance_findings, ...r }: any) => r);
    },
  });
}

export function useFindingRegulationMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["finding-regulations"] });

  const add = useMutation({
    mutationFn: async (input: { finding_id: string; regulation_id?: string | null; clause?: string | null; note?: string | null }) => {
      const { error } = await sb
        .from("compliance_finding_regulations")
        .insert({ ...input, company_id: cid, created_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Regelverksreferanse lagt til");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke legge til referanse"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("compliance_finding_regulations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Referanse fjernet");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke fjerne referanse"),
  });

  return { add, remove };
}

/* ---------------- Dokumentasjon / bevis ---------------- */

export function useFindingEvidence(inspectionId?: string) {
  const cid = useCid();
  return useQuery<FindingEvidence[]>({
    queryKey: ["finding-evidence", cid, inspectionId],
    enabled: !!cid && !!inspectionId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_finding_evidence")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEvidenceMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const log = useLogInspectionEvent();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["finding-evidence"] });
    qc.invalidateQueries({ queryKey: ["inspection-summaries"] });
  };

  const add = useMutation({
    mutationFn: async (input: Partial<FindingEvidence> & { inspection_id: string; source_kind: EvidenceSourceKind }) => {
      const { error } = await sb
        .from("compliance_finding_evidence")
        .insert({ ...input, company_id: cid, created_by: user?.id ?? null });
      if (error) throw error;
      await log({
        inspection_id: input.inspection_id,
        finding_id: input.finding_id ?? null,
        event_type: "evidence_linked",
        summary: `Dokumentasjon koblet: ${input.label ?? input.source_kind}`,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Dokumentasjon koblet");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke koble dokumentasjon"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("compliance_finding_evidence").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Dokumentasjonsreferanse fjernet");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke fjerne"),
  });

  return { add, remove };
}

/* ---------------- Tiltak (gjenbruk av hms_action_items) ---------------- */

export interface InspectionAction {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_user_id: string | null;
  completed_at: string | null;
  compliance_finding_id: string | null;
  compliance_inspection_id: string | null;
}

export function useInspectionActions(inspectionId?: string) {
  const cid = useCid();
  return useQuery<InspectionAction[]>({
    queryKey: ["inspection-actions", cid, inspectionId],
    enabled: !!cid && !!inspectionId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("hms_action_items")
        .select("id, title, description, status, priority, due_date, assignee_user_id, completed_at, compliance_finding_id, compliance_inspection_id")
        .eq("company_id", cid)
        .eq("compliance_inspection_id", inspectionId)
        .is("deleted_at", null)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInspectionActionMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const log = useLogInspectionEvent();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inspection-actions"] });
    qc.invalidateQueries({ queryKey: ["inspection-summaries"] });
    qc.invalidateQueries({ queryKey: ["hms-action-items"] });
  };

  const create = useMutation({
    mutationFn: async (input: {
      inspection_id: string;
      finding_id?: string | null;
      title: string;
      description?: string | null;
      due_date?: string | null;
      assignee_user_id?: string | null;
      priority?: string;
    }) => {
      const { error } = await sb.from("hms_action_items").insert({
        company_id: cid,
        compliance_inspection_id: input.inspection_id,
        compliance_finding_id: input.finding_id ?? null,
        title: input.title,
        description: input.description ?? null,
        due_date: input.due_date || null,
        assignee_user_id: input.assignee_user_id || null,
        priority: input.priority ?? "medium",
        status: "open",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      await log({
        inspection_id: input.inspection_id,
        finding_id: input.finding_id ?? null,
        event_type: "action_created",
        summary: `Tiltak opprettet: ${input.title}`,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Tiltak opprettet i tiltakssystemet");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke opprette tiltak"),
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; inspection_id: string; status?: string; due_date?: string | null; assignee_user_id?: string | null }) => {
      const patch: any = {};
      if (input.status) {
        patch.status = input.status;
        patch.completed_at = input.status === "completed" ? new Date().toISOString() : null;
        patch.completed_by = input.status === "completed" ? user?.id ?? null : null;
      }
      if (input.due_date !== undefined) patch.due_date = input.due_date || null;
      if (input.assignee_user_id !== undefined) patch.assignee_user_id = input.assignee_user_id || null;
      const { error } = await sb.from("hms_action_items").update(patch).eq("id", input.id);
      if (error) throw error;
      await log({ inspection_id: input.inspection_id, event_type: "action_updated", summary: "Tiltak oppdatert", payload: patch });
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke oppdatere tiltaket"),
  });

  return { create, update };
}

/* ---------------- Korrespondanse ---------------- */

export function useCorrespondence(inspectionId?: string) {
  const cid = useCid();
  return useQuery<Correspondence[]>({
    queryKey: ["inspection-correspondence", cid, inspectionId],
    enabled: !!cid && !!inspectionId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_correspondence")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCorrespondenceMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["inspection-correspondence"] });

  const save = useMutation({
    mutationFn: async (payload: Partial<Correspondence> & { inspection_id: string }) => {
      if (payload.id) {
        const { id, ...rest } = payload as any;
        const { error } = await sb.from("compliance_correspondence").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("compliance_correspondence")
          .insert({ ...payload, company_id: cid, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Korrespondanse lagret");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke lagre"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("compliance_correspondence").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Oppføring fjernet");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke fjerne"),
  });

  return { save, remove };
}
