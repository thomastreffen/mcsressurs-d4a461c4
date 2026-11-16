import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addMinutes } from "date-fns";
import { nb } from "date-fns/locale";
import { Clock, Loader2, Check, FolderKanban, ListTodo } from "lucide-react";
import { TechnicianMultiSelect } from "@/components/TechnicianMultiSelect";
import { notifyJobAssignment } from "@/lib/notify-job-assignment";

export interface DropPayload {
  taskId?: string;
  taskTitle: string;
  projectId?: string;
  estimatedMinutes?: number;
  priority?: string;
  type: "task" | "project";
  technicianId: string;
  technicianName?: string;
  dropTime: Date;
}

interface DropConfirmPopoverProps {
  payload: DropPayload | null;
  onClose: () => void;
  onCreated: () => void;
}

const DURATION_OPTIONS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 time" },
  { value: "90", label: "1t 30m" },
  { value: "120", label: "2 timer" },
  { value: "180", label: "3 timer" },
  { value: "240", label: "4 timer" },
  { value: "480", label: "Hel dag" },
];

export function DropConfirmPopover({ payload, onClose, onCreated }: DropConfirmPopoverProps) {
  const [duration, setDuration] = useState<string>(
    payload?.estimatedMinutes?.toString() || "60"
  );
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Initialize selected technicians when payload changes
  useEffect(() => {
    if (!payload) return;

    // If project already has assigned technicians, preselect them + the dropped tech
    if (payload.type === "project" && payload.taskId) {
      supabase
        .from("event_technicians")
        .select("technician_id")
        .eq("event_id", payload.taskId)
        .then(({ data }) => {
          const existing = (data || []).map((r) => r.technician_id);
          const merged = new Set([...existing, payload.technicianId]);
          setSelectedTechIds(Array.from(merged));
        });
    } else {
      setSelectedTechIds([payload.technicianId]);
    }
  }, [payload?.taskId, payload?.technicianId, payload?.type]);

  const handleConfirm = useCallback(async () => {
    if (!payload || selectedTechIds.length === 0) return;
    setSaving(true);

    try {
      const durationMin = parseInt(duration, 10);
      const endTime = addMinutes(payload.dropTime, durationMin);
      const startIso = payload.dropTime.toISOString();
      const endIso = endTime.toISOString();

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      // Look up company_id from the first selected technician
      const { data: techData } = await supabase
        .from("technicians")
        .select("company_id")
        .eq("id", selectedTechIds[0])
        .single();

      const companyId = (techData as any)?.company_id;

      // Fetch names for toast
      const { data: techNames } = await supabase
        .from("technicians")
        .select("id, name")
        .in("id", selectedTechIds);
      const nameMap = new Map((techNames || []).map((t) => [t.id, t.name]));

      if (payload.type === "project" && payload.taskId) {
        // ── Project drop: do NOT overwrite event times ──
        // Each drop creates its own schedule_block with independent times.
        // Only update status if still in initial state.
        const { data: currentEvent } = await supabase
          .from("events")
          .select("status")
          .eq("id", payload.taskId)
          .single();
        
        if (currentEvent && ["requested", "planned"].includes((currentEvent as any).status)) {
          await supabase
            .from("events")
            .update({ status: "scheduled" as any })
            .eq("id", payload.taskId);
        }

        // For each selected technician: assignment + schedule block
        for (const techId of selectedTechIds) {
          // Idempotent assignment
          const { data: existing } = await supabase
            .from("event_technicians")
            .select("id")
            .eq("event_id", payload.taskId)
            .eq("technician_id", techId)
            .maybeSingle();

          if (!existing) {
            await supabase.from("event_technicians").insert({
              event_id: payload.taskId,
              technician_id: techId,
            });
          }

          // Idempotency guard: skip insert if an identical active block already exists
          const { data: existingBlock } = await (supabase as any)
            .from("schedule_blocks")
            .select("id")
            .eq("technician_id", techId)
            .eq("project_id", payload.taskId)
            .eq("start_at", startIso)
            .eq("end_at", endIso)
            .is("deleted_at", null)
            .maybeSingle();

          if (existingBlock?.id) {
            console.warn("[DropConfirm] Skipping duplicate schedule_block insert", {
              existingId: existingBlock.id,
              techId,
              projectId: payload.taskId,
              start: startIso,
              end: endIso,
            });
            continue;
          }

          // Create schedule block per technician — each drop creates a unique block
          const { data: sbData } = await (supabase as any).from("schedule_blocks").insert({
            company_id: companyId,
            technician_id: techId,
            project_id: payload.taskId,
            source: "manual",
            start_at: startIso,
            end_at: endIso,
            title: payload.taskTitle,
            match_state: "manual",
            match_confidence: 100,
            match_reason: "Prosjekt dratt til kalender",
          }).select("id").single();
          console.info("[DropConfirm] Created schedule_block", { blockId: sbData?.id, techId, projectId: payload.taskId, start: startIso, end: endIso });

        }

        // Log activity
        const names = selectedTechIds.map((id) => nameMap.get(id) || "Montør").join(", ");
        await supabase.from("event_logs").insert({
          event_id: payload.taskId,
          action_type: "technician_assigned",
          performed_by: userId || null,
          change_summary: `${names} tildelt via drag-planlegging kl. ${format(payload.dropTime, "HH:mm")}–${format(endTime, "HH:mm")}`,
        });
        await notifyJobAssignment(payload.taskId, selectedTechIds, false);

      } else {
        // ── Task drop: create schedule blocks for each technician ──
        for (const techId of selectedTechIds) {
          // Idempotency guard
          let dupQuery = (supabase as any)
            .from("schedule_blocks")
            .select("id")
            .eq("technician_id", techId)
            .eq("start_at", startIso)
            .eq("end_at", endIso)
            .is("deleted_at", null);
          dupQuery = payload.taskId
            ? dupQuery.eq("job_id", payload.taskId)
            : dupQuery.eq("project_id", payload.projectId || null);
          const { data: existingTaskBlock } = await dupQuery.maybeSingle();
          if (existingTaskBlock?.id) {
            console.warn("[DropConfirm] Skipping duplicate task schedule_block", {
              existingId: existingTaskBlock.id, techId, taskId: payload.taskId, start: startIso, end: endIso,
            });
            continue;
          }

          await (supabase as any).from("schedule_blocks").insert({
            company_id: companyId,
            technician_id: techId,
            project_id: payload.projectId || null,
            source: "manual",
            start_at: startIso,
            end_at: endIso,
            title: payload.taskTitle,
            match_state: "manual",
            match_confidence: 100,
            match_reason: payload.type === "task" ? "Oppgave dratt til kalender" : "Prosjekt dratt til kalender",
          });

        }


        if (payload.taskId) {
          await (supabase as any).from("tasks").update({
            planned_start_at: startIso,
            planned_end_at: endIso,
            assigned_user_id: selectedTechIds[0],
          }).eq("id", payload.taskId);
        }
      }

      const names = selectedTechIds.map((id) => nameMap.get(id) || "montør").join(", ");
      toast.success("Planlagt!", {
        description: `${payload.taskTitle} → ${names} kl. ${format(payload.dropTime, "HH:mm")}–${format(endTime, "HH:mm")}`,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      console.error("Drop confirm error:", err);
      toast.error("Kunne ikke opprette planblokk");
    } finally {
      setSaving(false);
    }
  }, [payload, duration, selectedTechIds, onClose, onCreated]);

  if (!payload) return null;

  const endTime = addMinutes(payload.dropTime, parseInt(duration, 10));
  const isProject = payload.type === "project";
  const TypeIcon = isProject ? FolderKanban : ListTodo;

  return (
    <Sheet open={!!payload} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[520px] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-base">Bekreft planlegging</SheetTitle>
          <SheetDescription className="sr-only">Bekreft planlegging av {isProject ? "jobb" : "oppgave"}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Title with type indicator */}
          <div className="flex items-center gap-2">
            <TypeIcon className={`h-4 w-4 shrink-0 ${isProject ? "text-primary" : "text-accent"}`} />
            <span className="font-semibold text-sm truncate">{payload.taskTitle}</span>
            {isProject && (
              <span className="text-[9px] font-mono font-bold bg-primary/15 text-primary rounded px-1.5 py-0.5 shrink-0">
                Jobb
              </span>
            )}
          </div>

          {/* Time */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Tidspunkt
            </Label>
            <p className="text-sm font-medium">
              {format(payload.dropTime, "EEE d. MMM", { locale: nb })} · {format(payload.dropTime, "HH:mm")} – {format(endTime, "HH:mm")}
            </p>
          </div>

          {/* Duration selector */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Varighet</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Multi-technician selector */}
          <TechnicianMultiSelect
            selectedIds={selectedTechIds}
            onChange={setSelectedTechIds}
          />
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={saving}>
            Avbryt
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1 gap-1.5"
            disabled={saving || selectedTechIds.length === 0}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Planlegg {selectedTechIds.length > 1 ? `(${selectedTechIds.length})` : ""}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
