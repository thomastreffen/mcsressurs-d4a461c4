import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { approvalResponseStatus } from "@/lib/approval-response-status";

export interface ApprovalSummary {
  total: number;
  approved: number;
  declined: number;
  pending: number;
  changeRequest: number;
  reminderProfile: string | null;
  reminderCount: number;
  lastRemindedAt: string | null;
  responseRequired: boolean;
  createdAt: string | null;
  hasPaused: boolean;
  eventStartTime: string | null;
}

export function useApprovalSummaries(eventIds: string[]) {
  const [summaries, setSummaries] = useState<Map<string, ApprovalSummary>>(new Map());

  const key = useMemo(() => [...eventIds].sort().join(","), [eventIds]);

  const fetch = useCallback(async () => {
    if (eventIds.length === 0) {
      setSummaries(new Map());
      return;
    }

    const { data, error } = await supabase
      .from("job_approvals")
      .select("job_id, status, reminder_profile, reminder_count, last_reminded_at, response_required, created_at, reminders_paused")
      .in("job_id", eventIds);

    if (error || !data) {
      setSummaries(new Map());
      return;
    }

    const map = new Map<string, ApprovalSummary>();
    for (const row of data) {
      const jobId = row.job_id;
      if (!map.has(jobId)) {
        map.set(jobId, {
          total: 0,
          approved: 0,
          declined: 0,
          pending: 0,
          changeRequest: 0,
          reminderProfile: row.reminder_profile,
          reminderCount: row.reminder_count ?? 0,
          lastRemindedAt: row.last_reminded_at,
          responseRequired: row.response_required ?? true,
          createdAt: row.created_at,
          hasPaused: false,
          eventStartTime: null,
        });
      }
      const s = map.get(jobId);
      if (!s) continue;
      const status = approvalResponseStatus(row.status);
      s.total++;
      if (status === "approved") s.approved++;
      else if (status === "declined") s.declined++;
      else if (status === "change_request") s.changeRequest++;
      else s.pending++;
      if ((row as any).reminders_paused) s.hasPaused = true;
      // Use highest reminder_count across approvals
      if ((row.reminder_count ?? 0) > s.reminderCount) {
        s.reminderCount = row.reminder_count ?? 0;
        s.lastRemindedAt = row.last_reminded_at;
      }
    }

    setSummaries(map);
  }, [key]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { summaries, refetch: fetch };
}

/** Calculate next reminder time based on profile and current state */
export function getNextReminderInfo(
  summary: ApprovalSummary | undefined,
  eventStart: Date
): { nextAt: Date | null; label: string } {
  if (!summary || summary.pending === 0) {
    return { nextAt: null, label: "Alle har svart" };
  }
  if (!summary.responseRequired) {
    return { nextAt: null, label: "Ingen påminnelse" };
  }

  const profile = summary.reminderProfile || "standard";
  if (profile === "none") {
    return { nextAt: null, label: "Ingen påminnelse" };
  }

  const intervals: Record<string, number[]> = {
    standard: [120, 1440, 2880],
    urgent: [30, 120, 360],
    company_default: [120, 1440, 2880],
  };

  const profileIntervals = intervals[profile] || intervals.standard;
  const maxReminders = profileIntervals.length;
  const count = summary.reminderCount;

  if (count >= maxReminders) {
    return { nextAt: null, label: "Ingen flere påminnelser" };
  }

  const now = new Date();
  if (now >= eventStart) {
    return { nextAt: null, label: "Oppdrag passert" };
  }

  // Calculate next reminder: sum of intervals up to count
  const baseTime = summary.createdAt ? new Date(summary.createdAt) : now;
  let totalMinutes = 0;
  for (let i = 0; i <= count; i++) {
    totalMinutes += profileIntervals[i] ?? profileIntervals[profileIntervals.length - 1];
  }
  const nextAt = new Date(baseTime.getTime() + totalMinutes * 60000);

  if (nextAt >= eventStart) {
    return { nextAt: null, label: "Ingen flere før start" };
  }

  return { nextAt, label: "" };
}
