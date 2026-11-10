import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Loader2, AlertTriangle, ChevronRight, Users, RefreshCw, Info } from "lucide-react";
import { FORM_STATUS_CONFIG, type FormInstanceStatus } from "@/lib/form-types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { JobDocRequirementsPanel } from "@/components/forms/JobDocRequirementsPanel";

const FORM_TYPE_LABELS: Record<string, string> = {
  checklist: "Sjekkliste",
  control: "Kontroll",
  signature: "Signering",
  hms: "HMS",
  handover: "Overlevering",
};

const ROLE_LABELS: Record<string, string> = {
  technician: "Montør",
  project_manager: "Prosjektleder",
  admin: "Admin",
  customer: "Kunde",
};

interface FormTemplate {
  id: string;
  title: string;
  form_type: string;
  allowed_roles: string[];
  required_before_completion: boolean;
  required_before_billing: boolean;
  active_version_id: string | null;
}

interface FormInstance {
  id: string;
  template_id: string;
  status: string;
  assigned_to: string | null;
}

interface Props {
  projectId: string;
}

export function ProjectFormsSection({ projectId }: Props) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [instances, setInstances] = useState<FormInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const [tplRes, instRes] = await Promise.all([
        (supabase as any)
          .from("form_templates")
          .select("id, title, form_type, allowed_roles, required_before_completion, required_before_billing, active_version_id")
          .eq("available_in_projects", true)
          .eq("is_active", true)
          .is("deleted_at", null),
        supabase
          .from("form_instances")
          .select("id, template_id, status, assigned_to")
          .eq("project_id", projectId),
      ]);
      if (tplRes.error) throw tplRes.error;
      if (tplRes.data) setTemplates(tplRes.data);
      if (instRes.data) setInstances(instRes.data as any);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStart = async (tpl: FormTemplate) => {
    if (!tpl.active_version_id) {
      toast.error("Malen har ingen aktiv versjon", {
        description: "Be administrator om å publisere en versjon av dette skjemaet.",
      });
      return;
    }
    setCreating(tpl.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Ikke innlogget");

      const { data, error } = await supabase
        .from("form_instances")
        .insert({
          template_id: tpl.id,
          version_id: tpl.active_version_id,
          project_id: projectId,
          created_by: userData.user.id,
          status: "not_started",
        })
        .select("id")
        .single();

      if (error) throw error;
      if (data) {
        toast.success("Skjema opprettet");
        navigate(`/forms/${(data as any).id}`);
      }
    } catch (err: any) {
      toast.error("Kunne ikke opprette skjema", {
        description: err?.message || "Sjekk nettverksforbindelsen og prøv igjen",
      });
    } finally {
      setCreating(null);
    }
  };

  if (loading) return null;

  if (error) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Skjema & sjekklister</h2>
        </div>
        <Card>
          <CardContent className="p-4 text-center space-y-2">
            <p className="text-xs text-muted-foreground">Kunne ikke laste skjema</p>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => { setLoading(true); fetchData(); }}>
              <RefreshCw className="h-3 w-3" /> Prøv igjen
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (templates.length === 0 && instances.length === 0) return <JobDocRequirementsPanel projectId={projectId} />;

  // Map instances by template
  const instanceMap = new Map<string, FormInstance[]>();
  for (const inst of instances) {
    const arr = instanceMap.get(inst.template_id) || [];
    arr.push(inst);
    instanceMap.set(inst.template_id, arr);
  }

  const requiredTemplates = templates.filter(t => t.required_before_completion || t.required_before_billing);
  const completedRequired = requiredTemplates.filter(t => {
    const insts = instanceMap.get(t.id) || [];
    return insts.some(i => i.status === "completed" || i.status === "signed");
  });

  return (
    <section className="space-y-3">
      <JobDocRequirementsPanel projectId={projectId} />
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Skjema & sjekklister</h2>
        </div>
        {requiredTemplates.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {completedRequired.length}/{requiredTemplates.length} obligatoriske
          </span>
        )}
      </div>

      {/* Admin help text */}
      {templates.length > 0 && requiredTemplates.length > 0 && completedRequired.length < requiredTemplates.length && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/5 p-3 mx-1">
          <Info className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {requiredTemplates.length - completedRequired.length} obligatorisk{requiredTemplates.length - completedRequired.length > 1 ? "e" : ""} skjema gjenstår. Disse må fullføres før oppdrag kan ferdigmeldes eller faktureres.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {templates.map((tpl) => {
          const tplInstances = instanceMap.get(tpl.id) || [];
          const latestInstance = tplInstances[0];
          const status: FormInstanceStatus = (latestInstance?.status as FormInstanceStatus) || "not_started";
          const statusCfg = FORM_STATUS_CONFIG[status] || FORM_STATUS_CONFIG.not_started;
          const isRequired = tpl.required_before_completion || tpl.required_before_billing;
          const isCompleted = status === "completed" || status === "signed";

          return (
            <Card
              key={tpl.id}
              className={cn(
                "transition-all",
                isRequired && !isCompleted && "border-warning/40 bg-warning/5",
                isCompleted && "border-success/20 bg-success/5"
              )}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{tpl.title}</span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-0 bg-muted text-muted-foreground">
                      {FORM_TYPE_LABELS[tpl.form_type] || tpl.form_type}
                    </Badge>
                    {isRequired && !isCompleted && (
                      <Badge variant="warning" className="text-[9px] px-1.5 py-0 gap-0.5 border-0 bg-warning/10 text-warning">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Obligatorisk
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", statusCfg.color)}>
                      {statusCfg.label}
                    </span>
                    {tpl.allowed_roles.length > 0 && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Users className="h-2.5 w-2.5" />
                        {tpl.allowed_roles.map(r => ROLE_LABELS[r] || r).join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                {latestInstance ? (
                  <Button
                    size="sm"
                    variant={isCompleted ? "outline" : "default"}
                    className="rounded-xl gap-1 text-xs shrink-0"
                    onClick={() => navigate(`/forms/${latestInstance.id}`)}
                  >
                    {isCompleted ? "Se" : "Åpne"}
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="rounded-xl gap-1 text-xs shrink-0"
                    onClick={() => handleStart(tpl)}
                    disabled={creating === tpl.id}
                  >
                    {creating === tpl.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Start"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Check if all required-before-completion forms are done for a project.
 * Returns { canComplete, missingForms } 
 */
export async function checkRequiredForms(projectId: string, rule: "required_before_completion" | "required_before_billing"): Promise<{
  status: "ok" | "missing" | "unknown";
  canComplete: boolean;
  missingForms: string[];
}> {
  // Server-side, company-scoped check. Legacy completed forms without server validation are re-checked, never trusted.
  const { data, error } = await supabase.rpc("check_required_forms", { _project_id: projectId, _rule: rule });
  if (error || !data) {
    console.error("[checkRequiredForms]", error);
    return { status: "unknown", canComplete: false, missingForms: ["Kunne ikke kontrollere skjemakrav – prøv igjen"] };
  }
  const res = data as { ok: boolean; missing: { title: string; reason: string }[] };
  const label = (m: { title: string; reason: string }) =>
    m.reason === "signature_missing" ? `${m.title} (mangler signatur)`
    : m.reason === "legacy_unvalidated" ? `${m.title} (må kontrolleres)` : m.title;
  return { status: res.ok ? "ok" : "missing", canComplete: res.ok, missingForms: (res.missing || []).map(label) };
}
