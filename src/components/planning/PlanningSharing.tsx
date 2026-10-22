import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { usePlanningExternal } from "@/hooks/usePlanningExternal";
import { CHANNEL_LABELS, PLANNING_CHANNELS, type PlanningChannel } from "@/lib/planning-external";
import { toast } from "sonner";

export function PlanningSharing({ projectId, kind, id, visibility = "internal", assignee, privateFile = true }: {
  projectId: string; kind: "file" | "task" | "work_package"; id: string;
  visibility?: string; assignee?: string | null; privateFile?: boolean;
}) {
  const { canManage, participants, refresh } = usePlanningExternal(projectId);
  const [saving, setSaving] = useState(false);
  const change = async (next: string, responsible?: string | null) => {
    if (!canManage || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("planning_set_external_sharing", {
        _project_id: projectId, _kind: kind, _id: id, _visibility: next,
        _assignee: responsible || undefined,
      });
      if (error) throw error;
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Kunne ikke endre deling"); }
    finally { setSaving(false); }
  };
  const eligible = (participants.data ?? []).filter(p => p.status === "active" && (visibility === "all" || p.participant_type === visibility));
  return <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">Kan se:</span>
      {canManage ? <Select value={visibility} disabled={saving} onValueChange={v => change(v, eligible.some(p => p.id === assignee && (v === "all" || p.participant_type === v)) ? assignee : null)}>
        <SelectTrigger className="min-h-11 w-[170px]" aria-label="Synlighet"><SelectValue /></SelectTrigger>
        <SelectContent>{PLANNING_CHANNELS.map(c => <SelectItem key={c} value={c} disabled={!privateFile && c !== "internal"}>{c === "internal" ? "Kun MCS" : `MCS + ${CHANNEL_LABELS[c]}`}</SelectItem>)}</SelectContent>
      </Select> : <span>{visibility === "internal" ? "Kun MCS" : `MCS + ${CHANNEL_LABELS[visibility as PlanningChannel]}`}</span>}
    </div>
    {!privateFile && <p className="text-muted-foreground">Eldre offentlig fil. Last opp en privat kopi før ekstern deling.</p>}
    {kind === "task" && canManage && visibility !== "internal" && <Select value={assignee || "none"} disabled={saving} onValueChange={v => change(visibility, v === "none" ? null : v)}>
      <SelectTrigger className="min-h-11 w-full sm:w-[280px]" aria-label="Ekstern oppgaveansvarlig"><SelectValue placeholder="Ekstern ansvarlig" /></SelectTrigger>
      <SelectContent><SelectItem value="none">Ingen ekstern ansvarlig</SelectItem>{eligible.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.company_name}</SelectItem>)}</SelectContent>
    </Select>}
  </div>;
}