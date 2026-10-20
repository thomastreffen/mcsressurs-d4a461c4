import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { ArrowLeft, MapPin, Users, CalendarDays, MessageSquare, FileText, Package, ShieldCheck, ClipboardList, MoreHorizontal, Hammer, Settings, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyModuleAccess } from "@/hooks/useCompanyModuleAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { JOB_STATUS_CONFIG } from "@/lib/job-status";
import { formatHubId, formatProjectLabel } from "@/lib/project-reference";
import type { Job } from "@/lib/mock-data";

interface Props {
  job: Job; financialProjectNumber: string | null; technicianNames: string[];
  activeTab: string; onTabChange: (tab: string) => void;
}
export function MobileProjectHome({ job, financialProjectNumber, technicianNames, activeTab, onTabChange }: Props) {
  const navigate = useNavigate();
  const access = useCompanyModuleAccess();
  const { hasPermission } = usePermissions();
  const { data: next, isError: nextError, isFetching: nextLoading } = useQuery({
    queryKey: ["mobile-project-next", job.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedule_blocks")
        .select("id,job_id,title,start_at,end_at,job:events!schedule_blocks_job_id_fkey(title)")
        .or(`project_id.eq.${job.id},job_id.eq.${job.id}`)
        .is("deleted_at", null).gt("end_at", new Date().toISOString()).order("start_at").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const actions = [
    { key: "plan", label: "Oppdrag og plan", icon: CalendarDays },
    { key: "epost", label: "Samtaler", icon: MessageSquare },
    { key: "dokumenter", label: "Filer", icon: FileText },
    { key: "materiell", label: "Materiell", icon: Package },
    { key: "skjemaer", label: "Skjemaer", icon: ClipboardList },
    { key: "risiko", label: "Risiko / HMS", icon: ShieldCheck },
  ];
  const activeLabel = [...actions, { key: "servicearbeid", label: "Service" }, { key: "okonomi", label: "Økonomi" }].find(a => a.key === activeTab)?.label;
  const number = financialProjectNumber ? `Prosjektnr. ${financialProjectNumber}` : job.projectNumber ?? formatHubId(job.internalNumber, job.jobNumber);
  return <div className="space-y-5 px-4 py-4 min-w-0">
    <div className="flex justify-between items-center gap-2">
      <Button variant="ghost" className="-ml-3" onClick={() => activeTab === "home" ? navigate("/projects") : onTabChange("home")}><ArrowLeft />{activeTab === "home" ? "Prosjekter" : "Prosjekt-hjem"}</Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Flere prosjekthandlinger"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="min-h-11" onSelect={() => onTabChange("servicearbeid")}><Hammer className="mr-2 h-4 w-4" />Service</DropdownMenuItem>
          {access.can("finance") && hasPermission("jobs.view_pricing") && <DropdownMenuItem className="min-h-11" onSelect={() => onTabChange("okonomi")}>Økonomi</DropdownMenuItem>}
          {hasPermission("projects.edit_plan") && <DropdownMenuItem className="min-h-11" onSelect={() => navigate(`/projects/${job.id}/settings`)}><Settings className="mr-2 h-4 w-4" />Prosjektinnstillinger</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="space-y-2">
      {number && <p className="text-sm font-semibold text-primary break-words">{number}</p>}
      <h1 className="text-2xl font-semibold break-words">{job.title}</h1>
      <Badge variant="secondary">{JOB_STATUS_CONFIG[job.status]?.label ?? job.status}</Badge>
      {job.customer && <p className="text-base text-muted-foreground break-words">{job.customer}</p>}
      {job.address && <p className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4 mt-0.5 shrink-0" /><span className="break-words">{job.address}</span></p>}
    </div>
    {activeTab === "home" ? <>
      <section className="border-t border-border pt-4 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Neste aktivitet</h2>
        {next ? <Button variant="outline" className="h-auto w-full p-4 justify-start whitespace-normal text-left" onClick={() => onTabChange("plan")}>
          <div className="min-w-0 flex-1 space-y-1"><p className="text-base font-semibold break-words">{formatProjectLabel(financialProjectNumber, next.job?.title ?? next.title)}</p><p className="text-sm text-muted-foreground">{format(new Date(next.start_at), "EEE d. MMM · HH:mm", { locale: nb })}–{format(new Date(next.end_at), "HH:mm")}</p></div><ChevronRight />
        </Button> : <p className="text-sm text-muted-foreground">{nextLoading ? "Henter neste aktivitet…" : nextError ? "Kunne ikke hente neste aktivitet." : "Ingen kommende ressursbookinger."}</p>}
        <Button className="w-full h-12" onClick={() => onTabChange("plan")}><CalendarDays />{hasPermission("projects.edit_plan") ? "Planlegg oppdrag" : "Se oppdrag og plan"}</Button>
      </section>
      <section className="space-y-3" aria-label="Prosjekthandlinger"><div className="grid grid-cols-2 gap-3">{actions.filter(a => a.key !== "plan").map(a => <Button key={a.key} variant="outline" className="min-h-20 h-auto flex-col gap-2 px-2 py-3 whitespace-normal" onClick={() => onTabChange(a.key)}><a.icon /><span>{a.label}</span></Button>)}</div></section>
      <section className="border-t border-border pt-4 space-y-2"><h2 className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" />Involverte montører</h2><p className="text-sm text-muted-foreground break-words">{technicianNames.length ? technicianNames.join(", ") : "Ingen montører tildelt"}</p></section>
    </> : <div className="flex items-center justify-between border-t border-border pt-4"><h2 className="text-lg font-semibold">{activeLabel}</h2><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">Bytt visning<MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{actions.map(a => <DropdownMenuItem key={a.key} className="min-h-11" onSelect={() => onTabChange(a.key)}>{a.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div>}
  </div>;
}