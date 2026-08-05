import { useRef, useCallback, useMemo, useEffect, useState, memo } from "react";
import { getNorwegianHolidays } from "@/lib/norwegian-holidays";
import type { AbsenceBlock } from "@/hooks/useAbsenceBlocks";
import { CalendarOff } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { EventInput, EventDropArg, DateSelectArg, EventClickArg } from "@fullcalendar/core";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
import type { ExternalBusySlot } from "@/hooks/useExternalBusy";
import type { ApprovalSummary } from "@/hooks/useApprovalSummaries";
import { getNextReminderInfo } from "@/hooks/useApprovalSummaries";
import type { DayCapacity } from "@/hooks/useCapacity";
import type { ScheduleBlock } from "@/hooks/useScheduleBlocks";
import {
  filterScheduleBlocksByTechnician,
  getRenderableAssignments,
} from "@/lib/resource-plan-assignment-identity";
import { Lock, CalendarCheck, AlertTriangle, Globe, Monitor, MapPin, Moon, Users, Check, Clock, X, Clock4, Zap, BellOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { TechAvatar } from "@/components/TechAvatar";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TechLookup {
  name: string;
  color: string | null;
  avatarId?: string | null;
}

interface ResourceCalendarProps {
  technicianId: string | null;
  companyId?: string | null;
  referenceDate: Date;
  calendarView?: string;
  technicianMap: Map<string, TechLookup>;
  getBusySlotsForDay?: (date: Date) => ExternalBusySlot[];
  dayCapacities?: DayCapacity[];
  scheduleBlocks?: ScheduleBlock[];
  absenceBlocks?: AbsenceBlock[];
  onEventClick?: (event: CalendarEvent, clickedTechId?: string) => void;
  onScheduleBlockClick?: (block: ScheduleBlock) => void;
  onDateSelect?: (start: Date, end: Date) => void;
  onEventDrop?: (eventId: string, newStart: Date, newEnd: Date, technicianId?: string) => void;
  onEventResize?: (eventId: string, newStart: Date, newEnd: Date, technicianId?: string) => void;
  onScheduleBlockDrop?: (blockId: string, newStart: Date, newEnd: Date, technicianId?: string) => void;
  onScheduleBlockResize?: (blockId: string, newStart: Date, newEnd: Date, technicianId?: string) => void;
  onExternalDrop?: (info: { taskId: string; title: string; start: Date; end: Date; estimatedMinutes: number; priority: string; dropType: string }) => void;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  canWriteEvents?: boolean;
  canViewExternalDetails?: boolean;
  canReadBusy?: boolean;
  hideExternalEvents?: boolean;
  slotMinTime?: string;
  slotMaxTime?: string;
  slotDuration?: string;
  operatingStartHour?: number;
  operatingEndHour?: number;
  hasNightHours?: boolean;
  approvalSummaries?: Map<string, ApprovalSummary>;
  highlightEventIds?: Set<string> | null;
  onMonthDayClick?: (date: Date) => void;
}

function mergeExternalSlots(slots: ExternalBusySlot[]): ExternalBusySlot[] {
  if (slots.length <= 1) return slots;
  const sorted = [...slots].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: ExternalBusySlot[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      if (sorted[i].end > last.end) last.end = sorted[i].end;
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

const GCAL_PALETTE = [
  "#D50000", "#F4511E", "#E67C73", "#F09300",
  "#009688", "#0B8043", "#33B679", "#7CB342",
  "#039BE5", "#3F51B5", "#7986CB", "#8E24AA",
  "#616161", "#795548",
];

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const statusDotColors: Record<string, string> = {
  scheduled: "#2563EB",
  in_progress: "#059669",
  completed: "#6B7280",
  ready_for_invoicing: "#D97706",
  invoiced: "#9CA3AF",
  planned: "#2563EB",
  requested: "#2563EB",
  approved: "#2563EB",
  done: "#6B7280",
};

const ACCEPTANCE_ICON_MAP: Record<string, { Icon: typeof Check; className: string; title: string }> = {
  requested: { Icon: Clock, className: "text-amber-300", title: "Forespurt" },
  approved: { Icon: Check, className: "text-emerald-300", title: "Godkjent" },
  time_change_proposed: { Icon: Clock4, className: "text-blue-300", title: "Tidsendring" },
  rejected: { Icon: X, className: "text-red-300", title: "Avslått" },
};

const matchStateColors: Record<string, { bg: string; border: string; text: string }> = {
  auto: { bg: "#059669", border: "#059669", text: "#FFFFFF" },
  confirmed: { bg: "#059669", border: "#059669", text: "#FFFFFF" },
  needs_confirmation: { bg: "#D97706", border: "#D97706", text: "#FFFFFF" },
  external: { bg: "#6B7280", border: "#6B7280", text: "#FFFFFF" },
  manual: { bg: "#2563EB", border: "#2563EB", text: "#FFFFFF" },
};

export const ResourceCalendar = memo(function ResourceCalendar({
  technicianId,
  companyId,
  referenceDate,
  calendarView = "timeGridWeek",
  technicianMap,
  getBusySlotsForDay,
  dayCapacities,
  scheduleBlocks = [],
  absenceBlocks = [],
  onEventClick,
  onScheduleBlockClick,
  onDateSelect,
  onEventDrop,
  onEventResize,
  onScheduleBlockDrop,
  onScheduleBlockResize,
  onExternalDrop,
  isAdmin = false,
  isSuperAdmin = false,
  canWriteEvents,
  canViewExternalDetails,
  canReadBusy = true,
  hideExternalEvents = false,
  slotMinTime = "07:00:00",
  slotMaxTime = "16:00:00",
  slotDuration = "00:30:00",
  operatingStartHour = 7,
  operatingEndHour = 16,
  hasNightHours = false,
  approvalSummaries = new Map(),
  highlightEventIds,
  onMonthDayClick,
}: ResourceCalendarProps) {
  const effectiveCanWrite = canWriteEvents ?? isAdmin;
  const effectiveCanViewExternal = canViewExternalDetails ?? isSuperAdmin;
  const calendarRef = useRef<FullCalendar>(null);
  const scopedTechnicianIds = useMemo(() => Array.from(technicianMap.keys()), [technicianMap]);
  const { events: calendarEvents } = useCalendarEvents(technicianId, referenceDate, companyId, scopedTechnicianIds);

  const isMonthView = calendarView === "dayGridMonth";
  const isDayView = calendarView === "timeGridDay";

  // ── Month heatmap: per-day summaries ──
  const monthDaySummaries = useMemo(() => {
    if (!isMonthView) return new Map<string, { eventCount: number; techCount: number; pending: number; risk: number; percent: number }>();
    const map = new Map<string, { events: Set<string>; techs: Set<string>; pending: number; risk: number; totalMinutes: number }>();

    const getDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    for (const ev of calendarEvents) {
      // Iterate through each day the event spans
      let cursor = new Date(ev.start);
      const end = ev.end;
      while (cursor < end) {
        const dk = getDayKey(cursor);
        if (!map.has(dk)) map.set(dk, { events: new Set(), techs: new Set(), pending: 0, risk: 0, totalMinutes: 0 });
        const entry = map.get(dk)!;
        entry.events.add(ev.id);
        for (const t of ev.technicians) entry.techs.add(t.id);

        // Calculate minutes for this day
        const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const segStart = Math.max(ev.start.getTime(), dayStart.getTime());
        const segEnd = Math.min(ev.end.getTime(), dayEnd.getTime());
        entry.totalMinutes += Math.max(0, (segEnd - segStart) / 60000);

        const nextDay = new Date(cursor);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(0, 0, 0, 0);
        cursor = nextDay;
      }

      // Approval data
      const summary = approvalSummaries.get(ev.id);
      if (summary) {
        const dk = getDayKey(ev.start);
        const entry = map.get(dk);
        if (entry) {
          entry.pending += summary.pending;
          if ((summary.declined > 0 || summary.changeRequest > 0)) entry.risk++;
          const hoursUntil = (ev.start.getTime() - Date.now()) / 3600000;
          if (summary.pending > 0 && hoursUntil > 0 && hoursUntil < 12) entry.risk++;
        }
      }
    }

    const WORK_DAY_MINUTES = 480; // 8h per tech
    const techCount = technicianMap.size || 1;
    const totalDayCapacity = WORK_DAY_MINUTES * techCount;

    const result = new Map<string, { eventCount: number; techCount: number; pending: number; risk: number; percent: number }>();
    for (const [dk, entry] of map) {
      result.set(dk, {
        eventCount: entry.events.size,
        techCount: entry.techs.size,
        pending: entry.pending,
        risk: entry.risk,
        percent: Math.min(100, (entry.totalMinutes / totalDayCapacity) * 100),
      });
    }
    return result;
  }, [isMonthView, calendarEvents, approvalSummaries, technicianMap]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      api.gotoDate(referenceDate);
      if (api.view.type !== calendarView) {
        api.changeView(calendarView);
      }
    }
  }, [referenceDate, calendarView]);

  useEffect(() => {
    if (isDayView || calendarView === "timeGridWeek") {
      const api = calendarRef.current?.getApi();
      if (api) {
        setTimeout(() => api.scrollToTime(new Date().toTimeString().slice(0, 8)), 100);
      }
    }
  }, [isDayView, calendarView, referenceDate]);

  const [wrapperRef, setWrapperRef] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!wrapperRef || !hasNightHours) return;
    wrapperRef.classList.add("fc-night-shading");
    return () => { wrapperRef?.classList.remove("fc-night-shading"); };
  }, [hasNightHours, wrapperRef]);

  useEffect(() => {
    const handler = (e: Event) => {
      const time = (e as CustomEvent).detail as string;
      calendarRef.current?.getApi()?.scrollToTime(time);
    };
    window.addEventListener("resource-calendar:scroll-to", handler);
    return () => window.removeEventListener("resource-calendar:scroll-to", handler);
  }, []);

  const techColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    for (const [techId, info] of technicianMap) {
      map.set(techId, info.color || GCAL_PALETTE[idx % GCAL_PALETTE.length]);
      idx++;
    }
    return map;
  }, [technicianMap]);

  const visibleScheduleBlocks = useMemo(
    () => filterScheduleBlocksByTechnician(scheduleBlocks, technicianId),
    [scheduleBlocks, technicianId]
  );

  const fcEvents: EventInput[] = useMemo(() => {
    // ── Single source of truth: schedule_blocks ──
    // We only build assignment metadata from calendarEvents so that:
    //   1. Click handlers can open the correct EventDrawer for project-linked blocks.
    //   2. External busy slots can be deduped against real assignments.
    // No event-fallback rendering happens here. If a project has no schedule_block,
    // it does NOT appear in the calendar (handled as "ikke planlagt" elsewhere).
    const calEventRangesByTech = new Map<string, Array<{ start: number; end: number }>>();
    const assignmentMetaByEventTech = new Map<string, {
      eventId: string;
      technicianId: string;
      eventTechnicianId: string | null;
      calendarEventId: string | null;
      start: number;
      end: number;
      displayName: string;
      calendarEvent: CalendarEvent;
      isMultiTech: boolean;
      technicianNames: string;
    }>();

    const result: EventInput[] = [];
    const renderableAssignments = getRenderableAssignments(calendarEvents, technicianId);

    for (const assignment of renderableAssignments) {
      const ev = assignment.event;
      const tech = assignment.technician;
      const techStart = tech.startAt ?? ev.start;
      const techEnd = tech.endAt ?? ev.end;

      const ranges = calEventRangesByTech.get(tech.id) || [];
      ranges.push({ start: techStart.getTime(), end: techEnd.getTime() });
      calEventRangesByTech.set(tech.id, ranges);

      assignmentMetaByEventTech.set(`${ev.id}::${tech.id}`, {
        eventId: ev.id,
        technicianId: tech.id,
        eventTechnicianId: tech.eventTechnicianId ?? null,
        calendarEventId: tech.calendarEventId ?? null,
        start: techStart.getTime(),
        end: techEnd.getTime(),
        displayName: tech.name,
        calendarEvent: ev,
        isMultiTech: assignment.isMultiTech,
        technicianNames: assignment.technicianNames,
      });
    }

    // External busy slots
    let missingNameCount = 0;
      if (getBusySlotsForDay && !hideExternalEvents) {
        const sbRangesByTech = new Map<string, Array<{ start: number; end: number }>>();
        for (const block of visibleScheduleBlocks) {
          const ranges = sbRangesByTech.get(block.technician_id) || [];
          ranges.push({ start: block.start_at.getTime(), end: block.end_at.getTime() });
          sbRangesByTech.set(block.technician_id, ranges);
        }

      const weekStart = new Date(referenceDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      const daysToRender = isMonthView ? 42 : 7;
      for (let i = 0; i < daysToRender; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        const rawSlots = getBusySlotsForDay(day);
        const byTech = new Map<string, ExternalBusySlot[]>();
        for (const s of rawSlots) {
          const arr = byTech.get(s.technicianId) || [];
          arr.push(s);
          byTech.set(s.technicianId, arr);
        }
        for (const [techId, techSlots] of byTech) {
          const tech = technicianMap.get(techId);
          if (!tech) continue;
          const merged = mergeExternalSlots(techSlots);
          const techSbRanges = sbRangesByTech.get(techId) || [];

          for (const slot of merged) {
            const slotStart = slot.start.getTime();
            const slotEnd = slot.end.getTime();
            // Widen tolerance to 65 minutes to catch timezone-shifted duplicates (±1h for CET/CEST)
            const TZ_TOLERANCE = 65 * 60000;
            const coveredBySb = techSbRanges.some(
              (r) => r.start <= slotStart + TZ_TOLERANCE && r.end >= slotEnd - TZ_TOLERANCE
            );
            if (coveredBySb) continue;

            const calRanges = calEventRangesByTech.get(techId) || [];
            const coveredByCalEvent = calRanges.some(
              (r) => r.start <= slotStart + TZ_TOLERANCE && r.end >= slotEnd - TZ_TOLERANCE
            );
            if (coveredByCalEvent) continue;

            const techName = tech?.name?.trim();
            const displayName = techName ? techName.split(" ")[0] : "Ukjent montør";
            if (!techName) missingNameCount++;
            const busyTechColor = techColorMap.get(techId) || GCAL_PALETTE[0];
            const maskedTitle = effectiveCanViewExternal ? `${displayName} – opptatt` : "Opptatt";
            const BUSY_GRAY = "#9CA3AF";
            result.push({
              id: `busy-${techId}-${slot.start.getTime()}`,
              title: maskedTitle,
              start: slot.start,
              end: slot.end,
              backgroundColor: effectiveCanViewExternal ? hexToRgba(busyTechColor, 0.25) : hexToRgba(BUSY_GRAY, 0.15),
              borderColor: effectiveCanViewExternal ? hexToRgba(busyTechColor, 0.5) : hexToRgba(BUSY_GRAY, 0.35),
              textColor: effectiveCanViewExternal ? busyTechColor : "#9CA3AF",
              editable: false,
              extendedProps: {
                source: "busy_slot",
                renderKey: `busy-${techId}-${slot.start.getTime()}`,
                eventId: null,
                eventTechnicianId: null,
                technicianId: techId,
                calendarEventId: null,
                displayName,
                isBusy: true,
                techName: effectiveCanViewExternal ? displayName : undefined,
                busyTechColor: effectiveCanViewExternal ? busyTechColor : BUSY_GRAY,
                busyTechId: techId,
                isExternalMasked: !effectiveCanViewExternal,
              },
            });
          }
        }
      }
    }

    // Build index of internal (non-outlook) schedule blocks per technician for dedup
    const TZ_TOLERANCE_DEDUP = 65 * 60000;
    const internalBlocksByTech = new Map<string, Array<{ start: number; end: number; projectId: string | null; jobNumber: string | null }>>();
    for (const block of visibleScheduleBlocks) {
      if (block.source === "outlook") continue;
      const arr = internalBlocksByTech.get(block.technician_id) || [];
      arr.push({
        start: block.start_at.getTime(),
        end: block.end_at.getTime(),
        projectId: block.project_id,
        jobNumber: block.job_number ?? null,
      });
      internalBlocksByTech.set(block.technician_id, arr);
    }

    const seenScheduleBlockKeys = new Set<string>();
    for (const block of visibleScheduleBlocks) {
      const isExternal = block.source === "outlook" && !block.project_id;
      if (hideExternalEvents && isExternal) continue;

      // Pull authoritative assignment metadata if this block is linked to a project.
      // We render the block (single source of truth) but use this metadata so clicks
      // open the right EventDrawer and so multi-tech context is preserved.
      const assignmentMeta = block.project_id
        ? assignmentMetaByEventTech.get(`${block.project_id}::${block.technician_id}`)
        : null;

      // Suppress Outlook blocks that mirror an internal block for same tech + same project/job + start within ±65min
      if (block.source === "outlook" && block.project_id) {
        const internals = internalBlocksByTech.get(block.technician_id) || [];
        const blockStart = block.start_at.getTime();
        const matchesInternal = internals.some((ib) => {
          const sameProject = ib.projectId && ib.projectId === block.project_id;
          const sameJob = ib.jobNumber && block.job_number && ib.jobNumber === block.job_number;
          const startClose = Math.abs(ib.start - blockStart) <= TZ_TOLERANCE_DEDUP;
          return (sameProject || sameJob) && startClose;
        });
        if (matchesInternal) {
          console.info("[ResourceCalendar][SuppressOutlookDuplicate]", {
            technician_id: block.technician_id,
            project_id: block.project_id,
            job_number: block.job_number,
            outlook_start: block.start_at.toISOString(),
            block_id: block.id,
          });
          continue;
        }
      }

      const techName = block.technician_name?.split(" ")[0] || "";
      // sourceLabel only set for genuine Outlook blocks. We no longer label
      // project blocks as "System" – they are first-class planning blocks.
      const sourceLabel = block.source === "outlook" ? "Outlook" : null;
      const blockOrderRef = extractOrderRef(block.title, block.description, block.outlook_preview);
      const displayTitle = getResourceCardTitle({
        eventTitle: block.job_title,
        parentTitle: block.project_title,
        blockTitle: block.title,
        outlookSubject: block.outlook_subject,
        sourceOrderNumber: blockOrderRef,
        fallbackRef: block.job_number_resolved || block.internal_number,
      });


      const normalizedTitle = displayTitle.trim().toLowerCase();
      const dedupKey = block.project_id
        ? `linked|${block.source}|${block.technician_id}|${block.project_id}|${block.start_at.toISOString()}|${block.end_at.toISOString()}|${normalizedTitle}`
        : `external|${block.source}|${block.technician_id}|${block.outlook_event_id || "no_external_id"}|${block.start_at.toISOString()}|${block.end_at.toISOString()}`;

      if (seenScheduleBlockKeys.has(dedupKey)) continue;
      seenScheduleBlockKeys.add(dedupKey);

      const masked = isExternal && !effectiveCanViewExternal;
      const BUSY_GRAY = "#9CA3AF";

      // Project-linked blocks inherit technician color for visual consistency.
      // Outlook (non-project) blocks get a subdued look so they don't dominate.
      const isLinkedToProject = !!block.project_id;
      const techColor = techColorMap.get(block.technician_id);
      const fallbackColors = matchStateColors[block.match_state] || matchStateColors.external;
      const useTechColor = isLinkedToProject && techColor;
      const isOvernight = block.start_at.toDateString() !== block.end_at.toDateString();

      const renderKey = `sb-${block.id}`;
      const calEvent = assignmentMeta?.calendarEvent;

      result.push({
        id: renderKey,
        title: masked
          ? "Opptatt"
          : (isLinkedToProject
              ? ((calEvent?.title?.replace("SERVICE – ", "")) || block.project_title || block.title || displayTitle)
              : displayTitle),
        start: block.start_at,
        end: block.end_at,
        backgroundColor: masked
          ? hexToRgba(BUSY_GRAY, 0.15)
          : (useTechColor ? techColor : hexToRgba(fallbackColors.bg, 0.85)),
        borderColor: masked
          ? hexToRgba(BUSY_GRAY, 0.35)
          : (useTechColor ? techColor : fallbackColors.border),
        textColor: masked ? "#9CA3AF" : (useTechColor ? "#FFFFFF" : fallbackColors.text),
        editable: effectiveCanWrite && isLinkedToProject && !masked,
        extendedProps: {
          source: "schedule_block",
          renderKey,
          eventId: block.project_id,
          eventTechnicianId: assignmentMeta?.eventTechnicianId ?? null,
          technicianId: block.technician_id,
          scheduleBlockId: block.id,
          calendarEventId: assignmentMeta?.calendarEventId ?? null,
          outlookEventId: block.outlook_event_id || null,
          displayName: masked ? undefined : (block.technician_name || techName),
          isScheduleBlock: true,
          scheduleBlock: masked ? null : block,
          // Carry the calendar event so the click handler opens EventDrawer directly
          calendarEvent: masked ? undefined : (calEvent ?? undefined),
          customer: calEvent?.customer ?? undefined,
          status: calEvent?.status ?? undefined,
          jobNumber: calEvent ? ((calEvent as any).projectNumber || calEvent.internalNumber || calEvent.jobNumber || null) : null,
          techNames: assignmentMeta?.technicianNames ?? undefined,
          isMultiTech: assignmentMeta?.isMultiTech ?? false,
          baseColor: useTechColor ? techColor : (isLinkedToProject ? fallbackColors.bg : BUSY_GRAY),
          statusDot: calEvent ? (statusDotColors[calEvent.status] || "#FFFFFF") : "#FFFFFF",
          isOvernight,
          approvalSummary: calEvent ? (approvalSummaries.get(calEvent.id) ?? null) : null,
          dimmed: highlightEventIds && calEvent ? !highlightEventIds.has(calEvent.id) : false,
          isExternalMasked: masked,
          matchState: block.match_state,
          techName: masked ? undefined : techName,
          techFullName: masked ? undefined : block.technician_name,
          techAvatarId: masked ? undefined : (technicianMap.get(block.technician_id)?.avatarId || null),
          projectTitle: masked ? undefined : block.project_title,
          sourceLabel,
          blockSource: block.source,
          matchConfidence: masked ? undefined : block.match_confidence,
          matchReason: masked ? undefined : block.match_reason,
          blockStartAt: block.start_at,
          blockEndAt: block.end_at,
          outlookLocation: masked ? undefined : block.outlook_location,
          aiConfidence: masked ? undefined : block.ai_confidence,
          aiMatchReason: masked ? undefined : block.ai_match_reason,
          isLinkedToProject,
          assignedTechId: block.technician_id,
        },
      });
    }

    // ── Absence blocks ──
    // Absences render as regular slots in the technician's own color,
    // identical to task slots. Full-day absences default to an 8-hour
    // (480 min) block starting at the operating hour.
    for (const ab of absenceBlocks) {
      if (technicianId && ab.technicianId !== technicianId) continue;

      const techColor = techColorMap.get(ab.technicianId) || "#6B7280";
      const techFirstName = ab.technicianName?.split(" ")[0] || "";

      let start: Date;
      let end: Date;
      if (ab.isFullDay) {
        start = new Date(ab.date);
        start.setHours(operatingStartHour, 0, 0, 0);
        end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
      } else {
        const [sh, sm] = (ab.startTime || "08:00").split(":");
        const [eh, em] = (ab.endTime || "16:00").split(":");
        start = new Date(ab.date);
        start.setHours(parseInt(sh), parseInt(sm || "0"), 0, 0);
        end = new Date(ab.date);
        end.setHours(parseInt(eh), parseInt(em || "0"), 0, 0);
      }

      result.push({
        id: ab.id,
        title: `${ab.label} – ${techFirstName}`,
        start,
        end,
        allDay: false,
        backgroundColor: hexToRgba(techColor, 0.18),
        borderColor: techColor,
        textColor: techColor,
        editable: false,
        classNames: ["fc-event-absence"],
        extendedProps: {
          source: "absence" as const,
          renderKey: ab.id,
          isAbsence: true,
          absenceType: ab.absenceType,
          absenceLabel: ab.label,
          technicianId: ab.technicianId,
          techName: techFirstName,
          techFullName: ab.technicianName,
          comment: ab.comment,
          displayName: ab.technicianName,
          absenceAccent: techColor,
        },
      });
    }

    return result;
  }, [calendarEvents, getBusySlotsForDay, technicianId, technicianMap, techColorMap, referenceDate, effectiveCanWrite, effectiveCanViewExternal, hideExternalEvents, visibleScheduleBlocks, isMonthView, approvalSummaries, highlightEventIds, absenceBlocks]);

  // Holiday lookup map for date headers
  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    const yr = referenceDate.getFullYear();
    for (const y of [yr - 1, yr, yr + 1]) {
      for (const h of getNorwegianHolidays(y)) {
        const k = `${h.date.getFullYear()}-${String(h.date.getMonth() + 1).padStart(2, "0")}-${String(h.date.getDate()).padStart(2, "0")}`;
        map.set(k, h.name);
      }
    }
    return map;
  }, [referenceDate]);
  const handleEventClick = useCallback((info: EventClickArg) => {
    const props = info.event.extendedProps as Record<string, any>;

    console.info("[ResourceCalendar][Click]", {
      render_key: props.renderKey ?? info.event.id,
      source: props.source ?? "unknown",
      event_id: props.eventId ?? null,
      event_technician_id: props.eventTechnicianId ?? null,
      technician_id: props.technicianId ?? props.assignedTechId ?? null,
      schedule_block_id: props.scheduleBlockId ?? null,
      calendar_event_id: props.calendarEventId ?? null,
      outlook_event_id: props.outlookEventId ?? null,
      display_name: props.displayName ?? props.techFullName ?? props.techName ?? null,
      title: info.event.title,
      start: info.event.start?.toISOString?.() ?? null,
      end: info.event.end?.toISOString?.() ?? null,
      open_handler: "pending",
    });

    if (props.isExternalMasked) return;

    if (props.isScheduleBlock && props.scheduleBlock) {
      const scheduleBlock = props.scheduleBlock as ScheduleBlock;
      const matchingAssignmentEvent = scheduleBlock.project_id
        ? calendarEvents.find((ev) => {
            if (ev.id !== scheduleBlock.project_id) return false;
            const matchingTech = ev.technicians.find((t) => t.id === scheduleBlock.technician_id);
            if (!matchingTech) return false;
            const effectiveStart = matchingTech.startAt ?? ev.start;
            const effectiveEnd = matchingTech.endAt ?? ev.end;
            return effectiveStart.getTime() < scheduleBlock.end_at.getTime()
              && effectiveEnd.getTime() > scheduleBlock.start_at.getTime();
          })
        : undefined;

      if (matchingAssignmentEvent) {
        console.info("[ResourceCalendar][Click->EventDrawer]", {
          open_handler: "event_drawer(authoritative_assignment)",
          render_key: props.renderKey ?? info.event.id,
          source: props.source ?? "unknown",
          event_id: matchingAssignmentEvent.id,
          event_technician_id: props.eventTechnicianId ?? null,
          technician_id: scheduleBlock.technician_id,
          schedule_block_id: scheduleBlock.id,
          calendar_event_id: props.calendarEventId ?? null,
          outlook_event_id: props.outlookEventId ?? scheduleBlock.outlook_event_id ?? null,
          display_name: props.displayName ?? scheduleBlock.technician_name ?? null,
        });
        onEventClick?.(matchingAssignmentEvent, scheduleBlock.technician_id);
        return;
      }

      console.info("[ResourceCalendar][Click->ScheduleBlockDetail]", {
        open_handler: "schedule_block_detail_panel",
        render_key: props.renderKey ?? info.event.id,
        source: props.source ?? "unknown",
        event_id: scheduleBlock.project_id,
        event_technician_id: props.eventTechnicianId ?? null,
        technician_id: scheduleBlock.technician_id,
        schedule_block_id: scheduleBlock.id,
        calendar_event_id: props.calendarEventId ?? null,
        outlook_event_id: props.outlookEventId ?? scheduleBlock.outlook_event_id ?? null,
        display_name: props.displayName ?? scheduleBlock.technician_name ?? null,
      });
      onScheduleBlockClick?.(scheduleBlock);
      return;
    }

    if (props.isBusy) {
      const busyStart = info.event.start?.getTime() ?? 0;
      const busyEnd = info.event.end?.getTime() ?? busyStart;
      const busyTechId = props.busyTechId as string | undefined;
      if (busyTechId && visibleScheduleBlocks.length > 0) {
        const match = visibleScheduleBlocks.find(
          (sb) =>
            sb.technician_id === busyTechId &&
            sb.start_at.getTime() < busyEnd &&
            sb.end_at.getTime() > busyStart
        );
        if (match) {
          console.info("[ResourceCalendar][Click->ScheduleBlockDetail]", {
            open_handler: "schedule_block_detail_panel",
            render_key: props.renderKey ?? info.event.id,
            source: "busy_slot",
            event_id: match.project_id,
            event_technician_id: null,
            technician_id: match.technician_id,
            schedule_block_id: match.id,
            calendar_event_id: null,
            outlook_event_id: match.outlook_event_id ?? null,
            display_name: match.technician_name ?? null,
          });
          onScheduleBlockClick?.(match);
          return;
        }
      }
      if (busyTechId && onScheduleBlockClick) {
        const debugBlock: ScheduleBlock = {
          id: `debug-${busyTechId}-${busyStart}`,
          company_id: "",
          technician_id: busyTechId,
          project_id: null,
          job_id: null,
          outlook_event_id: null,
          calendar_id: null,
          source: "outlook",
          start_at: info.event.start || new Date(busyStart),
          end_at: info.event.end || new Date(busyEnd),
          title: props.techName ? `${props.techName} – opptatt` : "Opptatt",
          location: null,
          description: `NO_MATCH: ${visibleScheduleBlocks.length} schedule_blocks vurdert`,
          match_confidence: 0,
          match_reason: `Debug: busy slot uten schedule_block.`,
          match_state: "external",
          mcs_block_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          outlook_subject: props.techName ? `${props.techName} – opptatt (ekstern)` : "Opptatt (ekstern)",
          outlook_location: null,
          outlook_preview: null,
          outlook_weblink: null,
          outlook_organizer: null,
          ai_match_reason: null,
          ai_confidence: null,
          technician_name: props.techName || "Ukjent",
          technician_color: props.busyTechColor || null,
          project_title: null,
        };
        console.info("[ResourceCalendar][Click->ScheduleBlockDetail]", {
          open_handler: "schedule_block_detail_panel(debug_busy)",
          render_key: props.renderKey ?? info.event.id,
          source: "busy_slot",
          event_id: null,
          event_technician_id: null,
          technician_id: debugBlock.technician_id,
          schedule_block_id: debugBlock.id,
          calendar_event_id: null,
          outlook_event_id: null,
          display_name: debugBlock.technician_name ?? null,
        });
        onScheduleBlockClick(debugBlock);
      }
      return;
    }

    const calEvent = props.calendarEvent as CalendarEvent | undefined;
    if (calEvent) {
      console.info("[ResourceCalendar][Click->EventDrawer]", {
        open_handler: "event_drawer",
        render_key: props.renderKey ?? info.event.id,
        source: props.source ?? "calendar_event",
        event_id: calEvent.id,
        event_technician_id: props.eventTechnicianId ?? null,
        technician_id: (props.assignedTechId as string | undefined) ?? (props.technicianId as string | undefined) ?? null,
        schedule_block_id: props.scheduleBlockId ?? null,
        calendar_event_id: props.calendarEventId ?? null,
        outlook_event_id: props.outlookEventId ?? null,
        display_name: props.displayName ?? props.techFullName ?? props.techName ?? null,
      });
      const clickedTechId = (props.assignedTechId as string | undefined) ?? (props.technicianId as string | undefined) ?? undefined;
      onEventClick?.(calEvent, clickedTechId);
    }
  }, [calendarEvents, onEventClick, onScheduleBlockClick, visibleScheduleBlocks]);

  const handleDateSelect = useCallback((info: DateSelectArg) => {
    if (effectiveCanWrite) onDateSelect?.(info.start, info.end);
  }, [effectiveCanWrite, onDateSelect]);

  const handleEventDrop = useCallback((info: EventDropArg) => {
    if (info.event.extendedProps.isBusy) { info.revert(); return; }
    const rawId = info.event.id;
    const realId = rawId.includes("__tech__") ? rawId.split("__tech__")[0] : rawId;
    const droppedTechId = (info.event.extendedProps.assignedTechId as string | undefined) ?? undefined;
    onEventDrop?.(realId, info.event.start!, info.event.end!, droppedTechId);
  }, [onEventDrop]);

  const handleEventResize = useCallback((info: any) => {
    if (info.event.extendedProps.isBusy) { info.revert(); return; }
    const rawId = info.event.id;
    const realId = rawId.includes("__tech__") ? rawId.split("__tech__")[0] : rawId;
    const resizedTechId = (info.event.extendedProps.assignedTechId as string | undefined) ?? undefined;
    onEventResize?.(realId, info.event.start!, info.event.end!, resizedTechId);
  }, [onEventResize]);

  const handleExternalDrop = useCallback((info: any) => {
    const props = info.draggedEl?.dataset || {};
    const taskId = props.taskId || "";
    const title = props.taskTitle || "Oppgave";
    const minutes = parseInt(props.taskMinutes || "60", 10);
    const priority = props.taskPriority || "normal";
    const dropType = props.taskType || "task";
    const start = info.date as Date;
    const end = new Date(start.getTime() + minutes * 60000);
    onExternalDrop?.({ taskId, title, start, end, estimatedMinutes: minutes, priority, dropType });
  }, [onExternalDrop]);

  return (
    <TooltipProvider delayDuration={300}>
    <div ref={setWrapperRef} className="fc-wrapper rounded-2xl border border-border/30 bg-card shadow-card overflow-hidden">
      <FullCalendar
        key={`fc-${hideExternalEvents ? "hide" : "show"}-${isMonthView ? "month" : "other"}`}
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        initialView={calendarView}
        initialDate={referenceDate}
        headerToolbar={false}
        locale="nb"
        firstDay={1}
        height="auto"
        contentHeight="auto"
        scrollTimeReset={false}
        allDaySlot={false}
        slotMinTime={slotMinTime}
        slotMaxTime={slotMaxTime}
        slotDuration={slotDuration}
        slotLabelInterval="01:00:00"
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        weekends={true}
        nowIndicator={true}
        selectable={effectiveCanWrite}
        selectMirror={true}
        editable={effectiveCanWrite && !isMonthView}
        eventDurationEditable={effectiveCanWrite && !isMonthView}
        eventStartEditable={effectiveCanWrite && !isMonthView}
        snapDuration="00:15:00"
        droppable={!isMonthView}
        drop={handleExternalDrop}
        events={isMonthView ? [] : fcEvents}
        eventClick={handleEventClick}
        select={handleDateSelect}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        slotEventOverlap={true}
        eventOverlap={true}
        eventOrder="start,-duration,allDay,title"
        eventMaxStack={isMonthView ? 0 : 8}
        eventMinHeight={28}
        eventContent={(arg) => {
          const props = arg.event.extendedProps;

          if (calendarView === "listWeek") return undefined;

          // Absence block rendering
          if (props.isAbsence) {
            const accent = props.absenceAccent as string;
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="px-2 py-1 overflow-hidden h-full cursor-default select-none relative rounded-md"
                    style={{ borderLeft: `4px solid ${accent}`, color: accent }}
                  >
                    <div className="flex items-center gap-1">
                      <CalendarOff className="h-2.5 w-2.5 shrink-0" style={{ color: accent }} />
                      <p className="text-[11px] font-bold leading-tight truncate" style={{ color: accent }}>
                        {props.techName}
                      </p>
                    </div>
                    <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: accent }}>
                      {props.absenceLabel}
                    </p>
                    <span className="text-[8px] block opacity-70" style={{ color: accent }}>{arg.timeText}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="space-y-1 text-xs max-w-[220px]">
                    <p className="font-semibold" style={{ color: accent }}>{props.absenceLabel}</p>
                    <p>{props.techFullName}</p>
                    {props.comment && <p className="text-muted-foreground italic">{props.comment}</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          }

          // Schedule block rendering
          if (props.isScheduleBlock) {
            const StateIcon = props.matchState === "needs_confirmation" ? AlertTriangle
              : props.matchState === "external" ? Globe : CalendarCheck;
            const SourceIcon = props.blockSource === "outlook" ? CalendarCheck : Monitor;

            const tooltipContent = (
              <div className="space-y-1 text-xs max-w-[220px]">
                <p className="font-semibold">{arg.event.title}</p>
                <p className="text-muted-foreground">
                  {props.blockStartAt ? format(props.blockStartAt, "EEE d. MMM HH:mm", { locale: nb }) : ""} – {props.blockEndAt ? format(props.blockEndAt, "HH:mm") : ""}
                </p>
                {props.projectTitle && <p>Prosjekt: {props.projectTitle}</p>}
                <p>Kilde: {props.sourceLabel}</p>
                {props.matchState === "needs_confirmation" && (
                  <>
                    <p className="text-amber-400">⚠ Trenger bekreftelse ({props.matchConfidence}%)</p>
                    {props.matchReason && <p className="text-muted-foreground italic">{props.matchReason}</p>}
                  </>
                )}
              </div>
            );

            if (isMonthView) {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] truncate">
                      <StateIcon className="h-2.5 w-2.5 shrink-0 opacity-80" />
                      <span className="truncate">{arg.event.title}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">{tooltipContent}</TooltipContent>
                </Tooltip>
              );
            }
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="px-2 py-1 overflow-hidden h-full cursor-pointer select-none">
                    <div className="flex items-center gap-1">
                      {props.techAvatarId ? (
                        <TechAvatar name={props.techFullName || props.techName || ""} avatarId={props.techAvatarId} size={20} />
                      ) : (
                        <StateIcon className="h-3 w-3 shrink-0 opacity-80" />
                      )}
                      <p className="text-[11px] font-bold leading-tight truncate">
                        {props.techName}
                      </p>
                      <span className="ml-auto flex items-center gap-0.5 text-[7px] font-semibold uppercase tracking-wider opacity-60 bg-white/15 rounded px-1 shrink-0">
                        <SourceIcon className="h-2 w-2" />
                        {props.sourceLabel}
                      </span>
                    </div>
                    <p className="text-[10px] font-medium truncate mt-0.5">{arg.event.title}</p>
                    {props.projectTitle && (
                      <p className="text-[9px] opacity-70 truncate">{props.projectTitle}</p>
                    )}
                    <span className="text-[8px] opacity-50 block">{arg.timeText}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">{tooltipContent}</TooltipContent>
              </Tooltip>
            );
          }

          // Month view – compact
          if (isMonthView) {
            if (props.isBusy) {
              return (
                <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] truncate cursor-pointer">
                   <Lock className="h-2.5 w-2.5 opacity-50 shrink-0" />
                   <span className="truncate">{props.techName || "Ukjent montør"}</span>
                </div>
              );
            }
            return (
              <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: props.baseColor }}
                />
                <span className="text-[10px] font-semibold truncate text-white">{arg.event.title}</span>
                {props.techName && <span className="text-[9px] opacity-60 truncate">· {props.techName}</span>}
              </div>
            );
          }

          // Day/Week view – busy slot
          if (props.isBusy) {
            const busyTooltip = (
              <div className="space-y-1 text-xs max-w-[220px]">
                <p className="font-semibold">{props.techName || "Ukjent montør"} – Opptatt</p>
                <p className="text-muted-foreground">{arg.timeText}</p>
                <p className="text-muted-foreground">Ekstern kalenderavtale</p>
              </div>
            );
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="fc-event-external flex items-center gap-1.5 px-2 py-1 cursor-pointer select-none h-full">
                    <Lock className="h-3 w-3 opacity-50 shrink-0" />
                    <div className="min-w-0 flex-1">
                      {props.techName && (
                        <p className="text-[10px] font-bold truncate">{props.techName}</p>
                      )}
                      <span className="text-[9px] font-medium truncate block">Opptatt</span>
                      <span className="text-[8px] opacity-60">{arg.timeText}</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">{busyTooltip}</TooltipContent>
              </Tooltip>
            );
          }

          // ── Regular event – assignment-based block ──
          const acceptanceInfo = ACCEPTANCE_ICON_MAP[props.status as string];
          const approvalSum = props.approvalSummary as ApprovalSummary | null;

          // Risk: starting within 12h and still has pending responses
          const calEvent = props.calendarEvent as CalendarEvent | undefined;
          const hoursUntilStart = calEvent ? (calEvent.start.getTime() - Date.now()) / (1000 * 60 * 60) : Infinity;
          const isRisk = approvalSum && approvalSum.pending > 0 && hoursUntilStart > 0 && hoursUntilStart < 12;

          // Determine up to 2 status icons (priority: ❗ → ⏱ → ⚡ → 🚫 → ✅)
          const statusIcons: Array<{ icon: typeof Check; className: string; title: string }> = [];
          if (approvalSum) {
            if (approvalSum.declined > 0 || approvalSum.changeRequest > 0) {
              statusIcons.push({ icon: AlertTriangle, className: "text-red-300", title: "Avslått/tidsendring" });
            }
            if (approvalSum.pending > 0) {
              statusIcons.push({ icon: Clock, className: "text-amber-300", title: "Venter på svar" });
            }
            if (approvalSum.reminderProfile === "urgent") {
              statusIcons.push({ icon: Zap, className: "text-amber-300", title: "Haster" });
            }
            if (approvalSum.reminderProfile === "none" || !approvalSum.responseRequired) {
              statusIcons.push({ icon: BellOff, className: "text-white/50", title: "Ingen påminnelse" });
            }
            if (approvalSum.total > 0 && approvalSum.approved === approvalSum.total) {
              statusIcons.push({ icon: Check, className: "text-emerald-300", title: "Alle godkjent" });
            }
          }
          const visibleIcons = statusIcons.slice(0, 2);

          // Progress label for multi-tech
          const progressLabel = approvalSum && approvalSum.total > 1
            ? `${approvalSum.approved}/${approvalSum.total}`
            : null;

          // Enhanced tooltip
          const nextReminder = approvalSum && calEvent
            ? getNextReminderInfo(approvalSum, calEvent.start)
            : null;

          const profileLabels: Record<string, string> = {
            standard: "Standard", urgent: "Haster", none: "Ingen", company_default: "Selskapsstandard", custom: "Egendefinert",
          };

          const eventTooltip = (
            <div className="space-y-1.5 text-xs max-w-[260px]">
              <p className="font-semibold">{arg.event.title}</p>
              {props.jobNumber && <p className="font-mono text-[10px] text-white/80">{props.jobNumber}</p>}
              {props.customer && <p className="text-muted-foreground">Kunde: {props.customer}</p>}
              <p className="text-muted-foreground">{arg.timeText}</p>
              {props.techNames && <p>Montører: {props.techNames}</p>}
              {calEvent?.address && (
                <p className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {calEvent.address}
                </p>
              )}
              {approvalSum && approvalSum.total > 0 && (
                <div className="border-t border-border/30 pt-1.5 space-y-0.5">
                  <p className="font-medium">
                    Svar: {approvalSum.approved}/{approvalSum.total} godkjent
                    {approvalSum.declined > 0 && ` · ${approvalSum.declined} avslått`}
                    {approvalSum.changeRequest > 0 && ` · ${approvalSum.changeRequest} tidsendring`}
                  </p>
                  {nextReminder && (
                    <p className="text-muted-foreground">
                      {nextReminder.nextAt
                        ? `Neste påminnelse: ${format(nextReminder.nextAt, "HH:mm", { locale: nb })}`
                        : nextReminder.label}
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    Profil: {profileLabels[approvalSum.reminderProfile || "standard"] || approvalSum.reminderProfile}
                  </p>
                </div>
              )}
            </div>
          );

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "fc-event-internal px-2 py-1 overflow-hidden h-full cursor-grab active:cursor-grabbing select-none relative",
                    props.dimmed && "opacity-25 transition-opacity",
                    isRisk && "ring-1 ring-red-400/60"
                  )}
                >
                  <div className="flex items-center gap-1">
                    {props.techAvatarId && (
                      <TechAvatar name={props.techFullName || props.techName || ""} avatarId={props.techAvatarId} size={20} />
                    )}
                    {props.isOvernight && (
                      <Moon className="h-2.5 w-2.5 shrink-0 text-white/80" />
                    )}
                    <p className="text-[11px] font-bold leading-tight truncate text-white/90">
                      {props.techName}
                    </p>
                    {props.isMultiTech && (
                      <Users className="h-2.5 w-2.5 shrink-0 text-white/60" />
                    )}
                    {/* Progress badge for multi-tech */}
                    {progressLabel && (
                      <span className="text-[8px] font-bold bg-white/20 text-white/90 rounded px-1 shrink-0">
                        {progressLabel}
                      </span>
                    )}
                    {props.jobNumber && (
                      <span className="text-[8px] font-mono font-semibold bg-white/20 text-white/90 rounded px-1 shrink-0 ml-auto">
                        {props.jobNumber}
                      </span>
                    )}
                    {/* Status icons (max 2) */}
                    {visibleIcons.map((si, idx) => {
                      const SIcon = si.icon;
                      return (
                        <span key={idx} className={cn("shrink-0", idx === 0 && !props.jobNumber ? "ml-auto" : "")} title={si.title}>
                          <SIcon className={cn("h-2.5 w-2.5", si.className)} />
                        </span>
                      );
                    })}
                    {/* Fallback: legacy acceptance icon if no approval summary */}
                    {visibleIcons.length === 0 && (() => {
                      const ai = ACCEPTANCE_ICON_MAP[props.status as string];
                      if (ai) {
                        const AccIcon = ai.Icon;
                        return (
                          <span className={cn("shrink-0", props.jobNumber ? "" : "ml-auto")} title={ai.title}>
                            <AccIcon className={cn("h-2.5 w-2.5", ai.className)} />
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <p className="text-[11px] font-semibold leading-tight truncate text-white">
                    {arg.event.title}
                  </p>
                  {props.customer && (
                    <p className="text-[9px] text-white/70 truncate">{props.customer}</p>
                  )}
                  <span className="text-[8px] text-white/50 block">{arg.timeText}</span>
                  {isRisk && (
                    <span className="absolute bottom-0.5 right-1 text-[7px] font-bold uppercase tracking-wider bg-red-500/80 text-white rounded px-1 py-px">
                      ⚠ Risiko
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">{eventTooltip}</TooltipContent>
            </Tooltip>
          );
        }}
        dayHeaderContent={(arg) => {
          const isToday = new Date().toDateString() === arg.date.toDateString();
          const dateKey = `${arg.date.getFullYear()}-${String(arg.date.getMonth() + 1).padStart(2, "0")}-${String(arg.date.getDate()).padStart(2, "0")}`;
          const holidayName = holidayMap.get(dateKey);
          if (isMonthView) {
            return (
              <div className="py-1.5 text-center">
                <div className={cn("text-xs uppercase tracking-widest font-semibold", isToday ? "text-primary" : "text-muted-foreground")}>
                  {arg.date.toLocaleDateString("nb-NO", { weekday: "short" })}
                </div>
                {holidayName && (
                  <div className="mt-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-400 truncate max-w-[80px] mx-auto">
                    {holidayName}
                  </div>
                )}
              </div>
            );
          }
          const dayCap = dayCapacities?.find(
            (d) => d.date.toDateString() === arg.date.toDateString()
          );
          return (
            <div className={`py-1.5 text-center ${isToday ? "text-primary font-bold" : ""}`}>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {arg.date.toLocaleDateString("nb-NO", { weekday: "short" })}
              </div>
              <div className={`text-base font-bold ${isToday ? "text-primary" : ""}`}>
                {arg.date.getDate()}
              </div>
              {holidayName && (
                <div className="mt-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-px inline-block">
                  <span className="text-[9px] font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap">
                    {holidayName}
                  </span>
                </div>
              )}
              {dayCap && (
                <div className="mt-0.5 flex flex-col items-center gap-0.5">
                  <div className="w-8 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(dayCap.percent, 100)}%`,
                        backgroundColor: dayCap.color,
                      }}
                    />
                  </div>
                  <span className="text-[8px] font-semibold" style={{ color: dayCap.color }}>
                    {dayCap.label}
                  </span>
                </div>
              )}
            </div>
          );
        }}
        dayCellDidMount={isMonthView ? (arg) => {
          const dk = `${arg.date.getFullYear()}-${String(arg.date.getMonth() + 1).padStart(2, "0")}-${String(arg.date.getDate()).padStart(2, "0")}`;
          const summary = monthDaySummaries.get(dk);
          const el = arg.el;
          if (!summary || summary.eventCount === 0) {
            el.style.backgroundColor = "";
            return;
          }
          const pct = summary.percent;
          if (summary.risk > 0) {
            el.style.backgroundColor = `hsl(0 65% 52% / ${Math.min(0.12 + pct * 0.001, 0.18)})`;
          } else if (pct >= 80) {
            el.style.backgroundColor = `hsl(38 92% 50% / ${Math.min(0.08 + pct * 0.001, 0.16)})`;
          } else if (pct >= 40) {
            el.style.backgroundColor = `hsl(38 92% 50% / 0.06)`;
          } else {
            el.style.backgroundColor = `hsl(152 50% 38% / ${Math.min(0.04 + pct * 0.001, 0.10)})`;
          }
        } : undefined}
        dayCellContent={isMonthView ? (arg) => {
          const isToday = new Date().toDateString() === arg.date.toDateString();
          const dk = `${arg.date.getFullYear()}-${String(arg.date.getMonth() + 1).padStart(2, "0")}-${String(arg.date.getDate()).padStart(2, "0")}`;
          const summary = monthDaySummaries.get(dk);

          return (
            <div
              className="w-full h-full p-1 cursor-pointer min-h-[80px] flex flex-col"
              onClick={() => onMonthDayClick?.(arg.date)}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  "text-sm font-bold tabular-nums",
                  isToday ? "text-primary-foreground bg-primary rounded-full w-6 h-6 flex items-center justify-center" : "text-foreground",
                  arg.isOther && "text-muted-foreground/40"
                )}>
                  {arg.date.getDate()}
                </span>
                {summary && summary.percent >= 80 && (
                  <span className="h-2 w-2 rounded-full bg-warning shrink-0" title={`${Math.round(summary.percent)}% belastning`} />
                )}
                {summary && summary.risk > 0 && (
                  <span className="h-2 w-2 rounded-full bg-destructive shrink-0" title={`${summary.risk} risikoer`} />
                )}
              </div>

              {/* Day summary */}
              {summary && summary.eventCount > 0 && !arg.isOther && (
                <div className="flex flex-col gap-0.5 mt-auto">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="font-semibold text-foreground">{summary.eventCount} oppdr.</span>
                    <span className="text-muted-foreground">· {summary.techCount} mont.</span>
                  </div>
                  {(summary.pending > 0 || summary.risk > 0) && (
                    <div className="flex items-center gap-1.5 text-[9px]">
                      {summary.pending > 0 && (
                        <span className="flex items-center gap-0.5 text-warning font-medium">
                          <Clock className="h-2 w-2" />{summary.pending}
                        </span>
                      )}
                      {summary.risk > 0 && (
                        <span className="flex items-center gap-0.5 text-destructive font-medium">
                          <AlertTriangle className="h-2 w-2" />{summary.risk}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Capacity bar */}
                  <div className="w-full h-1 rounded-full bg-muted overflow-hidden mt-0.5">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(summary.percent, 100)}%`,
                        backgroundColor: summary.risk > 0
                          ? "hsl(0 65% 52%)"
                          : summary.percent >= 80
                            ? "hsl(38 92% 50%)"
                            : summary.percent >= 40
                              ? "hsl(38 92% 50% / 0.7)"
                              : "hsl(152 50% 38%)",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        } : undefined}
        loading={() => {}}
      />
    </div>
    </TooltipProvider>
  );
});
