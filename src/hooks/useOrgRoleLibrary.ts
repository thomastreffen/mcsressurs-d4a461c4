import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { ORG_ROLE_TYPES } from "@/lib/compliance";

const sb = supabase as any;

export interface ResponsibilityType {
  key: string;
  name: string;
  is_active: boolean;
  is_standard: boolean;
  sort_order: number;
  row_id?: string;
}

export interface RoleTemplate {
  id: string;
  title: string;
  role_type: string;
  responsibilities: string | null;
  tasks: string | null;
  authority: string | null;
  is_active: boolean;
}

export interface OrgRoleAuditEntry {
  id: string;
  entity_id: string | null;
  action: string;
  performed_by: string | null;
  performed_by_name: string | null;
  performed_at: string;
  payload: { title?: string; changes?: Record<string, any> };
}

/** Standardtyper flettes med virksomhetens egne rader (overstyrt navn/deaktivert + egne typer). */
export function mergeResponsibilityTypes(rows: any[]): ResponsibilityType[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const std = ORG_ROLE_TYPES.map((t, i) => {
    const r = byKey.get(t.value);
    return {
      key: t.value,
      name: r?.name ?? t.label,
      is_active: r ? r.is_active : true,
      is_standard: true,
      sort_order: r?.sort_order ?? i * 10,
      row_id: r?.id,
    };
  });
  const stdKeys = new Set(ORG_ROLE_TYPES.map((t) => t.value));
  const custom = rows
    .filter((r) => !stdKeys.has(r.key))
    .map((r) => ({ key: r.key, name: r.name, is_active: r.is_active, is_standard: false, sort_order: r.sort_order, row_id: r.id }));
  return [...std, ...custom].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "nb"));
}

export function useResponsibilityTypes() {
  const { activeCompanyId: cid } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["compliance-resp-types", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb.from("compliance_responsibility_types").select("*").eq("company_id", cid);
      if (error) throw error;
      return data ?? [];
    },
  });
  const types = useMemo(() => mergeResponsibilityTypes(q.data ?? []), [q.data]);

  const upsert = useMutation({
    mutationFn: async (t: { key?: string; name: string; is_active: boolean; sort_order?: number }) => {
      const key = t.key ?? `custom_${crypto.randomUUID().slice(0, 8)}`;
      const existing = types.find((x) => x.key === key);
      const { error } = await sb.from("compliance_responsibility_types").upsert(
        {
          company_id: cid,
          key,
          name: t.name.trim(),
          is_active: t.is_active,
          sort_order: t.sort_order ?? existing?.sort_order ?? 500,
          created_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-resp-types"] });
      toast.success("Ansvarstype lagret");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke lagre ansvarstype"),
  });

  const labelOf = (key: string | null | undefined) => types.find((t) => t.key === key)?.name ?? "Annet";
  return { types, isLoading: q.isLoading, upsert, labelOf };
}

export function useRoleTemplates() {
  const { activeCompanyId: cid } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery<RoleTemplate[]>({
    queryKey: ["compliance-role-templates", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb.from("compliance_role_templates").select("*").eq("company_id", cid).order("title");
      if (error) throw error;
      return data ?? [];
    },
  });
  const save = useMutation({
    mutationFn: async (t: Partial<RoleTemplate>) => {
      const payload = {
        title: t.title?.trim(),
        role_type: t.role_type ?? "other",
        responsibilities: t.responsibilities ?? null,
        tasks: t.tasks ?? null,
        authority: t.authority ?? null,
        is_active: t.is_active ?? true,
        updated_at: new Date().toISOString(),
      };
      const { error } = t.id
        ? await sb.from("compliance_role_templates").update(payload).eq("id", t.id)
        : await sb.from("compliance_role_templates").insert({ ...payload, company_id: cid, created_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-role-templates"] });
      toast.success("Mal lagret");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke lagre mal"),
  });
  return { templates: q.data ?? [], isLoading: q.isLoading, save };
}

export function useOrgRoleAudit() {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery<OrgRoleAuditEntry[]>({
    queryKey: ["compliance-org-role-audit", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("hms_audit_log")
        .select("id, entity_id, action, performed_by, performed_at, payload")
        .eq("company_id", cid)
        .eq("entity_type", "org_role")
        .order("performed_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((r: any) => r.performed_by).filter(Boolean))];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: ua } = await sb.from("user_accounts").select("auth_user_id, people(full_name)").in("auth_user_id", ids);
        (ua ?? []).forEach((u: any) => names.set(u.auth_user_id, u.people?.full_name));
      }
      return (data ?? []).map((r: any) => ({ ...r, performed_by_name: names.get(r.performed_by) ?? null }));
    },
  });
}
