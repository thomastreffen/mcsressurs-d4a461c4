import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { TimeSelect } from "@/components/ui/time-select";
import { format, addMinutes, startOfDay, setHours, setMinutes } from "date-fns";
import { nb } from "date-fns/locale";
import {
  CalendarIcon, Loader2, Check, ChevronDown, MapPin, Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useTechnicians } from "@/hooks/useTechnicians";

/* ── Types ── */

interface TechAvailability {
  id: string;
  name: string;
  color?: string;
  status: "available" | "partial" | "full";
  label: string;
}

interface ProjectScheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectTitle: string;
  customer?: string;
  address?: string;
  suggestedDate?: Date;
  onCreated: () => void;
}

/* ── Duration options ── */
const DURATIONS = [
  { value: "60", label: "1 time" },
  { value: "120", label: "2 timer" },
  { value: "180", label: "3 timer" },
  { value: "240", label: "4 timer" },
  { value: "360", label: "6 timer" },
  { value: "480", label: "Hel dag (8t)" },
];

/* TIME_SLOTS replaced by TimeSelect component */

export function ProjectScheduleSheet({
  open, onOpenChange, projectId, projectTitle, customer, address,
  suggestedDate, onCreated,
}: ProjectScheduleSheetProps) {
  const isMobile = useIsMobile();
  const { activeCompanyId } = useCompanyContext();
  const { technicians } = useTechnicians(activeCompanyId);
  const [date, setDate] = useState<Date | undefined>(suggestedDate || new Date());
  const [startTime, setStartTime] = useState("08:00");
  const [duration, setDuration] = useState("120");
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [techs, setTechs] = useState<TechAvailability[]>([]);
  const [loadingTechs, setLoadingTechs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Fetch technicians + rough availability
  const fetchTechs = useCallback(async (targetDate: Date) => {
    setLoadingTechs(true);
    const dayStart = startOfDay(targetDate).toISOString();
    const dayEnd = new Date(startOfDay(targetDate).getTime() + 86400000).toISOString();

    const { data: blocksRes } = await supabase
      .from("schedule_blocks")
      .select("technician_id, start_at, end_at")
      .is("deleted_at", null)
      .lt("start_at", dayEnd)
      .gt("end_at", dayStart);

    const techList = technicians;
    const blocks = (blocksRes || []) as Array<{ technician_id: string; start_at: string; end_at: string }>;

    const busyMap = new Map<string, number>();
    for (const b of blocks) {
      const mins = (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000;
      busyMap.set(b.technician_id, (busyMap.get(b.technician_id) || 0) + mins);
    }

    const result: TechAvailability[] = techList.map((t) => {
      const busy = busyMap.get(t.id) || 0;
      const pct = (busy / 480) * 100;
      let status: TechAvailability["status"] = "available";
      let label = "Ledig";
      if (pct >= 90) {
        status = "full";
        label = "Fullbooket";
      } else if (pct >= 40) {
        status = "partial";
        label = `${Math.round(100 - pct)}% ledig`;
      }
      return { id: t.id, name: t.name, color: t.color, status, label };
    });

    result.sort((a, b) => {
      const order = { available: 0, partial: 1, full: 2 };
      return order[a.status] - order[b.status];
    });

    setTechs(result);
    setLoadingTechs(false);
  }, [technicians]);

  useEffect(() => {
    if (open && date) fetchTechs(date);
  }, [open, date, fetchTechs, technicians]);

  // Auto-select first available tech
  useEffect(() => {
    if (!selectedTechId && techs.length > 0) {
      const avail = techs.find((t) => t.status === "available") || techs[0];
      setSelectedTechId(avail.id);
    }
  }, [techs, selectedTechId]);

  const selectedTech = techs.find((t) => t.id === selectedTechId);

  const computedStart = useMemo(() => {
    if (!date) return new Date();
    const [h, m] = startTime.split(":").map(Number);
    return setMinutes(setHours(date, h), m);
  }, [date, startTime]);

  const computedEnd = useMemo(() => {
    return addMinutes(computedStart, parseInt(duration, 10));
  }, [computedStart, duration]);

  const handleConfirm = useCallback(async () => {
    if (!selectedTechId || !date) {
      toast.error("Velg montør og dato");
      return;
    }
    setSaving(true);
    try {
      if (!activeCompanyId) {
        toast.error("Velg et selskap før du planlegger");
        return;
      }

      const { error } = await (supabase as any).from("schedule_blocks").insert({
        company_id: activeCompanyId,
        technician_id: selectedTechId,
        project_id: projectId,
        source: "manual",
        start_at: computedStart.toISOString(),
        end_at: computedEnd.toISOString(),
        title: projectTitle,
        location: address || null,
        match_state: "manual",
        match_confidence: 100,
        match_reason: "Planlagt fra prosjektsiden",
      });

      if (error) throw error;

      toast.success("Arbeidsøkt planlagt!", {
        description: `${selectedTech?.name} · ${format(computedStart, "EEE d. MMM HH:mm", { locale: nb })} – ${format(computedEnd, "HH:mm")}`,
      });
      onCreated();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Schedule error:", err);
      toast.error("Kunne ikke opprette planblokk");
    } finally {
      setSaving(false);
    }
  }, [selectedTechId, date, computedStart, computedEnd, projectId, projectTitle, address, selectedTech, onCreated, onOpenChange, activeCompanyId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        mobileWorkspace
        side={isMobile ? "bottom" : "right"}
        className={cn(
          isMobile ? "max-h-[100dvh] flex flex-col" : "w-[420px] sm:max-w-[420px]"
        )}
      >
        <SheetHeader>
          <SheetTitle className="text-base">Planlegg arbeidsøkt</SheetTitle>
          <SheetDescription className="sr-only">Planlegg arbeidsøkt for prosjekt</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4 overflow-y-auto flex-1 min-h-0">
          {/* Project context */}
          <div className="rounded-xl border border-border/40 bg-muted/30 p-3 space-y-1">
            <p className="text-sm font-semibold truncate">{projectTitle}</p>
            {customer && <p className="text-xs text-muted-foreground">{customer}</p>}
            {address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {address}
              </p>
            )}
          </div>

          {/* Date picker */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Dato</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal h-10">
                  <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                  {date ? format(date, "EEEE d. MMMM yyyy", { locale: nb }) : "Velg dato"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { setDate(d); setCalendarOpen(false); setSelectedTechId(null); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time + Duration row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Starttid</Label>
              <TimeSelect value={startTime} onChange={setStartTime} className="w-full h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Varighet</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Technician selector with availability */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Montør</Label>
            {loadingTechs ? (
              <div className="flex items-center gap-2 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Sjekker tilgjengelighet…</span>
              </div>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {techs.map((tech) => (
                  <button
                    key={tech.id}
                    onClick={() => setSelectedTechId(tech.id)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      selectedTechId === tech.id
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted/50 border border-transparent"
                    )}
                  >
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: tech.color || "hsl(var(--primary))" }}
                    />
                    <span className="text-sm font-medium flex-1 truncate">{tech.name}</span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] h-5 font-semibold",
                        tech.status === "available" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
                        tech.status === "partial" && "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
                        tech.status === "full" && "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
                      )}
                    >
                      {tech.label}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Overnight indicator */}
          {computedEnd.getDate() !== computedStart.getDate() && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <Moon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-primary">Går over midnatt – slutter neste dag</span>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm space-y-1">
            <p className="font-semibold text-primary">Oppsummering</p>
            <p>{selectedTech?.name || "Ingen montør valgt"}</p>
            <p className="text-muted-foreground">
              {date ? format(computedStart, "EEE d. MMM", { locale: nb }) : "—"}{" "}
              kl. {format(computedStart, "HH:mm")} – {computedEnd.getDate() !== computedStart.getDate() ? format(computedEnd, "EEE d. MMM", { locale: nb }) + " " : ""}{format(computedEnd, "HH:mm")}
            </p>
          </div>

          {/* Advanced fields toggle */}
          {showMore && (
            <div className="space-y-3 pt-2 border-t border-border/30">
              <p className="text-xs text-muted-foreground">Flere innstillinger kommer i fremtidige oppdateringer.</p>
            </div>
          )}
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", showMore && "rotate-180")} />
            {showMore ? "Skjul" : "Vis mer"}
          </button>
        </div>

        <SheetFooter className="flex-row gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleConfirm} className="flex-1 gap-1.5" disabled={saving || !selectedTechId}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Planlegg
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
