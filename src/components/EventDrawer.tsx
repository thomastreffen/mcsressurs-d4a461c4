import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useProjectSuggestions, type ProjectSuggestion } from "@/hooks/useProjectSuggestions";
import { ProjectSuggestionList } from "./ProjectSuggestionList";
import { FileUpload } from "./FileUpload";
import { AttachmentList } from "./AttachmentList";
import type { Attachment } from "@/lib/mock-data";
import { TaskThreadPanel } from "@/components/task-thread";
import { EventHistoryTab } from "@/components/EventHistoryTab";
import { ReminderProfileSelect, type ReminderConfig } from "@/components/ReminderProfileSelect";
import { ApprovalCockpit } from "@/components/ApprovalCockpit";
import { TechReplacementSuggestion } from "@/components/TechReplacementSuggestion";
import { useTechnicianInsights } from "@/hooks/useTechnicianInsights";
import { useTechnicians } from "@/hooks/useTechnicians";
import { useTaskThreadReads } from "@/hooks/useTaskThreadReads";
import { useReminderSettings } from "@/hooks/useReminderSettings";
import { useApprovalSummaries, getNextReminderInfo } from "@/hooks/useApprovalSummaries";
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
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TechnicianMultiSelect } from "./TechnicianMultiSelect";
import { JobStatusBadge, JobStatusGroup } from "./JobStatusBadge";
import { useJobApprovals } from "@/hooks/useJobApprovals";
import { getExecutionStatus, BILLING_STATUSES, ACCEPTANCE_STATUSES } from "@/lib/job-status";
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
  CalendarPlus,
  Link2,
  Search,
  Plus,
  Trash2,
  Paperclip,
  FolderKanban,
  ListChecks,
  Moon,
  ArrowRight,
  Users,
  Building,
  MessageSquare,
  Bell,
  Zap,
  BellOff,
  Check,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";
import type { JobStatus } from "@/lib/job-status";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { TimeSelect } from "@/components/ui/time-select";
import { normalizeOvernightDates, isOvernightRange, autoAdjustEndDate } from "@/lib/overnight";
import { OrderBriefingSection } from "@/components/orders/OrderBriefingSection";

/* ── Types ── */
interface ExistingJob {
  id: string;
  title: string;
  customer: string | null;
  start_time: string;
  end_time: string;
  status: string;
  internal_number: string | null;
  parent_project_id: string | null;
  project_type: string | null;
}

interface ConflictInfo {
  techName: string;
  jobTitle: string;
  start: string;
  end: string;
}

interface ChangeDescriptor {
  key: string;
  label: string;
  severity: "critical" | "minor";
  oldValue: string | null;
  newValue: string | null;
  actionType: string;
  summary: string;
  metadata?: Record<string, any>;
}

interface PendingSaveState {
  criticalChanges: ChangeDescriptor[];
  allChanges: ChangeDescriptor[];
  impactedTechIds: string[];
  sendNotifications: boolean;
  updateOutlook: boolean;
}

interface DeliveryStatusSummary {
  notifiedAt: string | null;
  notifiedNames: string[];
  syncedAt: string | null;
  syncedCount: number;
  failedCount: number;
}

interface EventDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editEvent?: CalendarEvent | null;
  clickedTechId?: string | null;
  preselectedStart?: Date | null;
  preselectedEnd?: Date | null;
  preselectedTechId?: string | null;
  projectId?: string | null;
  projectTitle?: string | null;
  scheduleBlockId?: string | null;
  onSaved?: (eventId?: string) => void;
  /** When true, drawer opens in view-only mode (no editing) */
  readOnly?: boolean;
  /** Initial tab to open (e.g. "thread" from deep link) */
  initialTab?: "details" | "thread";
}

export function EventDrawer({
  open,
  onOpenChange,
  editEvent,
  clickedTechId,
  preselectedStart,
  preselectedEnd,
  preselectedTechId,
  projectId,
  projectTitle,
  scheduleBlockId,
  onSaved,
  readOnly = false,
  initialTab,
}: EventDrawerProps) {
  const navigate = useNavigate();
  const { syncCreate, syncUpdate } = useCalendarSync();
  const { activeCompanyId, isAllCompanies, companies } = useCompanyContext();
  const { settings: reminderSettings } = useReminderSettings();
  const isEditing = !!editEvent;

  // Form state
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [eventType, setEventType] = useState<"project" | "task">("project");
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [locationDetails, setLocationDetails] = useState("");
  const [siteContactName, setSiteContactName] = useState("");
  const [siteContactPhone, setSiteContactPhone] = useState("");
  const [accessNotes, setAccessNotes] = useState("");
  const [mapLink, setMapLink] = useState("");
  const [description, setDescription] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [customerPracticalInfo, setCustomerPracticalInfo] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("16:00");
  const [techIds, setTechIds] = useState<string[]>([]);
  // Multi-day repeat (only for new projects/tasks)
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatDates, setRepeatDates] = useState<Date[]>([]);
  const [repeatPickerOpen, setRepeatPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [reminderConfig, setReminderConfig] = useState<ReminderConfig>({
    responseRequired: true,
    profile: "company_default",
  });

  // Existing job search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ExistingJob[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobSnapshot, setSelectedJobSnapshot] = useState<ExistingJob | null>(null);

  // Conflicts
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Attachments
  const [files, setFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [originalAttachments, setOriginalAttachments] = useState<Attachment[]>([]);
  const [editCompanyName, setEditCompanyName] = useState<string | null>(null);
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  const [originalSnapshot, setOriginalSnapshot] = useState<Record<string, any> | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSaveState | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatusSummary>({
    notifiedAt: null,
    notifiedNames: [],
    syncedAt: null,
    syncedCount: 0,
    failedCount: 0,
  });

  // Drawer tab state (detaljer vs tråd)
  const [drawerTab, setDrawerTab] = useState<"details" | "thread" | "history">(initialTab || "details");

  // Sync initialTab when it changes (e.g. deep link opens drawer)
  useEffect(() => {
    if (initialTab && open) {
      setDrawerTab(initialTab);
    }
  }, [initialTab, open]);

  // Nullstill varselstatus når dialogen bytter oppgave
  useEffect(() => {
    setDeliveryStatus({ notifiedAt: null, notifiedNames: [], syncedAt: null, syncedCount: 0, failedCount: 0 });
  }, [editEvent?.id]);

  // Thread unread tracking

  const { unreadCount: threadUnreadCount } = useTaskThreadReads(editEvent?.id);

  // Per-technician approval statuses
  const { approvals: techApprovals, refetch: refetchApprovals } = useJobApprovals(editEvent?.id);
  const { summaries: approvalSummaryMap, refetch: refetchSummaries } = useApprovalSummaries(editEvent ? [editEvent.id] : []);
  const approvalSummary = editEvent ? approvalSummaryMap.get(editEvent.id) : undefined;
  const refreshApprovalData = useCallback(() => { refetchApprovals(); refetchSummaries(); }, [refetchApprovals, refetchSummaries]);

  // Available technicians for replacement suggestions
  const { technicians: allTechnicians } = useTechnicians(editEvent ? (editEvent as any).companyId || activeCompanyId : activeCompanyId);
  const techInsightUserIds = useMemo(() => {
    const ids = techApprovals.map(a => a.technicianUserId);
    // Also include available techs for replacement scoring
    for (const t of allTechnicians) {
      if (t.id && !ids.includes(t.id)) ids.push(t.id);
    }
    return ids;
  }, [techApprovals, allTechnicians]);
  const { insights: techInsights } = useTechnicianInsights(techInsightUserIds);

  // Populate form from props — only on open transition or when key inputs change.
  // We deliberately DO NOT depend on companies/activeCompanyId/isAllCompanies so
  // a background context refetch can never overwrite the user's selections
  // (e.g. wiping a freshly-picked existing project).
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false;
      return;
    }
    const justOpened = !prevOpenRef.current;
    prevOpenRef.current = true;
    if (!justOpened) return;

    // Varselstatus gjelder kun denne økten/oppgaven – nullstill så en tidligere
    // lagring på en annen oppgave ikke viser feil montørnavn her.
    setDeliveryStatus({ notifiedAt: null, notifiedNames: [], syncedAt: null, syncedCount: 0, failedCount: 0 });


    if (editEvent) {
      setTitle(editEvent.title);
      setCustomer(editEvent.customer || "");
      setAddress(editEvent.address || "");
      setDescription(editEvent.description || "");
      setDate(format(editEvent.start, "yyyy-MM-dd"));
      setStartTime(format(editEvent.start, "HH:mm"));
      setEndDate(format(editEvent.end, "yyyy-MM-dd"));
      setEndTime(format(editEvent.end, "HH:mm"));
      setTechIds(editEvent.technicians.map((t) => t.id));
      setMode("new");
    } else {
      const nextDate = preselectedStart ? format(preselectedStart, "yyyy-MM-dd") : "";
      const nextStartTime = preselectedStart ? format(preselectedStart, "HH:mm") : "08:00";
      const nextEndTime = preselectedEnd ? format(preselectedEnd, "HH:mm") : "16:00";

      setTitle(projectTitle || "");
      setCustomer("");
      setAddress("");
      setDescription("");
      setAssignmentNotes("");
      setDate(nextDate);
      setStartTime(nextStartTime);
      setEndTime(nextEndTime);
      setEndDate(nextDate ? autoAdjustEndDate(nextDate, nextStartTime, nextEndTime) : "");
      setTechIds(preselectedTechId ? [preselectedTechId] : []);
      setMode(projectId ? "existing" : "new");
      setEventType("project");
      setSelectedJobId(projectId || null);
      setSelectedJobSnapshot(null);
    }
    setConflicts([]);
    setSearchQuery("");
    setSearchResults([]);
    setSubmitted(false);
    setClientRequestId(crypto.randomUUID());
    setFiles([]);
    setExistingAttachments([]);
    setEditCompanyName(null);
    setEditCompanyId(null);
    setDrawerTab("details");
    setReminderConfig({ responseRequired: true, profile: "company_default" });
    setSelectedCompanyId(isAllCompanies ? (companies.length === 1 ? companies[0].id : null) : activeCompanyId);
    setRepeatEnabled(false);
    setRepeatDates([]);

    // Load existing attachments for edit mode
    if (editEvent) {
      supabase
        .from("events")
        .select("attachments, company_id, internal_companies(name), postal_code, city, location_details, site_contact_name, site_contact_phone, access_notes, map_link, assignment_notes, customer_practical_info, address, customer, description, title, start_time, end_time")
        .eq("id", editEvent.id)
        .single()
        .then(({ data }) => {
          const attachments = Array.isArray(data?.attachments) ? (data.attachments as unknown as Attachment[]) : [];
          setExistingAttachments(attachments);
          setOriginalAttachments(attachments);
          setPostalCode((data as any)?.postal_code || "");
          setCity((data as any)?.city || "");
          setLocationDetails((data as any)?.location_details || "");
          setSiteContactName((data as any)?.site_contact_name || "");
          setSiteContactPhone((data as any)?.site_contact_phone || "");
          setAccessNotes((data as any)?.access_notes || "");
          setMapLink((data as any)?.map_link || "");
          setAssignmentNotes((data as any)?.assignment_notes || "");
          setCustomerPracticalInfo((data as any)?.customer_practical_info || "");

          const compName = (data as any)?.internal_companies?.name;
          if (compName) setEditCompanyName(compName);
          if (data?.company_id) setEditCompanyId(data.company_id as string);

          setOriginalSnapshot({
            title: (data as any)?.title ?? editEvent.title,
            customer: (data as any)?.customer ?? editEvent.customer ?? "",
            address: (data as any)?.address ?? editEvent.address ?? "",
            postalCode: (data as any)?.postal_code ?? "",
            city: (data as any)?.city ?? "",
            locationDetails: (data as any)?.location_details ?? "",
            siteContactName: (data as any)?.site_contact_name ?? "",
            siteContactPhone: (data as any)?.site_contact_phone ?? "",
            accessNotes: (data as any)?.access_notes ?? "",
            mapLink: (data as any)?.map_link ?? "",
            description: (data as any)?.description ?? editEvent.description ?? "",
            assignmentNotes: (data as any)?.assignment_notes ?? "",
            customerPracticalInfo: (data as any)?.customer_practical_info ?? "",
            techIds: editEvent.technicians.map((t) => t.id),
            attachmentNames: attachments.map((attachment) => attachment.name),
            startLabel: `${format(new Date((data as any)?.start_time ?? editEvent.start), "yyyy-MM-dd")} ${format(new Date((data as any)?.start_time ?? editEvent.start), "HH:mm")}`,
            endLabel: `${format(new Date((data as any)?.end_time ?? editEvent.end), "yyyy-MM-dd")} ${format(new Date((data as any)?.end_time ?? editEvent.end), "HH:mm")}`,
          });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editEvent, preselectedStart, preselectedEnd, preselectedTechId, projectId, projectTitle]);

  // Search existing jobs
  useEffect(() => {
    if (mode !== "existing" || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const { data } = await supabase
        .from("events")
        .select("id, title, customer, start_time, end_time, status, internal_number, parent_project_id, project_type")
        .is("deleted_at", null)
        .is("parent_project_id", null)
        .or("project_type.is.null,project_type.neq.task")
        .or(`title.ilike.%${searchQuery}%,customer.ilike.%${searchQuery}%,internal_number.ilike.%${searchQuery}%`)
        .order("start_time", { ascending: false })
        .limit(10);
      setSearchResults(data || []);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, mode]);

  // Conflict check
  const checkConflicts = useCallback(async (d: string, s: string, ed: string, e: string, techs: string[], excludeId?: string) => {
    if (!d || !ed || techs.length === 0) { setConflicts([]); return; }
    try {
      const { startISO, endISO } = normalizeOvernightDates(d, s, ed, e);

      const { data: overlaps } = await (supabase as any).rpc("find_work_visit_conflicts", {
        p_technician_ids: techs, p_start: startISO, p_end: endISO, p_exclude_event_id: excludeId ?? null,
      });

      const found: ConflictInfo[] = [];
      for (const row of (overlaps || []) as any[]) {
        found.push({ techName: row.technician_name || "Ukjent", jobTitle: row.event_title,
          start: format(new Date(row.conflict_start), "HH:mm"), end: format(new Date(row.conflict_end), "HH:mm") });
      }
      setConflicts(found);
    } catch { setConflicts([]); }
  }, []);

  // Auto-check conflicts
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      checkConflicts(
        date,
        startTime,
        endDate || (date ? autoAdjustEndDate(date, startTime, endTime) : ""),
        endTime,
        techIds,
        editEvent?.id || (mode === "existing" ? selectedJobId || undefined : undefined),
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [date, startTime, endDate, endTime, techIds, open, editEvent, mode, selectedJobId, checkConflicts]);

  const handleDateChange = (nextDate: string) => {
    setDate(nextDate);
    setEndDate(nextDate ? autoAdjustEndDate(nextDate, startTime, endTime) : "");
  };

  const handleStartTimeChange = (nextStartTime: string) => {
    setStartTime(nextStartTime);
    if (date) setEndDate(autoAdjustEndDate(date, nextStartTime, endTime));
  };

  const handleEndTimeChange = (nextEndTime: string) => {
    setEndTime(nextEndTime);
    if (date) setEndDate(autoAdjustEndDate(date, startTime, nextEndTime));
  };

  const resolvedEndDate = endDate || (date ? autoAdjustEndDate(date, startTime, endTime) : "");

  const overnight = date && startTime && resolvedEndDate && endTime
    ? isOvernightRange(date, startTime, resolvedEndDate, endTime)
    : false;

  const summaryLine = date && startTime && resolvedEndDate && endTime ? (() => {
    try {
      const start = new Date(`${date}T${startTime}`);
      const end = new Date(`${resolvedEndDate}T${endTime}`);
      return `${format(start, "dd.MM.yyyy HH:mm", { locale: nb })} → ${format(end, "dd.MM.yyyy HH:mm", { locale: nb })}`;
    } catch {
      return null;
    }
  })() : null;

  const detectedChanges = useMemo<ChangeDescriptor[]>(() => {
    if (!isEditing || !originalSnapshot) return [];

    const changes: ChangeDescriptor[] = [];
    const normalize = (value: unknown) => (typeof value === "string" ? value.trim() : value ?? null);
    const asText = (value: unknown) => {
      const normalized = normalize(value);
      return normalized === null || normalized === "" ? null : String(normalized);
    };
    const sameText = (a: unknown, b: unknown) => asText(a) === asText(b);
    const sameStringArray = (a: string[] = [], b: string[] = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const formatTechNames = (ids: string[]) => ids.map((id) => allTechnicians.find((tech) => tech.id === id)?.name || "Ukjent montør");
    const nextStartLabel = date && startTime ? `${date} ${startTime}` : null;
    const nextEndLabel = resolvedEndDate && endTime ? `${resolvedEndDate} ${endTime}` : null;

    const addChange = (
      key: string,
      label: string,
      severity: "critical" | "minor",
      oldValue: unknown,
      newValue: unknown,
      actionType: string,
      summary: string,
      metadata?: Record<string, any>,
    ) => {
      const oldText = asText(oldValue);
      const newText = asText(newValue);
      if (oldText === newText) return;
      changes.push({ key, label, severity, oldValue: oldText, newValue: newText, actionType, summary, metadata });
    };

    addChange("title", "Tittel", "minor", originalSnapshot.title, title, "title_changed", "Tittel endret");
    addChange("customer", "Kunde", "minor", originalSnapshot.customer, customer, "customer_changed", "Kunde oppdatert");
    addChange("start_time", "Starttid", "critical", originalSnapshot.startLabel, nextStartLabel, "time_changed", "Starttid endret");
    addChange("end_time", "Sluttid", "critical", originalSnapshot.endLabel, nextEndLabel, "time_changed", "Sluttid endret");
    addChange("address", "Adresse", "critical", originalSnapshot.address, address, "location_changed", "Adresse endret");
    addChange("postal_code", "Postnummer", "critical", originalSnapshot.postalCode, postalCode, "location_changed", "Postnummer oppdatert");
    addChange("city", "Poststed", "critical", originalSnapshot.city, city, "location_changed", "Poststed oppdatert");
    addChange("location_details", "Bygg / etasje / område", "critical", originalSnapshot.locationDetails, locationDetails, "location_changed", "Oppmøtested oppdatert");
    addChange("site_contact_name", "Kontaktperson", "critical", originalSnapshot.siteContactName, siteContactName, "contact_changed", "Kontaktperson oppdatert");
    addChange("site_contact_phone", "Telefon", "critical", originalSnapshot.siteContactPhone, siteContactPhone, "contact_changed", "Telefonnummer oppdatert");
    addChange("access_notes", "Oppmøtenotat", "critical", originalSnapshot.accessNotes, accessNotes, "location_changed", "Oppmøtenotat oppdatert");
    addChange("map_link", "Kartlenke", "critical", originalSnapshot.mapLink, mapLink, "location_changed", "Kartlenke oppdatert");
    addChange("description", "Beskrivelse / instruks", "critical", originalSnapshot.description, description, "description_changed", "Beskrivelse oppdatert");
    addChange("assignment_notes", "Montørinstruks", "critical", originalSnapshot.assignmentNotes, assignmentNotes, "assignment_notes_changed", "Montørinstruks oppdatert");
    addChange("customer_practical_info", "Praktisk kundeinfo", "minor", originalSnapshot.customerPracticalInfo, customerPracticalInfo, "customer_practical_info_changed", "Praktisk kundeinformasjon oppdatert");

    const previousTechIds = originalSnapshot.techIds || [];
    if (!sameStringArray(previousTechIds, techIds)) {
      const removedTechIds = previousTechIds.filter((id: string) => !techIds.includes(id));
      const addedTechIds = techIds.filter((id) => !previousTechIds.includes(id));
      const parts: string[] = [];
      if (addedTechIds.length > 0) parts.push(`la til ${formatTechNames(addedTechIds).join(", ")}`);
      if (removedTechIds.length > 0) parts.push(`fjernet ${formatTechNames(removedTechIds).join(", ")}`);
      changes.push({
        key: "technicians",
        label: "Montører",
        severity: "critical",
        oldValue: formatTechNames(previousTechIds).join(", ") || null,
        newValue: formatTechNames(techIds).join(", ") || null,
        actionType: "technician_assignment_changed",
        summary: `Montørplan endret: ${parts.join(" · ")}`,
        metadata: { addedTechIds, removedTechIds },
      });
    }

    const previousAttachmentNames = (originalSnapshot.attachmentNames || []) as string[];
    const currentAttachmentNames = existingAttachments.map((attachment) => attachment.name);
    const uploadedAttachmentNames = files.map((file) => file.name);
    const removedAttachmentNames = previousAttachmentNames.filter((name) => !currentAttachmentNames.includes(name));
    if (removedAttachmentNames.length > 0) {
      changes.push({
        key: "attachments_removed",
        label: "Vedlegg fjernet",
        severity: "critical",
        oldValue: removedAttachmentNames.join(", "),
        newValue: null,
        actionType: "attachment_removed",
        summary: `Fjernet vedlegg: ${removedAttachmentNames.join(", ")}`,
        metadata: { removedAttachmentNames },
      });
    }
    if (uploadedAttachmentNames.length > 0 || !sameStringArray(previousAttachmentNames.filter((name) => !removedAttachmentNames.includes(name)), currentAttachmentNames)) {
      if (uploadedAttachmentNames.length > 0) {
        changes.push({
          key: "attachments_added",
          label: "Vedlegg lagt til",
          severity: "critical",
          oldValue: null,
          newValue: uploadedAttachmentNames.join(", "),
          actionType: "attachment_added",
          summary: `La til vedlegg: ${uploadedAttachmentNames.join(", ")}`,
          metadata: { uploadedAttachmentNames },
        });
      }
    }

    return changes;
  }, [
    isEditing,
    originalSnapshot,
    allTechnicians,
    title,
    customer,
    date,
    startTime,
    resolvedEndDate,
    endTime,
    address,
    postalCode,
    city,
    locationDetails,
    siteContactName,
    siteContactPhone,
    accessNotes,
    mapLink,
    description,
    assignmentNotes,
    customerPracticalInfo,
    techIds,
    existingAttachments,
    files,
  ]);

  // Upload files to storage and return attachment metadata
  const uploadFiles = async (eventId: string, filesToUpload: File[]): Promise<Attachment[]> => {
    const uploaded: Attachment[] = [];
    for (const file of filesToUpload) {
      const filePath = `${eventId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("job-attachments").upload(filePath, file);
      if (uploadError) {
        throw new Error(`Kunne ikke laste opp ${file.name}: ${uploadError.message}`);
      }
      const { data: urlData } = supabase.storage.from("job-attachments").getPublicUrl(filePath);
      uploaded.push({ name: file.name, url: urlData.publicUrl, size: file.size });
    }
    return uploaded;
  };

  const persistEventChanges = async (options?: { sendNotifications?: boolean; updateOutlook?: boolean; changeSet?: ChangeDescriptor[] }) => {
    const sendNotifications = options?.sendNotifications ?? true;
    const updateOutlook = options?.updateOutlook ?? true;
    const changeSet = options?.changeSet ?? detectedChanges;

    if (!isEditing || !editEvent) return;

    const { startISO, endISO } = normalizeOvernightDates(date, startTime, endDate, endTime);
    const timeChanged =
      editEvent.start.getTime() !== new Date(startISO).getTime() ||
      editEvent.end.getTime() !== new Date(endISO).getTime();
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    const userName = session?.session?.user?.user_metadata?.full_name || session?.session?.user?.email || "Ukjent";
    const techNameMap = new Map(allTechnicians.map((t: any) => [t.id, t.name]));

    const { error: eventUpdateError } = await supabase.from("events")
      .update({
        start_time: startISO,
        end_time: endISO,
        title,
        customer,
        address,
        postal_code: postalCode || null,
        city: city || null,
        location_details: locationDetails || null,
        site_contact_name: siteContactName || null,
        site_contact_phone: siteContactPhone || null,
        access_notes: accessNotes || null,
        map_link: mapLink || null,
        description,
        assignment_notes: assignmentNotes || null,
        customer_practical_info: customerPracticalInfo || null,
      } as any)
      .eq("id", editEvent.id);
    if (eventUpdateError) throw new Error(`Kunne ikke lagre oppdraget: ${eventUpdateError.message}`);

    // Keep the schedule_blocks snapshot title in sync so resource plan cards
    // never keep showing an outdated (often generic) title.
    if (title) {
      const { error: blockTitleError } = await (supabase as any)
        .from("schedule_blocks")
        .update({ title })
        .or(`project_id.eq.${editEvent.id},job_id.eq.${editEvent.id}`)
        .is("deleted_at", null);
      if (blockTitleError) throw new Error(`Kunne ikke oppdatere kalenderkortene: ${blockTitleError.message}`);
    }


    const { data: existing } = await supabase
      .from("event_technicians").select("id, technician_id, start_at, end_at").eq("event_id", editEvent.id);
    const existingIds = new Set((existing || []).map((e) => e.technician_id));
    const newIds = new Set(techIds);
    const toAdd = techIds.filter((id) => !existingIds.has(id));
    const toRemove = (existing || []).filter((e) => !newIds.has(e.technician_id));

    // VIKTIG: nye montører legges til FØR gamle fjernes, ellers tolker
    // avplanleggingen det som «siste montør fjernet» og soft-sletter oppgaven.
    if (toAdd.length > 0) {
      const { error: addTechnicianError } = await supabase.from("event_technicians").insert(
        toAdd.map((tid) => ({ event_id: editEvent.id, technician_id: tid })),
      );
      if (addTechnicianError) throw new Error(`Kunne ikke tildele ny montør: ${addTechnicianError.message}`);
    }

    if (toRemove.length > 0) {
      const removedTechIds = toRemove.map((r) => r.technician_id);
      for (const technicianId of removedTechIds) {
        const { data: unplanResult, error: unplanError } = await supabase.functions.invoke("remove-work-visit-from-plan", {
          body: { action: "remove_assignment", event_id: editEvent.id, technician_id: technicianId },
        });
        if (unplanError || unplanResult?.error) {
          let serverMessage: string | null = unplanResult?.error ?? null;
          if (!serverMessage) {
            try {
              const body = await (unplanError as any)?.context?.json?.();
              serverMessage = body?.error ?? null;
            } catch {
              serverMessage = null;
            }
          }
          throw new Error(
            serverMessage ||
              `Kunne ikke fjerne montøren fra planen (${techNameMap.get(technicianId) || "montør"}): ${unplanError?.message || "ukjent feil"}`,
          );
        }
        if (unplanResult?.warnings?.length) {
          toast.warning(`Montøren er fjernet, men Outlook-sletting er satt i kø for ${unplanResult.warnings[0].technician_name || "montør"}`);
        }
      }
    }

    // Sikkerhetsnett: oppgaven skal aldri bli borte når det finnes montører igjen.
    if (techIds.length > 0) {
      const { data: eventState } = await supabase
        .from("events")
        .select("id, company_id, status, deleted_at")
        .eq("id", editEvent.id)
        .maybeSingle();

      if ((eventState as any)?.deleted_at || (eventState as any)?.status === "cancelled") {
        await supabase
          .from("events")
          .update({
            deleted_at: null,
            deleted_by: null,
            ...((eventState as any)?.status === "cancelled" ? { status: "scheduled" as any } : {}),
          } as any)
          .eq("id", editEvent.id);
      }

      // Gjenopprett/opprett kalenderblokker for montørene som skal ha oppdraget
      const { data: liveBlocks } = await (supabase as any)
        .from("schedule_blocks")
        .select("id, technician_id, deleted_at, source")
        .or(`project_id.eq.${editEvent.id},job_id.eq.${editEvent.id}`);

      for (const techId of techIds) {
        const rows = (liveBlocks || []).filter((b: any) => b.technician_id === techId);
        const active = rows.find((b: any) => !b.deleted_at);
        if (active) {
          // The resource plan renders schedule_blocks as its source of truth.
          // Keep an existing internal block aligned when the work visit moves.
          if (timeChanged && ["manual", "system"].includes(active.source)) {
            const assignment = (existing || []).find((row) => row.technician_id === techId);
            const { error: activeBlockError } = await (supabase as any)
              .from("schedule_blocks")
              .update({
                start_at: assignment?.start_at || startISO,
                end_at: assignment?.end_at || endISO,
                title,
              })
              .eq("id", active.id);
            if (activeBlockError) {
              throw new Error(`Kunne ikke flytte kalenderkortet: ${activeBlockError.message}`);
            }
          }
          continue;
        }
        if (rows.length > 0) {
          const { error: restoreBlockError } = await (supabase as any)
            .from("schedule_blocks")
            .update({ deleted_at: null, deleted_by: null, start_at: startISO, end_at: endISO, title })
            .eq("id", rows[0].id);
          if (restoreBlockError) {
            throw new Error(`Kunne ikke gjenopprette kalenderkortet: ${restoreBlockError.message}`);
          }
        } else {
          const { error: createBlockError } = await (supabase as any).from("schedule_blocks").insert({
            company_id: (eventState as any)?.company_id ?? null,
            technician_id: techId,
            project_id: editEvent.id,
            source: "manual",
            start_at: startISO,
            end_at: endISO,
            title,
            match_state: "manual",
            match_confidence: 100,
            match_reason: "Montør tildelt fra oppdragsdialog",
          });
          if (createBlockError) {
            throw new Error(`Kunne ikke opprette kalenderkortet: ${createBlockError.message}`);
          }
        }
      }
    }

    const remainingTechIds = techIds.filter((id) => existingIds.has(id));

    // GODKJENNING kreves KUN ved tid/dato-endring eller nye tildelinger.
    // Andre kritiske endringer (adresse, beskrivelse, oppmøteinfo, vedlegg, etc.)
    // sender kun info-varsel uten å nullstille godkjenning.
    const requiresApproval = sendNotifications && (timeChanged || toAdd.length > 0);

    // Info-only endringer = kritiske endringer som IKKE er tid eller tekniker-tildeling
    const infoOnlyChanges = changeSet.filter(
      (change) =>
        change.severity === "critical" &&
        change.key !== "start_time" &&
        change.key !== "end_time" &&
        change.key !== "technicians",
    );

    // KOMBINERT FLYT: Hvis både approval-endringer og info-endringer skjer samtidig,
    // sendes alt i én samlet e-post via create-approval (info_changes-seksjon).
    // Da hopper vi over notify-event-changes for de eksisterende montørene for å
    // unngå dobbeltvarsling. Nye montører får uansett full forespørsel.
    const combinedFlow = requiresApproval && infoOnlyChanges.length > 0;
    const shouldSendInfoOnly =
      sendNotifications && !requiresApproval && infoOnlyChanges.length > 0 && remainingTechIds.length > 0;

    if (timeChanged && remainingTechIds.length > 0) {
      const { data: remainTechs } = await supabase.from("technicians").select("user_id").in("id", remainingTechIds);
      const remainUserIds = (remainTechs || []).map((t: any) => t.user_id).filter(Boolean);
      if (remainUserIds.length > 0) {
        await supabase
          .from("job_approvals")
          .update({
            status: "pending",
            responded_at: null,
            comment: null,
            proposed_start: null,
            proposed_end: null,
            reminder_count: 0,
            last_reminded_at: null,
            response_required: true,
          } as any)
          .eq("job_id", editEvent.id)
          .in("technician_user_id", remainUserIds);
      }
    }

    // Propager tidsendring til koblede bestillinger (kunde-sporingsside)
    if (timeChanged) {
      try {
        const { data: linkedSubs } = await supabase
          .from("order_form_submissions")
          .select("id")
          .or(`linked_event_id.eq.${editEvent.id},id.eq.${(editEvent as any).sourceOrderFormId ?? "00000000-0000-0000-0000-000000000000"}`)
          .is("deleted_at", null);

        // Også finn submissions via events.source_order_form_id
        const { data: ev } = await supabase
          .from("events")
          .select("source_order_form_id")
          .eq("id", editEvent.id)
          .maybeSingle();
        const sourceSubId = (ev as any)?.source_order_form_id || null;

        const subIds = new Set<string>();
        (linkedSubs || []).forEach((s: any) => subIds.add(s.id));
        if (sourceSubId) subIds.add(sourceSubId);

        if (subIds.size > 0) {
          const oldStart = format(editEvent.start, "d. MMM yyyy 'kl.' HH:mm", { locale: nb });
          const newStart = format(new Date(startISO), "d. MMM yyyy 'kl.' HH:mm", { locale: nb });
          const summary = `Flyttet fra ${oldStart} til ${newStart}`;

          for (const subId of subIds) {
            await supabase.from("order_form_activity_log").insert({
              submission_id: subId,
              event_type: "task_rescheduled",
              payload: {
                event_id: editEvent.id,
                old_start: editEvent.start.toISOString(),
                new_start: startISO,
                old_end: editEvent.end.toISOString(),
                new_end: endISO,
                summary,
              },
              created_by: userId,
            } as any);

            await supabase
              .from("order_form_submissions")
              .update({ last_activity_at: new Date().toISOString() } as any)
              .eq("id", subId);
          }
        }
      } catch (err) {
        console.warn("[EventDrawer] Could not propagate reschedule to order submission:", err);
      }
    }

    if (requiresApproval && techIds.length > 0) {
      const { data: approvalResult, error: approvalError } = await supabase.functions.invoke("create-approval", {
        body: {
          job_id: editEvent.id,
          reminder_profile: reminderConfig.profile,
          reminder_config: reminderConfig.profile === "custom" ? reminderConfig.custom : null,
          response_required: reminderConfig.responseRequired,
          time_change: timeChanged,
          // Inkluder info-endringer i samme e-post når kombinert flyt
          info_changes: combinedFlow
            ? infoOnlyChanges.map((c) => ({ label: c.label, oldValue: c.oldValue, newValue: c.newValue }))
            : [],
        },
      });
      if (approvalError || approvalResult?.error) {
        throw new Error(approvalResult?.error || `Montørbyttet ble lagret, men godkjenningsforespørselen feilet: ${approvalError?.message}`);
      }
    }

    // Send info-varsel KUN når det ikke er noen approval-flyt (ellers håndteres alt
    // av create-approval over for å unngå dobbeltvarsling).
    if (shouldSendInfoOnly) {
      try {
        await supabase.functions.invoke("notify-event-changes", {
          body: {
            job_id: editEvent.id,
            technician_ids: remainingTechIds,
            changes: infoOnlyChanges.map((change) => ({
              label: change.label,
              oldValue: change.oldValue,
              newValue: change.newValue,
              severity: change.severity,
            })),
          },
        });
      } catch (err) {
        console.error("[EventDrawer] notify-event-changes failed", err);
      }
    }

    const logEntries: any[] = changeSet.map((change) => ({
      event_id: editEvent.id,
      action_type: change.actionType,
      performed_by: userId,
      performer_name: userName,
      change_summary: change.summary,
      metadata: {
        old_value: change.oldValue,
        new_value: change.newValue,
        severity: change.severity,
        ...(change.metadata || {}),
      },
    }));

    if (toRemove.length > 0) {
      const removedNames = toRemove.map((r) => techNameMap.get(r.technician_id) || "Ukjent");
      logEntries.push({
        event_id: editEvent.id,
        action_type: "technician_removed",
        performed_by: userId,
        performer_name: userName,
        change_summary: `fjernet ${removedNames.join(", ")} fra oppdraget`,
        metadata: { removed_names: removedNames },
      });
    }
    if (toAdd.length > 0) {
      const addedNames = toAdd.map((id) => techNameMap.get(id) || "Ukjent");
      logEntries.push({
        event_id: editEvent.id,
        action_type: "technician_added",
        performed_by: userId,
        performer_name: userName,
        change_summary: `la til ${addedNames.join(", ")} på oppdraget`,
        metadata: { added_names: addedNames },
      });
    }

    const removedAttachmentNames = originalAttachments.map((attachment) => attachment.name).filter((name) => !existingAttachments.some((attachment) => attachment.name === name));
    if (removedAttachmentNames.length > 0) {
      logEntries.push({
        event_id: editEvent.id,
        action_type: "attachment_removed",
        performed_by: userId,
        performer_name: userName,
        change_summary: `fjernet vedlegg: ${removedAttachmentNames.join(", ")}`,
        metadata: { removed_names: removedAttachmentNames },
      });
    }

    let uploadedNames: string[] = [];
    if (files.length > 0) {
      const newUploads = await uploadFiles(editEvent.id, files);
      uploadedNames = newUploads.map((attachment) => attachment.name);
      const allAttachments = [...existingAttachments, ...newUploads];
      const { error: attachmentUpdateError } = await supabase.from("events").update({ attachments: allAttachments as any }).eq("id", editEvent.id);
      if (attachmentUpdateError) throw new Error(`Vedlegget ble lastet opp, men kunne ikke kobles til oppdraget: ${attachmentUpdateError.message}`);
      setExistingAttachments(allAttachments);
      if (uploadedNames.length > 0) {
        logEntries.push({
          event_id: editEvent.id,
          action_type: "attachment_added",
          performed_by: userId,
          performer_name: userName,
          change_summary: `la til vedlegg: ${uploadedNames.join(", ")}`,
          metadata: { added_names: uploadedNames },
        });
      }
    } else {
      const { error: attachmentUpdateError } = await supabase.from("events").update({ attachments: existingAttachments as any }).eq("id", editEvent.id);
      if (attachmentUpdateError) throw new Error(`Kunne ikke lagre vedleggslisten: ${attachmentUpdateError.message}`);
    }

    if (sendNotifications) {
      logEntries.push({
        event_id: editEvent.id,
        action_type: "notifications_sent",
        performed_by: userId,
        performer_name: userName,
        change_summary: `varslet ${techIds.length} montør${techIds.length === 1 ? "" : "er"} om endringene`,
        metadata: { technician_ids: techIds },
      });
    }

    logEntries.push({
      event_id: editEvent.id,
      action_type: updateOutlook ? "calendar_sync_requested" : "calendar_sync_skipped",
      performed_by: userId,
      performer_name: userName,
      change_summary: updateOutlook ? "Outlook-oppdatering startet" : "Outlook-oppdatering hoppet over",
      metadata: { updateOutlook },
    });

    if (logEntries.length > 0) {
      await supabase.from("event_logs").insert(logEntries);
    }

    if (updateOutlook) {
      syncUpdate(editEvent.id);
    }

    setDeliveryStatus({
      notifiedAt: sendNotifications ? new Date().toISOString() : null,
      notifiedNames: sendNotifications ? techIds.map((id) => techNameMap.get(id) || "Ukjent") : [],
      syncedAt: updateOutlook ? new Date().toISOString() : null,
      syncedCount: updateOutlook ? techIds.length : 0,
      failedCount: 0,
    });

    const nextAttachments = files.length > 0 ? [...existingAttachments, ...uploadedNames.map((name) => ({ name, url: "", size: 0 }))] : existingAttachments;
    setOriginalAttachments(nextAttachments);
    setOriginalSnapshot({
      title,
      customer,
      address,
      postalCode,
      city,
      locationDetails,
      siteContactName,
      siteContactPhone,
      accessNotes,
      mapLink,
      description,
      assignmentNotes,
      customerPracticalInfo,
      techIds,
      attachmentNames: nextAttachments.map((attachment) => attachment.name),
      startLabel: `${date} ${startTime}`,
      endLabel: `${resolvedEndDate} ${endTime}`,
    });
    setFiles([]);
    setPendingSave(null);
    toast.success("Hendelse oppdatert", { description: sendNotifications ? "Viktige endringer er lagret og varsling er klargjort." : "Endringer lagret uten varsling." });
    // Refresh approval status + timeline so the drawer never shows the previous technician's answer
    refreshApprovalData();
    onSaved?.(editEvent.id);
  };

  // Save: create or update
  const handleSave = async () => {
    if (saving || submitted || readOnly) return;
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      const userName = session?.session?.user?.user_metadata?.full_name || session?.session?.user?.email || "Ukjent";
      const techNameMap = new Map(allTechnicians.map((t: any) => [t.id, t.name]));

      // Backend permission validation
      if (userId) {
        const { data: canPlan } = await supabase.rpc("check_permission_v2", {
          _auth_user_id: userId,
          _perm: "resource_plan.plan_resources",
        });
        const { data: canPlanLegacy } = await supabase.rpc("check_permission_v2", {
          _auth_user_id: userId,
          _perm: "resourceplan.schedule",
        });
        if (!canPlan && !canPlanLegacy) {
          toast.error("Mangler rettighet", { description: "Du har ikke tillatelse til å planlegge ressurser." });
          setSaving(false);
          return;
        }
      }

       if (isEditing && editEvent) {
         const criticalChanges = detectedChanges.filter((change) => change.severity === "critical");
         if (criticalChanges.length > 0) {
           setPendingSave({
             criticalChanges,
             allChanges: detectedChanges,
             impactedTechIds: techIds,
             sendNotifications: true,
             updateOutlook: true,
           });
           setSaving(false);
           return;
         }

         await persistEventChanges({
           sendNotifications: false,
           updateOutlook: false,
           changeSet: detectedChanges,
         });
      } else if (mode === "existing" && selectedJobId) {
        // Plan a NEW work-visit activity (child event) on an existing parent project.
        // The parent project is context only — we do NOT inherit its old technicians/state.
        if (!date) {
          toast.error("Velg dato for arbeidsbesøket");
          setSaving(false);
          return;
        }
        const { startISO, endISO } = normalizeOvernightDates(date, startTime, endDate, endTime);

        // 1) Load parent project
        const { data: parent, error: parentErr } = await supabase
          .from("events")
          .select("company_id, title, customer, address, postal_code, city, location_details, site_contact_name, site_contact_phone, access_notes, map_link, description, customer_practical_info, source_order_form_id, project_number, internal_number")
          .eq("id", selectedJobId)
          .single();
        if (parentErr || !parent) {
          toast.error("Kunne ikke hente prosjekt", { description: parentErr?.message });
          setSaving(false);
          return;
        }

        // Compute all planning dates (base + copy-to-dates), deduplicated by ISO date
        const dateSet = new Set<string>([date]);
        if (repeatEnabled && repeatDates.length > 0) {
          for (const d of repeatDates) {
            dateSet.add(format(d, "yyyy-MM-dd"));
          }
        }
        const allDates: string[] = Array.from(dateSet);

        // Duplicate pre-check: same tech + same date + same start_time on an existing
        // active task under same parent project → ask user to confirm.
        if (techIds.length > 0) {
          const { data: dupCandidates } = await supabase
            .from("events")
            .select("id, internal_number, title, start_time, end_time")
            .eq("parent_project_id", selectedJobId)
            .eq("project_type", "task")
            .is("deleted_at", null)
            .gte("start_time", `${date}T00:00:00`)
            .lt("start_time", `${date}T23:59:59`);
          if (dupCandidates && dupCandidates.length > 0) {
            const sameTime = dupCandidates.find((c: any) => {
              const t = new Date(c.start_time);
              return t.toTimeString().slice(0, 5) === startTime;
            });
            if (sameTime) {
              const proceed = window.confirm(
                `Det finnes allerede et arbeidsbesøk (${sameTime.internal_number || ""} ${sameTime.title || ""}) på samme dato og tid. Opprette nytt likevel?`
              );
              if (!proceed) {
                setSaving(false);
                return;
              }
            }
          }
        }

        // 2) Transactional batch create via RPC — one event per date
        const dateEntries = allDates.map((d) => {
          const { startISO: dStart, endISO: dEnd } = normalizeOvernightDates(
            d, startTime, d, endTime,
          );
          return { date: d, start: dStart, end: dEnd };
        });

        const { data: rpcRaw, error: rpcErr } = await (supabase as any).rpc(
          "create_work_visits_on_project_batch",
          {
            p_parent_id: selectedJobId,
            p_client_request_id: clientRequestId,
            p_title: title.trim() || null,
            p_technician_ids: techIds,
            p_dates: dateEntries,
            p_extra: {},
          },
        );
        if (rpcErr || !rpcRaw) {
          console.error("[resource-plan:create-activity:rpc-batch] failed", rpcErr);
          toast.error("Kunne ikke opprette arbeidsbesøk", { description: rpcErr?.message });
          setSaving(false);
          return;
        }
        const rpcBatch = rpcRaw as {
          root_project_id: string;
          results: Array<{ date: string; event_id?: string; status: string; inserted_blocks?: number; error?: string }>;
        };
        const results = rpcBatch.results || [];
        const createdResults = results.filter((r) => r.status === "created" && r.event_id);
        const repairedResults = results.filter((r) => r.status === "repaired" && r.event_id);
        const existingResults = results.filter((r) => r.status === "existing" && r.event_id);
        const failedResults = results.filter((r) => r.status === "failed");
        const successResults = [...createdResults, ...repairedResults, ...existingResults];
        const primaryEventId = (successResults.find((r) => r.date === date) ?? successResults[0])?.event_id;

        // 5) Approvals + activity log per newly created/repaired event
        if (techIds.length > 0) {
          const addedNames = techIds.map((id) => techNameMap.get(id) || "Montør");
          for (const r of [...createdResults, ...repairedResults]) {
            if (!r.event_id) continue;
            await supabase.from("event_logs").insert({
              event_id: r.event_id,
              action_type: "technician_assigned",
              performed_by: userId,
              performer_name: userName,
              change_summary: `planla ${addedNames.join(", ")} på nytt arbeidsbesøk (${r.date})`,
              metadata: { added_names: addedNames, date: r.date },
            } as any);

            const { error: approvalErr } = await supabase.functions.invoke("create-approval", {
              body: {
                job_id: r.event_id,
                technician_ids: techIds,
                reminder_profile: reminderConfig.profile,
                reminder_config: reminderConfig.profile === "custom" ? reminderConfig.custom : null,
                response_required: reminderConfig.responseRequired,
              },
            });
            if (approvalErr) {
              console.error("[resource-plan:create-activity:batch] create-approval failed", r.date, approvalErr);
              toast.warning(`Arbeidsbesøk opprettet (${r.date}), men forespørsel ble ikke sendt`, {
                description: approvalErr.message,
              });
            }
          }
        }

        // 6) Attachments on the primary new activity (if any)
        if (files.length > 0 && primaryEventId) {
          const newUploads = await uploadFiles(primaryEventId, files);
          await supabase.from("events").update({ attachments: newUploads as any }).eq("id", primaryEventId);
        }

        // Summary
        if (failedResults.length > 0 && successResults.length === 0) {
          toast.error("Kunne ikke opprette arbeidsbesøk", {
            description: failedResults.map((r) => `${r.date}: ${r.error || "ukjent feil"}`).join("\n"),
          });
          setSaving(false);
          return;
        }
        if (failedResults.length > 0) {
          toast.warning(`Delvis fullført – ${failedResults.length} dato(er) feilet`, {
            description: failedResults.map((r) => `${r.date}: ${r.error || "ukjent feil"}`).join("\n"),
          });
        }
        const createdCount = createdResults.length;
        const repairedCount = repairedResults.length;
        const existingCount = existingResults.length;
        if (createdCount > 0) {
          toast.success(
            createdCount === 1 ? "Arbeidsbesøk opprettet" : `${createdCount} arbeidsbesøk opprettet`,
            {
              description: repairedCount + existingCount > 0
                ? `${repairedCount > 0 ? `${repairedCount} reparert. ` : ""}${existingCount > 0 ? `${existingCount} fantes fra før.` : ""}`.trim()
                : undefined,
            },
          );
        } else if (repairedCount > 0) {
          toast.success("Arbeidsbesøk fullført", { description: `${repairedCount} dato(er) fikk reparert planblokker.` });
        } else if (existingCount > 0 && failedResults.length === 0) {
          toast.info("Arbeidsbesøk fantes fra før", { description: "Ingenting nytt opprettet." });
        }

        setSubmitted(true);
        if (primaryEventId) onSaved?.(primaryEventId);
        onOpenChange(false);
      } else {
        const isTask = eventType === "task";
        // Resolve company_id: explicit selection > active company (non-global) > block
        const resolvedCompanyId = selectedCompanyId || (isAllCompanies ? null : activeCompanyId) || null;

        if (!resolvedCompanyId) {
          toast.error("Velg selskap før du oppretter oppdraget");
          setSaving(false);
          return;
        }

        if (!title.trim() || (!isTask && techIds.length === 0) || !date) {
          toast.error(isTask ? "Fyll inn tittel og dato" : "Fyll inn tittel, dato og minst én montør");
          setSaving(false);
          return;
        }
        const { startISO, endISO } = normalizeOvernightDates(date, startTime, endDate, endTime);

        const { data: existing } = await supabase
          .from("events")
          .select("id")
          .eq("client_request_id", clientRequestId)
          .maybeSingle();

        let createdId: string;

        if (existing) {
          createdId = existing.id;
        } else {
          const { data: created, error } = await supabase.from("events").insert({
            title: title.trim(),
            customer: customer || null,
            address: address || null,
            description: description || null,
            start_time: startISO,
            end_time: endISO,
            technician_id: techIds[0] || userId || "00000000-0000-0000-0000-000000000000",
            status: "requested" as any,
            created_by: userId || null,
            client_request_id: clientRequestId,
            project_type: isTask ? "task" : "project",
            company_id: resolvedCompanyId,
          } as any).select("id").single();

          if (error || !created) {
            toast.error("Kunne ikke opprette", { description: error?.message });
            setSaving(false);
            return;
          }
          createdId = created.id;

          await supabase.from("event_logs").insert({
            event_id: createdId,
            action_type: "created",
            performed_by: userId,
            performer_name: userName,
            change_summary: `opprettet ${isTask ? "oppgave" : "oppdrag"}`,
          });

          if (techIds.length > 0) {
            // Compute all planned dates: primary date + repeat dates (deduplicated by ISO)
            const dateSet = new Set<string>([date]);
            if (repeatEnabled && repeatDates.length > 0) {
              for (const d of repeatDates) {
                dateSet.add(format(d, "yyyy-MM-dd"));
              }
            }
            const allDates: string[] = Array.from(dateSet);

            // event_technicians has UNIQUE (event_id, technician_id) → one row per tech.
            // For the assignment row itself we attach the primary-day window so the
            // event has a canonical timestamp; per-day blocks are handled below.
            const { startISO: primStart, endISO: primEnd } = normalizeOvernightDates(
              date, startTime, date, endTime,
            );
            const etRows = techIds.map((tid) => ({
              event_id: createdId,
              technician_id: tid,
              start_at: primStart,
              end_at: primEnd,
            } as any));

            console.info("[resource-plan:create-activity]", {
              installerIds: techIds,
              baseDate: date,
              copyToDates: repeatEnabled ? repeatDates.map((d) => format(d, "yyyy-MM-dd")) : [],
              allDates,
              expectedBlockRows: techIds.length * allDates.length,
            });

            const { error: etErr } = await (supabase as any)
              .from("event_technicians")
              .upsert(etRows, { onConflict: "event_id,technician_id", ignoreDuplicates: false });
            if (etErr) {
              console.error("[resource-plan:create-activity] event_technicians upsert failed", etErr, etRows);
              toast.error("Kunne ikke tildele montører", { description: etErr.message });
              setSaving(false);
              return;
            }

            // Build one schedule_block per (technician, date) combination so that
            // multi-day + multi-tech expands to N×M planned occurrences.
            const blockMap = new Map<string, any>();
            for (const tid of techIds) {
              for (const ds of allDates) {
                const { startISO: dStart, endISO: dEnd } = normalizeOvernightDates(
                  ds, startTime, ds, endTime,
                );
                const key = `${tid}|${dStart}|${dEnd}`;
                if (blockMap.has(key)) continue;
                blockMap.set(key, {
                  company_id: resolvedCompanyId,
                  technician_id: tid,
                  project_id: createdId,
                  source: "manual",
                  start_at: dStart,
                  end_at: dEnd,
                  title: title.trim() || "Prosjektarbeid",
                  match_state: "manual",
                  match_confidence: 100,
                  match_reason: allDates.length > 1
                    ? "Planlagt over flere dager via planlegger"
                    : "Montør tildelt via planlegger",
                });
              }
            }
            const blockRows = Array.from(blockMap.values());

            console.info("[resource-plan:multi-date-debug]", {
              baseDate: date,
              repeatEnabled,
              repeatDates: repeatDates.map((d) => format(d, "yyyy-MM-dd")),
              allDates,
              blockRowsCount: blockRows.length,
            });

            // Idempotency without onConflict: pre-check active blocks for this
            // event and only insert the missing ones (no matching unique
            // constraint exists on schedule_blocks for an upsert).
            const { data: existingNewBlocks } = await supabase
              .from("schedule_blocks")
              .select("technician_id,start_at,end_at")
              .is("deleted_at", null)
              .eq("project_id", createdId)
              .eq("source", "manual")
              .in("technician_id", techIds);

            const existingNewSet = new Set(
              (existingNewBlocks ?? []).map(
                (b: any) => `${b.technician_id}|${new Date(b.start_at).toISOString()}|${new Date(b.end_at).toISOString()}`
              )
            );
            const blockRowsToInsert = blockRows.filter(
              (b) => !existingNewSet.has(`${b.technician_id}|${b.start_at}|${b.end_at}`)
            );

            let sbErr: any = null;
            if (blockRowsToInsert.length > 0) {
              const res = await (supabase as any)
                .from("schedule_blocks")
                .insert(blockRowsToInsert);
              sbErr = res.error;
            }

            console.info("[resource-plan:create-activity:result]", {
              expected: blockRows.length,
              inserted: blockRowsToInsert.length,
              skippedExisting: blockRows.length - blockRowsToInsert.length,
              error: sbErr,
            });
            if (sbErr) {
              console.error("[resource-plan:create-activity] schedule_blocks insert failed", sbErr, blockRowsToInsert);
              toast.error("Kunne ikke planlegge dager", { description: sbErr.message });
              setSaving(false);
              return;
            }

            const assignedNames = techIds.map((id) => techNameMap.get(id) || "Montør");
            await supabase.from("event_logs").insert({
              event_id: createdId,
              action_type: "technician_assigned",
              performed_by: userId,
              performer_name: userName,
              change_summary: allDates.length > 1
                ? `planla ${assignedNames.join(", ")} over ${allDates.length} dager`
                : `tildelte ${assignedNames.join(", ")} til oppdraget`,
              metadata: { added_names: assignedNames, day_count: allDates.length },
            });

            if (isTask) {
              await supabase.from("events").update({ status: "scheduled" } as any).eq("id", createdId);
              syncCreate(createdId);
            } else {
              await supabase.functions.invoke("create-approval", {
                body: {
                  job_id: createdId,
                  reminder_profile: reminderConfig.profile,
                  reminder_config: reminderConfig.profile === "custom" ? reminderConfig.custom : null,
                  response_required: reminderConfig.responseRequired,
                },
              });
              syncCreate(createdId);
            }
          }
        }

        // Upload attachments for new event
        if (files.length > 0) {
          const newUploads = await uploadFiles(createdId, files);
          await supabase.from("events").update({ attachments: newUploads as any }).eq("id", createdId);
        }

        const totalDaysSet = new Set<string>([date]);
        if (repeatEnabled) for (const d of repeatDates) totalDaysSet.add(format(d, "yyyy-MM-dd"));
        const totalDays = totalDaysSet.size;
        toast.success(isTask ? "Oppgave opprettet" : "Hendelse opprettet og planlagt", {
          description: isTask
            ? `${title} er lagt til som oppgave.`
            : totalDays > 1
              ? `Opprettet ${totalDays} planlagte dager for ${title} (${techIds.length} montør(er) per dag).`
              : `${title} er tildelt ${techIds.length} montør(er).`,
        });
        setSubmitted(true);
        onSaved?.(createdId);
      }
    } catch (err: any) {
      toast.error("Feil ved lagring", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = isEditing && editEvent ? (
    date !== format(editEvent.start, "yyyy-MM-dd") ||
    startTime !== format(editEvent.start, "HH:mm") ||
    endDate !== format(editEvent.end, "yyyy-MM-dd") ||
    endTime !== format(editEvent.end, "HH:mm") ||
    title !== editEvent.title ||
    description !== (editEvent.description || "") ||
    customer !== (editEvent.customer || "") ||
    address !== (editEvent.address || "") ||
    JSON.stringify([...techIds].sort()) !== JSON.stringify(editEvent.technicians.map((t) => t.id).sort())
  ) : true;

  const isMultiTech = isEditing && editEvent && editEvent.technicians.length > 1;
  const clickedTechName = isEditing && clickedTechId
    ? editEvent?.technicians.find((t) => t.id === clickedTechId)?.name ?? null
    : null;
  const otherTechNames = isMultiTech && clickedTechId
    ? editEvent!.technicians.filter((t) => t.id !== clickedTechId).map((t) => t.name)
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[480px] flex flex-col overflow-y-auto">
        <SheetHeader className="space-y-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            {isEditing ? (
              readOnly
                ? <><Clock className="h-4 w-4 text-muted-foreground" />Oppdragsdetaljer</>
                : <><Clock className="h-4 w-4 text-primary" />Rediger oppdrag</>
            ) : (
              <><CalendarPlus className="h-4 w-4 text-primary" />{projectId ? "Planlegg arbeid" : "Nytt oppdrag"}</>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {isEditing
              ? readOnly
                ? "Viser detaljer for oppdraget (kun lesemodus)"
                : "Endre tid, ressurser eller detaljer"
              : projectId
              ? `Tildel tid og montører til ${projectTitle || "prosjektet"}`
              : "Opprett nytt oppdrag eller knytt til eksisterende prosjekt"}
          </SheetDescription>

          {/* Multi-tech context banner */}
          {isEditing && editEvent && (
            <div className="space-y-1.5 pt-1">
              {/* Primary identifier badges */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(editEvent as any).projectNumber && (
                  <span className="inline-block font-mono text-[11px] font-semibold bg-primary/10 text-primary rounded-md px-2 py-0.5">
                    {(editEvent as any).projectNumber}
                  </span>
                )}
                {editEvent.jobNumber && (
                  <span className={cn(
                    "inline-block font-mono text-[10px] rounded-md px-1.5 py-0.5",
                    (editEvent as any).projectNumber
                      ? "text-muted-foreground bg-muted/50"
                      : "font-semibold bg-primary/10 text-primary"
                  )}>
                    {editEvent.jobNumber}
                  </span>
                )}
              </div>
              {/* Compact technician line */}
              {isMultiTech ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3 w-3 shrink-0" />
                  <span>Montører: <span className="font-medium text-foreground">{editEvent.technicians.map((t) => t.name.split(" ")[0]).join(", ")}</span></span>
                </div>
              ) : clickedTechName ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="h-3 w-3 shrink-0" />
                  <span>Montør: <span className="font-medium text-foreground">{clickedTechName}</span></span>
                </div>
              ) : null}
            </div>
          )}
        </SheetHeader>

        {/* Tab switcher for edit mode */}
        {isEditing && editEvent && (
          <div className="flex items-center gap-1 border border-border/40 rounded-lg p-0.5 mt-3">
            <Button
              type="button"
              variant={drawerTab === "details" ? "default" : "ghost"}
              size="sm"
              className="h-8 text-xs rounded-md flex-1 gap-1.5"
              onClick={() => setDrawerTab("details")}
            >
              <Clock className="h-3.5 w-3.5" />
              Detaljer
            </Button>
            <Button
              type="button"
              variant={drawerTab === "thread" ? "default" : "ghost"}
              size="sm"
              className="h-8 text-xs rounded-md flex-1 gap-1.5 relative"
              onClick={() => setDrawerTab("thread")}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Tråd
              {threadUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {threadUnreadCount > 9 ? "9+" : threadUnreadCount}
                </span>
              )}
            </Button>
            <Button
              type="button"
              variant={drawerTab === "history" ? "default" : "ghost"}
              size="sm"
              className="h-8 text-xs rounded-md flex-1 gap-1.5"
              onClick={() => setDrawerTab("history")}
            >
              <Clock className="h-3.5 w-3.5" />
              Historikk
            </Button>
          </div>
        )}

        {/* Thread tab content */}
        {isEditing && editEvent && drawerTab === "thread" ? (
          <div className="flex-1 mt-3 flex flex-col min-h-0">
            <TaskThreadPanel
              taskId={editEvent.id}
              companyId={editCompanyId || activeCompanyId || ""}
            />
          </div>
        ) : isEditing && editEvent && drawerTab === "history" ? (
          <div className="flex-1 mt-3 overflow-y-auto px-1">
            <EventHistoryTab eventId={editEvent.id} />
          </div>
        ) : (
        <>
        <div className="flex-1 mt-3 space-y-6">

          {/* ═══ SECTION: SELSKAP ═══ */}
          {!isEditing && isAllCompanies && companies.length > 1 && (
            <section className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Selskap</h3>
              <p className="text-[11px] text-muted-foreground">
                Du oppretter fra «Alle selskaper» – velg hvilket selskap oppdraget tilhører.
              </p>
              <select
                value={selectedCompanyId || ""}
                onChange={(e) => setSelectedCompanyId(e.target.value || null)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Velg selskap…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </section>
          )}

          {/* Company badge (when known) */}
          {!isEditing && !isAllCompanies && activeCompanyId && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building className="h-3 w-3 shrink-0" />
              <span>Selskap: <span className="font-medium text-foreground">{companies.find(c => c.id === activeCompanyId)?.name || "—"}</span></span>
            </div>
          )}

          {/* ═══ SECTION: TYPE ═══ */}
          {!isEditing && !projectId && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Type</h3>
              <div className="flex items-center gap-1 border border-border/40 rounded-lg p-0.5">
                <Button
                  type="button"
                  variant={eventType === "project" ? "default" : "ghost"}
                  size="sm"
                  className="h-9 text-xs rounded-md flex-1 gap-1.5"
                  onClick={() => { setEventType("project"); setMode("new"); }}
                >
                  <FolderKanban className="h-3.5 w-3.5" />
                  Prosjekt
                </Button>
                <Button
                  type="button"
                  variant={eventType === "task" ? "default" : "ghost"}
                  size="sm"
                  className="h-9 text-xs rounded-md flex-1 gap-1.5"
                  onClick={() => { setEventType("task"); setMode("new"); }}
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  Oppgave
                </Button>
              </div>

              {eventType === "project" && (
                <Tabs value={mode} onValueChange={(v) => setMode(v as "new" | "existing")}>
                  <TabsList className="grid w-full grid-cols-2 h-8">
                    <TabsTrigger value="new" className="gap-1 text-[11px] h-7">
                      <Plus className="h-3 w-3" />Nytt prosjekt
                    </TabsTrigger>
                    <TabsTrigger value="existing" className="gap-1 text-[11px] h-7">
                      <Link2 className="h-3 w-3" />Eksisterende
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </section>
          )}

          {/* ═══ SECTION: EXISTING JOB SEARCH ═══ */}
          {mode === "existing" && !isEditing && !projectId && (
            <section className="space-y-3">
              {/* Selected project chip — persists regardless of search state */}
              {selectedJobSnapshot && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-0.5">Valgt prosjekt</p>
                    <p className="text-sm font-medium truncate">{selectedJobSnapshot.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedJobSnapshot.internal_number} · {selectedJobSnapshot.customer || "Ingen kunde"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={() => {
                      setSelectedJobId(null);
                      setSelectedJobSnapshot(null);
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                  >
                    Endre
                  </Button>
                </div>
              )}

              {!selectedJobSnapshot && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Søk prosjekt (tittel, kunde, nr)..."
                      className="pl-9"
                    />
                  </div>
                  {searchLoading && (
                    <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  )}
                  {searchResults.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-border p-1">
                      {searchResults.map((job) => (
                        <button key={job.id} type="button"
                          onClick={() => {
                            console.info("[resource-plan:select-existing-project]", { id: job.id, title: job.title });
                            setSelectedJobId(job.id);
                            setSelectedJobSnapshot(job);
                            setTitle(job.title);
                            if (job.customer) setCustomer(job.customer);
                          }}
                          className={cn(
                            "w-full text-left rounded-md px-3 py-2 text-sm transition-colors",
                            selectedJobId === job.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
                          )}>
                          <p className="font-medium truncate">{job.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {job.internal_number} · {job.customer || "Ingen kunde"}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* Project info banner */}
          {projectId && !isEditing && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-sm font-medium">{projectTitle}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Velg tid og montører</p>
            </div>
          )}

          {/* Edit mode: job info */}
          {isEditing && editEvent && (
            <div className="space-y-3">
              {((editEvent as any).projectNumber || editEvent.internalNumber || editEvent.jobNumber) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {(editEvent as any).projectNumber && (
                    <span className="inline-block font-mono text-[11px] font-semibold bg-primary/10 text-primary rounded px-2 py-0.5">
                      {(editEvent as any).projectNumber}
                    </span>
                  )}
                  {(editEvent.internalNumber || editEvent.jobNumber) && (
                    <span className={cn(
                      "inline-block font-mono text-[10px] rounded px-1.5 py-0.5",
                      (editEvent as any).projectNumber
                        ? "text-muted-foreground bg-muted/50"
                        : "font-semibold bg-primary/10 text-primary"
                    )}>
                      {(() => {
                        const num = editEvent.internalNumber || editEvent.jobNumber || "";
                        return num.startsWith("JOB-") ? num : `JOB-${num}`;
                      })()}
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {editCompanyName && (
                  <span className="flex items-center gap-1.5"><Building className="h-3.5 w-3.5" />{editCompanyName}</span>
                )}
                {editEvent.customer && (
                  <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{editEvent.customer}</span>
                )}
                {editEvent.address && (
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{editEvent.address}</span>
                )}
              </div>

              {/* ── Grouped status display ── */}
              <div className="rounded-lg border border-border/40 bg-card p-3">
                <JobStatusGroup
                  executionStatus={getExecutionStatus(editEvent.status)}
                  acceptanceStatuses={
                    techApprovals.length > 0
                      ? techApprovals.map((a) => ({ techName: a.technicianName.split(" ")[0], status: a.status }))
                      : editEvent.technicians.map((t) => ({
                          techName: t.name.split(" ")[0],
                          status: ACCEPTANCE_STATUSES.includes(editEvent.status) ? (editEvent.status === "approved" ? "approved" : editEvent.status === "rejected" ? "declined" : editEvent.status === "time_change_proposed" ? "change_request" : "pending") : "approved",
                        }))
                  }
                  billingStatus={BILLING_STATUSES.includes(editEvent.status) ? editEvent.status : null}
                />
              </div>

              {/* ═══ KJEMIKALIERISIKO ═══ */}
              <ChemicalRiskAlert
                riskText={`${title} ${description}`}
                technicians={techIds.map((id) => {
                  const t = allTechnicians.find((tech: any) => tech.id === id);
                  return { full_name: t?.name ?? null, email: t?.email ?? null };
                })}
              />

              {/* ═══ APPROVAL COCKPIT ═══ */}

              {approvalSummary && approvalSummary.total > 0 && editEvent && (
                <ApprovalCockpit
                  jobId={editEvent.id}
                  eventStart={editEvent.start}
                  summary={approvalSummary}
                  approvals={techApprovals}
                  onRefresh={refreshApprovalData}
                  readOnly={readOnly}
                />
              )}

              {/* ═══ TECH REPLACEMENT SUGGESTION ═══ */}
              {approvalSummary && editEvent && (approvalSummary.declined > 0 || approvalSummary.changeRequest > 0 || (approvalSummary.pending > 0 && (editEvent.start.getTime() - Date.now()) < 12 * 60 * 60 * 1000)) && (
                <TechReplacementSuggestion
                  summary={approvalSummary}
                  eventStart={editEvent.start}
                  availableTechs={allTechnicians}
                  assignedTechIds={editEvent.technicianIds || []}
                  insights={techInsights}
                  onSelectTech={(techId) => {
                    if (!techIds.includes(techId)) {
                      setTechIds([...techIds, techId]);
                    }
                  }}
                />
              )}

              {/* ═══ FRA BESTILLING (jobbunderlag for montør) ═══ */}
              <OrderBriefingSection eventId={editEvent.id} />
            </div>
          )}

          {/* ═══ SECTION: OPPDRAG (new event fields) ═══ */}
          {mode === "new" && !isEditing && !projectId && (
            <NewEventFields
              title={title}
              setTitle={setTitle}
              customer={customer}
              setCustomer={setCustomer}
              address={address}
              setAddress={setAddress}
              eventType={eventType}
              onLinkProject={(proj) => {
                setMode("existing");
                setSelectedJobId(proj.id);
                setSelectedJobSnapshot({
                  id: proj.id,
                  title: proj.title,
                  customer: proj.customer || null,
                  internal_number: (proj as any).internal_number || (proj as any).jobNumber || "",
                  start_time: null,
                  end_time: null,
                  status: null,
                } as any);
                setTitle(proj.title);
                setCustomer(proj.customer || "");
              }}
              onAddressSelect={(sel) => {
                if (sel.postalCode) setPostalCode(sel.postalCode);
                if (sel.city) setCity(sel.city);
              }}
            />
          )}

          {/* Edit mode: oppdrag + kunde */}
          {isEditing && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Oppdrag</h3>
              <div>
                <Label className="text-xs">Tittel</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" disabled={readOnly} />
              </div>
              <div>
                <Label className="text-xs">Kunde</Label>
                <Input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Kundenavn"
                  className="mt-1"
                  disabled={readOnly}
                />
              </div>
            </section>
          )}

          {/* ═══ SECTION: OPPMØTE / LOKASJON (edit mode) ═══ */}
          {isEditing && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                Oppmøte / lokasjon
              </h3>
              <div className="rounded-lg border border-border/40 bg-card p-3 space-y-3">
                <div>
                  <Label className="text-xs">Adresse</Label>
                  <AddressAutocomplete
                    value={address}
                    onChange={setAddress}
                    onSelect={(sel) => {
                      setAddress(sel.address);
                      if (sel.postalCode) setPostalCode(sel.postalCode);
                      if (sel.city) setCity(sel.city);
                    }}
                    placeholder="Søk adresse…"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <div>
                    <Label className="text-xs">Postnr.</Label>
                    <Input
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="0000"
                      className="mt-1"
                      disabled={readOnly}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Poststed</Label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="By"
                      className="mt-1"
                      disabled={readOnly}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Bygg / etasje / sone</Label>
                  <Input
                    value={locationDetails}
                    onChange={(e) => setLocationDetails(e.target.value)}
                    placeholder="F.eks. Bygg B, 3. etasje"
                    className="mt-1"
                    disabled={readOnly}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Kontaktperson på sted</Label>
                    <Input
                      value={siteContactName}
                      onChange={(e) => setSiteContactName(e.target.value)}
                      placeholder="Navn"
                      className="mt-1"
                      disabled={readOnly}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Telefon</Label>
                    <Input
                      type="tel"
                      value={siteContactPhone}
                      onChange={(e) => setSiteContactPhone(e.target.value)}
                      placeholder="+47 ..."
                      className="mt-1"
                      disabled={readOnly}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Adkomst / oppmøtenotat</Label>
                  <Textarea
                    value={accessNotes}
                    onChange={(e) => setAccessNotes(e.target.value)}
                    placeholder="Parkering, nøkler, kode, alarm, hvor møte…"
                    rows={2}
                    className="mt-1 resize-none"
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <Label className="text-xs">Kartlenke (valgfritt)</Label>
                  <Input
                    value={mapLink}
                    onChange={(e) => setMapLink(e.target.value)}
                    placeholder="https://maps.google.com/…"
                    className="mt-1"
                    disabled={readOnly}
                  />
                </div>
              </div>
            </section>
          )}

          {/* ═══ SECTION: TIDSPUNKT ═══ */}
          <section className="space-y-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Tidspunkt</h3>

            {/* Fra */}
            <div className="rounded-lg border border-border/40 bg-card p-3 space-y-2">
              <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Fra</Label>
              <div className="flex gap-2">
                <Input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} className="flex-1 h-9" disabled={readOnly} />
                <TimeSelect value={startTime} onChange={handleStartTimeChange} className="w-[100px]" disabled={readOnly} />
              </div>
            </div>

            {/* Arrow indicator */}
            <div className="flex justify-center">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <div className="h-px w-6 bg-border" />
                <ArrowRight className="h-3.5 w-3.5" />
                <div className="h-px w-6 bg-border" />
              </div>
            </div>

            {/* Til */}
            <div className="rounded-lg border border-border/40 bg-card p-3 space-y-2">
              <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Til</Label>
              <div className="flex gap-2">
                <Input type="date" value={resolvedEndDate} onChange={(e) => setEndDate(e.target.value)} className="flex-1 h-9" disabled={readOnly} />
                <TimeSelect value={endTime} onChange={handleEndTimeChange} className="w-[100px]" disabled={readOnly} />
              </div>
            </div>

            {/* Overnight badge */}
            {overnight && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <Moon className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-medium text-primary">Går over midnatt – slutter neste dag</span>
              </div>
            )}

            {/* Time summary */}
            {summaryLine && (
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tidsrom</p>
                <p className="text-sm font-semibold mt-0.5 flex items-center gap-1.5">
                  {summaryLine}
                  {overnight && <Moon className="h-3 w-3 text-primary" />}
                </p>
              </div>
            )}

            {/* Multi-day repeat — available for new events AND when planlegging på eksisterende prosjekt */}
            {!isEditing && !readOnly && (mode === "new" || (mode === "existing" && selectedJobId)) && (
              <div className="rounded-lg border border-border/40 bg-card p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Gjenta flere dager
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Opprett samme oppdrag på flere datoer (samme tid og montører)
                    </p>
                  </div>
                  <Switch
                    checked={repeatEnabled}
                    onCheckedChange={(v) => {
                      setRepeatEnabled(v);
                      if (!v) setRepeatDates([]);
                    }}
                  />
                </div>

                {repeatEnabled && (
                  <div className="space-y-2 pt-1">
                    <Popover open={repeatPickerOpen} onOpenChange={setRepeatPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-start h-9">
                          <CalendarPlus className="h-3.5 w-3.5 mr-2" />
                          {repeatDates.length === 0
                            ? "Velg ekstra datoer..."
                            : `${repeatDates.length} ekstra ${repeatDates.length === 1 ? "dag" : "dager"} valgt`}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="multiple"
                          selected={repeatDates}
                          onSelect={(dates) => setRepeatDates(dates || [])}
                          disabled={(d) => {
                            // Disable the primary date (already covered by main date field)
                            if (date && format(d, "yyyy-MM-dd") === date) return true;
                            // Disable past dates
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return d < today;
                          }}
                          initialFocus
                          locale={nb}
                          weekStartsOn={1}
                          className={cn("p-3 pointer-events-auto")}
                        />
                        <div className="border-t p-2 flex justify-between items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {repeatDates.length} valgt
                          </span>
                          <div className="flex gap-1.5">
                            <Button variant="ghost" size="sm" onClick={() => setRepeatDates([])}>
                              Tøm
                            </Button>
                            <Button size="sm" onClick={() => setRepeatPickerOpen(false)}>
                              Ferdig
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    {repeatDates.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {[...repeatDates]
                          .sort((a, b) => a.getTime() - b.getTime())
                          .map((d) => (
                            <span
                              key={d.toISOString()}
                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                            >
                              {format(d, "d. MMM", { locale: nb })}
                              <button
                                type="button"
                                onClick={() =>
                                  setRepeatDates((prev) =>
                                    prev.filter((x) => x.getTime() !== d.getTime()),
                                  )
                                }
                                className="hover:text-destructive"
                                aria-label="Fjern dato"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Hovedoppdrag opprettes på <strong>{date ? format(new Date(date), "d. MMM", { locale: nb }) : "valgt dato"}</strong>
                      {repeatDates.length > 0 && ` + ${repeatDates.length} ekstra ${repeatDates.length === 1 ? "dag" : "dager"}`}.
                      Hver dag får egen planlagt blokk per montør.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ═══ SECTION: RESSURSER ═══ */}
          <section className="space-y-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {eventType === "task" && !isEditing ? "Tildel montør (valgfritt)" : "Ressurser"}
            </h3>
            <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} disabled={readOnly} />
          </section>

          {/* ═══ SECTION: PÅMINNELSE ═══ */}
          {(isEditing || eventType === "project") && techIds.length > 0 && (
            <ReminderProfileSelect
              value={reminderConfig}
              onChange={setReminderConfig}
              disabled={readOnly}
              companyRemindersDisabled={reminderSettings?.enabled === false}
            />
          )}

          {/* ═══ SECTION: BESKRIVELSE ═══ */}
          {(mode === "new" || isEditing) && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Beskrivelse</h3>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Detaljer til montøren..." className="min-h-[60px] resize-none" rows={2} disabled={readOnly} />
            </section>
          )}

          {/* ═══ SECTION: OPPDRAGSINSTRUKS (existing project mode) ═══ */}
          {mode === "existing" && !isEditing && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Instruks for dette oppdraget</h3>
              <p className="text-[11px] text-muted-foreground">
                Prosjektet gir grunninfo. Feltet under gjelder denne konkrete tildelingen.
              </p>
              <Textarea
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
                placeholder="Spesifikke instrukser for denne tildelingen…"
                className="min-h-[60px] resize-none"
                rows={2}
              />
            </section>
          )}

          {/* ═══ SECTION: VEDLEGG ═══ */}
          <section className="space-y-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Paperclip className="h-3 w-3" />
              Vedlegg
            </h3>
            {existingAttachments.length > 0 && (
              <AttachmentList
                attachments={existingAttachments}
                onRemove={readOnly ? undefined : (name) => {
                  const updated = existingAttachments.filter((a) => a.name !== name);
                  setExistingAttachments(updated);
                  if (isEditing && editEvent) {
                    supabase.from("events").update({ attachments: updated as any }).eq("id", editEvent.id);
                  }
                }}
              />
            )}
            {!readOnly && <FileUpload files={files} onChange={setFiles} />}
          </section>

          {isEditing && deliveryStatus.notifiedAt && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</h3>
              <div className="rounded-lg border border-border/40 bg-card p-3 space-y-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Varslet montører</span>
                  <span className="text-right font-medium">{deliveryStatus.notifiedNames.join(", ") || "Ingen"}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Sist varslet</span>
                  <span className="text-right font-medium">{format(new Date(deliveryStatus.notifiedAt), "dd.MM.yyyy HH:mm", { locale: nb })}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Outlook-synk</span>
                  <span className="text-right font-medium">
                    {deliveryStatus.syncedAt ? `OK · ${deliveryStatus.syncedCount} oppdatert` : "Ikke kjørt"}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* ═══ CONFLICTS ═══ */}
          {conflicts.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p className="text-sm font-semibold">Kalenderkonflikt</p>
              </div>
              {conflicts.map((c, i) => (
                <p key={i} className="text-xs text-amber-700/80 dark:text-amber-400/80 ml-6">
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
            {isEditing && editEvent && (
              <Button variant="outline" className="flex-1 gap-1.5"
                onClick={() => { onOpenChange(false); navigate(`/projects/${editEvent.id}`); }}>
                <ExternalLink className="h-3.5 w-3.5" />
                Åpne prosjekt
              </Button>
            )}
            {!readOnly && drawerTab === "details" && (
              <Button className="flex-1 gap-1.5" onClick={handleSave}
                disabled={saving || submitted || (isEditing && !hasChanges) || (eventType === "project" && !isEditing && techIds.length === 0)}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? "Oppretter…" :
                 submitted ? "Opprettet ✓" :
                 isEditing ? (conflicts.length > 0 ? "Lagre likevel" : "Lagre endringer") :
                 eventType === "task" ? "Opprett oppgave" :
                 conflicts.length > 0 ? "Lagre likevel" : "Opprett og planlegg"}
              </Button>
            )}
          </div>

          {!readOnly && drawerTab === "details" && isEditing && editEvent && (
            <Button
              variant="ghost" size="sm"
              className="h-8 text-xs gap-1.5 w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Fjern fra plan
            </Button>
          )}
        </SheetFooter>
        </>
        )}

        {/* Delete confirmation */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fjern fra ressursplan?</AlertDialogTitle>
              <AlertDialogDescription>
                {scheduleBlockId
                  ? "Blokken fjernes fra planoversikten. Hvis den er koblet til Outlook, forsøkes sletting der også."
                  : "Montørtildelingen og tidsplanen fjernes fra kalenderen. Prosjektet forblir intakt."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Avbryt</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("remove-work-visit-from-plan", {
                      body: scheduleBlockId
                        ? { action: "remove_assignment", schedule_block_id: scheduleBlockId, technician_id: clickedTechId }
                        : { action: "remove_event", event_id: editEvent?.id },
                    });
                    if (error || data?.error) {
                      toast.error("Kunne ikke avplanlegge", { description: data?.error || error?.message });
                      return;
                    }
                    const warning = data?.warnings?.[0];
                    if (warning) {
                      toast.warning(`Fjernet i ressursplan, men Outlook-sletting feilet for ${warning.technician_name || "montør"}`, {
                        description: "Nytt forsøk er satt i kø.",
                      });
                    } else {
                      toast.success(data?.status === "already_removed" ? "Allerede fjernet ✓" : "Fjernet fra plan og Outlook ✓");
                    }
                    onOpenChange(false);
                    onSaved?.();
                  } catch (err: any) {
                    toast.error("Feil", { description: err?.message });
                  } finally {
                    setDeleting(false);
                    setShowDeleteConfirm(false);
                  }
                }}
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Slett
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!pendingSave} onOpenChange={(open) => !open && setPendingSave(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bekreft endringer på oppdraget</AlertDialogTitle>
              <AlertDialogDescription>
                Disse endringene påvirker montørene ute i felt. Velg hvordan oppdraget skal oppdateres.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {(() => {
              const criticals = pendingSave?.criticalChanges ?? [];
              const requiresApproval = criticals.filter(
                (c) => c.key === "start_time" || c.key === "end_time" || c.key === "technicians",
              );
              const infoOnly = criticals.filter(
                (c) => c.key !== "start_time" && c.key !== "end_time" && c.key !== "technicians",
              );

              return (
                <div className="space-y-3">
                  {requiresApproval.length > 0 && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <p className="text-xs font-semibold uppercase tracking-wide">Krever ny godkjenning fra montør</p>
                      </div>
                      {requiresApproval.map((change) => (
                        <div key={change.key} className="space-y-0.5 text-sm">
                          <p className="font-medium">{change.label}</p>
                          <p className="text-muted-foreground">{change.oldValue || "Tomt"} → {change.newValue || "Tomt"}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {infoOnly.length > 0 && (
                    <div className="rounded-lg border border-border/40 bg-card p-3 space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Bell className="h-4 w-4" />
                        <p className="text-xs font-semibold uppercase tracking-wide">Sendes som informasjon (ingen ny godkjenning)</p>
                      </div>
                      {infoOnly.map((change) => (
                        <div key={change.key} className="space-y-0.5 text-sm">
                          <p className="font-medium">{change.label}</p>
                          <p className="text-muted-foreground">{change.oldValue || "Tomt"} → {change.newValue || "Tomt"}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3 rounded-lg border border-border/40 bg-card p-3">
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={pendingSave?.sendNotifications ?? true}
                        onCheckedChange={(checked) => setPendingSave((prev) => prev ? { ...prev, sendNotifications: checked === true } : prev)}
                      />
                      <div>
                        <p className="font-medium">Varsle berørte montører</p>
                        <p className="text-muted-foreground">
                          {requiresApproval.length > 0 && infoOnly.length > 0
                            ? "Sender én samlet e-post: ny godkjenningsforespørsel for tid/montør, og en tydelig seksjon med øvrige praktiske endringer."
                            : requiresApproval.length > 0
                              ? "Sender ny godkjenningsforespørsel for tid/montør."
                              : "Sender info-e-post om endringene. Montørene trenger ikke å godkjenne på nytt."}
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={pendingSave?.updateOutlook ?? true}
                        onCheckedChange={(checked) => setPendingSave((prev) => prev ? { ...prev, updateOutlook: checked === true } : prev)}
                      />
                      <div>
                        <p className="font-medium">Oppdater Outlook-kalenderhendelser</p>
                        <p className="text-muted-foreground">Forsøker å oppdatere eksisterende kalenderkobling.</p>
                      </div>
                    </label>
                  </div>
                </div>
              );
            })()}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Avbryt</AlertDialogCancel>
              <Button
                variant="outline"
                disabled={saving}
                onClick={async () => {
                  if (!pendingSave) return;
                  setSaving(true);
                  try {
                    await persistEventChanges({
                      sendNotifications: false,
                      updateOutlook: false,
                      changeSet: pendingSave.allChanges,
                    });
                  } catch (err: any) {
                    console.error("[EventDrawer] save without notifications failed", err);
                    toast.error("Feil ved lagring", {
                      description: err?.message || "Ukjent feil. Prøv igjen.",
                    });
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Lagrer...</span>
                ) : (
                  "Lagre uten varsling"
                )}
              </Button>
              <AlertDialogAction
                disabled={saving}
                onClick={async (event) => {
                  event.preventDefault();
                  if (!pendingSave) return;
                  setSaving(true);
                  try {
                    await persistEventChanges({
                      sendNotifications: pendingSave.sendNotifications,
                      updateOutlook: pendingSave.updateOutlook,
                      changeSet: pendingSave.allChanges,
                    });
                  } catch (err: any) {
                    console.error("[EventDrawer] save with notifications failed", err);
                    toast.error("Feil ved lagring", {
                      description: err?.message || "Ukjent feil. Prøv igjen.",
                    });
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Oppdaterer...</span>
                ) : (
                  "Fortsett og oppdater"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

/* ── Extracted: New event fields with project suggestions ── */
function NewEventFields({
  title, setTitle, customer, setCustomer, address, setAddress, eventType, onLinkProject, onAddressSelect,
}: {
  title: string;
  setTitle: (v: string) => void;
  customer: string;
  setCustomer: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  eventType: "project" | "task";
  onLinkProject: (proj: ProjectSuggestion) => void;
  onAddressSelect?: (sel: { postalCode: string; city: string }) => void;
}) {
  const { suggestions, loading } = useProjectSuggestions(title, eventType === "project");

  return (
    <section className="space-y-4">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Oppdrag</h3>
      <div>
        <Label className="text-xs">Tittel *</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={eventType === "task" ? "F.eks. Bestille materialer" : "F.eks. Kabellegging 3. etg"}
          className="mt-1"
        />
      </div>

      {/* Project suggestions */}
      {eventType === "project" && (
        <ProjectSuggestionList
          suggestions={suggestions}
          loading={loading}
          onSelect={onLinkProject}
        />
      )}

      {eventType === "project" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Kunde</Label>
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Kundenavn" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Adresse</Label>
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              onSelect={(sel) => {
                setAddress(sel.address);
                onAddressSelect?.({ postalCode: sel.postalCode, city: sel.city });
              }}
              placeholder="Søk adresse…"
              className="mt-1"
            />
          </div>
        </div>
      )}
    </section>
  );
}
