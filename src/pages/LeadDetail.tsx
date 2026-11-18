import { useState, useEffect, useCallback, Component, type ReactNode, type ErrorInfo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, isPast, isToday } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActivityLog } from "@/hooks/useActivityLog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { LeadPipelineBar } from "@/components/LeadPipelineBar";
import { ActivityFeedList } from "@/components/activity/ActivityFeedList";
import { LeadActionPanel, type ActionPanelTab } from "@/components/activity/LeadActionPanel";
import { LeadStickyBar } from "@/components/activity/LeadStickyBar";
import { NextStepCard } from "@/components/activity/NextStepCard";
import { LeadEmailButton } from "@/components/leads/LeadEmailButton";
import { LeadConvertPanel } from "@/components/activity/LeadConvertPanel";
import { CreateOrderFromLeadCard } from "@/components/leads/CreateOrderFromLeadCard";
import { FlowTrail } from "@/components/flow/FlowTrail";
import { useFlowChain } from "@/components/flow/useFlowChain";
import { ContractListSection } from "@/components/contracts/ContractListSection";
import { LEAD_STATUS_CONFIG, ALL_LEAD_STATUSES, NEXT_ACTION_TYPES, type LeadStatus } from "@/lib/lead-status";
import {
  User, Loader2, Save, Clock, ArrowLeft, Copy,
  AlertTriangle, Plus, Trash2, FileText, ArrowRightLeft, ShieldAlert,
  Mail, CalendarPlus, RefreshCw, Calendar as CalendarIcon, CheckCircle2, ExternalLink, Link2, ArrowRight
} from "lucide-react";
import { toast } from "sonner";

// ─── Error Boundary ───
class LeadDetailErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[LeadDetail] Render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-md p-8 text-center space-y-4">
          <ShieldAlert className="h-12 w-12 mx-auto text-destructive opacity-60" />
          <h2 className="text-lg font-semibold">Kunne ikke laste lead-detaljer</h2>
          <p className="text-sm text-muted-foreground">Prøv å oppdatere siden.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Oppdater siden</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Types ───
interface Lead {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  estimated_value: number;
  probability: number;
  expected_close_date: string | null;
  notes: string | null;
  created_at: string;
  company_id: string | null;
  customer_id?: string | null;
  customer_account_id?: string | null;
  assigned_owner_user_id: string | null;
  owner_id: string | null;
  next_action_type: string | null;
  next_action_date: string | null;
  next_action_note: string | null;
  lead_ref_code: string | null;
}

interface Participant {
  id: string;
  user_id: string;
  role: string;
  notify_enabled: boolean;
  user_name?: string;
  user_email?: string;
}

interface LeadCalc {
  id: string;
  project_title: string;
  status: string;
  total_price: number | null;
  created_at: string;
}

interface CalendarLink {
  id: string;
  lead_id: string;
  outlook_event_id: string;
  event_subject: string | null;
  event_start: string | null;
  event_end: string | null;
  event_location: string | null;
  created_at: string;
  last_synced_at: string | null;
}

// ─── Inner Component ───
function LeadDetailInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activities, fetchActivities, logActivity } = useActivityLog("lead", id);

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [offers, setOffers] = useState<LeadCalc[]>([]);
  const [calendarLinks, setCalendarLinks] = useState<CalendarLink[]>([]);
  const [companyUsers, setCompanyUsers] = useState<{ id: string; name: string; email: string }[]>([]);

  // Edit state
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [probability, setProbability] = useState("50");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");

  // Dialogs — only confirmations
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  // Inline convert panel
  const [showConvertPanel, setShowConvertPanel] = useState(false);

  // Side panel
  const [actionPanelOpen, setActionPanelOpen] = useState(false);
  const [actionPanelTab, setActionPanelTab] = useState<ActionPanelTab>("note");

  const [msReauthNeeded, setMsReauthNeeded] = useState(false);

  const openActionPanel = (tab: ActionPanelTab) => {
    setActionPanelTab(tab);
    setActionPanelOpen(true);
  };

  // ─── Fetches ───
  const fetchLead = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id).single();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      const l = data as any as Lead;
      if (!LEAD_STATUS_CONFIG[l.status]) l.status = "new";
      setLead(l);
      setCompanyName(l.company_name);
      setContactName(l.contact_name || "");
      setEmail(l.email || "");
      setPhone(l.phone || "");
      setSource(l.source || "");
      setEstimatedValue(l.estimated_value ? String(l.estimated_value) : "");
      setProbability(l.probability ? String(l.probability) : "50");
      setExpectedCloseDate(l.expected_close_date || "");
      setNotes(l.notes || "");
    } catch (err) {
      console.error("[LeadDetail] Fetch error:", err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchParticipants = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await supabase.from("lead_participants").select("*").eq("lead_id", id);
      if (!data) return;
      const { data: techs } = await supabase.from("technicians").select("user_id, name, email");
      const techMap = new Map((techs || []).map((t: any) => [t.user_id, t]));
      setParticipants((data as any[]).filter(p => p.id && p.user_id).map(p => ({
        ...p,
        user_name: techMap.get(p.user_id)?.name || "Ukjent bruker",
        user_email: techMap.get(p.user_id)?.email || "",
      })));
    } catch (err) { console.warn("[LeadDetail] Participants fetch error:", err); }
  }, [id]);

  const fetchOffers = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await supabase.from("calculations")
        .select("id, project_title, status, total_price, created_at")
        .eq("lead_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      setOffers((data || []) as any as LeadCalc[]);
    } catch (err) { console.warn("[LeadDetail] Offers fetch error:", err); }
  }, [id]);

  const fetchCalendarLinks = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await supabase.from("lead_calendar_links").select("*").eq("lead_id", id).order("event_start", { ascending: false });
      setCalendarLinks((data || []) as any as CalendarLink[]);
    } catch (err) { console.warn("[LeadDetail] Calendar links fetch error:", err); }
  }, [id]);

  const fetchCompanyUsers = useCallback(async () => {
    try {
      const { data } = await supabase.from("technicians").select("user_id, name, email");
      setCompanyUsers((data || []).filter((t: any) => t.user_id && t.name).map((t: any) => ({ id: t.user_id, name: t.name, email: t.email })));
    } catch (err) { console.warn("[LeadDetail] Company users fetch error:", err); }
  }, []);

  useEffect(() => {
    fetchLead();
    fetchParticipants();
    fetchActivities();
    fetchOffers();
    fetchCalendarLinks();
    fetchCompanyUsers();
  }, [fetchLead, fetchParticipants, fetchActivities, fetchOffers, fetchCalendarLinks, fetchCompanyUsers]);

  const refreshAll = () => {
    fetchActivities();
    fetchCalendarLinks();
  };

  const notifyParticipants = async (title: string, message: string) => {
    const toNotify = participants.filter(p => p.notify_enabled && p.user_id !== user?.id);
    if (toNotify.length === 0) return;
    const rows = toNotify.map(p => ({ user_id: p.user_id, title, message, type: "lead_update" }));
    await supabase.from("notifications").insert(rows);
  };

  const handleSave = async () => {
    if (!lead || !companyName.trim()) { toast.error("Firmanavn er påkrevd"); return; }
    setSaving(true);
    const payload: any = {
      company_name: companyName.trim(),
      contact_name: contactName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      source: source.trim() || null,
      estimated_value: Number(estimatedValue) || 0,
      probability: Number(probability) || 50,
      expected_close_date: expectedCloseDate || null,
      notes: notes.trim() || null,
    };
    await supabase.from("leads").update(payload).eq("id", lead.id);
    await logActivity({ action: "updated", description: "Lead oppdatert", type: "note", performedBy: user?.id });
    await supabase.from("lead_history").insert({ lead_id: id!, action: "updated", description: "Lead oppdatert", performed_by: user?.id, metadata: {} });
    toast.success("Lead lagret");
    setSaving(false);
    fetchLead();
    fetchActivities();
  };

  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (!lead || lead.status === newStatus) return;

    // If moving to won, show convert panel instead of immediate change
    if (newStatus === "won") {
      setShowConvertPanel(true);
    }

    const oldLabel = LEAD_STATUS_CONFIG[lead.status]?.label || lead.status;
    const newLabel = LEAD_STATUS_CONFIG[newStatus]?.label || newStatus;
    await supabase.from("leads").update({ status: newStatus }).eq("id", lead.id);
    const desc = `Status endret fra ${oldLabel} til ${newLabel}`;
    await logActivity({ action: "status_changed", description: desc, type: "status_change", title: `Status: ${newLabel}`, performedBy: user?.id, metadata: { from: lead.status, to: newStatus } });
    await supabase.from("lead_history").insert({ lead_id: id!, action: "status_changed", description: desc, performed_by: user?.id, metadata: { from: lead.status, to: newStatus } });
    await notifyParticipants(`Status endret til ${newLabel}`, `Lead "${lead.company_name}" fikk ny status: ${newLabel}`);
    toast.success(`Status endret til ${newLabel}`);
    setLead({ ...lead, status: newStatus });
    fetchActivities();
  };

  const handleOwnerChange = async (newOwnerId: string) => {
    if (!lead || newOwnerId === "__unset__") return;
    await supabase.from("leads").update({ assigned_owner_user_id: newOwnerId, owner_id: newOwnerId }).eq("id", lead.id);
    await supabase.from("lead_participants").upsert({ lead_id: lead.id, user_id: newOwnerId, role: "owner" }, { onConflict: "lead_id,user_id" });
    const ownerName = companyUsers.find(u => u.id === newOwnerId)?.name || "Ukjent";
    const desc = `Eier endret til ${ownerName}`;
    await logActivity({ action: "owner_changed", description: desc, type: "status_change", title: `Ny eier: ${ownerName}`, performedBy: user?.id, metadata: { new_owner: newOwnerId } });
    await supabase.from("lead_history").insert({ lead_id: lead.id, action: "owner_changed", description: desc, performed_by: user?.id, metadata: { new_owner: newOwnerId } });
    await notifyParticipants(`Ny eier: ${ownerName}`, `Lead "${lead.company_name}" fikk ny eier: ${ownerName}`);
    toast.success("Eier endret");
    fetchLead();
    fetchParticipants();
    fetchActivities();
  };

  const addParticipant = async () => {
    if (!selectedUserId || !lead) return;
    const { error } = await supabase.from("lead_participants").insert({ lead_id: lead.id, user_id: selectedUserId, role: "contributor" });
    if (error) { toast.error("Kunne ikke legge til deltaker"); return; }
    const userName = companyUsers.find(u => u.id === selectedUserId)?.name || "Ukjent";
    await logActivity({ action: "participant_added", description: `${userName} lagt til som deltaker`, type: "note", performedBy: user?.id });
    await supabase.from("lead_history").insert({ lead_id: lead.id, action: "participant_added", description: `${userName} lagt til som deltaker`, performed_by: user?.id, metadata: {} });
    toast.success("Deltaker lagt til");
    setAddParticipantOpen(false);
    setSelectedUserId("");
    fetchParticipants();
    fetchActivities();
  };

  const removeParticipant = async (p: Participant) => {
    if (p.role === "owner") { toast.error("Kan ikke fjerne eier"); return; }
    await supabase.from("lead_participants").delete().eq("id", p.id);
    await logActivity({ action: "participant_removed", description: `${p.user_name} fjernet som deltaker`, type: "note", performedBy: user?.id });
    await supabase.from("lead_history").insert({ lead_id: lead!.id, action: "participant_removed", description: `${p.user_name} fjernet som deltaker`, performed_by: user?.id, metadata: {} });
    toast.success("Deltaker fjernet");
    fetchParticipants();
    fetchActivities();
  };

  // Next step handlers
  const handleCompleteNextStep = async () => {
    if (!lead) return;
    const actionLabel = NEXT_ACTION_TYPES.find(t => t.key === lead.next_action_type)?.label || lead.next_action_type || "Aksjon";
    await supabase.from("leads").update({ next_action_type: null, next_action_date: null, next_action_note: null }).eq("id", lead.id);
    await logActivity({ action: "next_action_completed", description: `${actionLabel} markert som utført`, type: "note", performedBy: user?.id });
    await supabase.from("lead_history").insert({ lead_id: id!, action: "next_action_completed", description: `${actionLabel} markert som utført`, performed_by: user?.id, metadata: {} });
    toast.success("Steg fullført");
    setLead({ ...lead, next_action_type: null, next_action_date: null, next_action_note: null });
    fetchActivities();
    // Offer to set new step via action panel
    openActionPanel("note");
  };

  const handleUpdateNextStep = async (data: { type: string; date: string; note: string }) => {
    if (!lead) return;
    await supabase.from("leads").update({
      next_action_type: (data.type || null) as any,
      next_action_date: data.date || null,
      next_action_note: data.note || null,
    }).eq("id", lead.id);
    const label = NEXT_ACTION_TYPES.find(t => t.key === data.type)?.label || data.type;
    await logActivity({ action: "next_action_updated", description: `Neste steg satt til: ${label}`, type: "note", performedBy: user?.id });
    toast.success("Neste steg oppdatert");
    setLead({ ...lead, next_action_type: data.type || null, next_action_date: data.date || null, next_action_note: data.note || null });
    fetchActivities();
  };

  const handlePostponeNextStep = async (newDate: string) => {
    if (!lead) return;
    await supabase.from("leads").update({ next_action_date: newDate }).eq("id", lead.id);
    await logActivity({ action: "next_action_postponed", description: `Neste steg utsatt til ${format(new Date(newDate), "d. MMM yyyy HH:mm", { locale: nb })}`, type: "note", performedBy: user?.id });
    toast.success("Neste steg utsatt");
    setLead({ ...lead, next_action_date: newDate });
    fetchActivities();
  };

  const handleDeleteCalendarLink = async (linkId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("lead-calendar-event", { body: { action: "delete", link_id: linkId } });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success("Møte slettet fra Outlook");
      await logActivity({ action: "meeting_deleted", description: "Møte slettet", type: "meeting", performedBy: user?.id });
      fetchCalendarLinks();
      fetchActivities();
    } catch (err) {
      console.error("[LeadDetail] Delete calendar link error:", err);
      toast.error("Kunne ikke slette møte");
    }
  };

  const handleResyncCalendarLink = async (linkId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("lead-calendar-event", { body: { action: "resync", link_id: linkId } });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success("Møte resynkronisert");
      fetchCalendarLinks();
    } catch (err) {
      console.error("[LeadDetail] Resync error:", err);
      toast.error("Kunne ikke resynkronisere");
    }
  };

  // ─── Derived values ───
  const safeStatus = lead && LEAD_STATUS_CONFIG[lead.status] ? lead.status : "new";
  const ownerSelectValue = lead?.assigned_owner_user_id && companyUsers.some(u => u.id === lead.assigned_owner_user_id)
    ? lead.assigned_owner_user_id : "__unset__";
  const ownerName = lead?.assigned_owner_user_id
    ? companyUsers.find(u => u.id === lead.assigned_owner_user_id)?.name
    : undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !lead) {
    return (
      <div className="mx-auto max-w-md p-8 text-center space-y-4">
        <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground opacity-60" />
        <h2 className="text-lg font-semibold">Lead ikke funnet</h2>
        <Button variant="outline" onClick={() => navigate("/sales/leads")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbake
        </Button>
      </div>
    );
  }

  const copyRefCode = () => {
    if (lead.lead_ref_code) {
      navigator.clipboard.writeText(lead.lead_ref_code);
      toast.success("Referansekode kopiert");
    }
  };

  return (
    <>
      {/* ── Sticky action bar ── */}
      <LeadStickyBar onAction={openActionPanel} />

      <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
        {/* ── MS re-auth banner ── */}
        {msReauthNeeded && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Microsoft-tilkobling må fornyes</p>
              <p className="text-xs text-muted-foreground">Manglende rettigheter. Logg inn på nytt.</p>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-r from-primary/[0.04] to-transparent p-4 -mx-1">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sales/leads")} className="mt-1 rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{lead.company_name}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {lead.lead_ref_code && (
                <button onClick={copyRefCode} className="inline-flex items-center gap-1 text-xs font-mono bg-card border border-border/60 px-2 py-0.5 rounded-lg hover:bg-accent/50 transition-colors shadow-sm" title="Klikk for å kopiere">
                  {lead.lead_ref_code}
                  <Copy className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              <span className="text-sm text-muted-foreground">Opprettet {format(new Date(lead.created_at), "d. MMM yyyy", { locale: nb })}</span>
            </div>
          </div>
        </div>

        {/* ── Flyt-kjede (Postkontor → Lead → Bestilling → Oppdrag) ── */}
        <LeadFlowTrail leadId={lead.id} leadName={lead.company_name} />

        {/* ── Pipeline bar ── */}
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="py-4">
            <LeadPipelineBar currentStatus={safeStatus} onStatusChange={handleStatusChange} />
          </CardContent>
        </Card>

        {/* ── Inline convert panel (when won) ── */}
        {showConvertPanel && (
          <LeadConvertPanel
            lead={{
              id: lead.id,
              company_name: lead.company_name,
              notes: lead.notes,
              company_id: lead.company_id,
              estimated_value: lead.estimated_value,
            }}
            participants={participants}
            offers={offers.map(o => ({ id: o.id, offer_number: o.project_title, status: o.status }))}
            onConverted={() => setShowConvertPanel(false)}
            onCancel={() => setShowConvertPanel(false)}
            logActivity={logActivity}
          />
        )}

        {/* ── Two-column: Left = Feed + Customer, Right = Next Step + Deal + Meetings ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left column (3/5) */}
          <div className="lg:col-span-3 space-y-5">
            {/* Activity Feed */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Aktivitet</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityFeedList
                  activities={activities}
                  maxItems={10}
                  showSections
                  emptyMessage="Ingen aktivitet ennå. Bruk handlingsknappene over for å komme i gang."
                />
              </CardContent>
            </Card>

            {/* Customer info */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Kundeinformasjon</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Installatør / kunde *</Label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Kontaktperson</Label>
                  <Input value={contactName} onChange={e => setContactName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>E-post</Label>
                    <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefon</Label>
                    <Input value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Kilde</Label>
                  <Input value={source} onChange={e => setSource(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Participants */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Deltakere</CardTitle>
                  <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs" onClick={() => setAddParticipantOpen(true)}>
                    <Plus className="h-3 w-3" /> Legg til
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {participants.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">Ingen deltakere</p>
                ) : (
                  <div className="space-y-2">
                    {participants.map(p => (
                      <div key={p.id} className="flex items-center gap-3 py-1.5">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.user_name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.user_email}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">{p.role === "owner" ? "Eier" : "Bidragsyter"}</Badge>
                        {p.role !== "owner" && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeParticipant(p)}>
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Notater</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Interne notater..." />
              </CardContent>
            </Card>
          </div>

          {/* Right column (2/5) */}
          <div className="lg:col-span-2 space-y-5">
            {/* Next Step Card — operational motor */}
            <NextStepCard
              nextActionType={lead.next_action_type}
              nextActionDate={lead.next_action_date}
              nextActionNote={lead.next_action_note}
              ownerName={ownerName}
              onComplete={handleCompleteNextStep}
              onUpdate={handleUpdateNextStep}
              onPostpone={handlePostponeNextStep}
            />

            {/* Value highlight */}
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="pt-5">
                <div className="rounded-xl bg-gradient-to-r from-primary/[0.06] to-transparent p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Estimert ordreverdi</p>
                  <p className="text-2xl font-bold text-foreground">kr {Number(estimatedValue || 0).toLocaleString("nb-NO")}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <p className="text-xs text-muted-foreground">Ordresannsynlighet:</p>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${Number(probability) >= 70 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : Number(probability) >= 40 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>
                      {probability}%
                    </span>
                    <p className="text-xs text-muted-foreground ml-auto">
                      Vektet: <span className="font-medium text-foreground">kr {Math.round(Number(estimatedValue || 0) * Number(probability || 50) / 100).toLocaleString("nb-NO")}</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Deal details */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Ordredetaljer</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Ansvarlig selger</Label>
                  <Select value={ownerSelectValue} onValueChange={handleOwnerChange}>
                    <SelectTrigger><SelectValue placeholder="Velg eier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">Ikke satt</SelectItem>
                      {companyUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Estimert ordreverdi (kr)</Label>
                    <Input value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} type="number" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ordresannsynlighet (%)</Label>
                    <Input value={probability} onChange={e => setProbability(e.target.value)} type="number" min="0" max="100" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Forventet leveringsdato</Label>
                  <Input value={expectedCloseDate} onChange={e => setExpectedCloseDate(e.target.value)} type="date" />
                </div>
              </CardContent>
            </Card>

            {/* Tilbud */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2"><CardTitle className="text-base">Tilbud</CardTitle><LeadEmailButton companyId={lead.company_id} customerId={lead.customer_id ?? null} accountId={lead.customer_account_id ?? null} leadId={lead.id} /></CardHeader>
              <CardContent>
                {offers.length === 0 ? (
                  <div className="text-center py-4">
                    <FileText className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground/60">Ingen tilbud ennå</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 gap-1.5 text-xs rounded-xl"
                      onClick={() => navigate(`/sales/offers/new?lead_id=${lead.id}`)}
                    >
                      <Plus className="h-3 w-3" /> Opprett tilbud
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {offers.map(offer => (
                      <div
                        key={offer.id}
                        className="flex items-center gap-3 py-2.5 px-2 border-b border-border/20 last:border-0 group rounded-lg hover:bg-secondary/40 cursor-pointer transition-colors"
                        onClick={() => navigate(`/sales/offers/${offer.id}`)}
                      >
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{offer.project_title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(offer.created_at), "d. MMM yyyy", { locale: nb })} · kr {Number(offer.total_price || 0).toLocaleString("nb-NO")} eks. mva
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">{offer.status}</Badge>
                        <ArrowRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-primary/50 transition-all shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bestilling fra lead */}
            <CreateOrderFromLeadCard
              lead={{
                id: lead.id,
                company_id: lead.company_id,
                company_name: lead.company_name,
                contact_name: lead.contact_name,
                email: lead.email,
                phone: lead.phone,
                notes: lead.notes,
              }}
              logActivity={logActivity}
            />


            {/* Befaringer & møter — action-driven */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Befaringer & møter</CardTitle>
                  <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs" onClick={() => openActionPanel("meeting")}>
                    <CalendarPlus className="h-3 w-3" /> Ny befaring
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {calendarLinks.length === 0 ? (
                  <div className="text-center py-5 space-y-3">
                    <CalendarIcon className="h-6 w-6 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground/60">Ingen møter planlagt</p>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs rounded-xl"
                      onClick={() => openActionPanel("meeting")}
                    >
                      <CalendarPlus className="h-3.5 w-3.5" /> Planlegg møte
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {calendarLinks.map(link => (
                      <div key={link.id} className="flex items-center gap-3 py-2 border-b border-border/20 last:border-0 group">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{link.event_subject || "Ukjent møte"}</p>
                          <p className="text-xs text-muted-foreground">
                            {link.event_start ? format(new Date(link.event_start), "d. MMM yyyy HH:mm", { locale: nb }) : "—"}
                            {link.event_end ? ` – ${format(new Date(link.event_end), "HH:mm", { locale: nb })}` : ""}
                            {link.event_location ? ` · ${link.event_location}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResyncCalendarLink(link.id)} title="Resynkroniser">
                            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteCalendarLink(link.id)} title="Slett fra Outlook">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Kontrakter */}
            {id && (
              <Card className="rounded-2xl shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-base">Kontrakter</CardTitle></CardHeader>
                <CardContent>
                  <ContractListSection entityType="lead" entityId={id} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end pb-6">
          <Button onClick={handleSave} disabled={saving} className="gap-1.5 rounded-xl">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lagre endringer
          </Button>
        </div>
      </div>

      {/* ── Action Side Panel ── */}
      <LeadActionPanel
        open={actionPanelOpen}
        onOpenChange={setActionPanelOpen}
        defaultTab={actionPanelTab}
        lead={{
          id: lead.id,
          company_name: lead.company_name,
          email: lead.email,
          lead_ref_code: lead.lead_ref_code,
        }}
        participantEmails={participants.filter(p => p.user_email).map(p => p.user_email!)}
        onActivityCreated={refreshAll}
      />

      {/* ── Only confirmation dialogs remain ── */}
      <Dialog open={addParticipantOpen} onOpenChange={setAddParticipantOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Legg til deltaker</DialogTitle>
            <DialogDescription>Velg en bruker å legge til som deltaker på denne leaden.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Bruker</Label>
            {companyUsers.filter(u => !participants.some(p => p.user_id === u.id)).length > 0 ? (
              <Select value={selectedUserId || "__pick__"} onValueChange={v => setSelectedUserId(v === "__pick__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Velg bruker" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__pick__">Velg bruker...</SelectItem>
                  {companyUsers.filter(u => !participants.some(p => p.user_id === u.id)).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">Alle tilgjengelige brukere er allerede lagt til.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddParticipantOpen(false)}>Avbryt</Button>
            <Button onClick={addParticipant} disabled={!selectedUserId || selectedUserId === "__pick__"}>Legg til</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Inline flow-trail wrapper for a lead ───
function LeadFlowTrail({ leadId, leadName }: { leadId: string; leadName: string }) {
  const { steps } = useFlowChain({ leadId, leadName });
  if (steps.length <= 1) return null;
  return <FlowTrail steps={steps} />;
}

// ─── Export with Error Boundary ───
export default function LeadDetail() {
  return (
    <LeadDetailErrorBoundary>
      <LeadDetailInner />
    </LeadDetailErrorBoundary>
  );
}
