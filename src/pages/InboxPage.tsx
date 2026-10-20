import { useState, useEffect, useCallback, useRef } from "react";
import DOMPurify from "dompurify";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Building2,
  RefreshCw,
  Search,
  Mail,
  MailOpen,
  FolderKanban,
  UserPlus,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Users,
  Lock,
  Unlock,
  UserCheck,
  Clock,
  Phone,
  FileText,
  Wrench,
  CalendarDays,
  Package,
  AlertTriangle,
  Timer,
  ReceiptText,
  Hammer,
  ArrowRightLeft,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { PlanJobDialog } from "@/components/PlanJobDialog";
import { CaseAssignmentBanner } from "@/components/cases/CaseAssignmentBanner";
import { CaseOfferConversionDrawer } from "@/components/cases/CaseOfferConversionDrawer";
import { CaseCloseDrawer } from "@/components/cases/CaseCloseDrawer";
import { CaseLinkedEntities } from "@/components/cases/CaseLinkedEntities";
import { LinkToExistingDialog } from "@/components/cases/LinkToExistingDialog";
import { CaseEmailViewer } from "@/components/cases/CaseEmailViewer";
import { CaseToOrderDialog } from "@/components/cases/CaseToOrderDialog";
import { format, formatDistanceToNow, isPast, differenceInHours } from "date-fns";
import { nb } from "date-fns/locale";
import { FlowTrail as _FlowTrail } from "@/components/flow/FlowTrail";
import { useFlowChain as _useFlowChain } from "@/components/flow/useFlowChain";
import {
  CASE_STATUS_LABELS,
  CASE_STATUS_COLOR,
  CASE_PRIORITY_LABELS,
  CASE_PRIORITY_COLOR,
  CASE_NEXT_ACTION_LABELS,
  ALL_CASE_STATUSES,
  ALL_CASE_PRIORITIES,
  ALL_CASE_NEXT_ACTIONS,
  type CaseStatus,
  type CasePriority,
  type CaseNextAction,
  type CaseScope,
  type CaseResolutionType,
  CASE_RESOLUTION_LABELS,
} from "@/lib/case-labels";

// ─── Types ───────────────────────────────────
type Case = {
  id: string;
  company_id: string;
  case_number: string;
  title: string;
  status: CaseStatus;
  priority: CasePriority;
  due_at: string | null;
  next_action: CaseNextAction;
  owner_user_id: string | null;
  assigned_to_user_id: string | null;
  assigned_at: string | null;
  participant_user_ids: string[];
  scope: CaseScope;
  mailbox_address: string | null;
  thread_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  project_id: string | null;
  offer_id: string | null;
  work_order_id: string | null;
  service_job_id: string | null;
  resolution_type: CaseResolutionType | null;
  linked_offer_id: string | null;
  linked_project_id: string | null;
  linked_work_order_id: string | null;
  linked_lead_id: string | null;
  linked_order_submission_id: string | null;
  archived_at: string | null;
  archived_by: string | null;
  last_activity_at: string | null;
  last_activity_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type CaseItem = {
  id: string;
  case_id: string;
  type: string;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  body_preview: string | null;
  body_html: string | null;
  body_text: string | null;
  received_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  conversation_id: string | null;
  to_emails: string[] | null;
  cc_emails: string[] | null;
  internet_message_id: string | null;
  attachments_meta: any[] | null;
};

type Mailbox = {
  id: string;
  address: string;
  display_name: string;
  is_enabled: boolean;
};

type FilterType = "mine" | "team" | "needs_action" | "waiting_customer" | "waiting_internal" | "linked" | "converted" | "closed";

/** A case is considered "linked" (forwarded) when it has been connected to a project, job, lead, offer or order */
const isLinkedCase = (c: { linked_project_id?: string | null; linked_work_order_id?: string | null; linked_lead_id?: string | null; linked_offer_id?: string | null; linked_order_submission_id?: string | null }) =>
  !!(c.linked_project_id || c.linked_work_order_id || c.linked_lead_id || c.linked_offer_id || c.linked_order_submission_id);

/** A linked case still needs attention if it has an actionable status or critical priority */
const needsAttention = (c: Case, userId?: string) => {
  if (["new", "triage"].includes(c.status)) return true;
  if (c.priority === "critical" && !["closed", "archived", "converted"].includes(c.status)) return true;
  if (c.due_at && isPast(new Date(c.due_at)) && !["closed", "archived", "converted"].includes(c.status)) return true;
  if (c.status === "waiting_customer" || c.status === "waiting_internal") return true;
  return false;
};

/** Determine the forwarded reason label */
const forwardedReason = (c: Case): string => {
  if (["closed", "converted"].includes(c.status)) return "Koblet og ferdig";
  if (c.status === "in_progress") return "Under arbeid";
  return "Videresendt";
};

/** Route for a linked entity */
const linkedEntityRoute = (c: Case): string | null => {
  if (c.linked_order_submission_id) return `/orders/${c.linked_order_submission_id}`;
  if (c.linked_project_id) return `/projects/${c.linked_project_id}?tab=epost`;
  if (c.linked_work_order_id) return `/projects/${c.linked_work_order_id}?tab=epost`;
  if (c.linked_lead_id) return `/sales/leads/${c.linked_lead_id}`;
  if (c.linked_offer_id) return `/sales/offers/${c.linked_offer_id}`;
  return null;
};

const linkedEntityLabel = (c: Case): string =>
  c.linked_order_submission_id ? "Bestilling" : c.linked_project_id ? "Prosjekt" : c.linked_work_order_id ? "Prosjekt" : c.linked_lead_id ? "Lead" : "Tilbud";

const FILTER_OPTIONS: { key: FilterType; label: string; icon: React.ElementType }[] = [
  { key: "mine", label: "Mine saker", icon: UserCheck },
  { key: "team", label: "Teamets saker", icon: Users },
  { key: "needs_action", label: "Krever handling", icon: AlertCircle },
  { key: "waiting_customer", label: "Avventer kunde", icon: Clock },
  { key: "waiting_internal", label: "Avventer internt", icon: Timer },
  { key: "linked", label: "Videresendt", icon: ArrowRightLeft },
  { key: "converted", label: "Opprettet jobb", icon: CheckCircle2 },
  { key: "closed", label: "Lukket", icon: Lock },
];

const NEXT_ACTION_ICONS: Record<CaseNextAction, React.ElementType> = {
  call: Phone,
  quote: ReceiptText,
  clarify: Wrench,
  order: Package,
  schedule: CalendarDays,
  document: FileText,
  none: Clock,
};

// ─── Main Page ───────────────────────────────
const AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

export default function InboxPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [items, setItems] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const mobileDetail = isMobile && !!selectedId;
  const [filter, setFilter] = useState<FilterType>("mine");
  const [search, setSearch] = useState("");
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<string>("all");
  const [companyUsers, setCompanyUsers] = useState<{ id: string; name: string }[]>([]);
  const [assigningTo, setAssigningTo] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [autoSyncActive, setAutoSyncActive] = useState(true);
  const autoSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedCase = cases.find((c) => c.id === selectedId);
  const selectedItems = items.filter((i) => i.case_id === selectedId);

  const fetchMailboxes = useCallback(async () => {
    const { data } = await supabase.from("mailboxes").select("*").order("created_at");
    setMailboxes((data as unknown as Mailbox[]) || []);
  }, []);

  const fetchCompanyUsers = useCallback(async () => {
    const { data } = await supabase.from("technicians").select("user_id, name");
    setCompanyUsers(
      (data || []).filter((t: any) => t.user_id && t.name).map((t: any) => ({ id: t.user_id, name: t.name }))
    );
  }, []);

  const { activeCompanyId, allowedCompanyIds } = useCompanyContext();

  const fetchCases = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("cases")
      .select("*")
      .is("deleted_at", null)
      .not("status", "eq", "archived")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
    else if (allowedCompanyIds.length > 0) query = query.in("company_id", allowedCompanyIds);
    const { data, error } = await query;

    if (error) {
      console.error("Failed to load cases:", error);
      toast.error("Kunne ikke laste henvendelser");
    } else {
      setCases((data as unknown as Case[]) || []);
    }
    setLoading(false);
  }, [activeCompanyId]);

  const fetchItems = useCallback(async (caseId: string) => {
    const { data } = await supabase
      .from("case_items")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });
    setItems((data as unknown as CaseItem[]) || []);
  }, []);

  useEffect(() => {
    fetchCases();
    fetchMailboxes();
    fetchCompanyUsers();
  }, [fetchCases, fetchMailboxes, fetchCompanyUsers]);

  useEffect(() => {
    if (selectedId) fetchItems(selectedId);
  }, [selectedId, fetchItems]);

  const syncInbox = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-sync");
      if (error) throw error;
      if (data?.ms_reauth) {
        if (!silent) toast.error("Microsoft-tilkobling må fornyes. Gå til Integrasjoner.");
        return;
      }
      setLastSyncAt(new Date());
      const newCases = data?.new_cases || 0;
      const newItems = data?.new_items || 0;
      if (!silent) {
        toast.success(`Synkronisert! ${newCases} nye henvendelser, ${newItems} nye meldinger.`);
      } else if (newCases > 0 || newItems > 0) {
        toast.info(`${newCases} nye henvendelser, ${newItems} nye meldinger`);
      }
      await fetchCases();
    } catch (err: any) {
      if (!silent) toast.error("Synkronisering feilet: " + (err.message || "Ukjent feil"));
      console.error("Inbox sync error:", err);
    } finally {
      setSyncing(false);
    }
  }, [fetchCases]);

  // Auto-sync interval
  useEffect(() => {
    if (!autoSyncActive) {
      if (autoSyncRef.current) clearInterval(autoSyncRef.current);
      autoSyncRef.current = null;
      return;
    }
    // Initial silent sync on mount
    syncInbox(true);
    autoSyncRef.current = setInterval(() => {
      syncInbox(true);
    }, AUTO_SYNC_INTERVAL_MS);
    return () => {
      if (autoSyncRef.current) clearInterval(autoSyncRef.current);
    };
  }, [autoSyncActive, syncInbox]);

  // Realtime subscription for cases
  useEffect(() => {
    const channel = supabase
      .channel("cases-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "cases",
      }, () => fetchCases())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCases]);

  const softDeleteCase = async (c: Case) => {
    if (!user) return;
    if (!confirm(`Er du sikker på at du vil slette sak "${c.title || c.case_number}"?`)) return;
    await supabase.from("cases").update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    } as any).eq("id", c.id);
    setCases(prev => prev.filter(x => x.id !== c.id));
    if (selectedId === c.id) setSelectedId(null);
    toast.success("Sak slettet");
  };

  const openCase = (c: Case) => {
    setSelectedId(c.id);
    if (c.status === "new") {
      supabase.from("cases").update({ status: "triage" } as any).eq("id", c.id).then(() => {
        setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "triage" as CaseStatus } : x)));
      });
    }
  };

  const touchActivity = (caseId: string) => {
    if (!user) return;
    supabase.from("cases").update({
      last_activity_at: new Date().toISOString(),
      last_activity_by_user_id: user.id,
    } as any).eq("id", caseId);
  };

  const logSystemItem = async (c: Case, subject: string, body: string) => {
    if (!user) return;
    await supabase.from("case_items").insert({
      case_id: c.id, company_id: c.company_id, type: "system",
      subject, body_preview: body, created_by: user.id,
    } as any);
    touchActivity(c.id);
  };

  const assignToMe = async (c: Case) => {
    if (!user) return;
    const participants = [...(c.participant_user_ids || [])];
    if (!participants.includes(user.id)) participants.push(user.id);
    await supabase.from("cases").update({
      owner_user_id: user.id,
      assigned_to_user_id: user.id,
      assigned_at: new Date().toISOString(),
      participant_user_ids: participants,
      status: c.status === "new" ? "triage" : c.status,
      last_activity_at: new Date().toISOString(),
      last_activity_by_user_id: user.id,
    } as any).eq("id", c.id);
    const myName = companyUsers.find(u => u.id === user.id)?.name || "Ukjent";
    await logSystemItem(c, "Tildelt", `${myName} tildelte seg denne henvendelsen`);
    const newStatus = (c.status === "new" ? "triage" : c.status) as CaseStatus;
    setCases((prev) => prev.map((x) => x.id === c.id ? { ...x, owner_user_id: user.id, assigned_to_user_id: user.id, assigned_at: new Date().toISOString(), participant_user_ids: participants, status: newStatus } : x));
    toast.success("Tildelt deg");
  };

  const assignToUser = async (c: Case, targetUserId: string) => {
    const participants = [...(c.participant_user_ids || [])];
    if (!participants.includes(targetUserId)) participants.push(targetUserId);
    await supabase.from("cases").update({
      owner_user_id: targetUserId,
      assigned_to_user_id: targetUserId,
      assigned_at: new Date().toISOString(),
      participant_user_ids: participants,
      status: c.status === "new" ? "triage" : c.status,
      last_activity_at: new Date().toISOString(),
      last_activity_by_user_id: user?.id,
    } as any).eq("id", c.id);
    const name = companyUsers.find((u) => u.id === targetUserId)?.name || "bruker";
    await logSystemItem(c, "Tildelt", `Henvendelsen ble tildelt ${name}`);
    const newStatus = (c.status === "new" ? "triage" : c.status) as CaseStatus;
    setCases((prev) => prev.map((x) => x.id === c.id ? { ...x, owner_user_id: targetUserId, assigned_to_user_id: targetUserId, assigned_at: new Date().toISOString(), participant_user_ids: participants, status: newStatus } : x));
    toast.success(`Tildelt ${name}`);
    setAssigningTo(null);
  };

  const unassignCase = async (c: Case) => {
    if (!user) return;
    const prevName = companyUsers.find(u => u.id === c.assigned_to_user_id)?.name || "Ukjent";
    await supabase.from("cases").update({
      assigned_to_user_id: null,
      assigned_at: null,
      last_activity_at: new Date().toISOString(),
      last_activity_by_user_id: user.id,
    } as any).eq("id", c.id);
    await logSystemItem(c, "Frigjort", `${prevName} ble fjernet som tildelt`);
    setCases((prev) => prev.map(x => x.id === c.id ? { ...x, assigned_to_user_id: null, assigned_at: null } : x));
    toast.success("Sak frigjort");
  };

  const archiveCase = async (c: Case) => {
    if (!user) return;
    await supabase.from("cases").update({
      status: "archived",
      archived_at: new Date().toISOString(),
      archived_by: user.id,
      last_activity_at: new Date().toISOString(),
      last_activity_by_user_id: user.id,
    } as any).eq("id", c.id);
    await logSystemItem(c, "Arkivert", "Henvendelsen ble arkivert");
    setCases(prev => prev.filter(x => x.id !== c.id));
    setSelectedId(null);
    toast.success("Sak arkivert");
  };

  /** Check if another user owns this case and prompt for override */
  const checkConflictAndUpdate = async (c: Case, updates: Partial<Case>) => {
    if (
      c.assigned_to_user_id &&
      c.assigned_to_user_id !== user?.id &&
      (updates.status || updates.priority || updates.next_action)
    ) {
      const assignedName = ownerName(c.assigned_to_user_id) || "en annen bruker";
      const confirmed = window.confirm(
        `${assignedName} jobber med denne saken. Vil du overskrive endringene?`
      );
      if (!confirmed) return;
    }
    await doUpdateCaseField(c, updates);
  };

  const doUpdateCaseField = async (c: Case, updates: Partial<Case>) => {
    // Detect reopen: moving from closed/converted to an active status
    const terminalStatuses = ["closed", "converted"];
    const activeStatuses: CaseStatus[] = ["new", "triage", "in_progress", "waiting_customer", "waiting_internal"];
    const isReopen = terminalStatuses.includes(c.status) && updates.status && activeStatuses.includes(updates.status as CaseStatus);

    // On reopen, clear resolution_type
    const finalUpdates = isReopen ? { ...updates, resolution_type: null } : updates;

    await supabase.from("cases").update({
      ...finalUpdates,
      last_activity_at: new Date().toISOString(),
      last_activity_by_user_id: user?.id,
    } as any).eq("id", c.id);

    // Audit trail: log each changed field
    if (user) {
      const fieldLabels: Record<string, string> = {
        status: "Status", priority: "Prioritet", next_action: "Neste steg", due_at: "Frist", scope: "Omfang",
      };
      const statusLabels: Record<string, string> = { ...CASE_STATUS_LABELS };
      const priorityLabels: Record<string, string> = { ...CASE_PRIORITY_LABELS };
      const nextActionLabels: Record<string, string> = { ...CASE_NEXT_ACTION_LABELS };
      const allLabels: Record<string, Record<string, string>> = {
        status: statusLabels, priority: priorityLabels, next_action: nextActionLabels,
      };

      for (const [key, val] of Object.entries(updates)) {
        if (fieldLabels[key]) {
          const oldVal = (c as any)[key];
          const labelMap = allLabels[key];
          const oldLabel = labelMap ? (labelMap[oldVal] || oldVal) : oldVal;
          const newLabel = labelMap ? (labelMap[val as string] || val) : val;
          await logSystemItem(c, `${fieldLabels[key]} endret`, `${fieldLabels[key]}: ${oldLabel || "(tom)"} → ${newLabel || "(tom)"}`);
        }
      }

      // Log reopen as separate system event
      if (isReopen) {
        await logSystemItem(c, "Gjenåpnet sak", `Sak gjenåpnet: ${CASE_STATUS_LABELS[c.status] || c.status} → ${CASE_STATUS_LABELS[updates.status as CaseStatus] || updates.status}, resolution_type nullstilt`);
      }
    }
    setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...finalUpdates } : x)));
  };

  const convertToProject = (c: Case) => {
    const params = new URLSearchParams();
    params.set("fromCase", c.id);
    params.set("title", c.title);
    navigate(`/projects/new?${params.toString()}`);
  };

  const convertToLead = async (c: Case) => {
    try {
      // Use first email in the case as the source
      const caseEmails = items
        .filter((i) => i.case_id === c.id && i.type === "email")
        .sort((a, b) => {
          const ta = new Date(a.received_at || a.sent_at || a.created_at).getTime();
          const tb = new Date(b.received_at || b.sent_at || b.created_at).getTime();
          return ta - tb;
        });
      const firstItem = caseEmails[0];

      const fromEmail = (firstItem?.from_email || "").trim();
      const fromName = (firstItem?.from_name || "").trim();
      const emailDomain = fromEmail.includes("@") ? fromEmail.split("@")[1] : "";
      const domainAsName = emailDomain
        ? emailDomain.replace(/\.(no|com|net|org|io|co\.\w+)$/i, "").replace(/\./g, " ")
        : "";
      const companyNameGuess =
        fromName ||
        (domainAsName ? domainAsName.charAt(0).toUpperCase() + domainAsName.slice(1) : "") ||
        "Ukjent avsender";

      const bodyPreview = (firstItem?.body_preview || firstItem?.body_text || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280);

      const notesLines = [
        `Sak: ${c.case_number} — ${c.title}`,
        firstItem?.subject ? `E-postemne: ${firstItem.subject}` : null,
        fromEmail ? `Fra: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}` : null,
        bodyPreview ? `\nUtdrag:\n${bodyPreview}` : null,
      ].filter(Boolean);

      const { data, error } = await supabase
        .from("leads")
        .insert({
          company_id: c.company_id,
          company_name: companyNameGuess,
          contact_name: fromName || null,
          email: fromEmail || null,
          source: "postkontor",
          notes: notesLines.join("\n"),
          status: "new",
          owner_id: user?.id || null,
          assigned_owner_user_id: user?.id || null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      await doUpdateCaseField(c, {
        status: "converted" as CaseStatus,
        resolution_type: "converted_to_lead",
        linked_lead_id: data.id,
        lead_id: data.id,
      } as any);
      await logSystemItem(
        c,
        "Konvertert til lead",
        `Henvendelse konvertert til lead «${companyNameGuess}». Lead ID: ${data.id}`,
      );
      toast.success("Lead opprettet uten koblet kunde", {
        description: "Du kan koble kunde/selskap manuelt på leadet senere.",
        action: { label: "Åpne lead", onClick: () => navigate(`/sales/leads/${data.id}`) },
      });
      navigate(`/sales/leads/${data.id}`);
    } catch (err: any) {
      toast.error("Kunne ikke opprette lead: " + (err.message || ""));
    }
  };

  // ─── Filter Logic ────────────────────────
  // When searching, bypass filter to find across all buckets
  const isSearching = search.length > 0;
  const searchMatch = (c: Case, q: string) =>
    c.title.toLowerCase().includes(q) ||
    (c.mailbox_address || "").toLowerCase().includes(q) ||
    (c.case_number || "").toLowerCase().includes(q);

  const filtered = cases
    .filter((c) => {
      if (selectedMailbox !== "all" && c.mailbox_address !== selectedMailbox) return false;

      // Global search bypasses filter selection
      if (isSearching) {
        const q = search.toLowerCase();
        return searchMatch(c, q);
      }

      const linked = isLinkedCase(c);
      const attention = needsAttention(c, user?.id);
      const isMine = c.owner_user_id === user?.id || (c.participant_user_ids || []).includes(user?.id || "");

      if (import.meta.env.DEV) {
        if (linked && attention) {
          console.debug(`[filter] Case ${c.case_number} is linked but needs_attention → visible in action filters`);
        }
      }

      switch (filter) {
        case "mine":
          // Hide forwarded only if settled
          return isMine && (!linked || attention);
        case "team":
          return c.scope === "company" && (!linked || attention);
        case "needs_action":
          // Always include cases that need attention, even if forwarded
          return ["new", "triage"].includes(c.status) || (linked && attention && c.priority === "critical");
        case "waiting_customer":
          return c.status === "waiting_customer";
        case "waiting_internal":
          return c.status === "waiting_internal";
        case "linked":
          // Show forwarded cases that are settled (no attention needed)
          return linked && !attention;
        case "converted":
          return c.status === "converted";
        case "closed":
          return c.status === "closed";
      }
      return true;
    });

  // Group search results by bucket
  type SearchBucket = "active" | "forwarded" | "archived";
  const getSearchBucket = (c: Case): SearchBucket => {
    if (c.archived_at) return "archived";
    if (isLinkedCase(c) && !needsAttention(c, user?.id)) return "forwarded";
    return "active";
  };

  const statusCounts: Record<FilterType, number> = {
    mine: cases.filter((c) => {
      const isMine = c.owner_user_id === user?.id || (c.participant_user_ids || []).includes(user?.id || "");
      return isMine && (!isLinkedCase(c) || needsAttention(c, user?.id));
    }).length,
    team: cases.filter((c) => c.scope === "company" && (!isLinkedCase(c) || needsAttention(c, user?.id))).length,
    needs_action: cases.filter((c) => ["new", "triage"].includes(c.status) || (isLinkedCase(c) && needsAttention(c, user?.id) && c.priority === "critical")).length,
    waiting_customer: cases.filter((c) => c.status === "waiting_customer").length,
    waiting_internal: cases.filter((c) => c.status === "waiting_internal").length,
    linked: cases.filter((c) => isLinkedCase(c) && !needsAttention(c, user?.id)).length,
    converted: cases.filter((c) => c.status === "converted").length,
    closed: cases.filter((c) => c.status === "closed").length,
  };

  const ownerName = (id: string | null) => {
    if (!id) return null;
    if (id === user?.id) return "Deg";
    return companyUsers.find((u) => u.id === id)?.name || null;
  };

  // ─── KPI Dashboard ──────────────────────
  const openCount = cases.filter((c) => !["closed", "archived", "converted"].includes(c.status)).length;
  const criticalCount = cases.filter((c) => c.priority === "critical" && !["closed", "archived"].includes(c.status)).length;
  const overdueCount = cases.filter((c) => c.due_at && isPast(new Date(c.due_at)) && !["closed", "archived", "converted"].includes(c.status)).length;
  const unhandled24h = cases.filter((c) => c.status === "new" && differenceInHours(new Date(), new Date(c.created_at)) > 24).length;

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      {/* KPI Dashboard */}
      <div className={`border-b border-border bg-card px-4 md:px-6 py-3 ${mobileDetail ? "hidden" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Postkontoret</h1>
              <p className="text-xs text-muted-foreground">Kommandosentral for alle saker</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedMailbox} onValueChange={setSelectedMailbox}>
              <SelectTrigger className="w-full sm:w-48 h-11 md:h-9 text-sm">
                <SelectValue placeholder="Alle postbokser" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle postbokser</SelectItem>
                {mailboxes.filter((mb) => mb.is_enabled).map((mb) => (
                  <SelectItem key={mb.id} value={mb.address}>{mb.display_name || mb.address}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              {/* Auto-sync indicator */}
              <button
                onClick={() => setAutoSyncActive(prev => !prev)}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors ${
                  autoSyncActive
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : "border-border text-muted-foreground"
                }`}
                title={autoSyncActive ? "Auto-synk aktiv (hvert 3. min) – klikk for å deaktivere" : "Auto-synk deaktivert – klikk for å aktivere"}
              >
                {autoSyncActive ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {autoSyncActive ? "Auto" : "Av"}
              </button>
              {lastSyncAt && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  Sist: {formatDistanceToNow(lastSyncAt, { addSuffix: true, locale: nb })}
                </span>
              )}
              <Button onClick={() => syncInbox(false)} disabled={syncing} variant="outline" size="sm">
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Synkroniserer..." : "Synk e-post"}
              </Button>
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <KpiCard label="Åpne saker" value={openCount} icon={Mail} />
          <KpiCard label="Kritiske" value={criticalCount} icon={AlertTriangle} variant={criticalCount > 0 ? "destructive" : "default"} />
          <KpiCard label="Over frist" value={overdueCount} icon={Timer} variant={overdueCount > 0 ? "warning" : "default"} />
          <KpiCard label="Ubehandlet > 24t" value={unhandled24h} icon={Clock} variant={unhandled24h > 0 ? "warning" : "default"} />
        </div>
      </div>

      {/* Main layout: filters | list | preview */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Filters */}
        <div className="hidden md:block w-56 shrink-0 border-r border-border bg-card p-3 space-y-1">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === f.key
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <f.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{f.label}</span>
              <span className="text-xs tabular-nums">{statusCounts[f.key]}</span>
            </button>
          ))}
        </div>

        {/* Center: Case list */}
        <div className={`w-full md:w-[420px] shrink-0 md:border-r border-border flex-col ${mobileDetail ? "hidden" : "flex"}`}>
          <div className="flex md:hidden gap-2 overflow-x-auto px-3 pt-3 [scrollbar-width:none]">
            {FILTER_OPTIONS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm ${
                  filter === f.key ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground"
                }`}
              >
                {f.label}
                <span className="text-xs tabular-nums">{statusCounts[f.key]}</span>
              </button>
            ))}
          </div>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Søk alle saker (tittel, saksnr, postboks)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-11 md:h-9"
              />
            </div>
            {isSearching && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Søker på tvers av alle saker · {filtered.length} treff
              </p>
            )}
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-3 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="space-y-2 p-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Mail className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Ingen saker</p>
                <p className="text-xs mt-1">{autoSyncActive ? "Auto-synk er aktiv – nye saker vil dukke opp automatisk" : "Slå på auto-synk eller klikk «Synk e-post»"}</p>
              </div>
            ) : (() => {
              // When searching, group results by bucket
              const renderCaseRow = (c: Case) => {
                const isOverdue = c.due_at && isPast(new Date(c.due_at)) && !["closed", "archived", "converted"].includes(c.status);
                const ActionIcon = NEXT_ACTION_ICONS[c.next_action] || Clock;
                const linked = isLinkedCase(c);
                const route = linked ? linkedEntityRoute(c) : null;

                return (
                  <button
                    key={c.id}
                    onClick={() => openCase(c)}
                    className={`w-full text-left p-4 md:p-3 hover:bg-muted/50 transition-colors ${
                      selectedId === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    } ${c.status === "new" ? "bg-primary/[0.02]" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">
                        {linked ? (
                          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                        ) : c.priority === "critical" ? (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        ) : c.status === "new" ? (
                          <Mail className="h-4 w-4 text-primary" />
                        ) : c.status === "converted" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <MailOpen className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-sm truncate ${c.status === "new" ? "font-semibold text-foreground" : "text-foreground"}`}>
                            {c.title || "(Uten tittel)"}
                          </p>
                          {c.case_number && (
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">{c.case_number}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${CASE_STATUS_COLOR[c.status]}`}>
                            {CASE_STATUS_LABELS[c.status]}
                          </Badge>
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${CASE_PRIORITY_COLOR[c.priority]}`}>
                            {CASE_PRIORITY_LABELS[c.priority]}
                          </Badge>
                          {c.next_action !== "none" && (
                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <ActionIcon className="h-3 w-3" />
                              {CASE_NEXT_ACTION_LABELS[c.next_action]}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(c.updated_at), { locale: nb, addSuffix: true })}
                          </span>
                          {c.owner_user_id && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {ownerName(c.owner_user_id)}
                            </Badge>
                          )}
                          {isOverdue && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Over frist
                            </Badge>
                          )}
                          {c.mailbox_address && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                              {c.mailbox_address}
                            </span>
                          )}
                          {linked && route && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 gap-0.5 cursor-pointer hover:bg-primary/10 transition-colors"
                              title={`Åpne ${linkedEntityLabel(c)}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(route);
                              }}
                            >
                              <ArrowRightLeft className="h-2.5 w-2.5" />
                              {linkedEntityLabel(c)}
                            </Badge>
                          )}
                          {/* Diagnostics pill: show reason on Videresendt filter */}
                          {filter === "linked" && linked && (
                            <span className="text-[10px] text-muted-foreground italic">
                              {forwardedReason(c)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              };

              if (isSearching) {
                // Group by bucket
                const buckets: Record<SearchBucket, Case[]> = { active: [], forwarded: [], archived: [] };
                for (const c of filtered) {
                  buckets[getSearchBucket(c)].push(c);
                }
                const bucketLabels: Record<SearchBucket, string> = { active: "Aktive", forwarded: "Videresendt", archived: "Arkiv" };
                const bucketOrder: SearchBucket[] = ["active", "forwarded", "archived"];

                return (
                  <div>
                    {bucketOrder.map((bucket) => {
                      const items = buckets[bucket];
                      if (items.length === 0) return null;
                      return (
                        <div key={bucket}>
                          <div className="px-3 py-1.5 bg-muted/50 border-b border-border sticky top-0 z-10">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {bucketLabels[bucket]} ({items.length})
                            </span>
                          </div>
                          <div className="divide-y divide-border">
                            {items.map(renderCaseRow)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              return (
                <div className="divide-y divide-border">
                  {filtered.map(renderCaseRow)}
                </div>
              );
            })()}
          </ScrollArea>
        </div>

        {/* Right: Detail view */}
        <div className={`flex-1 flex-col min-w-0 ${isMobile && !selectedId ? "hidden" : "flex"}`}>
          {isMobile && selectedId && (
            <div className="sticky top-0 z-10 flex items-center border-b border-border bg-card px-2 py-1">
              <Button variant="ghost" className="h-11 gap-2" onClick={() => setSelectedId(null)}>
                <ArrowLeft className="h-5 w-5" /> Alle saker
              </Button>
            </div>
          )}
          {selectedCase ? (
            <CaseDetail
              caseData={selectedCase}
              items={selectedItems}
              onAssignToMe={() => assignToMe(selectedCase)}
              onAssignToUser={(uid) => assignToUser(selectedCase, uid)}
              onUnassign={() => unassignCase(selectedCase)}
              onUpdateField={(updates) => checkConflictAndUpdate(selectedCase, updates)}
              onConvertProject={() => convertToProject(selectedCase)}
              onConvertLead={() => convertToLead(selectedCase)}
              onArchive={() => archiveCase(selectedCase)}
              onDelete={() => softDeleteCase(selectedCase)}
              onCaseUpdated={() => { fetchCases(); fetchItems(selectedCase.id); }}
              companyUsers={companyUsers}
              currentUserId={user?.id || ""}
              isAdmin={isAdmin}
              ownerName={ownerName}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Building2 className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm font-medium">Velg en sak</p>
              <p className="text-xs mt-1">Velg fra listen for å se detaljer og handlinger</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────
function KpiCard({ label, value, icon: Icon, variant = "default" }: {
  label: string;
  value: number;
  icon: React.ElementType;
  variant?: "default" | "destructive" | "warning";
}) {
  const colors = {
    default: "text-foreground",
    destructive: value > 0 ? "text-destructive" : "text-foreground",
    warning: value > 0 ? "text-warning" : "text-foreground",
  };
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${colors[variant]}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${colors[variant]}`}>{value}</p>
    </div>
  );
}

// ─── Auto-Link Banner ────────────────────────
function AutoLinkBanner({ items }: { items: CaseItem[] }) {
  const autoLinks = items.filter(
    (i) => i.type === "system" && i.subject === "auto_link_success"
  );
  if (autoLinks.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {autoLinks.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-1.5 text-xs text-blue-800 dark:text-blue-300"
        >
          <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
          <span>{item.body_preview}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Case Detail ─────────────────────────────
function CaseDetail({
  caseData,
  items,
  onAssignToMe,
  onAssignToUser,
  onUnassign,
  onUpdateField,
  onConvertProject,
  onConvertLead,
  onArchive,
  onDelete,
  onCaseUpdated,
  companyUsers,
  currentUserId,
  isAdmin,
  ownerName,
}: {
  caseData: Case;
  items: CaseItem[];
  onAssignToMe: () => void;
  onAssignToUser: (uid: string) => void;
  onUnassign: () => void;
  onUpdateField: (updates: Partial<Case>) => void;
  onConvertProject: () => void;
  onConvertLead: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onCaseUpdated: () => void;
  companyUsers: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
  ownerName: (id: string | null) => string | null;
}) {
  const navigate = useNavigate();
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [planJobOpen, setPlanJobOpen] = useState(false);
  const [offerDrawerOpen, setOfferDrawerOpen] = useState(false);
  const [closeDrawerOpen, setCloseDrawerOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-5">
        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {!caseData.owner_user_id ? (
            <Button size="sm" variant="default" onClick={onAssignToMe} className="gap-1.5">
              <UserCheck className="h-4 w-4" />
              Tildel meg
            </Button>
          ) : (
            <Badge variant="secondary" className="px-3 py-1.5 text-xs">
              <UserCheck className="h-3 w-3 mr-1" />
              Tildelt: {ownerName(caseData.owner_user_id)}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowAssignPicker(!showAssignPicker)} className="gap-1.5">
            <Users className="h-4 w-4" />
            Tildel…
          </Button>
          <Badge variant="outline" className="text-xs ml-auto">
            {caseData.scope === "private" ? "Privat" : "Hele firma"}
          </Badge>
        </div>

        {showAssignPicker && (
          <Card className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Velg person:</p>
            <div className="flex flex-wrap gap-1.5">
              {companyUsers.map((u) => (
                <Button key={u.id} size="sm" variant="outline" className="text-xs h-7" onClick={() => { onAssignToUser(u.id); setShowAssignPicker(false); }}>
                  {u.name}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {/* Assignment banner */}
        {caseData.assigned_to_user_id && caseData.assigned_at && (
          <CaseAssignmentBanner
            assignedName={ownerName(caseData.assigned_to_user_id) || "Ukjent"}
            assignedAt={caseData.assigned_at}
            isCurrentUser={caseData.assigned_to_user_id === currentUserId}
            onUnassign={caseData.assigned_to_user_id === currentUserId || isAdmin ? onUnassign : undefined}
          />
        )}

        {/* Title & meta */}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{caseData.title || "(Uten tittel)"}</h2>
            {caseData.case_number && (
              <button
                onClick={() => { navigator.clipboard.writeText(caseData.case_number); toast.success("Saksnummer kopiert"); }}
                className="inline-flex items-center gap-1 text-xs font-mono bg-card border border-border/60 px-2 py-0.5 rounded-lg hover:bg-accent/50 transition-colors shadow-sm text-muted-foreground"
                title="Klikk for å kopiere"
              >
                {caseData.case_number}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
            <Badge className={CASE_STATUS_COLOR[caseData.status]}>{CASE_STATUS_LABELS[caseData.status]}</Badge>
            <Badge className={CASE_PRIORITY_COLOR[caseData.priority]}>{CASE_PRIORITY_LABELS[caseData.priority]}</Badge>
            {caseData.resolution_type && (
              <Badge variant="secondary" className="text-xs">
                {CASE_RESOLUTION_LABELS[caseData.resolution_type as CaseResolutionType] || caseData.resolution_type}
              </Badge>
            )}
            {caseData.due_at && (
              <span className="text-xs">
                Frist: {format(new Date(caseData.due_at), "d. MMM yyyy", { locale: nb })}
              </span>
            )}
            {caseData.mailbox_address && (
              <Badge variant="outline" className="text-xs">
                <Building2 className="h-3 w-3 mr-1" />
                {caseData.mailbox_address}
              </Badge>
            )}
          </div>
          <CaseLinkedEntities
            linkedOfferId={caseData.linked_offer_id}
            linkedProjectId={caseData.linked_project_id}
            linkedWorkOrderId={caseData.linked_work_order_id}
            linkedLeadId={caseData.linked_lead_id}
            linkedOrderSubmissionId={caseData.linked_order_submission_id}
            offerId={caseData.offer_id}
            projectId={caseData.project_id}
            serviceJobId={caseData.service_job_id}
            leadId={caseData.lead_id}
          />
          {caseData.linked_lead_id && (
            <CaseFlowTrail
              caseId={caseData.id}
              caseNumber={caseData.case_number}
              leadId={caseData.linked_lead_id}
              orderSubmissionId={caseData.linked_order_submission_id}
            />
          )}
          <AutoLinkBanner items={items} />
        </div>

        <Separator />

        {/* Controls: Status, Priority, Next Action, Scope */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={caseData.status} onValueChange={(v) => {
              const newStatus = v as CaseStatus;
              if (newStatus === "closed" && !caseData.resolution_type) {
                setCloseDrawerOpen(true);
                return;
              }
              // doUpdateCaseField handles reopen logic (clearing resolution_type + logging)
              onUpdateField({ status: newStatus });
            }}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_CASE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{CASE_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Prioritet</label>
            <Select value={caseData.priority} onValueChange={(v) => onUpdateField({ priority: v as CasePriority })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_CASE_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{CASE_PRIORITY_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Neste steg</label>
            <Select value={caseData.next_action} onValueChange={(v) => onUpdateField({ next_action: v as CaseNextAction })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_CASE_NEXT_ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>{CASE_NEXT_ACTION_LABELS[a]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Frist</label>
            <Input
              type="date"
              value={caseData.due_at ? caseData.due_at.slice(0, 10) : ""}
              onChange={(e) => onUpdateField({ due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="h-9 mt-1"
            />
          </div>
        </div>

        <Separator />

        {/* Converted links */}
        {caseData.status === "converted" && (
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium text-sm">Konvertert</span>
              {caseData.resolution_type && (
                <Badge variant="secondary" className="text-xs ml-2">
                  {CASE_RESOLUTION_LABELS[caseData.resolution_type as CaseResolutionType] || caseData.resolution_type}
                </Badge>
              )}
            </div>
          </Card>
        )}

        {caseData.status === "closed" && (
          <Card className="p-4 border-muted">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Lock className="h-5 w-5" />
              <span className="font-medium text-sm">Lukket</span>
              {caseData.resolution_type && (
                <Badge variant="secondary" className="text-xs ml-2">
                  {CASE_RESOLUTION_LABELS[caseData.resolution_type as CaseResolutionType] || caseData.resolution_type}
                </Badge>
              )}
            </div>
          </Card>
        )}

        {/* Convert & Link actions */}
        {!["converted", "closed", "archived"].includes(caseData.status) && (
          <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Handlinger</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setLinkDialogOpen(true)} className="gap-1.5">
                <ArrowRightLeft className="h-4 w-4" />
                Koble til eksisterende
              </Button>
              <Button size="sm" onClick={() => setPlanJobOpen(true)} className="gap-1.5">
                <Hammer className="h-4 w-4" />
                Opprett servicearbeid
              </Button>
              <Button size="sm" variant="secondary" onClick={onConvertLead} className="gap-1.5">
                <UserPlus className="h-4 w-4" />
                Opprett lead
              </Button>
              <Button size="sm" variant="outline" onClick={onConvertProject} className="gap-1.5">
                <FolderKanban className="h-4 w-4" />
                Opprett prosjekt
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOfferDrawerOpen(true)} className="gap-1.5">
                <ReceiptText className="h-4 w-4" />
                Opprett tilbud
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOrderDialogOpen(true)} className="gap-1.5">
                <Package className="h-4 w-4" />
                Opprett bestilling
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCloseDrawerOpen(true)} className="gap-1.5 text-muted-foreground">
                <Lock className="h-4 w-4" />
                Lukk sak
              </Button>
              <Button size="sm" variant="ghost" onClick={onArchive} className="gap-1.5 text-muted-foreground">
                <Lock className="h-4 w-4" />
                Arkiver
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete} className="gap-1.5 text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
                Slett
              </Button>
            </div>
          </Card>
        )}

        {/* Always show delete for closed/archived/converted cases */}
        {["converted", "closed", "archived"].includes(caseData.status) && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onDelete} className="gap-1.5 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
              Slett
            </Button>
          </div>
        )}

        <PlanJobDialog
          open={planJobOpen}
          onOpenChange={setPlanJobOpen}
          caseId={caseData.id}
          caseTitle={caseData.title}
          companyId={caseData.company_id}
          existingProjectId={caseData.project_id}
          onPlanned={(projectId, workOrderId) => {
            onUpdateField({
              status: "converted" as CaseStatus,
              resolution_type: "converted_to_service",
              linked_project_id: projectId || undefined,
              linked_work_order_id: workOrderId || undefined,
            } as any);
            onCaseUpdated();
          }}
        />

        <CaseOfferConversionDrawer
          open={offerDrawerOpen}
          onOpenChange={setOfferDrawerOpen}
          caseId={caseData.id}
          caseTitle={caseData.title}
          companyId={caseData.company_id}
          items={items}
          currentUserId={currentUserId}
          onConverted={(offerId) => {
            onUpdateField({
              status: "converted" as CaseStatus,
              resolution_type: "converted_to_offer",
              linked_offer_id: offerId,
            } as any);
            onCaseUpdated();
          }}
        />

        <CaseCloseDrawer
          open={closeDrawerOpen}
          onOpenChange={setCloseDrawerOpen}
          onConfirm={(resolutionType) => {
            onUpdateField({
              status: "closed" as CaseStatus,
              resolution_type: resolutionType,
            } as any);
          }}
        />

        <LinkToExistingDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          caseId={caseData.id}
          companyId={caseData.company_id}
          onLinked={(field, id) => {
            // Set linked field + move status to in_progress if new/triage
            const statusUpdate: Partial<Case> = { [field]: id } as any;
            if (["new", "triage"].includes(caseData.status)) {
              (statusUpdate as any).status = "in_progress";
            }
            onUpdateField(statusUpdate);
            onCaseUpdated();
          }}
        />

        <CaseToOrderDialog
          open={orderDialogOpen}
          onOpenChange={setOrderDialogOpen}
          caseId={caseData.id}
          caseTitle={caseData.title}
          companyId={caseData.company_id}
          items={items}
          onCreated={(orderId) => {
            onUpdateField({
              status: "converted" as CaseStatus,
              resolution_type: "converted_to_order",
              linked_order_submission_id: orderId,
            } as any);
            onCaseUpdated();
          }}
        />

        {/* Timeline / Email Viewer */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Tidslinje</p>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Ingen aktivitet ennå</p>
            </div>
          ) : (
            <CaseEmailViewer
              items={items}
              caseId={caseData.id}
              companyId={caseData.company_id}
              linkedWorkOrderId={caseData.linked_work_order_id}
              linkedProjectId={caseData.linked_project_id}
              linkedLeadId={caseData.linked_lead_id}
              linkedOfferId={caseData.linked_offer_id}
            />
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

// ─── Inline flow-trail wrapper for postkontor-case ───
function CaseFlowTrail({
  caseId,
  caseNumber,
  leadId,
  orderSubmissionId,
}: {
  caseId: string;
  caseNumber: string | null;
  leadId: string | null;
  orderSubmissionId: string | null;
}) {
  const { steps } = _useFlowChain({
    caseId,
    caseNumber,
    leadId,
    orderSubmissionId,
  });
  if (steps.length <= 1) return null;
  return <_FlowTrail steps={steps} />;
}
