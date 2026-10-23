import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersonDirectory, suggestedEmployment, type DirectoryPerson } from "@/hooks/useMyPlanningTasks";

export interface AssigneeValue {
  assignee_person_id: string | null;
  company_id: string | null;
  department_id: string | null;
}

/** Søk på person på tvers av MCS. Ansvarlig selskap/avdeling foreslås fra primær ansettelse. */
export function PersonAssigneePicker({ value, onChange }: { value: AssigneeValue; onChange: (v: AssigneeValue) => void }) {
  const { data: people = [] } = usePersonDirectory();
  const [q, setQ] = useState("");
  const selected = people.find((p) => p.id === value.assignee_person_id) ?? null;

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return people.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 8);
  }, [q, people]);

  const pick = (p: DirectoryPerson) => {
    const e = suggestedEmployment(p);
    onChange({ assignee_person_id: p.id, company_id: e?.company_id ?? null, department_id: e?.department_id ?? null });
    setQ("");
  };

  if (selected) {
    const multi = selected.employments.length > 1;
    return (
      <div className="space-y-2">
        <Label>Ansvarlig person</Label>
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{selected.name}</p>
            {!multi && (
              <p className="text-xs text-muted-foreground">
                {[selected.employments[0]?.company_name, selected.employments[0]?.department_name].filter(Boolean).join(" · ")}
              </p>
            )}
            {!selected.canNotify && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <BellOff className="h-3 w-3" /> Kan ikke varsles ennå
              </p>
            )}
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Fjern person"
            onClick={() => onChange({ assignee_person_id: null, company_id: value.company_id, department_id: value.department_id })}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {multi && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{selected.name} jobber flere steder. Hvem har ansvaret for denne oppgaven?</p>
            <div className="flex flex-wrap gap-2">
              {selected.employments.map((e) => {
                const active = e.company_id === value.company_id && (e.department_id ?? null) === (value.department_id ?? null);
                return (
                  <button key={`${e.company_id}-${e.department_id}`} type="button"
                    onClick={() => onChange({ assignee_person_id: selected.id, company_id: e.company_id, department_id: e.department_id })}
                    className={cn("min-h-11 rounded-md border px-3 py-1.5 text-left text-xs",
                      active ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground")}>
                    {[e.company_name, e.department_name].filter(Boolean).join(" · ")}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative space-y-1.5">
      <Label htmlFor="assignee-search">Ansvarlig person</Label>
      <Input id="assignee-search" placeholder="Søk på navn i hele MCS" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {hits.map((p) => {
            const e = suggestedEmployment(p);
            return (
              <button key={p.id} type="button" onClick={() => pick(p)}
                className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-muted">
                <span className="text-sm text-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[e?.company_name, e?.department_name].filter(Boolean).join(" · ")}
                  {p.employments.length > 1 ? ` · +${p.employments.length - 1}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {q.trim() && hits.length === 0 && <p className="text-xs text-muted-foreground">Ingen treff</p>}
    </div>
  );
}
