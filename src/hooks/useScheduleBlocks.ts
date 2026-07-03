import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek } from "date-fns";
import { parseUtc } from "@/lib/parse-utc";

export interface ScheduleBlock {
  id: string;
  company_id: string;
  technician_id: string;
  project_id: string | null;
  job_id: string | null;
  outlook_event_id: string | null;
  calendar_id: string | null;
  source: "outlook" | "manual" | "system";
  start_at: Date;
  end_at: Date;
  title: string;
  location: string | null;
  description: string | null;
  match_confidence: number;
  match_reason: string | null;
  match_state: "auto" | "needs_confirmation" | "external" | "confirmed" | "manual";
  mcs_block_id: string | null;
  created_at: string;
  updated_at: string;
  // Outlook detail fields
  outlook_subject: string | null;
  outlook_location: string | null;
  outlook_preview: string | null;
  outlook_weblink: string | null;
  outlook_organizer: string | null;
  // AI matcher fields
  ai_match_reason: string | null;
  ai_confidence: number | null;
  // Joined
  technician_name?: string;
  technician_color?: string | null;
  project_title?: string | null;
  job_number?: string | null;
  internal_number?: string | null;
  job_title?: string | null;
  job_status?: string | null;
  job_number_resolved?: string | null;
}

function mapRow(row: any): ScheduleBlock {
  return {
    ...row,
    start_at: parseUtc(row.start_at),
    end_at: parseUtc(row.end_at),
    technician_name: row.technicians?.name,
    technician_color: row.technicians?.color,
    project_title: row.events?.title ?? null,
    job_number: row.events?.job_number ?? null,
    internal_number: row.events?.internal_number ?? null,
    job_title: row.job?.title ?? null,
    job_status: row.job?.status ?? null,
    job_number_resolved: row.job?.job_number ?? row.events?.job_number ?? null,
  };
}

/**
 * Fetches schedule_blocks with correct overlap query:
 *   start_at < rangeEnd AND end_at > rangeStart
 * 
 * Accepts optional technicianIds array for batched viewport fetching.
 * Realtime changes are debounced (200ms) to handle cron batch upserts.
 */
export function useScheduleBlocks(
  referenceDate: Date,
  technicianId?: string | null,
  technicianIds?: string[],
  companyId?: string | null,
  allowedCompanyIds?: string[]
) {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const weekStart = useMemo(
    () => startOfWeek(referenceDate, { weekStartsOn: 1 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [referenceDate.toDateString()]
  );
  const weekEnd = useMemo(
    () => endOfWeek(referenceDate, { weekStartsOn: 1 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [referenceDate.toDateString()]
  );

  // Stable key for subscription filtering
  const techFilterKey = `${companyId ?? "all-companies"}|${technicianId || (technicianIds ? technicianIds.join(",") : "all-techs")}`;

  const fetchBlocks = useCallback(async (silent = false) => {
    const id = ++fetchIdRef.current;
    if (!silent) setLoading(true);
    try {
      // Correct overlap query: start_at < rangeEnd AND end_at > rangeStart
      let query = supabase
        .from("schedule_blocks")
        .select(`
          *,
          technicians!inner(name, color),
          events!schedule_blocks_project_id_fkey(title, job_number, internal_number, deleted_at),
          job:events!schedule_blocks_job_id_fkey(title, status, job_number, deleted_at)
        `)
        .is("deleted_at", null)
        .lt("start_at", weekEnd.toISOString())
        .gt("end_at", weekStart.toISOString())
        .order("start_at", { ascending: true });

      // Filter by company scope
      if (companyId) {
        query = query.eq("company_id", companyId);
      } else if (allowedCompanyIds && allowedCompanyIds.length > 0) {
        query = query.in("company_id", allowedCompanyIds);
      }

      // Filter by technician(s)
      if (technicianId) {
        query = query.eq("technician_id", technicianId);
      } else if (technicianIds && technicianIds.length > 0) {
        query = query.in("technician_id", technicianIds);
      }

      const { data, error } = await query;
      if (id !== fetchIdRef.current) return; // stale
      if (error) {
        console.error("[ScheduleBlocks] Fetch error:", error);
        setBlocks([]);
        return;
      }

      const rows = data ?? [];

      // Ghost filter: drop any block whose linked event(s) are soft-deleted
      // or missing. These blocks have no clickable target and must not render.
      const ghostRows: any[] = [];
      const liveRows: any[] = [];
      for (const row of rows) {
        const jobRow = (row as any).job;
        const projRow = (row as any).events;
        const jobDead = row.job_id && (!jobRow || jobRow.deleted_at != null);
        const projDead = row.project_id && (!projRow || projRow.deleted_at != null);
        // Block is a ghost if:
        //  - job_id is dead (activity is gone), or
        //  - no job_id and project_id is dead
        const isGhost = jobDead || (!row.job_id && projDead);
        if (isGhost) ghostRows.push(row);
        else liveRows.push(row);
      }

      const mapped = liveRows.map(mapRow);

      // Defensive: detect orphaned project_id where project is soft-deleted
      // but job is still valid → unlink project reference so click routes to job.
      const orphanIds: string[] = [];
      for (const b of mapped) {
        if (b.project_id && b.project_title === null) {
          orphanIds.push(b.id);
          b.project_id = null;
          b.match_state = "external";
          b.title = b.outlook_subject || b.title || "Ekstern blokk";
        }
      }

      // Fire-and-forget cleanup via server-side function
      if (orphanIds.length > 0 || ghostRows.length > 0) {
        if (ghostRows.length > 0) {
          console.warn("[ScheduleBlocks] Filtered ghost blocks (linked event deleted/missing)", {
            count: ghostRows.length,
            ids: ghostRows.map((r) => r.id),
          });
        }
        supabase.rpc("sweep_orphan_schedule_blocks").then(({ error: cleanupErr }) => {
          if (cleanupErr) console.error("[ScheduleBlocks] Orphan sweep error:", cleanupErr);
        });
      }

      setBlocks(mapped);
    } catch (err) {
      console.error("[ScheduleBlocks] Exception:", err);
    } finally {
      if (id === fetchIdRef.current && !silent) setLoading(false);
    }
  }, [weekStart, weekEnd, technicianId, technicianIds?.join(","), companyId]);

  // Debounced silent refetch – batches multiple realtime events
  const debouncedRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchBlocks(true), 200);
  }, [fetchBlocks]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Initial fetch
  useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

  // Optimistic removal – instantly hide a block by id (used by callers after delete)
  const removeBlockOptimistic = useCallback((blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }, []);

  // Realtime – debounced to handle cron batch upserts
  useEffect(() => {
    const channel = supabase
      .channel(`schedule-blocks-rt-${techFilterKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "schedule_blocks" },
        () => debouncedRefetch()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "schedule_blocks" },
        (payload) => {
          const updated = payload.new as any;
          // Soft-deleted blocks should be removed immediately
          if (updated.deleted_at) {
            setBlocks((prev) => prev.filter((b) => b.id !== updated.id));
          } else {
            debouncedRefetch();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "schedule_blocks" },
        (payload) => {
          const old = payload.old as any;
          setBlocks((prev) => prev.filter((b) => b.id !== old.id));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [techFilterKey, debouncedRefetch]);

  // Fallback: silent refetch every 60s
  useEffect(() => {
    const interval = setInterval(() => fetchBlocks(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchBlocks]);

  // Fallback: refetch on tab focus / visibilitychange
  useEffect(() => {
    const onFocus = () => fetchBlocks(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchBlocks(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchBlocks]);

  return { blocks, loading, refetch: fetchBlocks, removeBlockOptimistic };
}

/** Hook to get count of blocks needing confirmation */
export function useConfirmationCount() {
  const [count, setCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCount = useCallback(async () => {
    const { count: c, error } = await supabase
      .from("schedule_blocks")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("match_state", "needs_confirmation");
    if (!error && c !== null) setCount(c);
  }, []);

  useEffect(() => { fetchCount(); }, [fetchCount]);

  useEffect(() => {
    const channel = supabase
      .channel("confirmation-count-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_blocks" }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(fetchCount, 300);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchCount]);

  // Fallback polling
  useEffect(() => {
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return count;
}
