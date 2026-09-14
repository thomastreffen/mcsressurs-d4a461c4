import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  usePlanningLookups,
  usePlanningMutations,
  type PlanningTask,
  type PlanningWorkPackage,
} from "@/hooks/usePlanning";
import { TASK_STATUSES, taskStatusLabel } from "@/lib/planning";

const NONE = "__none__";

export function PlanningTasks({
  projectId,
  tasks,
  workPackages,
}: {
  projectId: string;
  tasks: PlanningTask[];
  workPackages: PlanningWorkPackage[];
}) {
  const { data: lookups } = usePlanningLookups();
  const { saveTask, deleteTask } = usePlanningMutations(projectId);
  const [editing, setEditing] = useState<Partial<PlanningTask> | null>(null);

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null | undefined) =>
    (id && list?.find((x) => x.id === id)?.name) || null;

  const toggleDone = (t: PlanningTask) => {
    const done = t.status === "done";
    saveTask.mutate({
      id: t.id,
      patch: {
        title: t.title,
        status: done ? "open" : "done",
        completed_at: done ? null : new Date().toISOString(),
      },
    });
  };

  const save = async () => {
    if (!editing?.title?.trim()) {
      toast.error("Oppgaven må ha en tittel");
      return;
    }
    const patch = { ...editing };
    const id = patch.id;
    delete (patch as any).id;
    try {
      await saveTask.mutateAsync({ id, patch });
      setEditing(null);
      toast.success(id ? "Oppgave oppdatert" : "Oppgave opprettet");
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke lagre");
    }
  };

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  const row = (t: PlanningTask) => (
    <Card key={t.id} className="flex items-start gap-3 p-3">
      <Checkbox checked={t.status === "done"} onCheckedChange={() => toggleDone(t)} className="mt-1" />
      <div className="min-w-0 flex-1">
        <p className={t.status === "done" ? "text-sm line-through text-muted-foreground" : "text-sm font-medium"}>
          {t.title}
        </p>
        {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {nameOf(lookups?.departments as any, t.department_id) && (
            <Badge variant="outline">{nameOf(lookups?.departments as any, t.department_id)}</Badge>
          )}
          {nameOf(lookups?.people as any, t.assignee_person_id) && (
            <span>{nameOf(lookups?.people as any, t.assignee_person_id)}</span>
          )}
          {t.due_date && <span>Frist {format(new Date(t.due_date), "d. MMM", { locale: nb })}</span>}
          {t.work_package_id && (
            <Badge variant="secondary">{workPackages.find((w) => w.id === t.work_package_id)?.name}</Badge>
          )}
          {t.status !== "done" && t.status !== "open" && <Badge variant="outline">{taskStatusLabel(t.status)}</Badge>}
        </div>
      </div>
      <div className="flex">
        <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { if (confirm("Slette oppgaven?")) deleteTask.mutate(t.id); }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Oppgaver</h2>
          <p className="text-sm text-muted-foreground">Kan tildeles avdeling uten at person velges med en gang.</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setEditing({ title: "", status: "open" })}>
          <Plus className="h-4 w-4" /> Ny oppgave
        </Button>
      </div>

      {tasks.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Ingen oppgaver ennå.</Card>
      ) : (
        <div className="space-y-2">
          {open.map(row)}
          {done.length > 0 && (
            <>
              <p className="pt-3 text-xs font-medium uppercase text-muted-foreground">Ferdig ({done.length})</p>
              {done.map(row)}
            </>
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Rediger oppgave" : "Ny oppgave"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Tittel *</Label>
                <Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Beskrivelse</Label>
                <Textarea
                  rows={2}
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Ansvarlig avdeling</Label>
                  <Select
                    value={editing.department_id ?? NONE}
                    onValueChange={(v) => setEditing({ ...editing, department_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Ikke valgt</SelectItem>
                      {(lookups?.departments ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ansvarlig person (valgfritt)</Label>
                  <Select
                    value={editing.assignee_person_id ?? NONE}
                    onValueChange={(v) => setEditing({ ...editing, assignee_person_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Ikke valgt" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Ikke valgt</SelectItem>
                      {(lookups?.people ?? [])
                        .filter((p) => !editing.department_id || p.department_id === editing.department_id)
                        .map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Frist</Label>
                  <Input
                    type="date"
                    value={editing.due_date ?? ""}
                    onChange={(e) => setEditing({ ...editing, due_date: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editing.status ?? "open"} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Kobling til arbeidspakke</Label>
                  <Select
                    value={editing.work_package_id ?? NONE}
                    onValueChange={(v) => setEditing({ ...editing, work_package_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Ingen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Ingen</SelectItem>
                      {workPackages.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Avbryt</Button>
            <Button onClick={save} disabled={saveTask.isPending}>Lagre</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
