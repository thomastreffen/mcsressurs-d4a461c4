import { useMemo } from "react";
import { startOfWeek, addDays } from "date-fns";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";
import type { ExternalBusySlot } from "@/hooks/useExternalBusy";

const DEFAULT_WEEKLY_MINUTES = 2400; // 40h
const DEFAULT_WORK_DAY_MINUTES = 480; // 8h
const MIRROR_TOLERANCE_MINUTES = 5;

type Interval = { startMs: number; endMs: number };

export interface DayCapacity {
  date: Date;
  bookedMinutes: number;
  externalMinutes: number;
  totalMinutes: number;
  /** Minutes consumed by absence/ferie that day (e.g. full day = workDayMinutes) */
  absenceMinutes: number;
  /** Effective capacity for this day after subtracting absence */
  availableMinutes: number;
  /** True when person is fully absent (availableMinutes === 0) */
  isAbsence: boolean;
  percent: number;
  color: string;
  label: string;
}

export interface TechDayCapacity {
  techId: string;
  days: DayCapacity[];
  weekPercent: number;
  weekPlannedMinutes: number;
  /** Weekly capacity in minutes, already reduced by absence */
  weekCapacityMinutes: number;
  overtimeMinutes: number;
  weekAbsenceMinutes: number;
  weekPlannedHours: number;
  weekCapacityHours: number;
  overtimeHours: number;
  weekAbsenceHours: number;
}

/** Absence input: per technician → per day-key (yyyy-MM-dd) → minutes absent */
export type AbsenceMinutesMap = Map<string, Map<string, number>>;

function capacityColor(percent: number): string {
  if (percent > 100) return "#7F1D1D";
  if (percent >= 90) return "#DC2626";
  if (percent >= 50) return "#F59E0B";
  return "#22C55E";
}

function capacityLabel(percent: number): string {
  if (percent > 100) return "Overbooket";
  if (percent >= 90) return "Full dag";
  if (percent >= 50) return `${Math.round(percent)}%`;
  if (percent > 0) return `${Math.round(percent)}%`;
  return "Ledig";
}

function toDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeInterval(start: Date, end: Date): Interval {
  const startMs = start.getTime();
  let endMs = end.getTime();
  if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

function splitIntervalByDay(start: Date, end: Date): Array<{ dayKey: string; minutes: number }> {
  const normalized = normalizeInterval(start, end);
  const chunks: Array<{ dayKey: string; minutes: number }> = [];
  let cursor = normalized.startMs;
  while (cursor < normalized.endMs) {
    const cursorDate = new Date(cursor);
    const dayStart = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), cursorDate.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const segmentEnd = Math.min(normalized.endMs, dayEnd.getTime());
    const minutes = Math.max(0, Math.round((segmentEnd - cursor) / 60000));
    if (minutes > 0) chunks.push({ dayKey: toDayKey(dayStart), minutes });
    cursor = segmentEnd;
  }
  return chunks;
}

function roundToMinute(ms: number): number {
  return Math.round(ms / 60000);
}

function overlapMinutes(a: Interval, b: Interval): number {
  const overlapStart = Math.max(a.startMs, b.startMs);
  const overlapEnd = Math.min(a.endMs, b.endMs);
  return Math.max(0, roundToMinute(overlapEnd - overlapStart));
}

function isLikelyMirrored(slot: Interval, internal: Interval): boolean {
  const slotMinutes = roundToMinute(slot.endMs - slot.startMs);
  const internalMinutes = roundToMinute(internal.endMs - internal.startMs);
  if (slotMinutes <= 0 || internalMinutes <= 0) return false;
  const overlap = overlapMinutes(slot, internal);
  const minDuration = Math.min(slotMinutes, internalMinutes);
  const overlapRatio = minDuration > 0 ? overlap / minDuration : 0;
  const closeStart = Math.abs(roundToMinute(slot.startMs - internal.startMs)) <= MIRROR_TOLERANCE_MINUTES;
  const closeEnd = Math.abs(roundToMinute(slot.endMs - internal.endMs)) <= MIRROR_TOLERANCE_MINUTES;
  return overlapRatio >= 0.95 || (closeStart && closeEnd);
}

export function useCapacity(
  events: CalendarEvent[],
  busySlots: ExternalBusySlot[],
  referenceDate: Date,
  technicianIds: string[],
  workDayMinutes: number = DEFAULT_WORK_DAY_MINUTES,
  weeklyCapacityMinutes: number = DEFAULT_WEEKLY_MINUTES,
  absenceMinutesByTechByDay?: AbsenceMinutesMap
) {
  return useMemo(() => {
    const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekDayKeys = new Set(weekDays.map((d) => toDayKey(d)));

    const internalByTechByDay = new Map<string, Map<string, number>>();
    const internalIntervalsByTech = new Map<string, Interval[]>();

    const seenInternal = new Set<string>();
    for (const ev of events) {
      const normalized = normalizeInterval(ev.start, ev.end);
      for (const tech of ev.technicians) {
        const techId = tech.id;
        const internalKey = `${ev.id}|${techId}|${roundToMinute(normalized.startMs)}|${roundToMinute(normalized.endMs)}`;
        if (seenInternal.has(internalKey)) continue;
        seenInternal.add(internalKey);
        if (!internalByTechByDay.has(techId)) internalByTechByDay.set(techId, new Map());
        if (!internalIntervalsByTech.has(techId)) internalIntervalsByTech.set(techId, []);
        internalIntervalsByTech.get(techId)!.push(normalized);
        const chunks = splitIntervalByDay(ev.start, ev.end);
        const dayMap = internalByTechByDay.get(techId)!;
        for (const chunk of chunks) {
          if (!weekDayKeys.has(chunk.dayKey)) continue;
          dayMap.set(chunk.dayKey, (dayMap.get(chunk.dayKey) || 0) + chunk.minutes);
        }
      }
    }

    const externalByTechByDay = new Map<string, Map<string, number>>();
    const seenExternal = new Set<string>();
    for (const slot of busySlots) {
      const normalized = normalizeInterval(slot.start, slot.end);
      const externalKey = `${slot.technicianId}|${roundToMinute(normalized.startMs)}|${roundToMinute(normalized.endMs)}`;
      if (seenExternal.has(externalKey)) continue;
      seenExternal.add(externalKey);
      // Do not hide external commitments merely because a Hub job covers the same time.
      if (!externalByTechByDay.has(slot.technicianId)) externalByTechByDay.set(slot.technicianId, new Map());
      const dayMap = externalByTechByDay.get(slot.technicianId)!;
      const chunks = splitIntervalByDay(slot.start, slot.end);
      for (const chunk of chunks) {
        if (!weekDayKeys.has(chunk.dayKey)) continue;
        dayMap.set(chunk.dayKey, (dayMap.get(chunk.dayKey) || 0) + chunk.minutes);
      }
    }

    const dayPercent = (planned: number, available: number, isAbsence: boolean) => {
      if (isAbsence && available === 0) return 0;
      if (available <= 0) return planned > 0 ? 100 : 0;
      return (planned / available) * 100;
    };
    const dayLabel = (planned: number, available: number, isAbsence: boolean) => {
      if (isAbsence && available === 0) return "Ferie";
      return capacityLabel(dayPercent(planned, available, isAbsence));
    };

    // Per-tech capacity with weekly totals
    const techCapacities: TechDayCapacity[] = technicianIds.map((techId) => {
      const days: DayCapacity[] = [];
      let weekPlannedMinutes = 0;
      let weekAbsenceMinutes = 0;

      const internalDayMap = internalByTechByDay.get(techId) || new Map<string, number>();
      const externalDayMap = externalByTechByDay.get(techId) || new Map<string, number>();
      const absenceDayMap = absenceMinutesByTechByDay?.get(techId) || new Map<string, number>();

      for (let i = 0; i < 7; i++) {
        const day = addDays(weekStart, i);
        const dayKey = toDayKey(day);
        const bookedMinutes = internalDayMap.get(dayKey) || 0;
        const rawExternal = externalDayMap.get(dayKey) || 0;
        const absenceMinutes = Math.min(workDayMinutes, absenceDayMap.get(dayKey) || 0);
        // Strip external busy that is just the mirrored absence (oof) so it doesn't
        // double-count as planned load on a ferie day.
        const externalMinutes = absenceMinutes > 0
          ? Math.max(0, rawExternal - absenceMinutes)
          : rawExternal;
        const availableMinutes = Math.max(0, workDayMinutes - absenceMinutes);
        const isAbsence = absenceMinutes >= workDayMinutes;
        const totalMinutes = bookedMinutes + externalMinutes;
        const percent = dayPercent(totalMinutes, availableMinutes, isAbsence);

        days.push({
          date: day,
          bookedMinutes,
          externalMinutes,
          totalMinutes,
          absenceMinutes,
          availableMinutes,
          isAbsence,
          percent,
          color: capacityColor(percent),
          label: dayLabel(totalMinutes, availableMinutes, isAbsence),
        });

        weekPlannedMinutes += totalMinutes;
        weekAbsenceMinutes += absenceMinutes;
      }

      const effectiveWeekCapacity = Math.max(0, weeklyCapacityMinutes - weekAbsenceMinutes);
      const weekPercent = effectiveWeekCapacity > 0
        ? (weekPlannedMinutes / effectiveWeekCapacity) * 100
        : (weekPlannedMinutes > 0 ? 100 : 0);
      const overtimeMinutes = Math.max(0, weekPlannedMinutes - effectiveWeekCapacity);

      return {
        techId,
        days,
        weekPercent,
        weekPlannedMinutes,
        weekCapacityMinutes: effectiveWeekCapacity,
        overtimeMinutes,
        weekAbsenceMinutes,
        weekPlannedHours: Math.round((weekPlannedMinutes / 60) * 10) / 10,
        weekCapacityHours: Math.round((effectiveWeekCapacity / 60) * 10) / 10,
        overtimeHours: Math.round((overtimeMinutes / 60) * 10) / 10,
        weekAbsenceHours: Math.round((weekAbsenceMinutes / 60) * 10) / 10,
      };
    });

    // Aggregated day capacity
    const aggregatedDays: DayCapacity[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      let totalBooked = 0;
      let totalExternal = 0;
      let totalAbsence = 0;
      let totalAvailable = 0;
      for (const techCap of techCapacities) {
        totalBooked += techCap.days[i].bookedMinutes;
        totalExternal += techCap.days[i].externalMinutes;
        totalAbsence += techCap.days[i].absenceMinutes;
        totalAvailable += techCap.days[i].availableMinutes;
      }
      const totalMinutes = totalBooked + totalExternal;
      const percent = totalAvailable > 0 ? (totalMinutes / totalAvailable) * 100 : 0;
      aggregatedDays.push({
        date: day,
        bookedMinutes: totalBooked,
        externalMinutes: totalExternal,
        totalMinutes,
        absenceMinutes: totalAbsence,
        availableMinutes: totalAvailable,
        isAbsence: totalAvailable === 0 && totalAbsence > 0,
        percent,
        color: capacityColor(percent),
        label: capacityLabel(percent),
      });
    }

    const availableTechIds = (dayIndex: number) =>
      techCapacities.filter((tc) => !tc.days[dayIndex].isAbsence && tc.days[dayIndex].percent < 50).map((tc) => tc.techId);
    const partialTechIds = (dayIndex: number) =>
      techCapacities.filter((tc) => !tc.days[dayIndex].isAbsence && tc.days[dayIndex].percent >= 50 && tc.days[dayIndex].percent < 90).map((tc) => tc.techId);

    return { techCapacities, aggregatedDays, availableTechIds, partialTechIds };
  }, [events, busySlots, referenceDate, technicianIds, workDayMinutes, weeklyCapacityMinutes, absenceMinutesByTechByDay]);
}
