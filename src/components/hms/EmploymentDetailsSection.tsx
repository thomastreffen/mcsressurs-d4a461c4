import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, Building2, Info } from "lucide-react";
import { toast } from "sonner";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useJobRoles } from "@/hooks/useComplianceRequirements";

const sb = supabase as any;

/**
 * Ansettelsesinformasjon – master for selskap, avdeling og stilling.
 * Stilling hentes fra den sentrale stillingskatalogen (compliance_job_roles) og er
 * bevisst atskilt fra systemrollen som styrer tilgang (Admin → Personer).
 * Ingen modaler: alt redigeres direkte her.
 */
export function EmploymentDetailsSection({
  personId,
  companyName,
  canManage,
}: {
  personId: string;
  companyName?: string | null;
  canManage: boolean;
}) {
  const { activeCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const jobRoles = useJobRoles();

  const profile = useQuery({
    queryKey: ["employment-details", activeCompanyId, personId],
    enabled: !!activeCompanyId && !!personId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("employment_profiles")
        .select("id, company_id, department_id, job_role_id")
        .eq("company_id", activeCompanyId)
        .eq("person_id", personId)
        .is("archived_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; company_id: string; department_id: string | null; job_role_id: string | null } | null;
    },
  });

  const departments = useQuery({
    queryKey: ["departments", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("departments")
        .select("id, name")
        .eq("company_id", activeCompanyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const update = useMutation({
    mutationFn: async (patch: { department_id?: string | null; job_role_id?: string | null }) => {
      if (!profile.data) throw new Error("Fant ikke ansettelsesforholdet");
      const { error } = await sb.from("employment_profiles").update(patch).eq("id", profile.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employment-details"] });
      qc.invalidateQueries({ queryKey: ["person-job-role"] });
      qc.invalidateQueries({ queryKey: ["compliance-requirement-status"] });
      qc.invalidateQueries({ queryKey: ["compliance-employees"] });
      toast.success("Ansettelsesinformasjon oppdatert");
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunne ikke lagre"),
  });

  if (profile.isLoading) return <Skeleton className="h-28" />;

  const roleName = (jobRoles.data ?? []).find((r) => r.id === profile.data?.job_role_id)?.name ?? null;
  const deptName = (departments.data ?? []).find((d) => d.id === profile.data?.department_id)?.name ?? null;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Briefcase className="h-4 w-4 text-muted-foreground" /> Ansettelsesforhold
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Selskap</Label>
          <p className="flex items-center gap-1.5 text-sm">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            {companyName || "–"}
          </p>
          <p className="text-[11px] text-muted-foreground">Selskapstilknytning endres under Admin → Personer.</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Avdeling</Label>
          {canManage ? (
            <Select
              value={profile.data?.department_id ?? "none"}
              onValueChange={(v) => update.mutate({ department_id: v === "none" ? null : v })}
              disabled={!profile.data || update.isPending}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Ingen avdeling" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen avdeling</SelectItem>
                {(departments.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm">{deptName || "–"}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Stilling</Label>
          {canManage ? (
            <Select
              value={profile.data?.job_role_id ?? "none"}
              onValueChange={(v) => update.mutate({ job_role_id: v === "none" ? null : v })}
              disabled={!profile.data || update.isPending}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Ikke registrert" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ikke registrert</SelectItem>
                {(jobRoles.data ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm">{roleName || "Ikke registrert"}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Faglig stilling. Styrer stillingsspesifikke kompetansekrav – ikke systemtilgang.
          </p>
        </div>
      </div>

      {canManage && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Stillinger administreres sentralt under Elsikkerhet → Kompetansekrav. Rolle i selskap (Admin → Personer)
          styrer kun systemtilgang.
        </p>
      )}
    </div>
  );
}
