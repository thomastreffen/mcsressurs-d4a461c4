import { useNavigate } from "react-router-dom";
import { format, isPast, isToday } from "date-fns";
import { nb } from "date-fns/locale";
import { CheckCircle2, Circle, FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMyPlanningTasks } from "@/hooks/useMyPlanningTasks";

/** Kun visning. Samme PlanningTask som i prosjektet – ingen kopi, ingen egen ferdigstatus. */
export function MyPlanningTasks({ title = "Mine oppgaver", showDone = false }: { title?: string; showDone?: boolean }) {
  const navigate = useNavigate();
  const { data = [], isLoading } = useMyPlanningTasks();
  const rows = showDone ? data : data.filter((t) => t.status !== "done");
  if (isLoading || rows.length === 0) return null;

  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="space-y-2">
        {rows.map((t) => {
          const due = t.due_date ? new Date(t.due_date) : null;
          const overdue = !!due && t.status !== "done" && isPast(due) && !isToday(due);
          const org = [t.company_name, t.department_name].filter(Boolean).join(" · ");
          const Wrapper: any = t.can_open_project ? "button" : "div";
          return (
            <Wrapper
              key={t.id}
              {...(t.can_open_project ? { type: "button", onClick: () => navigate(`/planlegging/${t.planning_project_id}?tab=oppgaver`) } : {})}
              className="flex min-h-14 w-full items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left active:bg-muted/60"
            >
              {t.status === "done"
                ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                : <Circle className={cn("mt-0.5 h-5 w-5 shrink-0", overdue ? "text-destructive" : "text-border")} />}
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-semibold text-foreground", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline" className="gap-1 font-normal">
                    <FolderKanban className="h-3 w-3" /> Planlegging · {t.project_name}
                  </Badge>
                  {t.work_package_name && <span>{t.work_package_name}</span>}
                  {org && <span>{org}</span>}
                  {due && (
                    <span className={cn(overdue && "font-medium text-destructive")}>
                      Frist {format(due, "d. MMM", { locale: nb })}
                    </span>
                  )}
                </div>
              </div>
            </Wrapper>
          );
        })}
      </div>
    </section>
  );
}
