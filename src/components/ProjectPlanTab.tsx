import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TechnicianMultiSelect } from "./TechnicianMultiSelect";
import { JobCalendarSync } from "./JobCalendarSync";
import { EventDrawer } from "./EventDrawer";
import { useTechnicians } from "@/hooks/useTechnicians";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Plus, Clock, CalendarCheck, Users, CheckCircle2, Circle,
  Loader2, Trash2, ChevronDown, MapPin, PlayCircle, FileText,
  ImageIcon, Send, Paperclip, X, MessageSquare, CalendarPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";

/* ── Types ── */
interface JobTask {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "done";
  sort_order: number;
  assigned_technician_ids: string[];
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
}

interface TaskNote {
  id: string;
  task_id: string;
  created_by: string | null;
  note_text: string | null;
  file_name: string | null;
  file_path: string | null;
  file_mime_type: string | null;
  created_at: string;
}

interface LinkedEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status: string;
  techNames: string[];
}

interface ProjectPlanTabProps {
  jobId: string;
  jobTitle: string;
  jobStart: Date;
  jobEnd: Date;
  jobAddress: string;
  technicianIds: string[];
  technicianNames: string[];
  isAdmin: boolean;
  calendarDirty?: boolean;
  calendarLastSyncedAt?: string | null;
  onSynced?: () => void;
  onResourceAssign?: () => void;
}

const STATUS_CONFIG = {
  pending: { label: "Venter", icon: Circle, className: "text-muted-foreground" },
  in_progress: { label: "Pågår", icon: PlayCircle, className: "text-amber-500" },
  done: { label: "Ferdig", icon: CheckCircle2, className: "text-emerald-500" },
};

export function ProjectPlanTab({
  jobId, jobTitle, jobStart, jobEnd, jobAddress,
  technicianIds, technicianNames, isAdmin,
  calendarDirty, calendarLastSyncedAt, onSynced, onResourceAssign,
}: ProjectPlanTabProps) {
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const [tasks, setTasks] = useState<JobTask[]>([]);
  const [linkedEvents, setLinkedEvents] = useState<LinkedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // Drawer states
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [eventDrawerOpen, setEventDrawerOpen] = useState(false);

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from("job_tasks")
      .select("*")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setTasks((data as JobTask[]) || []);
    setLoading(false);
  }, [jobId]);

  const fetchLinkedEvents = useCallback(async () => {
    // Fetch all events that reference this job (as project)
    // Events are linked by having the same job_id in a broader sense
    // For now we look at events that share the jobId as their id or have task_id pointing to tasks in this job
    const { data } = await supabase
      .from("events")
      .select(`
        id, title, start_time, end_time, status,
        event_technicians(technician_id, technicians(name))
      `)
      .or(`id.eq.${jobId},task_id.not.is.null`)
      .is("deleted_at", null)
      .order("start_time", { ascending: true });

    // Filter to only events linked to this project
    // The main event itself + any events with task_id pointing to our tasks
    const taskIds = tasks.map(t => t.id);
    const filtered = (data || []).filter((ev: any) =>
      ev.id === jobId // The main project event
    );

    setLinkedEvents(filtered.map((ev: any) => ({
      id: ev.id,
      title: ev.title,
      start_time: ev.start_time,
      end_time: ev.end_time,
      status: ev.status,
      techNames: (ev.event_technicians || [])
        .filter((et: any) => et.technicians)
        .map((et: any) => et.technicians.name),
    })));
  }, [jobId, tasks]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { if (!loading) fetchLinkedEvents(); }, [loading, fetchLinkedEvents]);

  const toggleTaskStatus = async (task: JobTask) => {
    const nextStatus: Record<string, string> = {
      pending: "in_progress", in_progress: "done", done: "pending",
    };
    const newStatus = nextStatus[task.status] as JobTask["status"];
    const updates: Record<string, unknown> = {
      status: newStatus,
      completed_at: newStatus === "done" ? new Date().toISOString() : null,
      completed_by: newStatus === "done" ? user?.id || null : null,
    };
    const { error } = await supabase.from("job_tasks").update(updates).eq("id", task.id);
    if (error) {
      toast.error("Kunne ikke oppdatere status");
    } else {
      fetchTasks();
      if (newStatus === "done") toast.success("Oppgave fullført", { description: task.title });
    }
  };

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase.from("job_tasks").delete().eq("id", taskId);
    if (!error) { fetchTasks(); toast.success("Oppgave slettet"); }
  };

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const completedTasks = tasks.filter((t) => t.status === "done");
  const completionPct = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Project overview header ── */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Prosjektplan
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Organiser oppgaver, tildel ressurser og følg fremdrift
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" className="rounded-xl gap-1.5 shrink-0"
              onClick={() => setEventDrawerOpen(true)}>
              <CalendarPlus className="h-3.5 w-3.5" />
              Planlegg jobb / serviceoppdrag
            </Button>
          )}
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Tidspunkt</p>
            <p className="text-sm font-medium">{format(jobStart, "EEEE d. MMM", { locale: nb })}</p>
            <p className="text-xs text-muted-foreground">{format(jobStart, "HH:mm")} – {format(jobEnd, "HH:mm")}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Adresse</p>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              {jobAddress || "—"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Montører</p>
            <div className="flex flex-wrap gap-1.5">
              {technicianNames.length > 0 ? technicianNames.map((name, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{name}</Badge>
              )) : <p className="text-sm text-muted-foreground">Ingen tildelt</p>}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {tasks.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">
                Fremdrift: {completedTasks.length}/{tasks.length} oppgaver
              </span>
              <span className={cn("font-bold tabular-nums",
                completionPct === 100 ? "text-emerald-600" : completionPct >= 50 ? "text-amber-600" : "text-muted-foreground"
              )}>{completionPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted/80 overflow-hidden">
              <div className={cn("h-full rounded-full transition-all duration-500",
                completionPct === 100 ? "bg-emerald-500" : completionPct >= 50 ? "bg-amber-500" : "bg-primary/60"
              )} style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Task list ── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Oppgaver
            {tasks.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground font-normal">({activeTasks.length} aktive)</span>
            )}
          </h3>
          {isAdmin && (
            <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={() => setCreateDrawerOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Ny intern oppgave
            </Button>
          )}
        </div>

        {/* Active tasks */}
        <div className="divide-y divide-border/30">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Ingen oppgaver ennå</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Legg til oppgaver for å organisere arbeidet</p>
            </div>
          ) : (
            activeTasks.map((task) => (
              <TaskRow key={task.id} task={task} isAdmin={isAdmin}
                expanded={expandedTaskId === task.id}
                onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                onStatusToggle={() => toggleTaskStatus(task)}
                onDelete={() => deleteTask(task.id)}
                userId={user?.id || null} />
            ))
          )}
        </div>

        {/* Completed tasks */}
        {completedTasks.length > 0 && (
          <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-5 py-3 border-t border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors text-left">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {completedTasks.length} fullførte oppgaver
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", showCompleted && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="divide-y divide-border/20">
                {completedTasks.map((task) => (
                  <TaskRow key={task.id} task={task} isAdmin={isAdmin}
                    expanded={expandedTaskId === task.id}
                    onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                    onStatusToggle={() => toggleTaskStatus(task)}
                    onDelete={() => deleteTask(task.id)}
                    userId={user?.id || null} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* ── Prosjektplan: Planlagte blokker ── */}
      {linkedEvents.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/40">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-primary" />
              Planlagte blokker
              <span className="text-xs text-muted-foreground font-normal">({linkedEvents.length})</span>
            </h3>
          </div>
          <div className="divide-y divide-border/30">
            {linkedEvents.map((ev) => (
              <div key={ev.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{ev.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {format(new Date(ev.start_time), "d. MMM HH:mm", { locale: nb })} –{" "}
                    {format(new Date(ev.end_time), "HH:mm", { locale: nb })}
                  </p>
                  {ev.techNames.length > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Users className="h-3 w-3" />
                      {ev.techNames.join(", ")}
                    </p>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">{ev.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Outlook calendar sync ── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-5">
        <JobCalendarSync jobId={jobId} jobStart={jobStart} jobEnd={jobEnd}
          technicianIds={technicianIds} isAdmin={isAdmin}
          calendarDirty={calendarDirty} calendarLastSyncedAt={calendarLastSyncedAt} onSynced={onSynced} />
      </div>

      {/* ── Create Task Drawer ── */}
      <CreateTaskDrawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        jobId={jobId}
        userId={user?.id || null}
        tasksCount={tasks.length}
        onCreated={() => { fetchTasks(); }}
      />

      {/* ── Event Drawer for scheduling resources ── */}
      <EventDrawer
        open={eventDrawerOpen}
        onOpenChange={setEventDrawerOpen}
        projectId={jobId}
        projectTitle={jobTitle}
        onSaved={() => { onResourceAssign?.(); fetchTasks(); fetchLinkedEvents(); }}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Create Task Drawer — all-in-one, single step, in a side panel
   ══════════════════════════════════════════════════════════ */
function CreateTaskDrawer({
  open, onOpenChange, jobId, userId, tasksCount, onCreated,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  jobId: string; userId: string | null; tasksCount: number;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset form when opening
  useEffect(() => {
    if (open) {
      setTitle(""); setDescription("");
      setFile(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);

    // 1. Insert task
    const { data: taskData, error: taskErr } = await supabase.from("job_tasks").insert({
      job_id: jobId,
      title: title.trim(),
      description: description.trim() || null,
      sort_order: tasksCount,
      created_by: userId,
    }).select("id").single();

    if (taskErr || !taskData) {
      toast.error("Kunne ikke opprette oppgave");
      setSaving(false);
      return;
    }

    // Internal sub-task only: never creates a resource-plan event.
    // Field work is planned via EventDrawer ("Planlegg jobb / serviceoppdrag").

    // 3. Upload file if present
    if (file) {
      const path = `task-files/${taskData.id}/${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("job-attachments").upload(path, file);
      if (!uploadErr) {
        await supabase.from("job_task_notes").insert({
          task_id: taskData.id,
          created_by: userId,
          note_text: `Vedlegg: ${file.name}`,
          file_name: file.name,
          file_path: path,
          file_mime_type: file.type,
        });
      }
    }

    toast.success("Intern oppgave opprettet");
    setSaving(false);
    onCreated();
    // Don't auto-close per spec
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[480px] flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Ny intern oppgave
          </SheetTitle>
          <SheetDescription>
            Intern deloppgave/sjekkpunkt. Feltarbeid planlegges med «Planlegg jobb / serviceoppdrag».
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 mt-4 space-y-5">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Oppgavetittel *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Hva skal gjøres?" className="mt-1" autoFocus />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Beskrivelse</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Hva skal sjekkes eller gjøres internt?"
              className="mt-1 min-h-[60px] resize-none" rows={2} />
          </div>

          {/* File attachment */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Vedlegg</label>
            <div className="mt-1 flex items-center gap-3">
              <label className="cursor-pointer flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded-lg px-3 py-2.5 flex-1">
                <Paperclip className="h-3.5 w-3.5" />
                {file ? file.name : "Legg ved fil eller bilde"}
                <input type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              {file && (
                <button type="button" onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

        </div>

        <SheetFooter className="mt-4">
          <Button className="w-full gap-1.5" onClick={handleSubmit} disabled={!title.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Opprett intern oppgave
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ══════════════════════════════════════════════════════════
   Task Row — with inline done, notes thread
   ══════════════════════════════════════════════════════════ */
function TaskRow({
  task, isAdmin, expanded, onToggleExpand, onStatusToggle, onDelete, userId,
}: {
  task: JobTask; isAdmin: boolean; expanded: boolean;
  onToggleExpand: () => void; onStatusToggle: () => void;
  onDelete: () => void; userId: string | null;
}) {
  const config = STATUS_CONFIG[task.status];
  const Icon = config.icon;
  const isDone = task.status === "done";
  const { technicians } = useTechnicians();
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [sendingNote, setSendingNote] = useState(false);

  const assignedNames = (task.assigned_technician_ids || [])
    .map((id) => technicians.find((t) => t.id === id)?.name)
    .filter(Boolean);

  // Fetch notes when expanded
  useEffect(() => {
    if (!expanded) return;
    setLoadingNotes(true);
    supabase.from("job_task_notes").select("*").eq("task_id", task.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => { setNotes((data as TaskNote[]) || []); setLoadingNotes(false); });
  }, [expanded, task.id]);

  const addNote = async () => {
    if (!noteText.trim() && !noteFile) return;
    setSendingNote(true);

    let filePath: string | null = null;
    let fileName: string | null = null;
    let fileMime: string | null = null;

    if (noteFile) {
      const path = `task-files/${task.id}/${noteFile.name}`;
      const { error } = await supabase.storage.from("job-attachments").upload(path, noteFile);
      if (!error) { filePath = path; fileName = noteFile.name; fileMime = noteFile.type; }
    }

    await supabase.from("job_task_notes").insert({
      task_id: task.id,
      created_by: userId,
      note_text: noteText.trim() || (fileName ? `Vedlegg: ${fileName}` : null),
      file_name: fileName,
      file_path: filePath,
      file_mime_type: fileMime,
    });

    setNoteText("");
    setNoteFile(null);

    const { data } = await supabase.from("job_task_notes").select("*").eq("task_id", task.id)
      .order("created_at", { ascending: true });
    setNotes((data as TaskNote[]) || []);
    setSendingNote(false);
    toast.success("Notat lagt til");
  };

  const getFileUrl = (path: string) => {
    const { data } = supabase.storage.from("job-attachments").getPublicUrl(path);
    return data?.publicUrl || "";
  };

  const hasSchedule = task.scheduled_date || task.start_time;

  return (
    <div className={cn("transition-colors", isDone && "bg-muted/20 opacity-75")}>
      <div className="flex items-center gap-3 px-5 py-3">
        {/* Status toggle */}
        <button onClick={onStatusToggle}
          className={cn("shrink-0 transition-colors hover:scale-110", config.className)}
          title={`Status: ${config.label}. Klikk for å endre.`}>
          <Icon className="h-5 w-5" />
        </button>

        {/* Title & meta */}
        <button onClick={onToggleExpand} className="flex-1 text-left min-w-0">
          <p className={cn("text-sm font-medium truncate", isDone && "line-through text-muted-foreground")}>
            {task.title}
          </p>
          {task.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {hasSchedule ? (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {task.scheduled_date && format(new Date(task.scheduled_date), "d. MMM", { locale: nb })}
                {task.start_time && ` ${task.start_time.slice(0, 5)}–${(task.end_time || "").slice(0, 5)}`}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/50 italic">Uplanlagt</span>
            )}
            {assignedNames.length > 0 && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                {assignedNames.join(", ")}
              </span>
            )}
            {isDone && task.completed_at && (
              <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Ferdig {format(new Date(task.completed_at), "d. MMM HH:mm", { locale: nb })}
              </span>
            )}
          </div>
        </button>

        {/* Quick action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {!isDone && (
            <Button size="sm" variant="ghost"
              className="h-7 px-2 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              onClick={onStatusToggle}
              title={task.status === "pending" ? "Start oppgave" : "Merk som ferdig"}>
              {task.status === "pending" ? (
                <><PlayCircle className="h-3.5 w-3.5" />Start</>
              ) : (
                <><CheckCircle2 className="h-3.5 w-3.5" />Ferdig</>
              )}
            </Button>
          )}
          <Button size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={onToggleExpand} title="Vis detaljer og notater">
            <MessageSquare className="h-3.5 w-3.5" />
          </Button>
        </div>

        <ChevronDown className={cn(
          "h-4 w-4 text-muted-foreground shrink-0 transition-transform cursor-pointer",
          expanded && "rotate-180"
        )} onClick={onToggleExpand} />
      </div>

      {/* Expanded: details + notes thread */}
      {expanded && (
        <div className="px-5 pb-4 pt-1 ml-8 space-y-4 border-t border-border/20">
          {/* Schedule & resources (admin inline edit) */}
          {isAdmin && (
            <TaskEditSection task={task} onUpdated={() => {}} />
          )}

          {/* Notes thread */}
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" />
              Notater & dokumentasjon
            </p>

            {loadingNotes ? (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : notes.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 py-2">Ingen notater ennå</p>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-lg bg-muted/30 border border-border/30 p-3 space-y-1">
                    <p className="text-xs text-foreground">{note.note_text}</p>
                    {note.file_path && (
                      <a href={getFileUrl(note.file_path)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                        {note.file_mime_type?.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                        {note.file_name}
                      </a>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "d. MMM HH:mm", { locale: nb })}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Add note input */}
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Input value={noteText} onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Skriv et notat eller endringsmelding..."
                  className="text-xs h-8"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }} />
                {noteFile && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Paperclip className="h-3 w-3" />
                    {noteFile.name}
                    <button onClick={() => setNoteFile(null)} className="text-destructive ml-1"><X className="h-3 w-3" /></button>
                  </div>
                )}
              </div>
              <label className="cursor-pointer shrink-0">
                <Paperclip className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                <input type="file" className="hidden" accept="image/*,.pdf,.doc,.docx"
                  onChange={(e) => setNoteFile(e.target.files?.[0] || null)} />
              </label>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0"
                disabled={(!noteText.trim() && !noteFile) || sendingNote} onClick={addNote}>
                {sendingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Delete */}
          {isAdmin && (
            <div className="pt-2 border-t border-border/20 flex justify-end">
              <Button size="sm" variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs"
                onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Slett oppgave
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Inline task edit section (admin only) ── */
function TaskEditSection({ task, onUpdated }: { task: JobTask; onUpdated: () => void }) {
  const updateField = async (field: string, value: unknown) => {
    await supabase.from("job_tasks").update({ [field]: value || null }).eq("id", task.id);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Planlegging</label>
        <Input type="date" defaultValue={task.scheduled_date || ""}
          onChange={(e) => updateField("scheduled_date", e.target.value)} className="h-8 text-xs" />
        <div className="grid grid-cols-2 gap-2">
          <Input type="time" defaultValue={task.start_time?.slice(0, 5) || ""}
            onChange={(e) => updateField("start_time", e.target.value)} className="h-8 text-xs" />
          <Input type="time" defaultValue={task.end_time?.slice(0, 5) || ""}
            onChange={(e) => updateField("end_time", e.target.value)} className="h-8 text-xs" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Ressurser</label>
        <TechnicianMultiSelect selectedIds={task.assigned_technician_ids || []}
          onChange={(ids) => updateField("assigned_technician_ids", ids)} />
      </div>
    </div>
  );
}
