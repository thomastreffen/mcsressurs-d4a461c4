import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { approvalResponseStatus } from "@/lib/approval-response-status";

export interface TechApproval {
  technicianUserId: string;
  technicianName: string;
  status: string; // pending | approved | declined | change_request
  respondedAt: string | null;
  comment: string | null;
  proposedStart: string | null;
  proposedEnd: string | null;
  remindersPaused: boolean;
  createdAt: string | null;
}

export function useJobApprovals(jobId: string | null | undefined) {
  const [approvals, setApprovals] = useState<TechApproval[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!jobId) { setApprovals([]); return; }
    setLoading(true);
    try {
      // Fetch approvals with technician names via user lookup
      const { data, error } = await supabase
        .from("job_approvals")
        .select("technician_user_id, status, responded_at, comment, proposed_start, proposed_end, reminders_paused, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });

      if (error || !data) {
        setApprovals([]);
        setLoading(false);
        return;
      }

      // Get technician names from technicians table (linked via user_id)
      const userIds = [...new Set(data.map((d) => d.technician_user_id))];
      const { data: techs } = await supabase
        .from("technicians")
        .select("user_id, name")
        .in("user_id", userIds);

      const nameMap = new Map<string, string>();
      for (const t of techs || []) {
        if (t.user_id) nameMap.set(t.user_id, t.name);
      }

      setApprovals(
        data.map((d: any) => ({
          technicianUserId: d.technician_user_id,
          technicianName: nameMap.get(d.technician_user_id) || "Ukjent",
          status: approvalResponseStatus(d.status),
          respondedAt: d.responded_at,
          comment: d.comment,
          proposedStart: d.proposed_start,
          proposedEnd: d.proposed_end,
          remindersPaused: d.reminders_paused ?? false,
          createdAt: d.created_at ?? null,
        }))
      );
    } catch {
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { approvals, loading, refetch: fetch };
}
