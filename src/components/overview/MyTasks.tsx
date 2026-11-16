import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, ChevronRight, AlertCircle, Circle, Plus,
  CalendarDays, FolderKanban, User, ListChecks,
} from "lucide-react";
import { format, isPast, isToday, isTomorrow, startOfDay, addDays } from "date-fns";
import { nb } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { overviewEventPath } from "@/lib/job-info-navigation";

export interface OverviewEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  project_type: string;
  status: string;
  customer: string | null;
  description: string | null;
}

interface MyTasksProps {
  events: OverviewEvent[];
  onNewTask?: () => void;
}

type FilterType = "all" | "tasks" | "projects";

function groupByDay(events: OverviewEvent[]): { label: string; events: OverviewEvent[] }[] {
  const today = startOfDay(new Date());
  const groups: Record<string, OverviewEvent[]> = {};

  for (const ev of events) {
    const start = startOfDay(new Date(ev.start_time));
    let label: string;
    if (start.getTime() < today.getTime()) {
      label = "Forfalt";
    } else if (isToday(start)) {
      label = "I dag";
    } else if (isTomorrow(start)) {
      label = "I morgen";
    } else {
      label = format(start, "EEEE d. MMM", { locale: nb });
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(ev);
  }

  const order = ["Forfalt", "I dag", "I morgen"];
  return Object.entries(groups)
    .sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    })
    .map(([label, events]) => ({ label, events }));
}

export function MyTasks({ events, onNewTask }: MyTasksProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = events.filter((ev) => {
    if (filter === "tasks") return ev.project_type === "task";
    if (filter === "projects") return ev.project_type !== "task";
    return true;
  });

  const groups = groupByDay(filtered);
  const taskCount = events.filter((e) => e.project_type === "task").length;
  const projectCount = events.filter((e) => e.project_type !== "task").length;

  if (events.length === 0) {
    return (
      <div className="text-center py-14">
        <div className="h-14 w-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="h-6 w-6 text-success/60" />
        </div>
        <p className="text-sm text-muted-foreground font-medium mb-1">Ingen planlagte gjøremål</p>
        <p className="text-xs text-muted-foreground/50 mb-5">Alt er i rute 🎉</p>
        {onNewTask && (
          <Button
            variant="outline"
            size="sm"
            onClick={onNewTask}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Opprett ny oppgave
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Filter pills */}
      <div className="flex items-center gap-1.5 px-5 pt-4 pb-2">
        <Button
          variant={filter === "all" ? "default" : "ghost"}
          size="sm" className="h-7 text-[11px] rounded-lg px-3"
          onClick={() => setFilter("all")}
        >
          Alle ({events.length})
        </Button>
        <Button
          variant={filter === "tasks" ? "default" : "ghost"}
          size="sm" className="h-7 text-[11px] rounded-lg px-3 gap-1"
          onClick={() => setFilter("tasks")}
        >
          <ListChecks className="h-3 w-3" /> Oppgaver ({taskCount})
        </Button>
        <Button
          variant={filter === "projects" ? "default" : "ghost"}
          size="sm" className="h-7 text-[11px] rounded-lg px-3 gap-1"
          onClick={() => setFilter("projects")}
        >
          <FolderKanban className="h-3 w-3" /> Prosjekter ({projectCount})
        </Button>
      </div>

      {/* Grouped list */}
      <div className="px-3 pb-3">
        {groups.map((group) => (
          <div key={group.label}>
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-4 pt-4 pb-2",
              group.label === "Forfalt" ? "text-destructive" : "text-muted-foreground/50"
            )}>
              {group.label}
            </p>
            {group.events.map((ev) => {
              const overdue = isPast(new Date(ev.end_time)) && ev.status !== "completed" && ev.status !== "done";
              const isTask = ev.project_type === "task";
              return (
                <button
                  key={ev.id}
                  onClick={() => navigate(overviewEventPath(ev.id, ev.project_type))}
                  className="flex items-center gap-3.5 w-full rounded-xl px-4 py-3.5 text-left
                    hover:bg-primary/5 transition-all group"
                >
                  {isTask ? (
                    <Circle className={`h-[18px] w-[18px] shrink-0 stroke-[2.5] ${overdue ? "text-destructive" : "text-border"}`} />
                  ) : (
                    <CalendarDays className="h-[18px] w-[18px] shrink-0 text-primary/40" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{ev.title}</p>
                    <div className="flex items-center gap-2.5 mt-1">
                      <span className="text-[10px] text-muted-foreground/50 font-mono">
                        {format(new Date(ev.start_time), "HH:mm")}–{format(new Date(ev.end_time), "HH:mm")}
                      </span>
                      {isTask ? (
                        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                          <ListChecks className="h-2.5 w-2.5" /> Oppgave
                        </span>
                      ) : (
                        <span className="text-[10px] text-primary/60 flex items-center gap-0.5">
                          <FolderKanban className="h-2.5 w-2.5" /> Prosjekt
                        </span>
                      )}
                      {ev.customer && (
                        <span className="text-[10px] text-muted-foreground/40 flex items-center gap-0.5">
                          <User className="h-2.5 w-2.5" /> {ev.customer}
                        </span>
                      )}
                    </div>
                  </div>
                  {overdue && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/10 group-hover:text-primary/40 shrink-0" />
                </button>
              );
            })}
          </div>
        ))}

        {/* Add task button */}
        {onNewTask && (
          <button
            onClick={onNewTask}
            className="flex items-center gap-3.5 w-full rounded-xl px-4 py-3 text-left
              hover:bg-primary/5 transition-colors text-muted-foreground/30 hover:text-primary mt-1"
          >
            <Plus className="h-[18px] w-[18px] shrink-0 stroke-[2]" />
            <span className="text-sm font-medium">Legg til oppgave</span>
          </button>
        )}
      </div>
    </div>
  );
}
