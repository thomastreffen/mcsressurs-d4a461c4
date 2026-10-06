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
import { PlanningWorkLine } from "./PlanningWorkLine";
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
  const { updateProject, saveWorkPackage } = usePlanningMutations(project.id);
  const [suggest, setSuggest] = useState<{ from: string; to: string; ids: string[] } | null>(null);
  const companyName = (id: string | null | undefined) => (id && lookups?.companies.find((c) => c.id === id)?.name) || "Ikke satt";
  const deptName = (id: string | null | undefined) => (id && lookups?.departments.find((d) => d.id === id)?.name) || "Ikke satt";
  const customerName = (id: string | null | undefined) => (id && lookups?.customers.find((c) => c.id === id)?.name) || "Ikke satt";

  /** Lagrer ett felt med en gang og logger gammel → ny verdi i Historikk. */
  const saveNow = async (patch: Partial<PlanningProject>, summary: string) => {
    try {
      await updateProject.mutateAsync({ id: project.id, patch, logSummary: summary });
      toast.success("Lagret");
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke lagre");
    }
  };

  const changeClient = async (newId: string | null) => {
    if (newId === project.company_id) return;
    const deptValid = !project.department_id || (lookups?.departments ?? []).some((d) => d.id === project.department_id && d.company_id === newId);
    const patch: Partial<PlanningProject> = { company_id: newId };
    let summary = `Oppdragsgiver endret: ${companyName(project.company_id)} → ${companyName(newId)}`;
    if (!deptValid) {
      patch.department_id = null;
      summary += ` (avdeling ${deptName(project.department_id)} nullstilt)`;
    }
    const oldId = project.company_id;
    await saveNow(patch, summary);
    // Foreslå – ikke gjør – oppdatering av arbeidspakker som bare har arvet «faktureres til» fra gammel oppdragsgiver
    const inherited = workPackages.filter((w) => oldId && newId && w.billing_to_company_id === oldId);
    setSuggest(inherited.length > 0 && oldId && newId ? { from: oldId, to: newId, ids: inherited.map((w) => w.id) } : null);
  };

  const applySuggestion = async () => {
    if (!suggest) return;
    try {
      for (const id of suggest.ids) await saveWorkPackage.mutateAsync({ id, patch: { billing_to_company_id: suggest.to } });
      await updateProject.mutateAsync({
        id: project.id,
        patch: {},
        logSummary: `«Faktureres til» endret på ${suggest.ids.length} arbeidspakke(r): ${companyName(suggest.from)} → ${companyName(suggest.to)}`,
      });
      toast.success("Arbeidspakkene er oppdatert");
      setSuggest(null);
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke oppdatere arbeidspakkene");
    }
  };
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
    (d) => !project.company_id || d.company_id === project.company_id,
  );
  const openTasks = tasks.filter((t) => t.status !== "done");
  const totalPeople = workPackages.reduce((s, w) => s + (w.resource_count ?? 0), 0);
  const totalHours = workPackages.reduce((s, w) => s + Number(w.estimated_hours ?? 0), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <PlanningWorkLine project={project} workPackages={workPackages} />
        <Card className="space-y-4 p-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Prosjektinformasjon</h2>
            <p className="text-xs text-muted-foreground">Oppdragsgiver, avdeling og kunde lagres med en gang du endrer dem.</p>
          </div>
          {suggest && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              <p className="text-foreground">
                {suggest.ids.length} arbeidspakke(r) faktureres fortsatt til {companyName(suggest.from)}. Skal de faktureres til {companyName(suggest.to)} i stedet?
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSuggest(null)}>Behold</Button>
                <Button size="sm" onClick={applySuggestion} disabled={saveWorkPackage.isPending}>Oppdater</Button>
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kunde / sluttkunde</Label>
              <Select
                value={project.customer_id ?? NONE}
                onValueChange={(x) => {
                  const id = x === NONE ? null : x;
                  if (id !== project.customer_id)
                    saveNow({ customer_id: id }, `Kunde / sluttkunde endret: ${customerName(project.customer_id)} → ${customerName(id)}`);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Velg kunde" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke valgt</SelectItem>
                  {(lookups?.customers ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Overordnet prosjekteier</Label>
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
              <Label>Oppdragsgiver (firma)</Label>
              <Select
                value={project.company_id ?? NONE}
                onValueChange={(x) => changeClient(x === NONE ? null : x)}
              >
                <SelectTrigger><SelectValue placeholder="Velg selskap" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke valgt</SelectItem>
                  {(lookups?.planCompanies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Oppdragsgivers avdeling</Label>
              <Select
                value={project.department_id ?? NONE}
                onValueChange={(x) => {
                  const id = x === NONE ? null : x;
                  if (id !== project.department_id)
                    saveNow({ department_id: id }, `Oppdragsgivers avdeling endret: ${deptName(project.department_id)} → ${deptName(id)}`);
                }}
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
                  {(lookups?.planCompanies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
