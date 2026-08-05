import { useMemo, useState } from "react";
import { addDays, startOfWeek, format, isSameDay } from "date-fns";
import { nb } from "date-fns/locale";
import { Palmtree, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ScheduleBlock } from "@/hooks/useScheduleBlocks";
import type { AbsenceBlock } from "@/hooks/useAbsenceBlocks";
import type { TechDayCapacity } from "@/hooks/useCapacity";

const TECH_COLOR_PRESETS = [
  "#D50000", "#F4511E", "#E67C73", "#F09300",
  "#F6BF26", "#33B679", "#0B8043", "#7CB342",
  "#039BE5", "#3F51B5", "#7986CB", "#8E24AA",
  "#616161", "#795548", "#009688", "#C0CA33",
];

/** Convert hex (#RRGGBB) to "r, g, b" string for rgba() use */
function hexToRgb(hex: string): string {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return "100, 100, 100";
  const [r, g, b] = m.map((h) => parseInt(h, 16));
  return `${r}, ${g}, ${b}`;
}

export type TeamStatusKey =
  | "approved"
  | "scheduled"
  | "in_progress"
  | "rejected"
  | "requested"
  | "time_change_proposed"
  | "absence";

export const TEAM_STATUS_OPTIONS: { key: TeamStatusKey; label: string; swatch: string }[] = [
  { key: "approved", label: "Godkjent", swatch: "bg-emerald-400 border-emerald-500" },
  { key: "scheduled", label: "Planlagt", swatch: "bg-sky-400 border-sky-500" },
  { key: "in_progress", label: "Pågår", swatch: "bg-amber-400 border-amber-500" },
  { key: "requested", label: "Forespurt", swatch: "bg-violet-400 border-violet-500" },
  { key: "time_change_proposed", label: "Tidsendring foreslått", swatch: "bg-orange-400 border-orange-500" },
  { key: "rejected", label: "Avslått", swatch: "bg-rose-400 border-rose-500" },
  { key: "absence", label: "Ferie/fravær", swatch: "bg-stone-300 border-stone-400 border-dashed" },
];

export function blockStatusKey(status?: string | null): TeamStatusKey {
  switch (status) {
    case "approved":
    case "completed":
    case "ready_for_invoicing":
    case "invoiced":
      return "approved";
    case "in_progress":
      return "in_progress";
    case "rejected":
    case "cancelled":
      return "rejected";
    case "requested":
      return "requested";
    case "time_change_proposed":
      return "time_change_proposed";
    default:
      return "scheduled";
  }
}

interface TechMeta {
  name: string;
  color: string | null;
  avatarId?: string | null;
}

interface TeamViewProps {
  referenceDate: Date;
  technicians: Array<{ id: string; name: string; color?: string | null }>;
  technicianMap: Map<string, TechMeta>;
  scheduleBlocks: ScheduleBlock[];
  absenceBlocks: AbsenceBlock[];
  techCapacities?: TechDayCapacity[];
  visibleStatuses?: Set<TeamStatusKey>;
  onBlockClick?: (block: ScheduleBlock) => void;
  onCellCreate?: (techId: string, day: Date) => void;
  onTechColorChange?: (techId: string, color: string) => void;
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function fmtHour(d: Date) {
  return format(d, "H");
}

/**
 * Status tones — stronger contrast for at-a-glance status read.
 * Left border accent + tinted bg + matching text color.
 *
 * VIKTIG: Violett/lilla tone er RESERVERT for schedule_blocks som er
 * AI-uavklart / unmatched / needs_confirmation (match_state-drevet), IKKE for
 * approval-status "requested" på en job-linked blokk. En vanlig planlagt
 * jobb som ennå ikke er godkjent skal se ut som "planlagt" (sky/blå).
 */
function statusTone(block: { job_status?: string | null; job_id?: string | null; match_state?: string | null }) {
  if (!block.job_id && (block.match_state === "needs_confirmation" || block.match_state === "external")) {
    return "bg-violet-50 border-violet-300 border-l-[3px] border-l-violet-500 text-violet-950 dark:bg-violet-950/40 dark:border-violet-800 dark:border-l-violet-400 dark:text-violet-50";
  }
  switch (block.job_status) {
    case "approved":
    case "completed":
    case "ready_for_invoicing":
    case "invoiced":
      return "bg-emerald-50 border-emerald-300 border-l-[3px] border-l-emerald-500 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-800 dark:border-l-emerald-400 dark:text-emerald-50";
    case "in_progress":
      return "bg-amber-50 border-amber-300 border-l-[3px] border-l-amber-500 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:border-l-amber-400 dark:text-amber-50";
    case "rejected":
    case "cancelled":
      return "bg-rose-50 border-rose-300 border-l-[3px] border-l-rose-500 text-rose-950 dark:bg-rose-950/40 dark:border-rose-800 dark:border-l-rose-400 dark:text-rose-50";
    case "time_change_proposed":
      return "bg-orange-50 border-orange-300 border-l-[3px] border-l-orange-500 text-orange-950 dark:bg-orange-950/40 dark:border-orange-800 dark:border-l-orange-400 dark:text-orange-50";
    default:
      return "bg-sky-50 border-sky-300 border-l-[3px] border-l-sky-500 text-sky-950 dark:bg-sky-950/40 dark:border-sky-800 dark:border-l-sky-400 dark:text-sky-50";
  }
}

function statusDot(block: { job_status?: string | null; job_id?: string | null; match_state?: string | null }) {
  if (!block.job_id && (block.match_state === "needs_confirmation" || block.match_state === "external")) {
    return "bg-violet-500";
  }
  switch (block.job_status) {
    case "approved":
    case "completed":
    case "ready_for_invoicing":
    case "invoiced":
      return "bg-emerald-500";
    case "in_progress":
      return "bg-amber-500";
    case "rejected":
    case "cancelled":
      return "bg-rose-500";
    case "time_change_proposed":
      return "bg-orange-500";
    default:
      return "bg-sky-500";
  }
}

/** Capacity utilisation color: green=normal, amber=high, red=overbooked */
function utilColor(p: number) {
  if (p > 100) return "text-rose-600 font-semibold";
  if (p >= 85) return "text-amber-600 font-semibold";
  if (p >= 40) return "text-emerald-600 font-medium";
  if (p > 0) return "text-emerald-700/70";
  return "text-muted-foreground/50";
}

/**
 * RESSURSPLAN — DATA-SOURCE-OF-TRUTH-KONTRAKT
 * ───────────────────────────────────────────
 * • schedule_blocks.start_at  → bestemmer DAG-KOLONNE (kun denne!)
 * • schedule_blocks.end_at    → bestemmer sluttid
 * • schedule_blocks.technician_id → bestemmer RAD
 * • schedule_blocks.job_id    → peker på aktivitet (events m/ project_type="task")
 * • schedule_blocks.project_id → peker på hovedprosjekt (events m/ project_type="project")
 *
 * events.start_time / end_time MÅ ALDRI brukes til plassering i matrisen.
 * Parent-prosjektets dato/tid skal heller ALDRI påvirke kolonneplassering.
 * events brukes kun for tittel/status/kunde/jobnummer/drawer-åpning.
 * event_technicians eies av aktiviteten (job_id), ikke parent-prosjektet.
 */
export function TeamView({
  referenceDate,
  technicians,
  technicianMap,
  scheduleBlocks,
  absenceBlocks,
  techCapacities,
  visibleStatuses,
  onBlockClick,
  onCellCreate,
  onTechColorChange,
}: TeamViewProps) {
  const [colorPickerOpenFor, setColorPickerOpenFor] = useState<string | null>(null);
  const weekStart = useMemo(
    () => startOfWeek(referenceDate, { weekStartsOn: 1 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [referenceDate.toDateString()]
  );
  const weekEndExclusive = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Defensive dedup: same schedule_blocks.id must never render more than once.
  // Also dedup on logical key — the same underlying activity can be referenced by
  // multiple schedule_blocks with different (project_id, job_id) tuples (e.g. one
  // created via the "new project" path with project_id=event.id, and another via
  // the "reuse existing project" RPC with project_id=root, job_id=event.id).
  // Canonical activity id = job_id ?? project_id. If two blocks resolve to the
  // same (activityId, tech, start, end), keep the richer one (job_id + project_id
  // linked) so parent-project navigation still works.
  const dedupedBlocks = useMemo(() => {
    // Defense-in-depth: drop any block that is soft-deleted BEFORE dedup so
    // that a stale/deleted block can never "win" the richness comparison and
    // resurrect a ghost card.
    const alive = scheduleBlocks.filter((b) => !(b as any).deleted_at);
    const byId = Array.from(
      new Map(alive.map((b) => [b.id, b])).values(),
    );
    const byLogicalKey = new Map<string, ScheduleBlock>();
    const dupGroups: Record<string, string[]> = {};
    const richness = (b: ScheduleBlock) =>
      (b.job_id ? 2 : 0) + (b.project_id ? 1 : 0);
    for (const b of byId) {
      const activityId = b.job_id ?? b.project_id ?? "_";
      const key = [
        activityId,
        b.technician_id,
        b.start_at.toISOString(),
        b.end_at.toISOString(),
      ].join("|");
      const existing = byLogicalKey.get(key);
      if (!existing) {
        byLogicalKey.set(key, b);
        dupGroups[key] = [b.id];
      } else {
        dupGroups[key].push(b.id);
        if (richness(b) > richness(existing)) byLogicalKey.set(key, b);
      }
    }
    if (import.meta.env.DEV) {
      const duplicates = Object.entries(dupGroups).filter(([, ids]) => ids.length > 1);
      if (duplicates.length > 0) {
        console.warn(
          "[team-view:duplicate-audit] Real DB duplicates detected — only one block per logical key is rendered. Run cleanup migration to resolve.",
          duplicates,
        );
      }
    }
    return Array.from(byLogicalKey.values());
  }, [scheduleBlocks]);

  // Hard week-window filter: schedule_blocks.start_at must be inside [weekStart, weekEndExclusive).
  // This guards against stale blocks lekke inn fra parent-prosjektets start_time eller andre uker.
  const filteredBlocks = useMemo(() => {
    const inWindow = dedupedBlocks.filter(
      (b) => b.start_at >= weekStart && b.start_at < weekEndExclusive,
    );
    if (!visibleStatuses) return inWindow;
    return inWindow.filter((b) => visibleStatuses.has(blockStatusKey(b.job_status)));
  }, [dedupedBlocks, visibleStatuses, weekStart, weekEndExclusive]);

  const showAbsence = !visibleStatuses || visibleStatuses.has("absence");

  // schedule_blocks.start_at is the source of truth for matrix placement.
  // We intentionally do NOT use overlap matching — overnight blocks (e.g. 16:00–06:00)
  // would otherwise render in both the start day and the next-morning column.
  // events.start_time must not be used for TeamView placement.
  const blocksByTechDay = useMemo(() => {
    const map = new Map<string, ScheduleBlock[]>();
    for (const b of filteredBlocks) {
      const dayKey = format(b.start_at, "yyyy-MM-dd");
      const key = `${b.technician_id}__${dayKey}`;
      const arr = map.get(key) || [];
      arr.push(b);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.start_at.getTime() - b.start_at.getTime());
    return map;
  }, [filteredBlocks]);



  const absencesByTechDay = useMemo(() => {
    const map = new Map<string, AbsenceBlock[]>();
    if (!showAbsence) return map;
    for (const b of absenceBlocks) {
      const key = `${b.technicianId}__${format(b.date, "yyyy-MM-dd")}`;
      const arr = map.get(key) || [];
      arr.push(b);
      map.set(key, arr);
    }
    return map;
  }, [absenceBlocks, showAbsence]);

  const capByTech = useMemo(() => {
    const map = new Map<string, TechDayCapacity>();
    for (const tc of techCapacities || []) map.set(tc.techId, tc);
    return map;
  }, [techCapacities]);

  // Today highlight
  const today = new Date();
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="overflow-auto">
        <div className="min-w-[920px]">
          {/* Header */}
          <div
            className="grid sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border"
            style={{ gridTemplateColumns: "200px repeat(7, minmax(0,1fr))" }}
          >
            <div className="sticky left-0 z-10 bg-card/95 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border">
              Montør
            </div>
            {days.map((d) => {
              const dow = d.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isToday = isSameDay(d, today);
              // Aggregate utilisation across all visible techs for this day,
              // using AVAILABLE capacity (workDay − absence) so ferieuker
              // ikke vises som overbooket.
              let plannedMin = 0;
              let availMin = 0;
              let absentTechs = 0;
              let totalTechs = 0;
              for (const tc of techCapacities || []) {
                const dc = tc.days.find((dd) => isSameDay(dd.date, d));
                if (dc) {
                  totalTechs += 1;
                  plannedMin += dc.totalMinutes;
                  availMin += dc.availableMinutes;
                  if (dc.isAbsence) absentTechs += 1;
                }
              }
              const pct = availMin > 0 ? Math.round((plannedMin / availMin) * 100) : 0;
              const allAbsent = totalTechs > 0 && absentTechs === totalTechs;
              return (
                <div
                  key={d.toISOString()}
                  className={cn(
                    "px-2 py-3 text-center border-r border-border last:border-r-0 transition-colors",
                    isWeekend && "bg-muted/40",
                    isToday && !isWeekend && "bg-primary/10 border-b-2 border-b-primary",
                  )}
                >
                  <div className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    isToday ? "text-primary" : "text-foreground/70"
                  )}>
                    {format(d, "EEE", { locale: nb })}
                  </div>
                  <div className={cn(
                    "text-lg font-bold leading-tight mt-0.5 tabular-nums",
                    isToday ? "text-primary" : "text-foreground",
                  )}>
                    {format(d, "d")}
                  </div>
                  <div className={cn(
                    "text-[10px] tabular-nums mt-0.5",
                    isWeekend ? "text-muted-foreground/50" : utilColor(pct),
                  )}>
                    {isWeekend ? "—" : allAbsent ? "Ferie" : (pct > 0 ? `${pct} %` : "—")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {technicians.map((t, rowIdx) => {
            const meta = technicianMap.get(t.id);
            const color = meta?.color || t.color || "#039BE5";
            const colorRgb = hexToRgb(color);
            const tc = capByTech.get(t.id);
            const freeHours = tc ? Math.max(0, tc.weekCapacityHours - tc.weekPlannedHours) : null;
            const weekAbsenceHours = tc?.weekAbsenceHours ?? 0;
            const fullyAbsentWeek = tc && tc.weekCapacityHours === 0 && weekAbsenceHours > 0;
            return (
              <div
                key={t.id}
                className={cn(
                  "grid border-b border-border last:border-b-0 group/row transition-colors hover:bg-accent/20",
                  rowIdx % 2 === 1 && "bg-muted/[0.04]",
                )}
                style={{ gridTemplateColumns: "200px repeat(7, minmax(0,1fr))" }}
              >
                {/* Sticky tech cell */}
                <div className="sticky left-0 z-10 bg-card group-hover/row:bg-accent/20 px-3 py-3 flex items-center gap-3 border-r border-border transition-colors">
                  <Popover
                    open={colorPickerOpenFor === t.id}
                    onOpenChange={(open) => setColorPickerOpenFor(open ? t.id : null)}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label="Endre ressursfarge"
                            className="h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ring-2 ring-background shadow-sm cursor-pointer transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            style={{ backgroundColor: color }}
                            onClick={(e) => { e.stopPropagation(); }}
                          >
                            {initials(t.name)}
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">Endre ressursfarge</TooltipContent>
                    </Tooltip>
                    <PopoverContent className="w-auto p-2 z-[60]" side="right" align="start">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
                        Velg farge for {t.name.split(" ")[0]}
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {TECH_COLOR_PRESETS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onTechColorChange?.(t.id, c);
                              setColorPickerOpenFor(null);
                            }}
                            className={cn(
                              "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                              color.toLowerCase() === c.toLowerCase()
                                ? "border-foreground scale-110 ring-2 ring-foreground/20"
                                : "border-transparent"
                            )}
                            style={{ backgroundColor: c }}
                            aria-label={`Velg farge ${c}`}
                          />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold leading-tight truncate text-foreground">{t.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                      {tc ? (
                        fullyAbsentWeek
                          ? `Ferie ${Math.round(weekAbsenceHours)}t`
                          : tc.weekPlannedHours > 0
                            ? `${Math.round(tc.weekPlannedHours)}/${Math.round(tc.weekCapacityHours)}t${weekAbsenceHours > 0 ? ` · ${Math.round(weekAbsenceHours)}t ferie` : ""}`
                            : `${Math.round(freeHours ?? 0)}t ledig${weekAbsenceHours > 0 ? ` · ${Math.round(weekAbsenceHours)}t ferie` : ""}`
                      ) : "—"}
                    </div>
                  </div>
                </div>

                {/* Day cells */}
                {days.map((day) => {
                  const dow = day.getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const isToday = isSameDay(day, today);
                  const key = `${t.id}__${format(day, "yyyy-MM-dd")}`;
                  const cellBlocks = blocksByTechDay.get(key) || [];
                  const cellAbsences = absencesByTechDay.get(key) || [];
                  const isEmpty = cellBlocks.length === 0 && cellAbsences.length === 0;

                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("[data-chip]")) return;
                        if (isWeekend) {
                          const ok = window.confirm(
                            "Dette er helg/utenfor normal arbeidstid. Vil du planlegge aktivitet her?"
                          );
                          if (!ok) return;
                        }
                        onCellCreate?.(t.id, day);
                      }}
                      className={cn(
                        "relative min-h-[110px] border-r border-border last:border-r-0 px-1.5 py-1.5 flex flex-col gap-1 text-left transition-colors group/cell cursor-pointer",
                        isWeekend ? "bg-muted/40 hover:bg-muted/60" : "hover:bg-primary/[0.04]",
                        isToday && !isWeekend && "bg-primary/[0.04]",
                      )}
                    >
                      {isWeekend && isEmpty && (
                        <div className="absolute top-1 right-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60 pointer-events-none">
                          Helg
                        </div>
                      )}
                      {/* Empty-cell + indicator (visible on hover) */}
                      {isEmpty && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity pointer-events-none">
                          <div className="h-6 w-6 rounded-full border border-dashed border-primary/40 flex items-center justify-center bg-background/80">
                            <Plus className="h-3 w-3 text-primary/60" />
                          </div>
                        </div>
                      )}


                      {cellAbsences.map((a) => (
                        <div
                          key={a.id}
                          data-chip
                          className="rounded-md border px-2 py-1 text-[11px] flex items-center gap-1.5"
                          style={{
                            backgroundColor: `rgba(${colorRgb}, 0.14)`,
                            borderColor: `rgba(${colorRgb}, 0.45)`,
                            borderLeft: `4px solid ${color}`,
                            color: color,
                          }}
                          title={a.label}
                        >
                          <Palmtree className="h-3 w-3 shrink-0" style={{ color }} />
                          <span className="truncate font-medium">{a.label}</span>
                        </div>
                      ))}


                      {cellBlocks.map((b) => {
                        const tone = statusTone(b);
                        const dotCls = statusDot(b);
                        const isSelected = selectedBlockId === b.id;
                        // Primary: always prefer the LIVE event title over the
                        // (possibly stale) schedule_blocks.title snapshot.
                        const orderRef = extractOrderRef(b.title, b.description, b.outlook_preview);
                        const primaryTitle = getResourceCardTitle({
                          eventTitle: b.job_title,
                          parentTitle: b.project_title,
                          blockTitle: b.title,
                          outlookSubject: b.outlook_subject,
                          sourceOrderNumber: orderRef,
                          fallbackRef: b.job_number_resolved || b.internal_number,
                        });
                        // Secondary: BST-ref / JOB-ID / internal number + time
                        const refId = b.job_number_resolved || b.internal_number || null;
                        const timeStr = `${fmtHour(b.start_at)}–${fmtHour(b.end_at)}`;
                        const secondary = getResourceCardSecondary([orderRef, refId, timeStr]);

                        return (
                          <div
                            key={b.id}
                            data-chip
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBlockId(b.id);
                              onBlockClick?.(b);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedBlockId(b.id);
                                onBlockClick?.(b);
                              }
                            }}
                            className={cn(
                              "rounded-md border px-2 py-1 text-[11px] leading-tight cursor-pointer transition-all",
                              "hover:shadow-md hover:-translate-y-px hover:border-foreground/30",
                              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                              tone,
                              isSelected && "ring-2 ring-primary ring-offset-1 shadow-md",
                            )}
                            title={refId ? `${primaryTitle} (${refId}) · ${timeStr}` : `${primaryTitle} · ${timeStr}`}
                          >
                            <div className="flex items-start gap-1.5">
                              <span className={cn("mt-1 h-1.5 w-1.5 rounded-full shrink-0", dotCls)} aria-hidden />
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold line-clamp-2 break-words">{primaryTitle}</div>
                                <div className="text-[10px] opacity-70 tabular-nums truncate font-normal mt-0.5">{secondary}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {technicians.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">Ingen teknikere å vise.</div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="border-t border-border bg-muted/20 px-4 py-2.5 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <LegendDot className="bg-emerald-200 border-emerald-300" label="Godkjent" />
        <LegendDot className="bg-sky-200 border-sky-300" label="Planlagt" />
        <LegendDot className="bg-amber-200 border-amber-300" label="Pågår" />
        <LegendDot className="bg-rose-200 border-rose-300" label="Avslått" />
        <LegendDot className="bg-stone-200 border-stone-300" label="Ferie/fravær" />
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-sm border", className)} />
      <span>{label}</span>
    </div>
  );
}
