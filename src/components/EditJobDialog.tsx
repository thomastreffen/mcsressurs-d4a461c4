import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { TechnicianMultiSelect } from "./TechnicianMultiSelect";
import { FileUpload } from "./FileUpload";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { AlertTriangle, Bell, BellOff, Moon } from "lucide-react";
import type { Attachment } from "@/lib/mock-data";
import { normalizeOvernightDates, isOvernightRange, autoAdjustEndDate } from "@/lib/overnight";
import { TimeSelect } from "@/components/ui/time-select";

interface EditJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onSaved?: () => void;
}

interface ConflictInfo {
  technicianName: string;
  jobTitle: string;
  start: string;
  end: string;
}

export function EditJobDialog({ open, onOpenChange, jobId, onSaved }: EditJobDialogProps) {
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("16:00");
  const [techIds, setTechIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [notifyParticipants, setNotifyParticipants] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);

  const overnight = startDate && startTime && endTime ? isOvernightRange(startDate, startTime, endDate || startDate, endTime) : false;
  const effectiveEndDate = startDate && overnight ? autoAdjustEndDate(startDate, startTime, endTime) : endDate;

  // Fetch existing job data
  useEffect(() => {
    if (!open || !jobId) return;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select(`*, event_technicians ( technician_id )`)
        .eq("id", jobId)
        .single();

      if (error || !data) {
        toast.error("Kunne ikke laste jobbdata");
        onOpenChange(false);
        return;
      }

      const rawTitle = data.title.replace("SERVICE – ", "");
      setTitle(rawTitle);
      setCustomer(data.customer ?? "");
      setAddress(data.address ?? "");
      setDescription(data.description ?? "");
      setJobNumber(data.job_number ?? "");

      const start = new Date(data.start_time);
      const end = new Date(data.end_time);
      setStartDate(format(start, "yyyy-MM-dd"));
      setStartTime(format(start, "HH:mm"));
      setEndDate(format(end, "yyyy-MM-dd"));
      setEndTime(format(end, "HH:mm"));

      setTechIds((data.event_technicians ?? []).map((et: any) => et.technician_id));
      setExistingAttachments(
        Array.isArray(data.attachments) ? (data.attachments as unknown as Attachment[]) : []
      );
      setFiles([]);
      setLoading(false);
    })();
  }, [open, jobId, onOpenChange]);

  // Check conflicts
  const checkConflicts = useCallback(async () => {
    if (!startDate || !startTime || !endDate || !endTime || techIds.length === 0) {
      setConflicts([]);
      return;
    }
    const { startISO, endISO } = normalizeOvernightDates(startDate, startTime, endDate, endTime);

    const { data: overlapping } = await (supabase as any).rpc("find_work_visit_conflicts", {
      p_technician_ids: techIds, p_start: startISO, p_end: endISO, p_exclude_event_id: jobId,
    });

    if (!overlapping) { setConflicts([]); return; }

    const found: ConflictInfo[] = [];
    for (const row of overlapping as any[]) {
      found.push({ technicianName: row.technician_name ?? "Ukjent", jobTitle: row.event_title?.replace("SERVICE – ", "") ?? "",
        start: format(new Date(row.conflict_start), "HH:mm"), end: format(new Date(row.conflict_end), "HH:mm") });
    }
    setConflicts(found);
  }, [startDate, startTime, endDate, endTime, techIds, jobId]);

  useEffect(() => {
    if (open && !loading) checkConflicts();
  }, [open, loading, checkConflicts]);

  const handleRemoveExisting = (name: string) => {
    setExistingAttachments((prev) => prev.filter((a) => a.name !== name));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (techIds.length === 0) return;
    setSubmitting(true);

    try {
      const { startISO, endISO } = normalizeOvernightDates(startDate, startTime, endDate, endTime);
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      let allAttachments = [...existingAttachments];
      for (const file of files) {
        const filePath = `${jobId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("job-attachments").upload(filePath, file);
        if (uploadError) { toast.error(`Kunne ikke laste opp ${file.name}`); continue; }
        const { data: urlData } = supabase.storage.from("job-attachments").getPublicUrl(filePath);
        allAttachments.push({ name: file.name, url: urlData.publicUrl, size: file.size });
      }

      const { error: updateError } = await supabase
        .from("events")
        .update({
          title: `SERVICE – ${title}`,
          customer,
          address,
          description,
          job_number: jobNumber || null,
          start_time: startISO,
          end_time: endISO,
          attachments: allAttachments as any,
          updated_by: userId || null,
        })
        .eq("id", jobId);

      // Keep schedule_blocks snapshot title in sync with the live event title
      await (supabase as any)
        .from("schedule_blocks")
        .update({ title: `SERVICE – ${title}` })
        .or(`project_id.eq.${jobId},job_id.eq.${jobId}`)
        .is("deleted_at", null);


      if (updateError) {
        toast.error("Kunne ikke oppdatere jobb", { description: updateError.message });
        setSubmitting(false);
        return;
      }

      const { data: existingAssignments } = await supabase
        .from("event_technicians")
        .select("technician_id")
        .eq("event_id", jobId);
      const existingTechIds = new Set((existingAssignments || []).map((assignment) => assignment.technician_id));
      const selectedTechIds = new Set(techIds);
      const removedTechIds = [...existingTechIds].filter((technicianId) => !selectedTechIds.has(technicianId));
      const addedTechIds = techIds.filter((technicianId) => !existingTechIds.has(technicianId));

      for (const technicianId of removedTechIds) {
        const { data: unplanResult, error: unplanError } = await supabase.functions.invoke("remove-work-visit-from-plan", {
          body: { action: "remove_assignment", event_id: jobId, technician_id: technicianId },
        });
        if (unplanError || unplanResult?.error) {
          toast.error("Kunne ikke avplanlegge montør", { description: unplanResult?.error || unplanError?.message });
          setSubmitting(false);
          return;
        }
        if (unplanResult?.warnings?.length) {
          toast.warning(`Montøren er fjernet, men Outlook-sletting er satt i kø for ${unplanResult.warnings[0].technician_name || "montør"}`);
        }
      }
      if (addedTechIds.length > 0) {
        await supabase.from("event_technicians").insert(
          addedTechIds.map((technicianId) => ({ event_id: jobId, technician_id: technicianId })),
        );
      }

      await supabase.from("event_logs").insert({
        event_id: jobId,
        action_type: "updated",
        performed_by: userId || null,
        change_summary: `Jobb oppdatert${notifyParticipants ? " (deltakere varslet)" : " (uten varsling)"}`,
      });

      if (notifyParticipants) {
        const { error: approvalError } = await supabase.functions.invoke("create-approval", {
          body: { job_id: jobId },
        });
        if (approvalError) console.error("[EditJob] Approval re-trigger failed:", approvalError);
      }

      toast.success("Jobb oppdatert", {
        description: notifyParticipants
          ? "Deltakere er varslet om endringene."
          : "Endringer lagret uten varsling.",
      });

      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      toast.error("Noe gikk galt", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Format summary line
  const summaryLine = startDate && startTime && endTime ? (() => {
    try {
      const startD = new Date(`${startDate}T${startTime}`);
      const endD = new Date(`${effectiveEndDate}T${endTime}`);
      return `${format(startD, "EEE d. MMM", { locale: nb })} ${startTime} → ${overnight ? format(endD, "EEE d. MMM", { locale: nb }) + " " : ""}${endTime}`;
    } catch { return null; }
  })() : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rediger jobb</DialogTitle>
          <DialogDescription className="sr-only">Rediger en eksisterende jobb</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-title">Tittel</Label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">SERVICE –</span>
                  <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-jobNumber">Jobbnummer</Label>
                <Input id="edit-jobNumber" value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Kunde</Label>
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)} required className="mt-1" />
              </div>
              <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />
            </div>

            <div>
              <Label>Adresse</Label>
              <AddressAutocomplete value={address} onChange={setAddress} placeholder="Søk adresse…" required className="mt-1" />
            </div>

            {/* Start */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="date" value={startDate} onChange={(e) => {
                    setStartDate(e.target.value);
                    setEndDate(autoAdjustEndDate(e.target.value, startTime, endTime));
                  }} required className="flex-1" />
                  <TimeSelect value={startTime} onChange={(v) => {
                    setStartTime(v);
                    if (startDate) setEndDate(autoAdjustEndDate(startDate, v, endTime));
                  }} />
                </div>
              </div>
              <div>
                <Label>Slutt</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="date" value={effectiveEndDate} onChange={(e) => setEndDate(e.target.value)} required className="flex-1" />
                  <TimeSelect value={endTime} onChange={(v) => {
                    setEndTime(v);
                    if (startDate) setEndDate(autoAdjustEndDate(startDate, startTime, v));
                  }} />
                </div>
              </div>
            </div>

            {/* Overnight indicator + summary */}
            {overnight && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <Moon className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium text-primary">Går over midnatt – slutter neste dag</span>
              </div>
            )}

            {summaryLine && (
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">Tidsrom</p>
                <p className="text-sm font-medium">{summaryLine}</p>
              </div>
            )}

            {/* Conflict warning */}
            {conflicts.length > 0 && (
              <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-sm font-medium">Overlappende jobber</p>
                </div>
                <div className="space-y-1">
                  {conflicts.map((c, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{c.technicianName}</span> har allerede{" "}
                      <span className="font-medium">"{c.jobTitle}"</span> {c.start}–{c.end}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Beskrivelse</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1" />
            </div>

            <FileUpload
              files={files}
              onChange={setFiles}
              existingAttachments={existingAttachments}
              onRemoveExisting={handleRemoveExisting}
            />

            {/* Notify toggle */}
            <div className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2">
                {notifyParticipants ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-medium">Varsle deltakere</p>
                  <p className="text-xs text-muted-foreground">
                    {notifyParticipants ? "E-post og kalenderhendelse oppdateres" : "Kun databasen oppdateres"}
                  </p>
                </div>
              </div>
              <Switch checked={notifyParticipants} onCheckedChange={setNotifyParticipants} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
              <Button type="submit" disabled={techIds.length === 0 || submitting}>
                {submitting ? "Lagrer..." : "Lagre endringer"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
