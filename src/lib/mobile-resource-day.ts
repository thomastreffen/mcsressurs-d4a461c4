import { addDays, startOfDay } from "date-fns";
import type { ScheduleBlock } from "@/hooks/useScheduleBlocks";

/** Same block identity/richness rules as TeamView, with overlap for overnight work. */
export function resourceBlocksForDay(blocks: ScheduleBlock[], day: Date, technicianId: string): ScheduleBlock[] {
  const start = startOfDay(day).getTime();
  const end = addDays(startOfDay(day), 1).getTime();
  const unique = new Map<string, ScheduleBlock>();
  for (const block of blocks) {
    if ((block as ScheduleBlock & { deleted_at?: string }).deleted_at || block.technician_id !== technicianId || block.start_at.getTime() >= end || block.end_at.getTime() <= start) continue;
    const key = `${block.job_id ?? block.project_id ?? block.id}|${block.technician_id}|${block.start_at.toISOString()}|${block.end_at.toISOString()}`;
    const old = unique.get(key);
    if (!old || (Number(!!block.job_id) * 2 + Number(!!block.project_id)) > (Number(!!old.job_id) * 2 + Number(!!old.project_id))) unique.set(key, block);
  }
  return [...unique.values()].sort((a, b) => a.start_at.getTime() - b.start_at.getTime());
}