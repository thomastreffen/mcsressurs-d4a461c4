import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TechnicianMultiSelect } from "./TechnicianMultiSelect";
import { JobStatusBadge } from "./JobStatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  AlertTriangle,
  ExternalLink,
  Clock,
  MapPin,
  User,
  Loader2,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";
import type { JobStatus } from "@/lib/job-status";

interface JobQuickEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: CalendarEvent | null;
  onUpdated?: () => void;
}

export function JobQuickEditSheet({
  open,
  onOpenChange,
  job,
  onUpdated,
}: JobQuickEditSheetProps) {
  const navigate = useNavigate();

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [techIds, setTechIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<
    { techName: string; jobTitle: string; start: string; end: string }[]
  >([]);

  // Populate from job
  useEffect(() => {
    if (job && open) {
      setDate(format(job.start, "yyyy-MM-dd"));
      setStartTime(format(job.start, "HH:mm"));
      setEndTime(format(job.end, "HH:mm"));
      setTechIds(job.technicians.map((t) => t.id));
      setConflicts([]);
    }
  }, [job, open]);

  // Conflict check
  const checkConflicts = useCallback(
    async (d: string, s: string, e: string, techs: string[]) => {
      if (!d || techs.length === 0 || !job) {
        setConflicts([]);
        return;
      }
      try {
        const startISO = new Date(`${d}T${s}`).toISOString();
        const endISO = new Date(`${d}T${e}`).toISOString();

        const { data: overlaps } = await (supabase as any).rpc("find_work_visit_conflicts", {
          p_technician_ids: techs, p_start: startISO, p_end: endISO, p_exclude_event_id: job.id,
        });

        const found: typeof conflicts = [];
        for (const row of overlaps || []) {
          found.push({ techName: row.technician_name || "Ukjent", jobTitle: row.event_title,
            start: format(new Date(row.conflict_start), "HH:mm"), end: format(new Date(row.conflict_end), "HH:mm") });
        }
        setConflicts(found);
      } catch {
        setConflicts([]);
      }
    },
    [job]
  );

  // Auto-check conflicts
  useEffect(() => {
    if (!open || !job) return;
    const timer = setTimeout(() => {
      checkConflicts(date, startTime, endTime, techIds);
    }, 500);
    return () => clearTimeout(timer);
  }, [date, startTime, endTime, techIds, open, job, checkConflicts]);

  const handleSave = async () => {
    if (!job) return;
    setSaving(true);
    try {
      const startISO = new Date(`${date}T${startTime}`).toISOString();
      const endISO = new Date(`${date}T${endTime}`).toISOString();

      // Update event time
      const { error: updateErr } = await supabase
        .from("events")
        .update({ start_time: startISO, end_time: endISO })
        .eq("id", job.id);

      if (updateErr) throw updateErr;

      // Sync technicians – get current, add new, remove old
      const { data: existing } = await supabase
        .from("event_technicians")
        .select("id, technician_id")
        .eq("event_id", job.id);

      const existingIds = new Set((existing || []).map((e) => e.technician_id));
      const newIds = new Set(techIds);

      const toAdd = techIds.filter((id) => !existingIds.has(id));
      const toRemove = (existing || []).filter(
        (e) => !newIds.has(e.technician_id)
      );

      if (toRemove.length > 0) {
        await supabase
          .from("event_technicians")
          .delete()
          .in(
            "id",
            toRemove.map((r) => r.id)
          );

        // Clean up orphaned job_approvals for removed technicians
        const removedTechIds = toRemove.map((r) => r.technician_id);
        const { data: removedTechs } = await supabase
          .from("technicians")
          .select("user_id")
          .in("id", removedTechIds);
        const removedUserIds = (removedTechs || []).map((t: any) => t.user_id).filter(Boolean);
        if (removedUserIds.length > 0) {
          await supabase
            .from("job_approvals")
            .delete()
            .eq("job_id", job.id)
            .in("technician_user_id", removedUserIds);
        }
      }

      if (toAdd.length > 0) {
        await supabase.from("event_technicians").insert(
          toAdd.map((tid) => ({
            event_id: job.id,
            technician_id: tid,
          }))
        );
      }

      // Trigger re-approval if technicians changed
      if (toAdd.length > 0) {
        await supabase.functions.invoke("create-approval", {
          body: { job_id: job.id },
        });
      }

      toast.success("Oppdatering lagret", {
        description: "Tid og ressurser er oppdatert.",
      });
      onOpenChange(false);
      onUpdated?.();
    } catch (err: any) {
      toast.error("Kunne ikke lagre", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (!job) return null;

  const hasChanges =
    date !== format(job.start, "yyyy-MM-dd") ||
    startTime !== format(job.start, "HH:mm") ||
    endTime !== format(job.end, "HH:mm") ||
    JSON.stringify(techIds.sort()) !==
      JSON.stringify(job.technicians.map((t) => t.id).sort());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[440px] flex flex-col">
        <SheetHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-lg leading-tight truncate">
                {job.title}
              </SheetTitle>
              <SheetDescription className="mt-1">
                Rediger tid og ressurser direkte
              </SheetDescription>
            </div>
            <JobStatusBadge status={job.status} />
          </div>

          {/* Info summary */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {job.customer && (
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {job.customer}
              </span>
            )}
            {job.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {job.address}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {format(job.start, "d. MMM yyyy", { locale: nb })}
            </span>
          </div>
        </SheetHeader>

        <div className="flex-1 mt-6 space-y-5 overflow-y-auto">
          {/* Date & Time */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tidspunkt
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Dato</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Start</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Slutt</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Technicians */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ressurser
            </Label>
            <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />
          </div>

          {/* Conflict warnings */}
          {conflicts.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p className="text-sm font-semibold">Kalenderkonflikt</p>
              </div>
              {conflicts.map((c, i) => (
                <p
                  key={i}
                  className="text-xs text-amber-700/80 dark:text-amber-400/80 ml-6"
                >
                  {c.techName}: «{c.jobTitle}» ({c.start}–{c.end})
                </p>
              ))}
              <p className="text-xs text-amber-600/70 dark:text-amber-500/70 ml-6">
                Du kan fortsatt lagre, men montøren er allerede booket.
              </p>
            </div>
          )}
        </div>

        <SheetFooter className="mt-4 flex-col gap-2 sm:flex-col">
          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={() => {
                onOpenChange(false);
                navigate(`/projects/${job.id}`);
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Åpne prosjekt
            </Button>
            <Button
              className="flex-1 gap-1.5"
              onClick={handleSave}
              disabled={saving || !hasChanges || techIds.length === 0}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving
                ? "Lagrer..."
                : conflicts.length > 0
                ? "Lagre likevel"
                : "Lagre endringer"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
