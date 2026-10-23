import { MyPlanningTasks } from "@/components/planning/MyPlanningTasks";
import { useState, useEffect } from "react";
import {
  ListChecks, Plus, Filter, CheckCircle2, Circle,
  AlertCircle, FolderKanban, User, Calendar, ChevronRight,
  Clock, ChevronDown,
} from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { nb } from "date-fns/locale";
import { useTasks, type Task } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { toast } from "sonner";

type ProjectFilter = "all" | "project" | "personal";
type TimeFilter = "all" | "overdue" | "today" | "week";

export default function TasksPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [doneOpen, setDoneOpen] = useState(false);

  const { tasks, loading, createTask, completeTask, deleteTask, fetchDoneTasks, refetch } = useTasks({
    projectFilter,
    timeFilter,
  });

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDueAt, setNewDueAt] = useState("");

  // Load done tasks when section opened
  useEffect(() => {
    if (doneOpen) {
      fetchDoneTasks().then(setDoneTasks);
    }
  }, [doneOpen, fetchDoneTasks]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !activeCompanyId) return;
    try {
      await createTask({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        priority: newPriority,
        due_at: newDueAt ? new Date(newDueAt).toISOString() : null,
        company_id: activeCompanyId,
        status: "open",
      });
      setShowCreate(false);
      setNewTitle("");
      setNewDescription("");
      setNewPriority("medium");
      setNewDueAt("");
      toast.success("Oppgave opprettet");
    } catch (e: any) {
      toast.error("Kunne ikke opprette oppgave: " + e.message);
    }
  };

  const handleComplete = async (taskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await completeTask(taskId);
    toast.success("Oppgave fullført");
    if (doneOpen) fetchDoneTasks().then(setDoneTasks);
  };

  const handleDelete = async (taskId: string) => {
    await deleteTask(taskId);
    toast.success("Oppgave slettet");
    if (doneOpen) fetchDoneTasks().then(setDoneTasks);
  };

  const overdueCount = tasks.filter(t => t.due_at && isPast(new Date(t.due_at))).length;
  const todayCount = tasks.filter(t => t.due_at && isToday(new Date(t.due_at))).length;
  const personalCount = tasks.filter(t => !t.linked_project_id).length;
  const projectCount = tasks.filter(t => t.linked_project_id).length;

  const renderTaskRow = (task: Task) => {
    const overdue = task.due_at && isPast(new Date(task.due_at));
    const isDone = task.status === "done";
    return (
      <div
        key={task.id}
        className="flex items-center gap-3 px-5 py-3.5 hover:bg-primary/[0.02] transition-colors cursor-pointer group"
        onClick={() => setSelectedTask(task)}
      >
        {!isDone && (
          <button
            onClick={(e) => { e.stopPropagation(); handleComplete(task.id); }}
            className="shrink-0"
          >
            <Circle className={`h-5 w-5 stroke-[2] transition-colors hover:text-success ${overdue ? "text-destructive" : "text-border"}`} />
          </button>
        )}
        {isDone && (
          <CheckCircle2 className="h-5 w-5 text-success/50 shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <p className={`text-sm truncate group-hover:text-primary transition-colors ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {task.linked_project_id ? (
              <span className="text-[10px] text-primary/70 flex items-center gap-0.5">
                <FolderKanban className="h-2.5 w-2.5" /> Prosjekt
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <User className="h-2.5 w-2.5" /> Personlig
              </span>
            )}
            {task.calendar_event_id && (
              <span className="text-[10px] text-primary/60 flex items-center gap-0.5">
                <Calendar className="h-2.5 w-2.5" /> Synket
              </span>
            )}
            {task.priority === "high" && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-3.5">Høy</Badge>
            )}
          </div>
        </div>

        {task.due_at && (
          <span className={`text-[11px] shrink-0 font-medium flex items-center gap-1 ${overdue && !isDone ? "text-destructive" : "text-muted-foreground/50"}`}>
            {overdue && !isDone && <AlertCircle className="h-3 w-3" />}
            {format(new Date(task.due_at), "d. MMM", { locale: nb })}
          </span>
        )}

        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/15 group-hover:text-primary/40 shrink-0" />
      </div>
    );
  };

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-8 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ListChecks className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Oppgaver</h1>
            <p className="text-sm text-muted-foreground">{tasks.length} oppgaver</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Ny oppgave
        </Button>
      </div>

      {/* Stats chips */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {overdueCount > 0 && (
          <Badge variant="destructive" className="gap-1 cursor-pointer" onClick={() => setTimeFilter("overdue")}>
            <AlertCircle className="h-3 w-3" /> {overdueCount} forfalt
          </Badge>
        )}
        {todayCount > 0 && (
          <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setTimeFilter("today")}>
            <Clock className="h-3 w-3" /> {todayCount} i dag
          </Badge>
        )}
        <Badge variant="outline" className="gap-1 cursor-pointer" onClick={() => setProjectFilter("personal")}>
          <User className="h-3 w-3" /> {personalCount} personlige
        </Badge>
        <Badge variant="outline" className="gap-1 cursor-pointer" onClick={() => setProjectFilter("project")}>
          <FolderKanban className="h-3 w-3" /> {projectCount} prosjekt
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
        </div>
        <Select value={projectFilter} onValueChange={(v) => setProjectFilter(v as ProjectFilter)}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle typer</SelectItem>
            <SelectItem value="project">Prosjektoppgaver</SelectItem>
            <SelectItem value="personal">Personlige</SelectItem>
          </SelectContent>
        </Select>
        <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle perioder</SelectItem>
            <SelectItem value="overdue">Forfalt</SelectItem>
            <SelectItem value="today">I dag</SelectItem>
            <SelectItem value="week">Denne uken</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Laster oppgaver...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20">
          <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3 border-2 border-success/20">
            <CheckCircle2 className="h-7 w-7 text-success/50" />
          </div>
          <p className="text-sm text-muted-foreground mb-4">Ingen oppgaver funnet</p>
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Opprett oppgave
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-border/50 bg-card overflow-hidden divide-y divide-border/30">
          {tasks.map(renderTaskRow)}
        </div>
      )}

      {/* Completed tasks section */}
      <div className="mt-8">
        <Collapsible open={doneOpen} onOpenChange={setDoneOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
            <ChevronDown className={`h-4 w-4 transition-transform ${doneOpen ? "" : "-rotate-90"}`} />
            <CheckCircle2 className="h-4 w-4" />
            Utførte oppgaver
            {doneTasks.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{doneTasks.length}</Badge>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            {doneTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 py-4 pl-6">Ingen fullførte oppgaver ennå</p>
            ) : (
              <div className="rounded-2xl border border-border/30 bg-card/50 overflow-hidden divide-y divide-border/20 mt-2">
                {doneTasks.map(renderTaskRow)}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Task detail sheet */}
      <TaskDetailSheet
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => { if (!open) setSelectedTask(null); }}
        onComplete={async (id) => { await handleComplete(id); }}
        onDelete={handleDelete}
      />

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny oppgave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tittel</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Hva skal gjøres?"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Beskrivelse</label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Valgfri beskrivelse..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Prioritet</label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Lav</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">Høy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Frist</label>
                <Input
                  type="date"
                  value={newDueAt}
                  onChange={(e) => setNewDueAt(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Avbryt</Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim()}>Opprett</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
