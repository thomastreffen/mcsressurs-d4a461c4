import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { MapPin, Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";

export interface MobileProjectRow {
  id: string; title: string; customer: string; address: string;
  displayNumber: string; startTime: Date; endTime: Date;
  status: JobStatus; techNames: string[];
}

export function MobileProjectList({ projects, roles, onOpen }: { projects: MobileProjectRow[]; roles: Map<string, string[]>; onOpen: (id: string) => void }) {
  if (!projects.length) return <div className="py-12 text-center text-sm text-muted-foreground">Ingen prosjekter i denne visningen.</div>;
  return <div className="space-y-3" aria-label="Prosjektliste">{projects.map(project => <Button key={project.id} variant="outline" className="w-full h-auto whitespace-normal items-start justify-start p-4 text-left bg-card" onClick={() => onOpen(project.id)}>
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-primary break-words">{project.displayNumber}</span><ChevronRight className="text-muted-foreground shrink-0" /></div>
      <h2 className="text-base font-semibold break-words">{project.title}</h2>
      {project.customer && <p className="text-sm text-muted-foreground break-words">{project.customer}</p>}
      {project.address && <p className="text-sm text-muted-foreground flex items-start gap-2"><MapPin className="mt-0.5 shrink-0" /><span className="break-words">{project.address}</span></p>}
      {Number.isFinite(project.startTime.getTime()) && <p className="text-sm text-muted-foreground flex items-center gap-2"><Clock />{project.startTime <= new Date() && project.endTime >= new Date() ? "Aktiv · " : ""}{format(project.startTime, "d. MMM yyyy", { locale: nb })}</p>}
      {!!roles.get(project.id)?.length && <p className="text-sm text-primary break-words">{roles.get(project.id)?.join(" · ")}</p>}
      <Badge variant="secondary">{JOB_STATUS_CONFIG[project.status]?.label ?? project.status}</Badge>
    </div>
  </Button>)}</div>;
}