import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink } from "lucide-react";
import { PlanningParticipants } from "./PlanningParticipants";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { usePermissions } from "@/hooks/usePermissions";
import {
  uniqueParticipants,
  useEligibleParticipants,
  usePlanningActivity,
  usePlanningFinance,
  usePlanningLookups,
  usePlanningMutations,
  type PlanningContact,
  type PlanningProject,
  type PlanningTask,
  type PlanningWorkPackage,
} from "@/hooks/usePlanning";
import {
  CONTRACT_FORMS,
  assignmentStateLabel,
  contractFormLabel,
  formatMoney,
  formatPeriod,
  resourceNeedLabel,
} from "@/lib/planning";

const NONE = "__none__";

export function PlanningOverview({
  project,
  workPackages,
  tasks,
  contacts,
  onGoTo,
}: {
  project: PlanningProject;
  workPackages: PlanningWorkPackage[];
  tasks: PlanningTask[];
  contacts: PlanningContact[];
  onGoTo: (tab: string) => void;
}) {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { data: lookups } = usePlanningLookups();
  const { updateProject } = usePlanningMutations(project.id);
  const { data: activity } = usePlanningActivity(project.id);
  const { data: finance } = usePlanningFinance(project.id);
  const { data: eligible } = useEligibleParticipants();
  const ownerOptions = uniqueParticipants(eligible);
  const [draft, setDraft] = useState<Partial<PlanningProject>>({});

  const v = <K extends keyof PlanningProject>(k: K): any => (draft[k] !== undefined ? draft[k] : project[k]);
  const dirty = Object.keys(draft).length > 0;
  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null | undefined) =>
    (id && list?.find((x) => x.id === id)?.name) || null;

  const save = async () => {
    try {
      await updateProject.mutateAsync({ id: project.id, patch: draft, logSummary: "Prosjektinformasjon oppdatert" });
      setDraft({});
      toast.success("Lagret");
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke lagre");
    }
  };

  const departments = (lookups?.departments ?? []).filter(
    (d) => !v("company_id") || d.company_id === v("company_id"),
  );
  const openTasks = tasks.filter((t) => t.status !== "done");
  const totalPeople = workPackages.reduce((s, w) => s + (w.resource_count ?? 0), 0);
  const totalHours = workPackages.reduce((s, w) => s + Number(w.estimated_hours ?? 0), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card className="space-y-4 p-4">
          <h2 className="text-sm font-semibold text-foreground">Overordnet ansvar</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kunde</Label>
              <Select
                value={v("customer_id") ?? NONE}
                onValueChange={(x) => setDraft({ ...draft, customer_id: x === NONE ? null : x })}
              >
                <SelectTrigger><SelectValue placeholder="Velg kunde" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke valgt</SelectItem>
                  {(lookups?.customers ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Overordnet prosjektansvarlig</Label>
              <Select
                value={v("owner_user_id") ?? NONE}
                onValueChange={(x) => setDraft({ ...draft, owner_user_id: x === NONE ? null : x })}
              >
                <SelectTrigger><SelectValue placeholder="Velg person" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke valgt</SelectItem>
                  {project.owner_user_id && !ownerOptions.some((o) => o.user_id === project.owner_user_id) && (
                    <SelectItem value={project.owner_user_id}>
                      {lookups?.users.find((u) => u.user_id === project.owner_user_id)?.name ?? "Nåværende ansvarlig"}
                    </SelectItem>
                  )}
                  {ownerOptions.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ansvarlig firma</Label>
              <Select
                value={v("company_id") ?? NONE}
                onValueChange={(x) => setDraft({ ...draft, company_id: x === NONE ? null : x, department_id: null })}
              >
                <SelectTrigger><SelectValue placeholder="Velg selskap" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke valgt</SelectItem>
                  {(lookups?.companies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ansvarlig avdeling</Label>
              <Select
                value={v("department_id") ?? NONE}
                onValueChange={(x) => setDraft({ ...draft, department_id: x === NONE ? null : x })}
              >
                <SelectTrigger><SelectValue placeholder="Velg avdeling" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke valgt</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kontraktsform</Label>
              <Select value={v("contract_form") ?? "unclear"} onValueChange={(x) => setDraft({ ...draft, contract_form: x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRACT_FORMS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fakturerende firma</Label>
              <Select
                value={v("invoicing_company_id") ?? NONE}
                onValueChange={(x) => setDraft({ ...draft, invoicing_company_id: x === NONE ? null : x })}
              >
                <SelectTrigger><SelectValue placeholder="Velg selskap" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke valgt</SelectItem>
                  {(lookups?.companies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forventet start</Label>
              <Input
                type="date"
                value={v("expected_start") ?? ""}
                onChange={(e) => setDraft({ ...draft, expected_start: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Forventet slutt</Label>
              <Input
                type="date"
                value={v("expected_end") ?? ""}
                onChange={(e) => setDraft({ ...draft, expected_end: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Beskrivelse</Label>
              <Textarea
                rows={3}
                value={v("description") ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
          </div>
          {dirty && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft({})}>Forkast</Button>
              <Button onClick={save} disabled={updateProject.isPending}>Lagre</Button>
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Arbeidspakker</h2>
            <Button variant="ghost" size="sm" onClick={() => onGoTo("arbeidspakker")}>Se alle</Button>
          </div>
          {workPackages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen arbeidspakker ennå.</p>
          ) : (
            workPackages.slice(0, 5).map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      nameOf(lookups?.companies, w.responsible_company_id),
                      nameOf(lookups?.departments as any, w.responsible_department_id),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Ansvarlig ikke satt"}
                    {" · "}
                    {formatPeriod(w.planned_start, w.planned_end, null)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {resourceNeedLabel(w.resource_count, w.estimated_hours) && (
                    <Badge variant="secondary">{resourceNeedLabel(w.resource_count, w.estimated_hours)}</Badge>
                  )}
                  <Badge variant="outline">{assignmentStateLabel(w.assignment_state)}</Badge>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <PlanningParticipants project={project} />
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Nøkkeltall</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kontraktsform</span>
              <span>{contractFormLabel(project.contract_form)}</span>
            </div>
            {finance && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kontraktsverdi</span>
                <span>{formatMoney(finance.contract_value)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ressursbehov</span>
              <span>{resourceNeedLabel(totalPeople || null, totalHours || null) ?? "–"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Åpne oppgaver</span>
              <span>{openTasks.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kontakter</span>
              <span>{contacts.length}</span>
            </div>
          </div>
          {project.linked_event_id && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => navigate(`/projects/${project.linked_event_id}`)}
            >
              <ExternalLink className="h-4 w-4" /> Åpne MCS-prosjekt
            </Button>
          )}
          {hasPermission("resourceplan.view") && (
            <Button variant="ghost" size="sm" className="w-full gap-2" onClick={() => navigate("/projects/plan")}>
              <ExternalLink className="h-4 w-4" /> Åpne ressursplan
            </Button>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Siste hendelser</h2>
          {(activity ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen hendelser ennå.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {(activity ?? []).slice(0, 8).map((a) => (
                <li key={a.id} className="border-l-2 border-border pl-3">
                  <p className="text-foreground">{a.summary}</p>
                  <p className="text-muted-foreground">
                    {a.performed_by_name ?? "System"} ·{" "}
                    {format(new Date(a.created_at), "d. MMM HH:mm", { locale: nb })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
