import { useState, useEffect, useCallback, Component, type ReactNode, type ErrorInfo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TechnicianMultiSelect } from "./TechnicianMultiSelect";
import { FileUpload } from "./FileUpload";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { AlertTriangle, ChevronDown, ChevronUp, Moon } from "lucide-react";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { normalizeOvernightDates, isOvernightRange, autoAdjustEndDate } from "@/lib/overnight";
import { TimeSelect } from "@/components/ui/time-select";

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedTechId?: string;
  onJobCreated?: () => void;
}

interface ErrorBoundaryProps { children: ReactNode; onReset: () => void }
interface ErrorBoundaryState { hasError: boolean; errorMsg: string }

class CreateJobErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, errorMsg: "" };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error?.message || "Unknown error" };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CreateJobDialog crashed:", error?.message, error?.stack, info?.componentStack);
    this.props.onReset();
  }
  render() {
    if (this.state.hasError) {
      return (
        <p className="p-4 text-sm text-destructive">
          Noe gikk galt: {this.state.errorMsg}. Prøv å lukke og åpne dialogen på nytt.
        </p>
      );
    }
    return this.props.children;
  }
}

interface ConflictInfo {
  technicianName: string;
  jobTitle: string;
  start: string;
  end: string;
}

function CreateJobDialogInner({
  open,
  onOpenChange,
  preselectedTechId,
  onJobCreated,
}: CreateJobDialogProps) {
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("16:00");
  const [techIds, setTechIds] = useState<string[]>(preselectedTechId ? [preselectedTechId] : []);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [showMore, setShowMore] = useState(false);
  const { syncCreate } = useCalendarSync();
  const { activeCompanyId } = useCompanyContext();

  const overnight = startDate && startTime && endTime ? isOvernightRange(startDate, startTime, endDate || startDate, endTime) : false;
  const effectiveEndDate = startDate && overnight ? autoAdjustEndDate(startDate, startTime, endTime) : endDate;

  // DB-based conflict check
  const checkConflicts = useCallback(async () => {
    const ids = Array.isArray(techIds) ? techIds : [];
    if (!startDate || !startTime || !endDate || !endTime || ids.length === 0) {
      setConflicts([]);
      return;
    }
    const { startISO, endISO } = normalizeOvernightDates(startDate, startTime, endDate, endTime);

    const { data: overlapping } = await (supabase as any).rpc("find_work_visit_conflicts", {
      p_technician_ids: ids, p_start: startISO, p_end: endISO, p_exclude_event_id: null,
    });

    if (!overlapping) { setConflicts([]); return; }

    const found: ConflictInfo[] = [];
    for (const row of overlapping as any[]) {
      found.push({ technicianName: row.technician_name ?? "Ukjent", jobTitle: row.event_title?.replace("SERVICE – ", "") ?? "",
        start: format(new Date(row.conflict_start), "HH:mm"), end: format(new Date(row.conflict_end), "HH:mm") });
    }
    setConflicts(found);
  }, [techIds, startDate, startTime, endDate, endTime]);

  useEffect(() => {
    if (open) checkConflicts();
  }, [open, checkConflicts]);

  const safeTechIds = Array.isArray(techIds) ? techIds : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (safeTechIds.length === 0 || submitting || submitted) return;
    setSubmitting(true);

    try {
    const { startISO, endISO } = normalizeOvernightDates(startDate, startTime, endDate, endTime);

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data: createdEvent, error: eventError } = await supabase
        .from("events")
        .insert({
          title: `SERVICE – ${title}`,
          customer,
          address: address || null,
          description: description || null,
          job_number: jobNumber || null,
          start_time: startISO,
          end_time: endISO,
          technician_id: safeTechIds[0],
          status: "requested",
          created_by: userId || null,
          client_request_id: clientRequestId,
          company_id: activeCompanyId,
        } as any)
        .select("id")
        .single();

      if (eventError || !createdEvent) {
        toast.error("Kunne ikke opprette prosjekt", { description: eventError?.message });
        setSubmitting(false);
        return;
      }

      // Upload files
      if (files.length > 0) {
        const attachments: { name: string; url: string; size: number }[] = [];
        for (const file of files) {
          const filePath = `${createdEvent.id}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from("job-attachments")
            .upload(filePath, file);
          if (uploadError) { toast.error(`Kunne ikke laste opp ${file.name}`); continue; }
          const { data: urlData } = supabase.storage.from("job-attachments").getPublicUrl(filePath);
          attachments.push({ name: file.name, url: urlData.publicUrl, size: file.size });
        }
        if (attachments.length > 0) {
          await supabase.from("events").update({ attachments }).eq("id", createdEvent.id);
        }
      }

      // Insert event_technicians
      const techInserts = safeTechIds.map((techId) => ({
        event_id: createdEvent.id,
        technician_id: techId,
      }));
      const { error: techError } = await supabase.from("event_technicians").insert(techInserts);
      if (techError) {
        toast.error("Prosjekt opprettet, men montørtilknytning feilet", { description: techError.message });
      }

      // Create approval & sync to Outlook
      const { data: approvalData, error: approvalError } = await supabase.functions.invoke(
        "create-approval",
        { body: { job_id: createdEvent.id } }
      );

      if (approvalError || approvalData?.error) {
        toast.error("Prosjekt opprettet, men godkjenning feilet");
      } else {
        toast.success("Prosjekt opprettet og sendt til montør", {
          description: `${title} – ${safeTechIds.length} montør(er)`,
        });
        syncCreate(createdEvent.id);
      }

      setSubmitted(true);
      onOpenChange(false);
      resetForm();
      onJobCreated?.();
    } catch (err: any) {
      toast.error("Noe gikk galt", { description: err?.message || "Ukjent feil" });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setCustomer("");
    setAddress("");
    setDescription("");
    setJobNumber("");
    setStartDate("");
    setEndDate("");
    setTechIds(preselectedTechId ? [preselectedTechId] : []);
    setFiles([]);
    setSubmitted(false);
    setShowMore(false);
    setClientRequestId(crypto.randomUUID());
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nytt prosjekt</DialogTitle>
          <DialogDescription>Opprett et prosjekt og send til montør</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Essential fields */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Hva skal gjøres? *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="F.eks. Bytte varmepumpe"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer">Kunde *</Label>
            <Input
              id="customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Kundenavn"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Montør *</Label>
            <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />
          </div>

          {/* Start row */}
          <div className="space-y-1.5">
            <Label>Start *</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate) setEndDate(e.target.value);
                  else {
                    const adj = autoAdjustEndDate(e.target.value, startTime, endTime);
                    setEndDate(adj);
                  }
                }}
                required
                className="flex-1"
              />
              <TimeSelect
                value={startTime}
                onChange={(v) => {
                  setStartTime(v);
                  if (startDate) setEndDate(autoAdjustEndDate(startDate, v, endTime));
                }}
              />
            </div>
          </div>

          {/* End row */}
          <div className="space-y-1.5">
            <Label>Slutt *</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                value={effectiveEndDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="flex-1"
              />
              <TimeSelect
                value={endTime}
                onChange={(v) => {
                  setEndTime(v);
                  if (startDate) setEndDate(autoAdjustEndDate(startDate, startTime, v));
                }}
              />
            </div>
          </div>

          {/* Overnight indicator + time summary */}
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
                <p className="text-sm font-medium">Overlappende prosjekter</p>
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

          {/* Show more toggle */}
          <Button
            type="button"
            variant="ghost"
            className="w-full gap-1.5 text-xs text-muted-foreground h-8"
            onClick={() => setShowMore(!showMore)}
          >
            {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showMore ? "Skjul detaljer" : "Adresse, beskrivelse, vedlegg…"}
          </Button>

          {showMore && (
            <div className="space-y-4 pt-1 border-t border-border/50">
              <div className="space-y-1.5">
                <Label htmlFor="address">Adresse</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Gateadresse, sted"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jobNumber">Prosjektnummer</Label>
                <Input
                  id="jobNumber"
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  placeholder="F.eks. P-12345"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Beskrivelse</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Kort beskrivelse til montøren…"
                  rows={3}
                />
              </div>

              <FileUpload files={files} onChange={setFiles} />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={safeTechIds.length === 0 || submitting || submitted}>
              {submitting ? "Oppretter…" : "Opprett og send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateJobDialog(props: CreateJobDialogProps) {
  return (
    <CreateJobErrorBoundary onReset={() => props.onOpenChange(false)}>
      <CreateJobDialogInner {...props} />
    </CreateJobErrorBoundary>
  );
}
