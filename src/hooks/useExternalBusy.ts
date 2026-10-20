import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithSession } from "@/lib/invoke-session";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { parseUtc } from "@/lib/parse-utc";

export interface ExternalBusySlot {
  technicianId: string;
  start: Date;
  end: Date;
}

interface UseExternalBusyOptions {
  technicianIds?: string[];
  referenceDate?: Date;
}

/**
 * Fetches external (Outlook) busy slots for technicians for the visible week.
 * Uses the existing ms-calendar edge function "availability".
 */
export function useExternalBusy(technicianId: string | null, options?: UseExternalBusyOptions) {
  const [busySlots, setBusySlots] = useState<ExternalBusySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopedTechIds = options?.technicianIds;
  const dateRef = options?.referenceDate ?? new Date();

  const weekStart = useMemo(
    () => startOfWeek(dateRef, { weekStartsOn: 1 }),
    [dateRef.toDateString()]
  );
  const weekEnd = useMemo(
    () => endOfWeek(dateRef, { weekStartsOn: 1 }),
    [dateRef.toDateString()]
  );

  const scopedTechKey = scopedTechIds?.length ? scopedTechIds.join(",") : "all";

  const fetchBusy = useCallback(async () => {
    // If technicianId is "__disabled__", skip fetching (permission guard)
    if (technicianId === "__disabled__") {
      setBusySlots([]);
      setLoading(false);
      return;
    }

    // No technicians in selected company scope -> no busy slots
    if (scopedTechIds && scopedTechIds.length === 0) {
      setBusySlots([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get scoped technician user_ids
      let techQuery = supabase
        .from("technicians")
        .select("id, user_id")
        .not("user_id", "is", null);

      if (scopedTechIds && scopedTechIds.length > 0) {
        techQuery = techQuery.in("id", scopedTechIds);
      }

      const { data: techs } = await techQuery;

      if (!techs?.length) {
        setBusySlots([]);
        return;
      }

      const userIds = techs.map((t: any) => t.user_id).filter(Boolean);
      const userToTech = new Map(techs.map((t: any) => [t.user_id, t.id]));

      // Send as UTC since ms-calendar now uses UTC timezone for Graph API
      const startISO = weekStart.toISOString().replace("Z", "");
      const endISO = weekEnd.toISOString().replace("Z", "");

      const { data, error: fnError } = await invokeWithSession("ms-calendar", {
        body: {
          action: "availability",
          user_ids: userIds,
          start: startISO,
          end: endISO,
        },
      });

      if (fnError || data?.error) {
        const msg = data?.error || fnError?.message || "Ukjent feil";
        console.warn("[ExternalBusy] Fetch failed:", msg);
        setError(msg);
        setBusySlots([]);
        return;
      }

      const results: any[] = data?.results || [];
      const slots: ExternalBusySlot[] = [];
      let totalSlots = 0;
      let matchedSlots = 0;
      let droppedSlots = 0;

      for (const entry of results) {
        const techId = entry.technician_id || userToTech.get(entry.user_id);
        const entrySlots = entry.busy_slots || [];
        totalSlots += entrySlots.length;

        if (!techId) {
          droppedSlots += entrySlots.length;
          console.warn(`[ExternalBusy] Dropped ${entrySlots.length} slots for user ${entry.user_id} – no matching technician`);
          continue;
        }

        for (const slot of entrySlots) {
          if (!slot.start || !slot.end) {
            droppedSlots++;
            continue;
          }
          matchedSlots++;
          slots.push({
            technicianId: techId,
            start: parseUtc(slot.start),
            end: parseUtc(slot.end),
          });
        }
      }

      console.log(`[ExternalBusy] Total: ${totalSlots} slots fetched, ${matchedSlots} matched to technician, ${droppedSlots} dropped (scope: ${scopedTechKey})`);
      setBusySlots(slots);
    } catch (err: any) {
      console.error("[ExternalBusy] Exception:", err);
      setError(err.message);
      setBusySlots([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd, scopedTechIds, scopedTechKey, technicianId]);

  useEffect(() => {
    fetchBusy();
  }, [fetchBusy]);

  /** Get external busy slots for a specific day, optionally filtered by selected technician */
  const getBusySlotsForDay = useCallback(
    (date: Date): ExternalBusySlot[] => {
      const dayStr = date.toDateString();
      return busySlots.filter((s) => {
        if (technicianId && technicianId !== "__disabled__" && s.technicianId !== technicianId) return false;
        return s.start.toDateString() === dayStr;
      });
    },
    [busySlots, technicianId]
  );

  /** Get total external busy minutes for a day */
  const getExternalBusyMinutesForDay = useCallback(
    (date: Date): number => {
      const daySlots = getBusySlotsForDay(date);
      return daySlots.reduce(
        (sum, s) => sum + Math.round((s.end.getTime() - s.start.getTime()) / 60000),
        0
      );
    },
    [getBusySlotsForDay]
  );

  return {
    busySlots,
    loading,
    error,
    refetch: fetchBusy,
    getBusySlotsForDay,
    getExternalBusyMinutesForDay,
  };
}
