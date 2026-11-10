import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, AlertTriangle, ChevronRight, Loader2, RefreshCw, Info } from "lucide-react";
import { FORM_STATUS_CONFIG, type FormInstanceStatus } from "@/lib/form-types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MyDayDocProgress } from "@/components/forms/MyDayDocProgress";

const FORM_TYPE_LABELS: Record<string, string> = {
  checklist: "Sjekkliste",
  control: "Kontroll",
  signature: "Signering",
  hms: "HMS",
  handover: "Overlevering",
};

interface FormTemplate {
  id: string;
  title: string;
  form_type: string;
  required_before_completion: boolean;
  active_version_id: string | null;
}

interface FormInstance {
  id: string;
  template_id: string;
  status: string;
}

interface Props {
  projectId: string;
}

export function MyDayChecklists({ projectId }: Props) {
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
          .select("id, title, form_type, required_before_completion, active_version_id")
          .eq("available_in_my_day", true)
          .eq("is_active", true)
          .is("deleted_at", null)
          .contains("allowed_roles", ["technician"]),
        supabase
          .from("form_instances")
          .select("id, template_id, status")
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
      toast.error("Skjema har ingen aktiv versjon", {
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
        navigate(`/forms/${(data as any).id}`);
      }
    } catch (err: any) {
      toast.error("Kunne ikke opprette skjema", {
        description: err?.message || "Sjekk nettverksforbindelsen og prøv igjen",
        action: { label: "Prøv igjen", onClick: () => handleStart(tpl) },
      });
    } finally {
      setCreating(null);
    }
  };

  if (loading) return <MyDayDocProgress projectId={projectId} />;

  if (error) {
    return (
      <Card>
        <CardContent className="p-4 text-center space-y-2">
          <p className="text-xs text-muted-foreground">Kunne ikke laste sjekklister</p>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => { setLoading(true); fetchData(); }}>
            <RefreshCw className="h-3 w-3" /> Prøv igjen
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (templates.length === 0) return <MyDayDocProgress projectId={projectId} />;

  const instanceMap = new Map<string, FormInstance>();
  for (const inst of instances) {
    if (!instanceMap.has(inst.template_id)) {
      instanceMap.set(inst.template_id, inst);
    }
  }

  const requiredCount = templates.filter(t => t.required_before_completion).length;
  const completedRequired = templates.filter(t => {
    if (!t.required_before_completion) return false;
    const inst = instanceMap.get(t.id);
    return inst && (inst.status === "completed" || inst.status === "signed");
  }).length;

  return (
    <>
    <MyDayDocProgress projectId={projectId} />
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sjekklister</h3>
          </div>
          {requiredCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {completedRequired}/{requiredCount} obligatoriske fullført
            </span>
          )}
        </div>

        {/* Help text */}
        {requiredCount > 0 && completedRequired < requiredCount && (
          <div className="flex items-start gap-2 rounded-lg bg-warning/5 border border-warning/20 p-2.5">
            <Info className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Obligatoriske sjekklister må fullføres før du kan markere oppdraget som ferdig.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {templates.map((tpl) => {
            const inst = instanceMap.get(tpl.id);
            const status: FormInstanceStatus = (inst?.status as FormInstanceStatus) || "not_started";
            const statusCfg = FORM_STATUS_CONFIG[status] || FORM_STATUS_CONFIG.not_started;
            const isRequired = tpl.required_before_completion;
            const isDone = status === "completed" || status === "signed";

            return (
              <button
                key={tpl.id}
                onClick={() => {
                  if (inst) navigate(`/forms/${inst.id}`);
                  else handleStart(tpl);
                }}
                disabled={creating === tpl.id}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl p-3 text-left transition-colors",
                  "active:scale-[0.99]",
                  isRequired && !isDone
                    ? "bg-warning/5 border border-warning/30"
                    : isDone
                    ? "bg-success/5 border border-success/20"
                    : "bg-muted/40 border border-transparent hover:border-border/60"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{tpl.title}</span>
                    {isRequired && !isDone && (
                      <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", statusCfg.color)}>
                      {statusCfg.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {FORM_TYPE_LABELS[tpl.form_type] || tpl.form_type}
                    </span>
                  </div>
                </div>
                {creating === tpl.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
    </>
  );
}
