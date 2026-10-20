import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2, Trash2, Calendar, Clock, Flag, FileText,
  FolderKanban, User, AlertCircle, Loader2,
} from "lucide-react";
import { format, isPast } from "date-fns";
import { nb } from "date-fns/locale";
import type { Task } from "@/hooks/useTasks";

interface TaskDetailSheetProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
}

const priorityLabels: Record<string, string> = {
  low: "Lav",
  normal: "Normal",
  medium: "Medium",
  high: "Høy",
  critical: "Kritisk",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-secondary text-secondary-foreground",
  medium: "bg-secondary text-secondary-foreground",
  high: "bg-destructive/10 text-destructive",
  critical: "bg-destructive text-destructive-foreground",
};

export function TaskDetailSheet({ task, open, onOpenChange, onComplete, onDelete }: TaskDetailSheetProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [acting, setActing] = useState(false);

  if (!task) return null;

  const overdue = task.due_at && isPast(new Date(task.due_at));
  const isDone = task.status === "done";

  const handleComplete = async () => {
    setActing(true);
    await onComplete(task.id);
    setActing(false);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    setActing(true);
    await onDelete(task.id);
    setActing(false);
    setConfirmDelete(false);
    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent mobileWorkspace className="sm:max-w-[480px] flex flex-col">
          <SheetHeader>
            <SheetTitle className="text-left pr-8">{task.title}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-5 py-4">
            {/* Status + Priority */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={isDone ? "default" : "outline"} className="gap-1">
                {isDone ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {isDone ? "Fullført" : "Åpen"}
              </Badge>
              <Badge className={`gap-1 ${priorityColors[task.priority] || priorityColors.normal}`}>
                <Flag className="h-3 w-3" />
                {priorityLabels[task.priority] || task.priority}
              </Badge>
              {task.linked_project_id ? (
                <Badge variant="outline" className="gap-1 text-primary">
                  <FolderKanban className="h-3 w-3" /> Prosjekt
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <User className="h-3 w-3" /> Personlig
                </Badge>
              )}
            </div>

            {/* Description */}
            {task.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Beskrivelse
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/30 rounded-lg p-3">
                  {task.description}
                </p>
              </div>
            )}

            <Separator />

            {/* Dates */}
            <div className="space-y-3">
              {task.due_at && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Frist
                  </span>
                  <span className={`text-sm font-medium ${overdue ? "text-destructive" : "text-foreground"}`}>
                    {overdue && <AlertCircle className="h-3 w-3 inline mr-1" />}
                    {format(new Date(task.due_at), "d. MMMM yyyy", { locale: nb })}
                  </span>
                </div>
              )}
              {task.planned_start_at && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Planlagt start
                  </span>
                  <span className="text-sm text-foreground">
                    {format(new Date(task.planned_start_at), "d. MMM HH:mm", { locale: nb })}
                  </span>
                </div>
              )}
              {task.planned_end_at && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Planlagt slutt
                  </span>
                  <span className="text-sm text-foreground">
                    {format(new Date(task.planned_end_at), "d. MMM HH:mm", { locale: nb })}
                  </span>
                </div>
              )}
              {task.calendar_event_id && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Kalender
                  </span>
                  <Badge variant="outline" className="text-xs text-primary">Synkronisert</Badge>
                </div>
              )}
            </div>

            <Separator />

            {/* Meta */}
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>Opprettet: {format(new Date(task.created_at), "d. MMM yyyy HH:mm", { locale: nb })}</p>
              <p>Oppdatert: {format(new Date(task.updated_at), "d. MMM yyyy HH:mm", { locale: nb })}</p>
            </div>
          </div>

          {/* Actions footer */}
          <div className="border-t border-border pt-4 flex items-center gap-2">
            {!isDone && (
              <Button onClick={handleComplete} disabled={acting} className="flex-1 gap-2">
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Fullfør
              </Button>
            )}
            <Button
              variant="destructive"
              size={isDone ? "default" : "icon"}
              onClick={() => setConfirmDelete(true)}
              disabled={acting}
              className={isDone ? "flex-1 gap-2" : ""}
            >
              <Trash2 className="h-4 w-4" />
              {isDone && "Slett"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett oppgave?</AlertDialogTitle>
            <AlertDialogDescription>
              «{task.title}» vil bli permanent slettet. Dette kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {acting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
