import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, differenceInMinutes } from "date-fns";
import type { JobStatus } from "@/lib/job-status";
import type { Job } from "@/lib/mock-data";
import { parseUtc } from "@/lib/parse-utc";
import { segmentForDay, minutesOnDay, type DaySegment } from "@/lib/calendar-segments";

export type CalendarDaySegment = DaySegment<CalendarEvent>;

export interface TechnicianInfo {
  id: string;
  name: string;
  color: string | null;
  eventTechnicianId?: string | null;
  calendarEventId?: string | null;
  /** Per-technician time override (if set, takes precedence over event time) */
  startAt?: Date | null;
  endAt?: Date | null;
}

export interface CalendarEvent extends Job {
  technicians: TechnicianInfo[];
}

function overlapsRange(start: Date, end: Date, rangeStart: Date, rangeEnd: Date) {
  return start.getTime() < rangeEnd.getTime() && end.getTime() > rangeStart.getTime();
}

export function useCalendarEvents(
  technicianId: string | null,
  referenceDate?: Date,
  companyId?: string | null,
  scopedTechnicianIds?: string[],
  allowedCompanyIds?: string[]
) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const refDate = referenceDate ?? new Date();
  const weekStart = useMemo(() => startOfWeek(refDate, { weekStartsOn: 1 }), [refDate.toDateString()]);
  const weekEnd = useMemo(() => endOfWeek(refDate, { weekStartsOn: 1 }), [refDate.toDateString()]);
  const weekStartISO = weekStart.toISOString();
  const weekEndISO = weekEnd.toISOString();
  const scopedTechKey = scopedTechnicianIds?.join(",") ?? "";
  const allowedCompanyIdsKey = allowedCompanyIds?.join(",") ?? "";

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const visibleTechIds = technicianId
        ? [technicianId]
        : Array.isArray(scopedTechnicianIds)
          ? scopedTechnicianIds.filter((id): id is string => Boolean(id))
          : null;

      let eventIdsQuery = supabase
        .from("events")
        .select("id")
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .lt("start_time", weekEndISO)
        .gt("end_time", weekStartISO);

      if (companyId) {
        eventIdsQuery = eventIdsQuery.eq("company_id", companyId);
      } else if (allowedCompanyIds && allowedCompanyIds.length > 0) {
        eventIdsQuery = eventIdsQuery.in("company_id", allowedCompanyIds);
      }

      const assignmentIdsQuery = visibleTechIds && visibleTechIds.length > 0
        ? supabase
            .from("event_technicians")
            .select("event_id")
            .lt("start_at", weekEndISO)
            .gt("end_at", weekStartISO)
            .in("technician_id", visibleTechIds)
        : Promise.resolve({ data: [], error: null });

      const [eventIdsResult, assignmentIdsResult] = await Promise.all([eventIdsQuery, assignmentIdsQuery]);

      if (eventIdsResult.error) {
        console.error("[Calendar] Failed to fetch event ids:", eventIdsResult.error);
        setEvents([]);
        return;
      }

      if (assignmentIdsResult.error) {
        console.error("[Calendar] Failed to fetch assignment event ids:", assignmentIdsResult.error);
        setEvents([]);
        return;
      }

      const eventIds = Array.from(
        new Set<string>([
          ...(eventIdsResult.data ?? []).map((row: any) => row.id),
          ...(assignmentIdsResult.data ?? []).map((row: any) => row.event_id),
        ].filter(Boolean))
      );

      if (eventIds.length === 0) {
        setEvents([]);
        return;
      }

      let query = supabase
        .from("events")
        .select(`
          id,
          title,
          description,
          customer,
          address,
          start_time,
          end_time,
          status,
          job_number,
          internal_number,
          project_number,
          microsoft_event_id,
          proposed_start,
          proposed_end,
          created_at,
          updated_at,
          attachments,
          event_technicians (
            id,
            technician_id,
            calendar_event_id,
            start_at,
            end_at,
            technicians (
              id,
              name,
              color
            )
          )
        `)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .in("id", eventIds)
        .order("start_time", { ascending: true });

      if (companyId) {
        query = query.eq("company_id", companyId);
      } else if (allowedCompanyIds && allowedCompanyIds.length > 0) {
        query = query.in("company_id", allowedCompanyIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[Calendar] Failed to fetch events:", error);
        setEvents([]);
        return;
      }

      const allEvents = data ?? [];

      const withTechs = allEvents
        .map((e: any) => {
          const eventStart = parseUtc(e.start_time);
          const eventEnd = parseUtc(e.end_time);
          const technicians: TechnicianInfo[] = (e.event_technicians ?? [])
            .filter((et: any) => et.technicians)
            .map((et: any) => ({
              id: et.technicians.id,
              name: et.technicians.name,
              color: et.technicians.color,
              eventTechnicianId: et.id ?? null,
              calendarEventId: et.calendar_event_id ?? null,
              startAt: et.start_at ? parseUtc(et.start_at) : null,
              endAt: et.end_at ? parseUtc(et.end_at) : null,
            }))
            .filter((tech) => {
              const effectiveStart = tech.startAt ?? eventStart;
              const effectiveEnd = tech.endAt ?? eventEnd;
              return overlapsRange(effectiveStart, effectiveEnd, weekStart, weekEnd);
            });

          return {
            raw: e,
            eventStart,
            eventEnd,
            technicians,
          };
        })
        .filter((entry) => entry.technicians.length > 0);

      const orphanCount = allEvents.length - withTechs.length;
      if (orphanCount > 0) {
        console.warn(`[Calendar] Dropped ${orphanCount} events without visible event_technicians`);
      }

      const scoped = Array.isArray(scopedTechnicianIds)
        ? (scopedTechnicianIds.length === 0
            ? []
            : withTechs.filter((e) =>
                e.technicians.some((tech) => scopedTechnicianIds.includes(tech.id))
              ))
        : withTechs;

      const filtered = technicianId
        ? scoped.filter((e) => e.technicians.some((tech) => tech.id === technicianId))
        : scoped;

      const uniqueMap = new Map<string, (typeof filtered)[0]>();
      for (const e of filtered) {
        uniqueMap.set(e.raw.id, e);
      }

      const mapped: CalendarEvent[] = Array.from(uniqueMap.values()).map(({ raw, eventStart, eventEnd, technicians }) => {
        const effectiveStarts = technicians.map((tech) => (tech.startAt ?? eventStart).getTime());
        const effectiveEnds = technicians.map((tech) => (tech.endAt ?? eventEnd).getTime());

        return {
          id: raw.id,
          microsoftEventId: raw.microsoft_event_id ?? "",
          technicianIds: technicians.map((tech) => tech.id),
          attendeeStatuses: [],
          title: raw.title,
          customer: raw.customer ?? "",
          address: raw.address ?? "",
          description: raw.description ?? "",
          start: effectiveStarts.length > 0 ? new Date(Math.min(...effectiveStarts)) : eventStart,
          end: effectiveEnds.length > 0 ? new Date(Math.max(...effectiveEnds)) : eventEnd,
          status: raw.status as JobStatus,
          jobNumber: raw.job_number,
          internalNumber: raw.internal_number,
          projectNumber: raw.project_number ?? null,
          proposedStart: raw.proposed_start ? parseUtc(raw.proposed_start) : undefined,
          proposedEnd: raw.proposed_end ? parseUtc(raw.proposed_end) : undefined,
          createdAt: raw.created_at ? parseUtc(raw.created_at) : undefined,
          updatedAt: raw.updated_at ? parseUtc(raw.updated_at) : undefined,
          attachments: raw.attachments ?? [],
          technicians,
        };
      });

      console.log(
        `[Calendar] Fetched ${mapped.length} unique events (tech: ${technicianId ?? "ALL"}, company: ${companyId ?? "ALL"}, scope-techs: ${Array.isArray(scopedTechnicianIds) ? scopedTechnicianIds.length : "ALL"}, week: ${weekStartISO.slice(0, 10)})`
      );
      setEvents(mapped);
    } catch (err) {
      console.error("[Calendar] Fetch exception:", err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [technicianId, weekStart, weekEnd, weekStartISO, weekEndISO, companyId, scopedTechKey, allowedCompanyIdsKey]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    const channel = supabase
      .channel("calendar-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          console.log("[Calendar] Realtime update triggered (events)");
          fetchEvents();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_technicians" },
        () => {
          console.log("[Calendar] Realtime update triggered (event_technicians)");
          fetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEvents]);

  const getJobsForDay = useCallback(
    (date: Date): CalendarEvent[] =>
      events.filter((j) => segmentForDay(j, date) !== null),
    [events]
  );

  const getSegmentsForDay = useCallback(
    (date: Date): CalendarDaySegment[] => {
      const segments: CalendarDaySegment[] = [];
      for (const job of events) {
        const seg = segmentForDay(job, date);
        if (seg) segments.push(seg);
      }
      return segments;
    },
    [events]
  );

  const getBookedMinutesForDay = useCallback(
    (date: Date): number =>
      events.reduce((sum, job) => sum + minutesOnDay(job, date), 0),
    [events]
  );

  return { events, loading, refetch: fetchEvents, getJobsForDay, getSegmentsForDay, getBookedMinutesForDay };
}
