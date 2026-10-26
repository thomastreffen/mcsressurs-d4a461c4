import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, User, ExternalLink, CheckCircle2, Clock, PlayCircle, Link2, MapPin, Send } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { invokeWithSession } from "@/lib/invoke-session";

interface LinkedTaskSectionProps {
  submissionId: string;
  convertedToId?: string | null;
  convertedToType?: string | null;
  linkedEventId?: string | null;
  onManageLink?: () => void;
}

const EXECUTION_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: "Utkast", color: "bg-muted text-muted-foreground", icon: <Clock className="h-3 w-3" /> },
  scheduled: { label: "Planlagt", color: "bg-cyan-100 text-cyan-800", icon: <CalendarDays className="h-3 w-3" /> },
  confirmed: { label: "Bekreftet", color: "bg-blue-100 text-blue-800", icon: <CheckCircle2 className="h-3 w-3" /> },
  in_progress: { label: "Under arbeid", color: "bg-purple-100 text-purple-800", icon: <PlayCircle className="h-3 w-3" /> },
  completed: { label: "Ferdig", color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-3 w-3" /> },
};

export function LinkedTaskSection({
  submissionId,
  convertedToId,
  convertedToType,
  linkedEventId,
  onManageLink,
}: LinkedTaskSectionProps) {
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);

  const resendJobInfo = async (jobId: string) => {
    setResending(true);
    try {
      const { data, error } = await invokeWithSession("create-approval", { body: { job_id: jobId, resend: true } });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      const results: any[] = (data as any)?.results || [];
      const sent = results.filter((r) => r.emailSent).length;
      const failed = results.filter((r) => !r.emailSent).length;
      if (sent > 0 && failed === 0) toast.success(`Jobbinfo med vedlegg sendt til ${sent} montør(er)`);
      else if (sent > 0) toast.warning(`Sendt til ${sent}, men ${failed} feilet`);
      else toast.error("E-post ble ikke sendt", { description: "Logg inn på nytt med Microsoft og prøv igjen." });
    } catch (e: any) {
      toast.error("Kunne ikke sende jobbinfo", { description: e?.message });
    } finally {
      setResending(false);
    }
  };

  // Resolution priority:
  // 1. Explicit linked_event_id (admin chose existing task)
  // 2. source_order_form_id (auto-link from "Opprett oppgave")
  // 3. converted_to_id (legacy)
  const { data: linkedTask } = useQuery({
    queryKey: ["linked-task-for-order", submissionId, linkedEventId, convertedToId],
    queryFn: async () => {
      let data: any = null;
      let linkSource: "manual" | "source" | "converted" = "source";

      if (linkedEventId) {
        const res = await supabase
          .from("events")
          .select("id, title, internal_number, project_number, start_time, end_time, status, address, customer, deleted_at")
          .eq("id", linkedEventId)
          .is("deleted_at", null)
          .maybeSingle();
        data = res.data;
        linkSource = "manual";
      }

      if (!data) {
        const res = await supabase
          .from("events")
          .select("id, title, internal_number, project_number, start_time, end_time, status, address, customer, deleted_at")
          .eq("source_order_form_id", submissionId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        data = res.data;
        linkSource = "source";
      }

      if (!data && convertedToId && convertedToType !== "case") {
        const res = await supabase
          .from("events")
          .select("id, title, internal_number, project_number, start_time, end_time, status, address, customer, deleted_at")
          .eq("id", convertedToId)
          .is("deleted_at", null)
          .maybeSingle();
        data = res.data;
        linkSource = "converted";
      }

      if (!data) return null;

      const { data: techs } = await supabase
        .from("event_technicians")
        .select("technician:technicians(id, user_id, person:people(full_name))")
        .eq("event_id", data.id);

      return {
        ...data,
        linkSource,
        technicians: (techs || []).map((t: any) => ({
          name: t.technician?.person?.full_name || "Ukjent",
        })),
      };
    },
  });

  if (!linkedTask) {
    // Empty state — still let admin link
    if (!onManageLink) return null;
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Ingen oppgave koblet til denne bestillingen
          </div>
          <Button size="sm" variant="outline" onClick={onManageLink}>
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            Koble til oppgave
          </Button>
        </CardContent>
      </Card>
    );
  }

  const statusCfg = EXECUTION_STATUS[linkedTask.status] || EXECUTION_STATUS.scheduled;

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Koblet oppgave
          {linkedTask.linkSource === "manual" && (
            <Badge variant="outline" className="text-[9px] h-4">Manuelt koblet</Badge>
          )}
        </CardTitle>
        {onManageLink && (
          <Button variant="ghost" size="sm" onClick={onManageLink} className="h-7 text-xs">
            <Link2 className="h-3 w-3 mr-1" />
            Endre
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">{linkedTask.title}</p>
          <p className="text-xs text-muted-foreground">{linkedTask.project_number || linkedTask.internal_number}</p>
        </div>

        <div className="flex items-center gap-2">
          <Badge className={`text-[10px] ${statusCfg.color}`}>
            {statusCfg.icon}
            <span className="ml-1">{statusCfg.label}</span>
          </Badge>
        </div>

        {linkedTask.start_time && (
          <div className="text-xs">
            <span className="text-muted-foreground">Planlagt: </span>
            <span className="font-medium">
              {format(new Date(linkedTask.start_time), "d. MMM yyyy HH:mm", { locale: nb })}
              {linkedTask.end_time && ` – ${format(new Date(linkedTask.end_time), "HH:mm", { locale: nb })}`}
            </span>
          </div>
        )}

        {linkedTask.address && (
          <div className="text-xs flex items-start gap-1">
            <MapPin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
            <span>{linkedTask.address}</span>
          </div>
        )}

        {linkedTask.technicians.length > 0 && (
          <div className="text-xs">
            <span className="text-muted-foreground">Utfører: </span>
            <span className="font-medium">
              {linkedTask.technicians.map((t: any) => t.name).join(", ")}
            </span>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8"
          onClick={() => navigate(`/projects/plan?openTask=${linkedTask.id}`)}
        >
          <ExternalLink className="h-3 w-3 mr-1.5" />
          Åpne i ressursplan
        </Button>

        {linkedTask.technicians.length > 0 && (
          <Button
            variant="default"
            size="sm"
            className="w-full text-xs h-8"
            disabled={resending}
            onClick={() => resendJobInfo(linkedTask.id)}
          >
            <Send className="h-3 w-3 mr-1.5" />
            {resending ? "Sender…" : "Send info til montør på nytt"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
