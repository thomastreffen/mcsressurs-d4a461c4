import { useState } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { CalendarPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimeSelect } from "@/components/ui/time-select";
import { cn } from "@/lib/utils";
import type { WorkDay, WorkDayError } from "@/lib/work-days";

type Props = {
  days: WorkDay[];               // first row = primary day (bound to Fra/Til)
  onChangeTime: (date: string, field: "start" | "end", value: string) => void;
  onRemove: (date: string) => void;
  onAdd: (dates: string[]) => void;
  errors?: WorkDayError[];
  disabled?: boolean;
};

export function WorkDayRows({ days, onChangeTime, onRemove, onAdd, errors = [], disabled }: Props) {
  const [open, setOpen] = useState(false);
  const taken = new Set(days.map((d) => d.date));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return (
    <div className="space-y-2" data-testid="work-day-rows">
      <ul className="space-y-1.5">
        {days.map((d, i) => {
          const err = errors.find((e) => e.date === d.date);
          const label = format(new Date(`${d.date}T12:00:00`), "EEE d.M", { locale: nb });
          return (
            <li key={d.date} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="w-20 text-xs font-medium capitalize">{label}</span>
                <TimeSelect value={d.start} onChange={(v) => onChangeTime(d.date, "start", v)} className="w-[92px]" disabled={disabled} aria-label={`Start ${label}`} />
                <span className="text-xs text-muted-foreground">–</span>
                <TimeSelect value={d.end} onChange={(v) => onChangeTime(d.date, "end", v)} className="w-[92px]" disabled={disabled} aria-label={`Slutt ${label}`} />
                {i === 0 ? (
                  <span className="text-[10px] text-muted-foreground">Hoveddag</span>
                ) : (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Fjern ${label}`} onClick={() => onRemove(d.date)} disabled={disabled}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {err && <p className="pl-20 text-[11px] text-destructive">{err.message}</p>}
            </li>
          );
        })}
      </ul>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-8" disabled={disabled || days.length === 0}>
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Legg til arbeidsdag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            onSelect={(dt) => { if (dt) { onAdd([format(dt, "yyyy-MM-dd")]); setOpen(false); } }}
            disabled={(dt) => dt < today || taken.has(format(dt, "yyyy-MM-dd"))}
            initialFocus locale={nb} weekStartsOn={1} className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
