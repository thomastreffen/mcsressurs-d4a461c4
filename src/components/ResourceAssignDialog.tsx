import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TechnicianMultiSelect } from "./TechnicianMultiSelect";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { AlertTriangle, Search, Loader2, CalendarPlus, Link2, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { JobStatusBadge } from "./JobStatusBadge";
import type { JobStatus } from "@/lib/job-status";
import { TimeSelect } from "@/components/ui/time-select";
import { normalizeOvernightDates, isOvernightRange, autoAdjustEndDate } from "@/lib/overnight";

interface ResourceAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected date from calendar click */
  preselectedDate?: Date | null;
  /** Pre-selected technician from sidebar */
  preselectedTechId?: string | null;
  /** If assigning from a specific project */
  projectId?: string | null;
  projectTitle?: string | null;
  onAssigned?: () => void;
}

interface ExistingJob {
  id: string;
  title: string;
  customer: string | null;
  start_time: string;
  end_time: string;
  status: string;
  internal_number: string | null;
}

export function ResourceAssignDialog({
  open,
  onOpenChange,
  preselectedDate,
  preselectedTechId,
  projectId,
  projectTitle,
  onAssigned,
}: ResourceAssignDialogProps) {
  const [mode, setMode] = useState<"new" | "existing">(projectId ? "existing" : "new");

  // New event fields
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
  const [submitting, setSubmitting] = useState(false);

  // Existing job search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ExistingJob[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [assignDate, setAssignDate] = useState("");
  const [assignStartTime, setAssignStartTime] = useState("08:00");
  const [assignEndDate, setAssignEndDate] = useState("");
  const [assignEndTime, setAssignEndTime] = useState("16:00");

  // Conflict detection
  const [conflicts, setConflicts] = useState<{ techName: string; jobTitle: string; start: string; end: string }[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  // Initialize from props
  useEffect(() => {
    if (open) {
      if (preselectedDate) {
        const dateStr = format(preselectedDate, "yyyy-MM-dd");
        setStartDate(dateStr);
        setEndDate(autoAdjustEndDate(dateStr, startTime, endTime));
        setAssignDate(dateStr);
        setAssignEndDate(autoAdjustEndDate(dateStr, assignStartTime, assignEndTime));
      }
      if (preselectedTechId) {
        setTechIds([preselectedTechId]);
      }
      if (projectId) {
        setSelectedJobId(projectId);
        setMode("existing");
      }
    }
  }, [open, preselectedDate, preselectedTechId, projectId]);

  // Search existing jobs
  const handleSearch = useCallback(async () => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const { data } = await supabase
      .from("events")
      .select("id, title, customer, start_time, end_time, status, internal_number")
      .is("deleted_at", null)
      .or(`title.ilike.%${searchQuery}%,customer.ilike.%${searchQuery}%,internal_number.ilike.%${searchQuery}%,job_number.ilike.%${searchQuery}%`)
      .order("start_time", { ascending: false })
      .limit(15);
    setSearchResults(data || []);
    setSearchLoading(false);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(handleSearch, 300);
    return () => clearTimeout(timer);
  }, [handleSearch]);

  const resetForm = () => {
    setTitle("");
    setCustomer("");
    setAddress("");
    setDescription("");
    setJobNumber("");
    setStartDate("");
    setEndDate("");
    setStartTime("08:00");
    setEndTime("16:00");
    setTechIds([]);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedJobId(null);
    setAssignDate("");
    setAssignEndDate("");
    setAssignStartTime("08:00");
    setAssignEndTime("16:00");
    setMode("new");
    setConflicts([]);
  };

  const handleClose = (v: boolean) => {
    if (!v) resetForm();
    onOpenChange(v);
  };

  // Check for conflicts before submitting
  const checkConflicts = useCallback(async (date: string, start: string, endDateValue: string, end: string, techs: string[], excludeEventId?: string) => {
    if (!date || !endDateValue || techs.length === 0) {
      setConflicts([]);
      return;
    }
    setCheckingConflicts(true);
    try {
      const { startISO, endISO } = normalizeOvernightDates(date, start, endDateValue, end);

      // Check overlapping assignments using technician-specific overrides
      const { data: overlaps } = await (supabase as any).rpc("find_work_visit_conflicts", {
        p_technician_ids: techs,
        p_start: startISO,
        p_end: endISO,
        p_exclude_event_id: excludeEventId ?? null,
      });

      const found: typeof conflicts = [];
      for (const row of (overlaps || []) as any[]) {
        found.push({ techName: row.technician_name || "Ukjent", jobTitle: row.event_title,
          start: format(new Date(row.conflict_start), "HH:mm"), end: format(new Date(row.conflict_end), "HH:mm") });
      }
      setConflicts(found);
    } catch {
      setConflicts([]);
    }
    setCheckingConflicts(false);
  }, []);

  // Auto-check conflicts when inputs change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mode === "new" && startDate && techIds.length > 0) {
        checkConflicts(startDate, startTime, endDate, endTime, techIds);
      } else if (mode === "existing" && assignDate && techIds.length > 0) {
        checkConflicts(assignDate, assignStartTime, assignEndDate, assignEndTime, techIds, selectedJobId || undefined);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [mode, startDate, startTime, endDate, endTime, assignDate, assignStartTime, assignEndDate, assignEndTime, techIds, selectedJobId, checkConflicts]);

  // Create new event
  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (techIds.length === 0) return;
    setSubmitting(true);
    try {
      const { startISO, endISO } = normalizeOvernightDates(startDate, startTime, endDate, endTime);
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data: created, error } = await supabase
        .from("events")
        .insert({
          title,
          customer,
          address,
          description,
          job_number: jobNumber || null,
          start_time: startISO,
          end_time: endISO,
          technician_id: techIds[0],
          status: "requested" as any,
          created_by: userId || null,
        })
        .select("id")
        .single();

      if (error || !created) {
        toast.error("Kunne ikke opprette hendelse", { description: error?.message });
        setSubmitting(false);
        return;
      }

      // Assign technicians
      const techInserts = techIds.map((tid) => ({
        event_id: created.id,
        technician_id: tid,
      }));
      await supabase.from("event_technicians").insert(techInserts);

      // Trigger approval
      await supabase.functions.invoke("create-approval", {
        body: { job_id: created.id },
      });

      toast.success("Hendelse opprettet", {
        description: `${title} er tildelt ${techIds.length} montør(er).`,
      });
      handleClose(false);
      onAssigned?.();
    } catch (err: any) {
      toast.error("Feil ved opprettelse", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Assign existing job to technicians
  const handleAssignExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || techIds.length === 0) return;
    setSubmitting(true);
    try {
      // Update job times if date is provided
      if (assignDate) {
        const { startISO, endISO } = normalizeOvernightDates(assignDate, assignStartTime, assignEndDate, assignEndTime);
        await supabase
          .from("events")
          .update({ start_time: startISO, end_time: endISO })
          .eq("id", selectedJobId);
      }

      // Get existing technicians to avoid duplicates
      const { data: existing } = await supabase
        .from("event_technicians")
        .select("technician_id")
        .eq("event_id", selectedJobId);

      const existingIds = new Set((existing || []).map((e) => e.technician_id));
      const newTechs = techIds.filter((id) => !existingIds.has(id));

      if (newTechs.length > 0) {
        await supabase.from("event_technicians").insert(
          newTechs.map((tid) => ({
            event_id: selectedJobId,
            technician_id: tid,
          }))
        );
      }

      // Trigger approval for new technicians
      if (newTechs.length > 0) {
        await supabase.functions.invoke("create-approval", {
          body: { job_id: selectedJobId },
        });
      }

      toast.success("Montør(er) tildelt", {
        description: `${newTechs.length} ny(e) montør(er) lagt til prosjektet.`,
      });
      handleClose(false);
      onAssigned?.();
    } catch (err: any) {
      toast.error("Feil ved tildeling", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const safeTechIds = Array.isArray(techIds) ? techIds : [];

  const handleAssignDateChange = (value: string) => {
    setAssignDate(value);
    setAssignEndDate(value ? autoAdjustEndDate(value, assignStartTime, assignEndTime) : "");
  };

  const handleAssignStartTimeChange = (value: string) => {
    setAssignStartTime(value);
    if (assignDate) setAssignEndDate(autoAdjustEndDate(assignDate, value, assignEndTime));
  };

  const handleAssignEndTimeChange = (value: string) => {
    setAssignEndTime(value);
    if (assignDate) setAssignEndDate(autoAdjustEndDate(assignDate, assignStartTime, value));
  };

  const existingOvernight = assignDate && assignStartTime && assignEndDate && assignEndTime
    ? isOvernightRange(assignDate, assignStartTime, assignEndDate, assignEndTime)
    : false;

  const existingSummaryLine = assignDate && assignStartTime && assignEndDate && assignEndTime ? (() => {
    try {
      const start = new Date(`${assignDate}T${assignStartTime}`);
      const end = new Date(`${assignEndDate}T${assignEndTime}`);
      return `${format(start, "dd.MM.yyyy HH:mm", { locale: nb })} → ${format(end, "dd.MM.yyyy HH:mm", { locale: nb })}`;
    } catch {
      return null;
    }
  })() : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            {projectId ? "Planlegg ressurs" : "Tildel ressurs"}
          </DialogTitle>
          <DialogDescription>
            {projectId
              ? `Tildel montører til ${projectTitle || "dette prosjektet"}`
              : "Opprett nytt oppdrag eller tildel eksisterende prosjekt til montører"}
          </DialogDescription>
        </DialogHeader>

        {!projectId && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "new" | "existing")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new" className="gap-1.5">
                <CalendarPlus className="h-3.5 w-3.5" />
                Nytt oppdrag
              </TabsTrigger>
              <TabsTrigger value="existing" className="gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Eksisterende prosjekt
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="mt-4">
              <form onSubmit={handleCreateNew} className="space-y-4">
                <NewEventForm
                  title={title} setTitle={setTitle}
                  customer={customer} setCustomer={setCustomer}
                  address={address} setAddress={setAddress}
                  description={description} setDescription={setDescription}
                  jobNumber={jobNumber} setJobNumber={setJobNumber}
                  startDate={startDate} setStartDate={setStartDate}
                  startTime={startTime} setStartTime={setStartTime}
                  endDate={endDate} setEndDate={setEndDate}
                  endTime={endTime} setEndTime={setEndTime}
                  techIds={techIds} setTechIds={setTechIds}
                />
                {/* Conflict warnings */}
                {conflicts.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <p className="text-sm font-semibold">Kalenderkonflikt oppdaget</p>
                    </div>
                    {conflicts.map((c, i) => (
                      <p key={i} className="text-xs text-amber-700/80 dark:text-amber-400/80 ml-6">
                        {c.techName}: «{c.jobTitle}» ({c.start}–{c.end})
                      </p>
                    ))}
                    <p className="text-xs text-amber-600/70 dark:text-amber-500/70 ml-6">
                      Du kan fortsatt opprette, men montøren er allerede booket i dette tidsrommet.
                    </p>
                  </div>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => handleClose(false)}>Avbryt</Button>
                  <Button type="submit" disabled={safeTechIds.length === 0 || submitting}>
                    {submitting ? "Oppretter..." : conflicts.length > 0 ? "Opprett likevel" : "Opprett hendelse"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="existing" className="mt-4">
              <form onSubmit={handleAssignExisting} className="space-y-4">
                <ExistingJobSearch
                  searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                  searchResults={searchResults} searchLoading={searchLoading}
                  selectedJobId={selectedJobId} setSelectedJobId={setSelectedJobId}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start</Label>
                    <div className="flex gap-2 mt-1">
                      <Input type="date" value={assignDate} onChange={(e) => handleAssignDateChange(e.target.value)} className="flex-1" />
                      <TimeSelect value={assignStartTime} onChange={handleAssignStartTimeChange} className="w-[110px]" />
                    </div>
                  </div>
                  <div>
                    <Label>Slutt</Label>
                    <div className="flex gap-2 mt-1">
                      <Input type="date" value={assignEndDate} onChange={(e) => setAssignEndDate(e.target.value)} className="flex-1" />
                      <TimeSelect value={assignEndTime} onChange={handleAssignEndTimeChange} className="w-[110px]" />
                    </div>
                  </div>
                </div>

                {existingOvernight && (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                    <Moon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium text-primary">Går over midnatt – slutter neste dag</span>
                  </div>
                )}

                {existingSummaryLine && (
                  <div className="rounded-lg bg-muted/50 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Tidsrom</p>
                    <p className="text-sm font-medium">{existingSummaryLine}</p>
                  </div>
                )}
                <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />

                {/* Conflict warnings */}
                {conflicts.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <p className="text-sm font-semibold">Kalenderkonflikt oppdaget</p>
                    </div>
                    {conflicts.map((c, i) => (
                      <p key={i} className="text-xs text-amber-700/80 dark:text-amber-400/80 ml-6">
                        {c.techName}: «{c.jobTitle}» ({c.start}–{c.end})
                      </p>
                    ))}
                  </div>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => handleClose(false)}>Avbryt</Button>
                  <Button type="submit" disabled={!selectedJobId || safeTechIds.length === 0 || submitting}>
                    {submitting ? "Tildeler..." : conflicts.length > 0 ? "Tildel likevel" : "Tildel montør(er)"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        )}

        {/* Project mode: direct assign */}
        {projectId && (
          <form onSubmit={handleAssignExisting} className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-sm font-medium">{projectTitle || "Prosjekt"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Velg montør(er) og tidspunkt for denne jobben</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="date" value={assignDate} onChange={(e) => handleAssignDateChange(e.target.value)} className="flex-1" required />
                  <TimeSelect value={assignStartTime} onChange={handleAssignStartTimeChange} className="w-[110px]" />
                </div>
              </div>
              <div>
                <Label>Slutt</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="date" value={assignEndDate} onChange={(e) => setAssignEndDate(e.target.value)} className="flex-1" required />
                  <TimeSelect value={assignEndTime} onChange={handleAssignEndTimeChange} className="w-[110px]" />
                </div>
              </div>
            </div>

            {existingOvernight && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <Moon className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium text-primary">Går over midnatt – slutter neste dag</span>
              </div>
            )}

            {existingSummaryLine && (
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">Tidsrom</p>
                <p className="text-sm font-medium">{existingSummaryLine}</p>
              </div>
            )}
            <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>Avbryt</Button>
              <Button type="submit" disabled={safeTechIds.length === 0 || submitting}>
                {submitting ? "Tildeler..." : "Planlegg ressurs"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── New event form fields ── */
function NewEventForm({
  title, setTitle,
  customer, setCustomer,
  address, setAddress,
  description, setDescription,
  jobNumber, setJobNumber,
  startDate, setStartDate,
  startTime, setStartTime,
  endDate, setEndDate,
  endTime, setEndTime,
  techIds, setTechIds,
}: any) {
  const overnight = startDate && startTime && endDate && endTime
    ? isOvernightRange(startDate, startTime, endDate, endTime)
    : false;

  const summaryLine = startDate && startTime && endDate && endTime ? (() => {
    try {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      return `${format(start, "dd.MM.yyyy HH:mm", { locale: nb })} → ${format(end, "dd.MM.yyyy HH:mm", { locale: nb })}`;
    } catch {
      return null;
    }
  })() : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ra-title">Tittel</Label>
          <Input id="ra-title" value={title} onChange={(e: any) => setTitle(e.target.value)} placeholder="Navn på hendelse" required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="ra-jobNumber">Jobbnummer (valgfritt)</Label>
          <Input id="ra-jobNumber" value={jobNumber} onChange={(e: any) => setJobNumber(e.target.value)} placeholder="F.eks. P-12345" className="mt-1" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ra-customer">Kunde</Label>
          <Input id="ra-customer" value={customer} onChange={(e: any) => setCustomer(e.target.value)} placeholder="Kundenavn" required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="ra-address">Adresse</Label>
          <AddressAutocomplete id="ra-address" value={address} onChange={setAddress} placeholder="Søk adresse…" className="mt-1" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Start</Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="date"
              value={startDate}
              onChange={(e: any) => {
                setStartDate(e.target.value);
                setEndDate(autoAdjustEndDate(e.target.value, startTime, endTime));
              }}
              required
              className="flex-1"
            />
            <TimeSelect
              value={startTime}
              onChange={(value) => {
                setStartTime(value);
                if (startDate) setEndDate(autoAdjustEndDate(startDate, value, endTime));
              }}
            />
          </div>
        </div>
        <div>
          <Label>Slutt</Label>
          <div className="flex gap-2 mt-1">
            <Input type="date" value={endDate} onChange={(e: any) => setEndDate(e.target.value)} required className="flex-1" />
            <TimeSelect
              value={endTime}
              onChange={(value) => {
                setEndTime(value);
                if (startDate) setEndDate(autoAdjustEndDate(startDate, startTime, value));
              }}
            />
          </div>
        </div>
      </div>

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

      <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />
      <div>
        <Label htmlFor="ra-desc">Beskrivelse</Label>
        <Textarea id="ra-desc" value={description} onChange={(e: any) => setDescription(e.target.value)} placeholder="Beskrivelse som vises i kalenderen..." rows={3} className="mt-1" />
      </div>
    </>
  );
}

/* ── Existing job search ── */
function ExistingJobSearch({
  searchQuery, setSearchQuery,
  searchResults, searchLoading,
  selectedJobId, setSelectedJobId,
}: {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchResults: ExistingJob[];
  searchLoading: boolean;
  selectedJobId: string | null;
  setSelectedJobId: (v: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Søk etter prosjekt</Label>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Søk på tittel, kunde, jobbnr..."
            className="pl-9"
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto rounded-lg border bg-background">
        {searchLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : searchResults.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {searchQuery.length < 2 ? "Skriv minst 2 tegn for å søke" : "Ingen treff"}
          </p>
        ) : (
          <div className="p-1 space-y-0.5">
            {searchResults.map((job) => (
              <button
                type="button"
                key={job.id}
                onClick={() => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors",
                  selectedJobId === job.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-secondary"
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {job.internal_number && <span className="text-muted-foreground mr-1.5">{job.internal_number}</span>}
                    {job.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {job.customer && `${job.customer} · `}
                    {format(new Date(job.start_time), "d. MMM yyyy", { locale: nb })}
                  </p>
                </div>
                <JobStatusBadge status={job.status as JobStatus} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
