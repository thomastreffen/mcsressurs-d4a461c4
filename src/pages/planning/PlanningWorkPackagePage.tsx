import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ExternalLink, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import {
  usePlanningAssignees,
  usePlanningChildren,
  usePlanningFinance,
  usePlanningLookups,
  usePlanningMutations,
  usePlanningProject,
  usePlanningStaffing,
  type PlanningWorkPackage,
} from "@/hooks/usePlanning";
import { CONTRACT_FORMS, WP_STATUSES, taskStatusLabel } from "@/lib/planning";
import { WorkPackageStaffing } from "@/components/planning/WorkPackageStaffing";
import { useSendWpToResourcePlan } from "@/components/planning/useSendWpToResourcePlan";

const NONE = "__none__";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

export default function PlanningWorkPackagePage() {
  const { id: projectId, wpId } = useParams<{ id: string; wpId: string }>();
  const isNew = !wpId || wpId === "ny";
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canSeeResourcePlan = hasPermission("resourceplan.view");

  const { data: project, isLoading } = usePlanningProject(projectId);
  const { data: children, isLoading: loadingChildren } = usePlanningChildren(projectId);
  const { data: finance } = usePlanningFinance(projectId);
  const { data: lookups } = usePlanningLookups();
  const { data: staffing } = usePlanningStaffing(projectId);
  const { data: assignees } = usePlanningAssignees(projectId);
  const { saveWorkPackage, deleteWorkPackage } = usePlanningMutations(projectId);
  const { send, sendingId } = useSendWpToResourcePlan(project ?? undefined);
  const canSeeFinance = !!finance;

  const existing = useMemo(() => {
    if (isNew) return null;
    const w = children?.workPackages.find((x) => x.id === wpId);
    if (!w) return null;
    const f = finance?.work_packages.find((x) => x.id === w.id);
    return { ...w, agreed_price: f?.agreed_price ?? null, hourly_rate: f?.hourly_rate ?? null };
  }, [children, finance, wpId, isNew]);

  const [form, setForm] = useState<Partial<PlanningWorkPackage> | null>(null);
  useEffect(() => {
    if (isNew && !form && project) {
      setForm({
        name: "",
        status: "planned",
        price_form: "unclear",
        assignment_state: "not_assigned",
        billing_to_company_id: project?.company_id ?? null,
        planned_start: project?.expected_start ?? null,
        planned_end: project?.expected_end ?? null,
      });
    } else if (existing && (!form || form.id !== existing.id)) {
      setForm(existing);
    }
  }, [isNew, existing, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => navigate(`/planlegging/${projectId}?tab=arbeidspakker`);

  if (isLoading || loadingChildren || !form) {
    if (!isLoading && !loadingChildren && !isNew && !existing) {
      return (
        <div className="p-6">
          <Card className="p-10 text-center">
            <p className="text-sm text-muted-foreground">Fant ikke arbeidspakken, eller du har ikke tilgang til den.</p>
            <Button className="mt-4" variant="outline" onClick={back}>Tilbake til prosjektet</Button>
          </Card>
        </div>
      );
    }
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!project) return null;

  const set = (patch: Partial<PlanningWorkPackage>) => setForm({ ...form, ...patch });
  const departments = (lookups?.departments ?? []).filter(
    (d) => !form.responsible_company_id || d.company_id === form.responsible_company_id,
  );
  const people = (lookups?.people ?? []).filter(
    (p) =>
      (!form.responsible_company_id || p.company_id === form.responsible_company_id) &&
      (!form.responsible_department_id || p.department_id === form.responsible_department_id),
  );
  const wpTasks = (children?.tasks ?? []).filter((t) => !isNew && t.work_package_id === wpId);

  const save = async () => {
    if (!form.name?.trim()) {
      toast.error("Arbeidspakken må ha et navn");
      return;
    }
    const patch: any = { ...form };
    if (patch.assignment_state === "not_assigned" && patch.responsible_department_id) {
      patch.assignment_state = "department_assigned";
    }
    const id = patch.id;
    for (const k of ["id", "planning_project_id", "created_at", "updated_at", "created_by", "linked_event_id", "sort_order"]) delete patch[k];
    try {
      await saveWorkPackage.mutateAsync({ id, patch });
      toast.success(id ? "Arbeidspakke lagret" : "Arbeidspakke opprettet");
      back();
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke lagre");
    }
  };

  const remove = async () => {
    if (!existing || !confirm("Slette arbeidspakken?")) return;
    await deleteWorkPackage.mutateAsync(existing.id);
    back();
  };

  const companySelect = (value: string | null | undefined, onChange: (v: string | null) => void, list = lookups?.planCompanies) => (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger><SelectValue placeholder="Velg selskap" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Ikke valgt</SelectItem>
        {(list ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={back}>
        <ArrowLeft className="h-4 w-4" /> {project.name}
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Arbeidspakke</p>
          <h1 className="text-2xl font-bold text-foreground">{isNew ? "Ny arbeidspakke" : existing?.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Oppdragsgiver: <span className="text-foreground">{lookups?.companies.find((c) => c.id === project.company_id)?.name ?? "ikke satt"}</span>
            {" · "}Kunde / sluttkunde: <span className="text-foreground">{lookups?.customers.find((c) => c.id === project.customer_id)?.name ?? "ikke satt"}</span>
          </p>
          {isNew && (
            <p className="mt-1 text-xs text-muted-foreground">
              Bare navn er påkrevd. Datoer og «faktureres til» er foreslått fra prosjektet – endre ved behov.
            </p>
          )}
        </div>
        {!isNew && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={remove}>
            <Trash2 className="h-4 w-4" /> Slett
          </Button>
        )}
      </header>

      <Section title="Hva skal gjøres">
        <div className="space-y-1.5">
          <Label htmlFor="wp-name">Navn *</Label>
          <Input id="wp-name" value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="F.eks. Montasje" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wp-desc">Beskrivelse</Label>
          <Textarea id="wp-desc" rows={3} value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status ?? "planned"} onValueChange={(v) => set({ status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WP_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wp-start">Planlagt start</Label>
            <Input id="wp-start" type="date" value={form.planned_start ?? ""} onChange={(e) => set({ planned_start: e.target.value || null })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wp-end">Planlagt slutt</Label>
            <Input id="wp-end" type="date" value={form.planned_end ?? ""} onChange={(e) => set({ planned_end: e.target.value || null })} />
          </div>
        </div>
      </Section>

      <Section title="Hvem utfører og hvem har ansvar" hint="Ansvarlig styrer arbeidspakken. Utførende personer velges av avdelingen i Ressursplan.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Utførende firma</Label>
            {companySelect(form.responsible_company_id, (v) =>
              set({ responsible_company_id: v, responsible_department_id: null, responsible_person_id: null }),
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Utførende avdeling</Label>
            <Select
              value={form.responsible_department_id ?? NONE}
              onValueChange={(v) => set({ responsible_department_id: v === NONE ? null : v, responsible_person_id: null })}
            >
              <SelectTrigger><SelectValue placeholder="Velg avdeling" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Ikke valgt</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Arbeidspakkeansvarlig</Label>
            <Select value={form.responsible_person_id ?? NONE} onValueChange={(v) => set({ responsible_person_id: v === NONE ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Velg person" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Ikke valgt</SelectItem>
                {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wp-vendor">Ekstern utfører (hvis ikke MCS)</Label>
            <Input id="wp-vendor" value={form.external_vendor_name ?? ""} onChange={(e) => set({ external_vendor_name: e.target.value })} placeholder="F.eks. underleverandør" />
          </div>
        </div>
      </Section>

      <Section title="Ressurser" hint="Behovet sendes til Ressursplan. Personene som velges der vises her.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wp-count">Antall personer</Label>
            <Input id="wp-count" type="number" value={form.resource_count ?? ""} onChange={(e) => set({ resource_count: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wp-hours">Estimerte timer</Label>
            <Input id="wp-hours" type="number" value={form.estimated_hours ?? ""} onChange={(e) => set({ estimated_hours: e.target.value ? Number(e.target.value) : null })} />
          </div>
        </div>
        {!isNew && existing && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
            <WorkPackageStaffing assignmentState={existing.assignment_state} staffing={staffing?.[existing.id]} assignees={assignees?.[existing.id]} />
            {existing.linked_event_id ? (
              canSeeResourcePlan && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/projects/${existing.linked_event_id}`)}>
                  <ExternalLink className="h-4 w-4" /> Åpne i Ressursplan
                </Button>
              )
            ) : (
              canSeeResourcePlan && (
                <Button variant="outline" size="sm" className="gap-1.5" disabled={sendingId === existing.id} onClick={() => send(existing)}>
                  <Send className="h-4 w-4" /> Send til ressursplan
                </Button>
              )
            )}
          </div>
        )}
      </Section>

      <Section title="Pris og fakturering">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Prisform</Label>
            <Select value={form.price_form ?? "unclear"} onValueChange={(v) => set({ price_form: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTRACT_FORMS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="hidden sm:block" />
          {canSeeFinance && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="wp-agreed-price">Avtalt pris</Label>
                <Input id="wp-agreed-price" type="number" value={form.agreed_price ?? ""} onChange={(e) => set({ agreed_price: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wp-hourly-rate">Timepris</Label>
                <Input id="wp-hourly-rate" type="number" value={form.hourly_rate ?? ""} onChange={(e) => set({ hourly_rate: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Fakturerer</Label>
            {companySelect(form.billing_from_company_id, (v) => set({ billing_from_company_id: v }))}
          </div>
          <div className="space-y-1.5">
            <Label>Faktureres til</Label>
            {companySelect(form.billing_to_company_id, (v) => set({ billing_to_company_id: v }), lookups?.companies)}
          </div>
        </div>
      </Section>

      <Section title="Kommentar">
        <Textarea rows={2} value={form.comment ?? ""} onChange={(e) => set({ comment: e.target.value })} />
      </Section>

      {!isNew && (
        <Section title="Oppgaver i denne arbeidspakken">
          {wpTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen oppgaver er koblet til arbeidspakken.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {wpTasks.map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span className={t.status === "done" ? "text-muted-foreground line-through" : ""}>{t.title}</span>
                  <span className="text-xs text-muted-foreground">{taskStatusLabel(t.status)}</span>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate(`/planlegging/${projectId}?tab=oppgaver`)}>
            Gå til Oppgaver
          </Button>
        </Section>
      )}

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button variant="ghost" onClick={back}>Avbryt</Button>
        <Button onClick={save} disabled={saveWorkPackage.isPending}>
          {isNew ? "Opprett arbeidspakke" : "Lagre"}
        </Button>
      </div>
    </div>
  );
}
