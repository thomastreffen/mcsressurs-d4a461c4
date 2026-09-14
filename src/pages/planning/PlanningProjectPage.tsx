import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Building2, CalendarDays, User, Users } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import {
  usePlanningActivity,
  usePlanningChildren,
  usePlanningLookups,
  usePlanningMutations,
  usePlanningProject,
} from "@/hooks/usePlanning";
import {
  PLANNING_STATUS_LABELS,
  PLANNING_STATUS_ORDER,
  formatPeriod,
  planningCertainty,
  type PlanningStatus,
} from "@/lib/planning";
import { PlanningOverview } from "@/components/planning/PlanningOverview";
import { PlanningWorkPackages } from "@/components/planning/PlanningWorkPackages";
import { PlanningTasks } from "@/components/planning/PlanningTasks";
import { PlanningFiles } from "@/components/planning/PlanningFiles";
import { PlanningContacts } from "@/components/planning/PlanningContacts";
import { PlanningEconomy } from "@/components/planning/PlanningEconomy";
import { PlanningThread } from "@/components/planning/PlanningThread";

export default function PlanningProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "oversikt";

  const { data: project, isLoading } = usePlanningProject(id);
  const { data: children } = usePlanningChildren(id);
  const { data: lookups } = usePlanningLookups();
  const { data: activity } = usePlanningActivity(id);
  const { updateProject } = usePlanningMutations(id);

  const setTab = (t: string) => setParams({ tab: t }, { replace: true });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">Fant ikke prosjektet, eller du har ikke tilgang til det.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/planlegging")}>
            Tilbake til Planlegging
          </Button>
        </Card>
      </div>
    );
  }

  const nameOf = (list: { id: string; name: string }[] | undefined, x: string | null) =>
    (x && list?.find((c) => c.id === x)?.name) || null;
  const ownerName = (x: string | null) => (x && lookups?.users.find((u) => u.user_id === x)?.name) || null;
  const cert = planningCertainty(project.status);

  const changeStatus = async (status: string) => {
    try {
      await updateProject.mutateAsync({
        id: project.id,
        patch: { status },
        logSummary: `Status endret til ${PLANNING_STATUS_LABELS[status as PlanningStatus] ?? status}`,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke endre status");
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/planlegging")}>
        <ArrowLeft className="h-4 w-4" /> Planlegging
      </Button>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
              <Badge variant={cert.tone === "success" ? "default" : "secondary"}>{cert.label}</Badge>
            </div>
            {project.description && <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>}
          </div>
          <Select value={project.status} onValueChange={changeStatus}>
            <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLANNING_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>{PLANNING_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {nameOf(lookups?.customers, project.customer_id) ?? "Kunde ikke satt"}
          </span>
          <span className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            {[nameOf(lookups?.companies, project.company_id), nameOf(lookups?.departments as any, project.department_id)]
              .filter(Boolean)
              .join(" · ") || "Selskap ikke satt"}
          </span>
          <span className="flex items-center gap-1.5">
            <User className="h-4 w-4" />
            {ownerName(project.owner_user_id) ?? "Ansvarlig ikke satt"}
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {formatPeriod(project.expected_start, project.expected_end, project.period_label)}
          </span>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
          <TabsTrigger value="samtale">Samtale</TabsTrigger>
          <TabsTrigger value="arbeidspakker">Arbeidspakker</TabsTrigger>
          <TabsTrigger value="oppgaver">Oppgaver</TabsTrigger>
          <TabsTrigger value="filer">Filer</TabsTrigger>
          <TabsTrigger value="okonomi">Økonomi</TabsTrigger>
          <TabsTrigger value="kontakter">Kontakter</TabsTrigger>
          <TabsTrigger value="historikk">Historikk</TabsTrigger>
        </TabsList>

        <div className="pt-6">
          <TabsContent value="oversikt">
            <PlanningOverview
              project={project}
              workPackages={children?.workPackages ?? []}
              tasks={children?.tasks ?? []}
              contacts={children?.contacts ?? []}
              onGoTo={setTab}
            />
          </TabsContent>
          <TabsContent value="samtale">
            <PlanningThread projectId={project.id} messages={children?.messages ?? []} />
          </TabsContent>
          <TabsContent value="arbeidspakker">
            <PlanningWorkPackages project={project} workPackages={children?.workPackages ?? []} />
          </TabsContent>
          <TabsContent value="oppgaver">
            <PlanningTasks
              projectId={project.id}
              tasks={children?.tasks ?? []}
              workPackages={children?.workPackages ?? []}
            />
          </TabsContent>
          <TabsContent value="filer">
            <PlanningFiles projectId={project.id} files={children?.files ?? []} />
          </TabsContent>
          <TabsContent value="okonomi">
            <PlanningEconomy project={project} workPackages={children?.workPackages ?? []} />
          </TabsContent>
          <TabsContent value="kontakter">
            <PlanningContacts
              projectId={project.id}
              contacts={children?.contacts ?? []}
              externalRefs={children?.externalRefs ?? []}
            />
          </TabsContent>
          <TabsContent value="historikk">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Historikk</h2>
              {(activity ?? []).length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">Ingen hendelser ennå.</Card>
              ) : (
                <div className="space-y-2">
                  {(activity ?? []).map((a) => (
                    <Card key={a.id} className="p-3">
                      <p className="text-sm text-foreground">{a.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.performed_by_name ?? "System"} ·{" "}
                        {format(new Date(a.created_at), "d. MMM yyyy HH:mm", { locale: nb })}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
