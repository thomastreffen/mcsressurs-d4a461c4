import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, CalendarDays, Users, Building2, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import {
  usePlanningFinance,
  usePlanningLookups,
  usePlanningMutations,
  usePlanningStaffing,
  staffingLabel,
  type PlanningProject,
  type PlanningWorkPackage,
} from "@/hooks/usePlanning";
import {
  ASSIGNMENT_STATES,
  CONTRACT_FORMS,
  WP_STATUSES,
  assignmentStateLabel,
  formatMoney,
  formatPeriod,
  resourceNeedLabel,
  wpStatusLabel,
} from "@/lib/planning";

const NONE = "__none__";
const sb = supabase as any;

function emptyWp(): Partial<PlanningWorkPackage> {
  return { name: "", status: "planned", price_form: "unclear", assignment_state: "not_assigned" };
}

export function PlanningWorkPackages({
  project,
  workPackages: rawWorkPackages,
}: {
  project: PlanningProject;
  workPackages: PlanningWorkPackage[];
}) {
  const { data: finance } = usePlanningFinance(project.id);
  const canSeeFinance = !!finance;
  // Priser flettes kun inn når databasen har gitt tilgang til dem
  const workPackages = rawWorkPackages.map((w) => {
    const f = finance?.work_packages.find((x) => x.id === w.id);
    return f ? { ...w, agreed_price: f.agreed_price, hourly_rate: f.hourly_rate } : { ...w, agreed_price: null, hourly_rate: null };
  });
  const { data: staffing } = usePlanningStaffing(project.id);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { data: lookups } = usePlanningLookups();
  const { saveWorkPackage, deleteWorkPackage, updateProject, invalidate } = usePlanningMutations(project.id);

  const [editing, setEditing] = useState<Partial<PlanningWorkPackage> | null>(null);
  const canSeeResourcePlan = hasPermission("resourceplan.view");

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null | undefined) =>
    (id && list?.find((x) => x.id === id)?.name) || null;

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast.error("Arbeidspakken må ha et navn");
      return;
    }
    const patch = { ...editing };
    // Avdelingstildeling alene er nok – konkrete personer velges av avdelingen selv.
    if (patch.assignment_state === "not_assigned" && patch.responsible_department_id) {
      patch.assignment_state = "department_assigned";
    }
    const id = patch.id;
    delete (patch as any).id;
    try {
      await saveWorkPackage.mutateAsync({ id, patch });
      toast.success(id ? "Arbeidspakke oppdatert" : "Arbeidspakke opprettet");
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke lagre");
    }
  };

  /** Oppretter et oppdrag i eksisterende ressursplan – personer velges der. */
  const sendToResourcePlan = async (wp: PlanningWorkPackage) => {
    if (!wp.planned_start) {
      toast.error("Sett planlagt start før arbeidspakken sendes til ressursplan");
      return;
    }
    if (sendingId) return;
    setSendingId(wp.id);
    try {
      // Idempotent i databasen: låser arbeidspakken og gjenbruker eksisterende oppdrag
      const { data, error } = await sb.rpc("send_planning_wp_to_resource_plan", { _wp_id: wp.id });
      if (error) throw error;
      invalidate();
      if (!data?.created) {
        toast.info("Arbeidspakken ligger allerede i ressursplanen");
        return;
      }
      if (project.status === "confirmed" || project.status === "early_planning" || project.status === "probable") {
        await updateProject.mutateAsync({
          id: project.id,
          patch: { status: "ready_for_resource_plan" },
          logSummary: "Status satt til Klar for ressursplan",
        });
      }
      toast.success("Sendt til ressursplan – avdelingen velger personer der");
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke sende til ressursplan");
    } finally {
      setSendingId(null);
    }
  };

  const departments = (lookups?.departments ?? []).filter(
    (d) => !editing?.responsible_company_id || d.company_id === editing.responsible_company_id,
  );
  const people = (lookups?.people ?? []).filter(
    (p) =>
      (!editing?.responsible_company_id || p.company_id === editing.responsible_company_id) &&
      (!editing?.responsible_department_id || p.department_id === editing.responsible_department_id),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Arbeidspakker</h2>
          <p className="text-sm text-muted-foreground">
            Tildel en pakke til en avdeling – avdelingen velger selv hvilke personer som utfører jobben.
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setEditing(emptyWp())}>
          <Plus className="h-4 w-4" /> Ny arbeidspakke
        </Button>
      </div>

      {workPackages.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Ingen arbeidspakker ennå.</Card>
      ) : (
        <div className="space-y-3">
          {workPackages.map((wp) => {
            const need = resourceNeedLabel(wp.resource_count, wp.estimated_hours);
            return (
              <Card key={wp.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-foreground">{wp.name}</h3>
                    {wp.description && <p className="text-sm text-muted-foreground">{wp.description}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary">{wpStatusLabel(wp.status)}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(wp)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Slette arbeidspakken?")) deleteWorkPackage.mutate(wp.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {[
                      nameOf(lookups?.companies, wp.responsible_company_id),
                      nameOf(lookups?.departments as any, wp.responsible_department_id),
                      wp.external_vendor_name,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Ansvarlig ikke satt"}
                  </span>
                  {nameOf(lookups?.people as any, wp.responsible_person_id) && (
                    <span>Ansvarlig: {nameOf(lookups?.people as any, wp.responsible_person_id)}</span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatPeriod(wp.planned_start, wp.planned_end, null)}
                  </span>
                  {need && (
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {need}
                    </span>
                  )}
                  <span>
                    {CONTRACT_FORMS.find((c) => c.value === wp.price_form)?.label ?? "Ikke avklart"}
                    {canSeeFinance && wp.agreed_price ? ` · ${formatMoney(wp.agreed_price)}` : ""}
                    {canSeeFinance && wp.hourly_rate ? ` · ${formatMoney(wp.hourly_rate)}/t` : ""}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={wp.assignment_state === "not_assigned" ? "border-warning/40 text-warning" : ""}
                  >
                    {assignmentStateLabel(wp.assignment_state)}
                  </Badge>
                  {(() => {
                    const st = staffing?.[wp.id];
                    const sl = staffingLabel(st);
                    return (
                      <>
                        {sl && (
                          <Badge
                            variant="outline"
                            className={
                              sl.tone === "warn" ? "border-warning/40 text-warning"
                              : sl.tone === "partial" ? "border-primary/40 text-primary"
                              : "border-success/40 text-success"
                            }
                          >
                            {sl.label}
                          </Badge>
                        )}
                        {st?.date_mismatch && (
                          <Badge variant="outline" className="border-destructive/40 text-destructive">
                            Avvik: datoen i Ressursplan er ikke justert
                          </Badge>
                        )}
                        {st?.event_missing && (
                          <Badge variant="outline" className="border-destructive/40 text-destructive">
                            Oppdraget er fjernet fra Ressursplan
                          </Badge>
                        )}
                      </>
                    );
                  })()}
                  {wp.linked_event_id ? (
                    canSeeResourcePlan ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => navigate(`/projects/${wp.linked_event_id}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Åpne MCS-jobb
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Ligger i ressursplan</span>
                    )
                  ) : (
                    canSeeResourcePlan && (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs" disabled={sendingId === wp.id} onClick={() => sendToResourcePlan(wp)}>
                        <Send className="h-3.5 w-3.5" /> Send til ressursplan
                      </Button>
                    )
                  )}
                </div>
                {wp.comment && <p className="text-xs text-muted-foreground">{wp.comment}</p>}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Rediger arbeidspakke" : "Ny arbeidspakke"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wp-name">Navn *</Label>
                <Input
                  id="wp-name"
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="F.eks. Montere strømskinner"
                />
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
                  <Label>Ansvarlig selskap</Label>
                  <Select
                    value={editing.responsible_company_id ?? NONE}
                    onValueChange={(v) =>
                      setEditing({
                        ...editing,
                        responsible_company_id: v === NONE ? null : v,
                        responsible_department_id: null,
                        responsible_person_id: null,
                      })
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Ikke valgt</SelectItem>
                      {(lookups?.planCompanies ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ansvarlig avdeling</Label>
                  <Select
                    value={editing.responsible_department_id ?? NONE}
                    onValueChange={(v) =>
                      setEditing({ ...editing, responsible_department_id: v === NONE ? null : v, responsible_person_id: null })
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Ikke valgt</SelectItem>
                      {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ansvarlig person (valgfritt)</Label>
                  <Select
                    value={editing.responsible_person_id ?? NONE}
                    onValueChange={(v) => setEditing({ ...editing, responsible_person_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Velges av avdelingen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Ikke valgt</SelectItem>
                      {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ekstern leverandør</Label>
                  <Input
                    value={editing.external_vendor_name ?? ""}
                    onChange={(e) => setEditing({ ...editing, external_vendor_name: e.target.value })}
                    placeholder="F.eks. Powercontrol"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={editing.status ?? "planned"}
                    onValueChange={(v) => setEditing({ ...editing, status: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WP_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tildeling</Label>
                  <Select
                    value={editing.assignment_state ?? "not_assigned"}
                    onValueChange={(v) => setEditing({ ...editing, assignment_state: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ASSIGNMENT_STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Planlagt start</Label>
                  <Input
                    type="date"
                    value={editing.planned_start ?? ""}
                    onChange={(e) => setEditing({ ...editing, planned_start: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Planlagt slutt</Label>
                  <Input
                    type="date"
                    value={editing.planned_end ?? ""}
                    onChange={(e) => setEditing({ ...editing, planned_end: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Antall personer</Label>
                  <Input
                    type="number"
                    value={editing.resource_count ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, resource_count: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Estimerte timer</Label>
                  <Input
                    type="number"
                    value={editing.estimated_hours ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, estimated_hours: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Prisform</Label>
                  <Select
                    value={editing.price_form ?? "unclear"}
                    onValueChange={(v) => setEditing({ ...editing, price_form: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTRACT_FORMS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {canSeeFinance && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="wp-agreed-price">Avtalt pris</Label>
                      <Input
                        id="wp-agreed-price"
                        type="number"
                        value={editing.agreed_price ?? ""}
                        onChange={(e) => setEditing({ ...editing, agreed_price: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="wp-hourly-rate">Timepris</Label>
                      <Input
                        id="wp-hourly-rate"
                        type="number"
                        value={editing.hourly_rate ?? ""}
                        onChange={(e) => setEditing({ ...editing, hourly_rate: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <Label>Fakturerer</Label>
                  <Select
                    value={editing.billing_from_company_id ?? NONE}
                    onValueChange={(v) => setEditing({ ...editing, billing_from_company_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Velg selskap" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Ikke valgt</SelectItem>
                      {(lookups?.planCompanies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Faktureres til</Label>
                  <Select
                    value={editing.billing_to_company_id ?? NONE}
                    onValueChange={(v) => setEditing({ ...editing, billing_to_company_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Velg selskap" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Ikke valgt</SelectItem>
                      {(lookups?.companies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Kommentar</Label>
                <Textarea
                  rows={2}
                  value={editing.comment ?? ""}
                  onChange={(e) => setEditing({ ...editing, comment: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Avbryt</Button>
            <Button onClick={save} disabled={saveWorkPackage.isPending}>Lagre</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
