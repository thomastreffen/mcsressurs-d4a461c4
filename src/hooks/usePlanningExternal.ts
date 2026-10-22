import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import type { ChannelPerson, ExternalParticipant } from "@/lib/planning-external";

export function usePlanningExternal(projectId: string) {
  const queryClient = useQueryClient();
  const { active: preview } = usePreviewMode();
  const participants = useQuery({
    queryKey: ["planning-external-participants", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("planning_external_participants")
        .select("id,name,email,company_name,participant_type,status").eq("planning_project_id", projectId).or("deleted_at.is.null,status.eq.revoked");
      if (error) throw error;
      return data as ExternalParticipant[];
    },
  });
  const manager = useQuery({
    queryKey: ["planning-external-manager", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("planning_external_manager", { _project_id: projectId });
      if (error) throw error;
      return data === true;
    },
  });
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["planning-external-participants", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["planning-children", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["planning-activity", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["planning-channel", projectId] }),
  ]);
  return { participants, canManage: manager.data === true && !preview, preview, refresh };
}

export async function planningAudience(projectId: string, channel: string): Promise<ChannelPerson[]> {
  const { data, error } = await supabase.rpc("planning_channel_audience", { _project_id: projectId, _channel: channel });
  if (error) throw error;
  return data as unknown as ChannelPerson[];
}