import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePlanningMutations, type PlanningProject, type PlanningWorkPackage } from "@/hooks/usePlanning";

const sb = supabase as any;

/** Oppretter et oppdrag i eksisterende Ressursplan – avdelingen velger personer der. */
export function useSendWpToResourcePlan(project: PlanningProject | undefined) {
  const [sendingId, setSendingId] = useState<string | null>(null);
  const { updateProject, invalidate } = usePlanningMutations(project?.id);

  const send = async (wp: PlanningWorkPackage) => {
    if (!project) return;
    if (!wp.planned_start) {
      toast.error("Sett planlagt start før arbeidspakken sendes til ressursplan");
      return;
    }
    if (sendingId) return;
    setSendingId(wp.id);
    try {
      // Idempotent i databasen: låser arbeidspakken og gjenbruker eksisterende oppdrag
      const { data, error } = await sb.rpc("send_planning_wp_to_resource_plan", { _wp_id: wp.id });
      if (error) throw error;
      invalidate();
      if (!data?.created) {
        toast.info("Arbeidspakken ligger allerede i ressursplanen");
        return;
      }
      if (["confirmed", "early_planning", "probable"].includes(project.status)) {
        await updateProject.mutateAsync({
          id: project.id,
          patch: { status: "ready_for_resource_plan" },
          logSummary: "Status satt til Klar for ressursplan",
        });
      }
      toast.success("Sendt til ressursplan – avdelingen velger personer der");
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke sende til ressursplan");
    } finally {
      setSendingId(null);
    }
  };

  return { send, sendingId };
}
