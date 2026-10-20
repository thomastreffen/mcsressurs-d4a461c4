import { useState } from "react";
import { format, isSameDay } from "date-fns";
import { nb } from "date-fns/locale";
import { ChevronLeft, ChevronRight, SlidersHorizontal, Plus, Clock, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { blockStatusKey, TEAM_STATUS_OPTIONS, type TeamStatusKey } from "./TeamView";
import { resourceBlocksForDay } from "@/lib/mobile-resource-day";
import { formatProjectLabel } from "@/lib/project-reference";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";
import type { ScheduleBlock } from "@/hooks/useScheduleBlocks";
import type { AbsenceBlock } from "@/hooks/useAbsenceBlocks";
import type { TechDayCapacity } from "@/hooks/useCapacity";

interface Props {
  referenceDate: Date;
  technicians: Array<{ id: string; name: string }>;
  scheduleBlocks: ScheduleBlock[];
  absenceBlocks: AbsenceBlock[];
  techCapacities?: TechDayCapacity[];
  visibleStatuses: Set<TeamStatusKey>;
  selectedTechId: string | null;
  onSelectTech: (id: string | null) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onToggleStatus: (key: TeamStatusKey) => void;
  onBlockClick: (block: ScheduleBlock) => void;
  onCellCreate?: (techId: string, day: Date) => void;
  unplannedCount: number;
  confirmationCount: number;
  onUnplanned: () => void;
  onConfirmations: () => void;
}

export function MobileResourceDayView(props: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const techs = props.technicians.filter(t => !props.selectedTechId || t.id === props.selectedTechId);
  return (
    <section className="min-w-0 space-y-5" aria-label="Ressursplan dagvisning">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Ressursplan</h1>
        <Button variant="outline" size="icon" aria-label="Filtre og handlinger" onClick={() => setFiltersOpen(true)}><SlidersHorizontal /></Button>
      </div>
      <div className="flex items-center justify-between gap-1">
        <Button variant="ghost" size="icon" aria-label="Forrige dag" onClick={props.onPrev}><ChevronLeft /></Button>
        <Button variant="ghost" className="h-auto flex-col gap-0.5 px-2 py-2" onClick={props.onToday}>
          <span className="text-base font-semibold">{format(props.referenceDate, "EEEE d. MMM", { locale: nb })}</span>
          <span className="text-xs text-muted-foreground">Uke {format(props.referenceDate, "w", { locale: nb })}{isSameDay(props.referenceDate, new Date()) ? " · I dag" : ""}</span>
        </Button>
        <Button variant="ghost" size="icon" aria-label="Neste dag" onClick={props.onNext}><ChevronRight /></Button>
      </div>
      <Select value={props.selectedTechId ?? "all"} onValueChange={v => props.onSelectTech(v === "all" ? null : v)}>
        <SelectTrigger className="h-12 text-sm" aria-label="Montør"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Alle montører</SelectItem>{props.technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
      </Select>
      {techs.length === 0 && <p className="py-8 text-center text-muted-foreground">Ingen montører tilgjengelig i dette selskapet.</p>}
      {techs.map(tech => {
        const allBlocks = resourceBlocksForDay(props.scheduleBlocks, props.referenceDate, tech.id);
        const blocks = allBlocks.filter(b => props.visibleStatuses.has(blockStatusKey(b.job_status)));
        const absences = props.absenceBlocks.filter(a => a.technicianId === tech.id && isSameDay(a.date, props.referenceDate));
        const capacity = props.techCapacities?.find(c => c.techId === tech.id)?.days.find(d => isSameDay(d.date, props.referenceDate));
        const free = capacity ? Math.max(0, capacity.availableMinutes - capacity.totalMinutes) : null;
        return (
          <section key={tech.id} className="border-t border-border pt-4 space-y-3" aria-label={tech.name}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="text-base font-semibold break-words">{tech.name}</h2><p className="text-sm text-muted-foreground">{capacity?.isAbsence ? "Fravær" : free !== null ? `${Math.round(free / 6) / 10} t ledig${capacity && capacity.percent > 100 ? " · Overbooket" : ""}` : allBlocks.length ? `${allBlocks.length} avtaler` : "Ingen planlagte oppdrag"}</p></div>
              {props.onCellCreate && <Button variant="outline" className="shrink-0" onClick={() => props.onCellCreate?.(tech.id, props.referenceDate)}><Plus />Planlegg</Button>}
            </div>
            {props.visibleStatuses.has("absence") && absences.map(a => <div key={a.id} className="rounded-lg border border-dashed border-border bg-muted px-3 py-3 text-sm">{a.label} · {a.isFullDay ? "Hele dagen" : `${a.startTime ?? ""}–${a.endTime ?? ""}`}</div>)}
            {blocks.map(block => <Button key={block.id} variant="outline" className="h-auto w-full justify-start items-start whitespace-normal p-4 text-left bg-card" onClick={() => props.onBlockClick(block)}>
              <div className="min-w-0 w-full space-y-2">
                <p className="flex items-center gap-2 text-sm font-semibold"><Clock className="shrink-0" />{format(block.start_at, "HH:mm")}–{format(block.end_at, "HH:mm")}{!isSameDay(block.start_at, block.end_at) && <span className="text-xs text-muted-foreground">{format(block.end_at, "d. MMM", { locale: nb })}</span>}</p>
                <p className="text-base font-semibold break-words">{formatProjectLabel(block.financial_project_number ?? block.job_number_resolved ?? block.internal_number, block.job_title ?? block.title ?? block.project_title ?? "Oppdrag")}</p>
                {block.location && <p className="text-sm text-muted-foreground break-words">{block.location}</p>}
                <Badge variant="secondary">{JOB_STATUS_CONFIG[block.job_status as JobStatus]?.label ?? (block.match_state === "needs_confirmation" ? "Må avklares" : "Planlagt")}</Badge>
              </div>
            </Button>)}
            {!blocks.length && allBlocks.length > 0 && <p className="text-sm text-muted-foreground">{allBlocks.length} avtaler skjult av statusfilter.</p>}
            {!allBlocks.length && !absences.length && <p className="text-sm text-muted-foreground flex items-center gap-2"><CalendarDays />Dagen er uten bookinger.</p>}
          </section>
        );
      })}
      <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DrawerContent><DrawerHeader><DrawerTitle>Filtre og handlinger</DrawerTitle></DrawerHeader>
          <div className="overflow-y-auto px-4 pb-4 space-y-4">
            <div className="space-y-1">{TEAM_STATUS_OPTIONS.map(opt => <label key={opt.key} className="flex min-h-12 items-center gap-3 text-sm"><Checkbox checked={props.visibleStatuses.has(opt.key)} onCheckedChange={() => props.onToggleStatus(opt.key)} />{opt.label}</label>)}</div>
            <DrawerClose asChild><Button variant="outline" className="w-full justify-between" onClick={props.onUnplanned}>Uplanlagte oppdrag<Badge variant="secondary">{props.unplannedCount}</Badge></Button></DrawerClose>
            <DrawerClose asChild><Button variant="outline" className="w-full justify-between" onClick={props.onConfirmations}>Bekreftelser<Badge variant="secondary">{props.confirmationCount}</Badge></Button></DrawerClose>
            <DrawerClose asChild><Button className="w-full">Ferdig</Button></DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}