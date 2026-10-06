import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

function TaskEditor({
  initial,
  workPackages,
  onCancel,
  onSave,
  saving,
}: {
  initial: Partial<PlanningTask>;
  workPackages: PlanningWorkPackage[];
  onCancel: () => void;
  onSave: (t: Partial<PlanningTask>) => void;
  saving: boolean;
}) {
  const { data: lookups } = usePlanningLookups();
  const [t, setT] = useState<Partial<PlanningTask>>(initial);
  const set = (p: Partial<PlanningTask>) => setT({ ...t, ...p });
  const departments = (lookups?.departments ?? []).filter((d) => !t.company_id || d.company_id === t.company_id);
  const people = (lookups?.people ?? []).filter(
    (p) => (!t.company_id || p.company_id === t.company_id) && (!t.department_id || p.department_id === t.department_id),
  );

  const pickWp = (v: string) => {
    const wp = workPackages.find((w) => w.id === v);
    // Arver ansvarslinje fra arbeidspakken når ingen er satt
    set({
      work_package_id: v === NONE ? null : v,
      ...(wp && !t.company_id ? { company_id: wp.responsible_company_id, department_id: wp.responsible_department_id } : {}),
    });
  };

  return (
    <Card className="space-y-4 border-primary/40 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="task-title">Tittel *</Label>
        <Input id="task-title" autoFocus value={t.title ?? ""} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Arbeidspakke</Label>
          <Select value={t.work_package_id ?? NONE} onValueChange={pickWp}>
            <SelectTrigger><SelectValue placeholder="Ingen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Hele prosjektet</SelectItem>
              {workPackages.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ansvarlig firma</Label>
          <Select
            value={t.company_id ?? NONE}
            onValueChange={(v) => set({ company_id: v === NONE ? null : v, department_id: null, assignee_person_id: null })}
          >
            <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ikke valgt</SelectItem>
              {(lookups?.companies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ansvarlig avdeling</Label>
          <Select
            value={t.department_id ?? NONE}
            onValueChange={(v) => set({ department_id: v === NONE ? null : v, assignee_person_id: null })}
          >
            <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ikke valgt</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ansvarlig person</Label>
          <Select value={t.assignee_person_id ?? NONE} onValueChange={(v) => set({ assignee_person_id: v === NONE ? null : v })}>
            <SelectTrigger><SelectValue placeholder="Ikke valgt" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ikke valgt</SelectItem>
              {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-due">Frist</Label>
          <Input id="task-due" type="date" value={t.due_date ?? ""} onChange={(e) => set({ due_date: e.target.value || null })} />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={t.status ?? "open"} onValueChange={(v) => set({ status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="task-desc">Beskrivelse</Label>
        <Textarea id="task-desc" rows={2} value={t.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Avbryt</Button>
        <Button onClick={() => onSave(t)} disabled={saving}>Lagre</Button>
      </div>
    </Card>
  );
}

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
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null | undefined) =>
    (id && list?.find((x) => x.id === id)?.name) || null;

  const toggleDone = (t: PlanningTask) => {
    const done = t.status === "done";
    saveTask.mutate({
      id: t.id,
      patch: { title: t.title, status: done ? "open" : "done", completed_at: done ? null : new Date().toISOString() },
    });
  };

  const save = async (draft: Partial<PlanningTask>) => {
    if (!draft.title?.trim()) {
      toast.error("Oppgaven må ha en tittel");
      return;
    }
    const patch: any = { ...draft };
    const id = patch.id;
    for (const k of ["id", "planning_project_id", "created_at", "updated_at", "created_by", "completed_by"]) delete patch[k];
    try {
      await saveTask.mutateAsync({ id, patch });
      setEditingId(null);
      toast.success(id ? "Oppgave oppdatert" : "Oppgave opprettet");
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke lagre");
    }
  };

  const row = (t: PlanningTask) =>
    editingId === t.id ? (
      <TaskEditor key={t.id} initial={t} workPackages={workPackages} onCancel={() => setEditingId(null)} onSave={save} saving={saveTask.isPending} />
    ) : (
      <Card key={t.id} className="flex items-start gap-3 p-3">
        <Checkbox checked={t.status === "done"} onCheckedChange={() => toggleDone(t)} className="mt-1" aria-label="Ferdig" />
        <div className="min-w-0 flex-1">
          <p className={t.status === "done" ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{t.title}</p>
          {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {[nameOf(lookups?.companies, t.company_id), nameOf(lookups?.departments as any, t.department_id)].filter(Boolean).length > 0 && (
              <Badge variant="outline">
                {[nameOf(lookups?.companies, t.company_id), nameOf(lookups?.departments as any, t.department_id)].filter(Boolean).join(" · ")}
              </Badge>
            )}
            <span>{nameOf(lookups?.people as any, t.assignee_person_id) ?? "Ingen ansvarlig person"}</span>
            {t.due_date && <span>· Frist {format(new Date(t.due_date), "d. MMM", { locale: nb })}</span>}
            {t.status !== "done" && t.status !== "open" && <Badge variant="outline">{taskStatusLabel(t.status)}</Badge>}
          </div>
        </div>
        <div className="flex">
          <Button variant="ghost" size="icon" aria-label="Rediger" onClick={() => setEditingId(t.id)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Slett" onClick={() => { if (confirm("Slette oppgaven?")) deleteTask.mutate(t.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    );

  const groups = [
    ...workPackages.map((w) => ({ key: w.id, title: w.name, items: tasks.filter((t) => t.work_package_id === w.id) })),
    { key: "none", title: "Hele prosjektet", items: tasks.filter((t) => !t.work_package_id || !workPackages.some((w) => w.id === t.work_package_id)) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Oppgaver</h2>
          <p className="text-sm text-muted-foreground">Gruppert per arbeidspakke, med ansvarlig firma, avdeling og person.</p>
        </div>
        {editingId !== "new" && (
          <Button size="sm" className="gap-2" onClick={() => setEditingId("new")}>
            <Plus className="h-4 w-4" /> Ny oppgave
          </Button>
        )}
      </div>

      {editingId === "new" && (
        <TaskEditor initial={{ title: "", status: "open" }} workPackages={workPackages} onCancel={() => setEditingId(null)} onSave={save} saving={saveTask.isPending} />
      )}

      {tasks.length === 0 && editingId !== "new" ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Ingen oppgaver ennå.</Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const open = g.items.filter((t) => t.status !== "done");
            const done = g.items.filter((t) => t.status === "done");
            return (
              <section key={g.key} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.title} <span className="font-normal">({open.length} åpne)</span>
                </h3>
                {open.map(row)}
                {done.map(row)}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
