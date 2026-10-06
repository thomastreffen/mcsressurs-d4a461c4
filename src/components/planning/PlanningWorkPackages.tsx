import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, CalendarDays, Users, Building2, ExternalLink, Send, User, ChevronRight } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  usePlanningAssignees,
  usePlanningFinance,
  usePlanningLookups,
  usePlanningStaffing,
  type PlanningProject,
  type PlanningWorkPackage,
} from "@/hooks/usePlanning";
import { CONTRACT_FORMS, formatMoney, formatPeriod, resourceNeedLabel, wpStatusLabel } from "@/lib/planning";
import { WorkPackageStaffing } from "./WorkPackageStaffing";
import { useSendWpToResourcePlan } from "./useSendWpToResourcePlan";

export function PlanningWorkPackages({
  project,
  workPackages: rawWorkPackages,
}: {
  project: PlanningProject;
  workPackages: PlanningWorkPackage[];
}) {
  const { data: finance } = usePlanningFinance(project.id);
  const canSeeFinance = !!finance;
  const workPackages = rawWorkPackages.map((w) => {
    const f = finance?.work_packages.find((x) => x.id === w.id);
    return { ...w, agreed_price: f?.agreed_price ?? null, hourly_rate: f?.hourly_rate ?? null };
  });
  const { data: staffing } = usePlanningStaffing(project.id);
  const { data: assignees } = usePlanningAssignees(project.id);
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { data: lookups } = usePlanningLookups();
  const { send, sendingId } = useSendWpToResourcePlan(project);
  const canSeeResourcePlan = hasPermission("resourceplan.view");

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null | undefined) =>
    (id && list?.find((x) => x.id === id)?.name) || null;
  const open = (wp: PlanningWorkPackage) => navigate(`/planlegging/${project.id}/arbeidspakker/${wp.id}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Arbeidspakker</h2>
          <p className="text-sm text-muted-foreground">
            Hver arbeidspakke er en del av utførelsen: hvem gjør hva, hvem styrer, når og til hvilken pris.
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => navigate(`/planlegging/${project.id}/arbeidspakker/ny`)}>
          <Plus className="h-4 w-4" /> Ny arbeidspakke
        </Button>
      </div>

      {workPackages.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Ingen arbeidspakker ennå.</Card>
      ) : (
        <div className="space-y-3">
          {workPackages.map((wp, i) => {
            const need = resourceNeedLabel(wp.resource_count, wp.estimated_hours);
            const responsible = nameOf(lookups?.people as any, wp.responsible_person_id);
            return (
              <Card key={wp.id} className="space-y-3 p-4">
                <button type="button" onClick={() => open(wp)} className="flex w-full items-start justify-between gap-2 text-left">
                  <div>
                    <h3 className="font-semibold text-foreground">
                      <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                      {wp.name}
                    </h3>
                    {wp.description && <p className="text-sm text-muted-foreground">{wp.description}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary">{wpStatusLabel(wp.status)}</Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>

                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {[
                      nameOf(lookups?.companies, wp.responsible_company_id) ?? wp.external_vendor_name,
                      nameOf(lookups?.departments as any, wp.responsible_department_id),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Utførende ikke satt"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {responsible ? `Ansvarlig: ${responsible}` : "Ansvarlig ikke satt"}
                  </span>
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

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <WorkPackageStaffing assignmentState={wp.assignment_state} staffing={staffing?.[wp.id]} assignees={assignees?.[wp.id]} compact />
                  {wp.linked_event_id ? (
                    canSeeResourcePlan ? (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => navigate(`/projects/${wp.linked_event_id}`)}>
                        <ExternalLink className="h-3.5 w-3.5" /> Åpne MCS-jobb
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Ligger i ressursplan</span>
                    )
                  ) : (
                    canSeeResourcePlan && (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs" disabled={sendingId === wp.id} onClick={() => send(wp)}>
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
    </div>
  );
}
