import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useUnreadOrderMessages } from "@/hooks/useUnreadOrderMessages";
import { Plus, Search, ClipboardList, Trash2, User, Clock, MessageSquare, AlertCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ORDER_STATUS_CONFIG,
  ORDER_PRIORITY_CONFIG,
  type OrderFormSubmissionStatus,
} from "@/types/order-forms";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { nb } from "date-fns/locale";
import { QualityDot } from "@/components/orders/QualityBadge";
import type { QualityLevel } from "@/lib/order-quality";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSubmissionDisplayTitle, getSubmissionAddressLine, getSubmissionCompany, getSubmissionContact } from "@/lib/order-display";

const STATUS_TABS: { key: OrderFormSubmissionStatus | "all"; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "new", label: "Ny" },
  { key: "under_review", label: "Til vurdering" },
  { key: "missing_info", label: "Mangler info" },
  { key: "waiting_customer", label: "Venter kunde" },
  { key: "waiting_internal", label: "Venter internt" },
  { key: "ready_for_planning", label: "Klar for planlegging" },
  { key: "task_created", label: "Oppgave opprettet" },
  { key: "in_progress", label: "Under arbeid" },
  { key: "closed", label: "Lukket" },
  { key: "rejected", label: "Avvist" },
];

export default function OrderFormsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCompanyId } = useCompanyContext();
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [unreadOnly, setUnreadOnly] = useState<boolean>(
    searchParams.get("filter") === "unread_messages",
  );
  const {
    unreadSubmissionCount: globalUnreadCount,
    submissions: unreadSubmissions,
    markAllRead: markAllOrderMsgsRead,
  } = useUnreadOrderMessages();

  // Keep URL ↔ chip state in sync
  useEffect(() => {
    const fromUrl = searchParams.get("filter") === "unread_messages";
    if (fromUrl !== unreadOnly) setUnreadOnly(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const toggleUnreadOnly = () => {
    const next = !unreadOnly;
    setUnreadOnly(next);
    const params = new URLSearchParams(searchParams);
    if (next) params.set("filter", "unread_messages");
    else params.delete("filter");
    setSearchParams(params, { replace: true });
  };
  const unreadSubmissionIds = useMemo(
    () => new Set(unreadSubmissions.map((s) => s.submission_id)),
    [unreadSubmissions],
  );


  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["order-form-submissions", activeCompanyId, statusFilter],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let query = supabase
        .from("order_form_submissions")
        .select("*, order_form_templates(name, slug, category)")
        .eq("company_id", activeCompanyId!)
        .is("deleted_at", null)
        .order("submitted_at", { ascending: false })
        .limit(500);
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;

      const assigneeIds = [...new Set((data || []).map((s: any) => s.assigned_to).filter(Boolean))];
      let assigneeMap = new Map<string, string>();
      if (assigneeIds.length > 0) {
        const { data: accounts } = await supabase
          .from("user_accounts")
          .select("auth_user_id, person:people(full_name)")
          .in("auth_user_id", assigneeIds)
          .eq("is_active", true);
        if (accounts) {
          (accounts as any[]).forEach(a => {
            if (a.person?.full_name) assigneeMap.set(a.auth_user_id, a.person.full_name);
          });
        }
      }

      return (data || []).map((s: any) => ({
        ...s,
        _assignee_name: assigneeMap.get(s.assigned_to) || null,
      }));
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["order-form-templates-active", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_form_templates")
        .select("id, name, slug")
        .eq("company_id", activeCompanyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const categoryOptions = useMemo(() => {
    const cats = new Set<string>();
    submissions.forEach((s: any) => {
      const cat = s.order_form_templates?.category;
      if (cat) cats.add(cat);
    });
    return Array.from(cats).sort();
  }, [submissions]);

  const filtered = useMemo(() => {
    let result = submissions.filter((s: any) => {
      if (search) {
        const q = search.toLowerCase();
        const sm = s.summary || {};
        const haystack = [
          s.submission_no,
          s.status,
          s.order_form_templates?.name,
          s.order_form_templates?.category,
          (s as any).submitter_name,
          (s as any).submitter_email,
          (s as any).submitter_phone,
          (s as any)._assignee_name,
          sm.oppdragstittel,
          sm.kundenavn,
          sm.firmanavn,
          sm.bestiller_navn,
          sm.kontaktperson_kunde,
          sm.anleggsadresse,
          sm.oppdragssted,
          sm.adresse,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (categoryFilter !== "all" && s.order_form_templates?.category !== categoryFilter) return false;
      if (priorityFilter !== "all" && s.priority !== priorityFilter) return false;
      if (assigneeFilter === "unassigned" && s.assigned_to) return false;
      if (assigneeFilter === "assigned" && !s.assigned_to) return false;
      if (assigneeFilter === "mine" && s.assigned_to !== user?.id) return false;
      if (unreadOnly && !unreadSubmissionIds.has(s.id)) return false;
      return true;
    });

    if (sortBy === "priority") {
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
      result = [...result].sort((a: any, b: any) =>
        (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
      );
    } else if (sortBy === "activity") {
      result = [...result].sort((a: any, b: any) =>
        new Date(b.last_activity_at || b.submitted_at).getTime() - new Date(a.last_activity_at || a.submitted_at).getTime()
      );
    } else if (sortBy === "stale") {
      result = [...result].sort((a: any, b: any) =>
        new Date(a.last_activity_at || a.submitted_at).getTime() - new Date(b.last_activity_at || b.submitted_at).getTime()
      );
    }

    return result;
  }, [submissions, search, categoryFilter, priorityFilter, assigneeFilter, sortBy, user?.id, unreadOnly, unreadSubmissionIds]);

  const handleSoftDelete = async (e: React.MouseEvent, sub: any) => {
    e.stopPropagation();
    if (!confirm(`Flytte ${sub.submission_no} til papirkurven?`)) return;
    setDeletingId(sub.id);
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    await supabase.from("order_form_submissions").update({
      deleted_at: new Date().toISOString(),
      deleted_by: currentUser?.id,
    } as any).eq("id", sub.id);
    queryClient.invalidateQueries({ queryKey: ["order-form-submissions"] });
    setDeletingId(null);
  };

  const statusCounts: Record<string, number> = {};
  submissions.forEach((s: any) => {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  });

  const needsActionCount = submissions.filter((s: any) =>
    s.status === "new" || s.status === "missing_info" || s.status === "waiting_customer"
  ).length;

  const myCount = submissions.filter((s: any) => s.assigned_to === user?.id).length;
  const staleCount = submissions.filter((s: any) => {
    if (["closed", "rejected"].includes(s.status)) return false;
    const lastAct = s.last_activity_at || s.submitted_at;
    return differenceInDays(new Date(), new Date(lastAct)) >= 5;
  }).length;
  // Single source of truth: per-user `notifications` (type=order_message, read=false).
  // Do NOT compare last_customer_message_at vs last_admin_message_at — admin sending
  // a message does not mean other internal users have read the customer message.
  const hasUnreadReply = (sub: any) => unreadSubmissionIds.has(sub.id);
  const customerRepliedCount = unreadSubmissionIds.size;

  // Realtime: refresh list when any message lands on a submission in this company
  useEffect(() => {
    if (!activeCompanyId) return;
    const channel = supabase
      .channel(`orders-list-msgs-${activeCompanyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_form_messages" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["order-form-submissions"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "order_form_submissions", filter: `company_id=eq.${activeCompanyId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["order-form-submissions"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCompanyId, queryClient]);

  return (
    <div className="space-y-4 sm:space-y-5 p-4 sm:p-6 max-w-7xl mx-auto pb-24 sm:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Bestillinger</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {submissions.length} bestillinger
            {needsActionCount > 0 && (
              <span className="text-amber-600 font-medium"> · {needsActionCount} krever handling</span>
            )}
            {staleCount > 0 && (
              <span className="text-orange-600 font-medium"> · {staleCount} uten aktivitet</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {templates.length > 0 && (
            <Button size="sm" onClick={() => navigate(`/orders/new/${templates[0].slug}`)}>
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Ny bestilling</span>
            </Button>
          )}
        </div>
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {globalUnreadCount > 0 && (
          <Button
            variant={unreadOnly ? "default" : "outline"}
            size="sm"
            className="text-xs h-8 border-green-300 text-green-700 hover:bg-green-50 data-[state=on]:bg-green-600"
            onClick={toggleUnreadOnly}
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Uleste meldinger ({globalUnreadCount})
          </Button>
        )}
        {globalUnreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-8 text-muted-foreground hover:text-foreground"
            onClick={async () => {
              await markAllOrderMsgsRead();
              toast.success("Alle kundemeldinger er markert som lest");
              queryClient.invalidateQueries({ queryKey: ["order-form-submissions"] });
            }}
          >
            Merk alle meldinger lest
          </Button>
        )}
        {myCount > 0 && (
          <Button
            variant={assigneeFilter === "mine" ? "default" : "outline"}
            size="sm"
            className="text-xs h-8"
            onClick={() => setAssigneeFilter(assigneeFilter === "mine" ? "all" : "mine")}
          >
            <User className="h-3 w-3 mr-1" />
            Mine ({myCount})
          </Button>
        )}
        {customerRepliedCount > 0 && (
          <Button
            variant={sortBy === "activity" ? "default" : "outline"}
            size="sm"
            className="text-xs h-8 border-primary/30 text-primary hover:bg-primary-soft"
            onClick={() => setSortBy(sortBy === "activity" ? "newest" : "activity")}
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Kundesvar ({customerRepliedCount})
          </Button>
        )}
        {staleCount > 0 && (
          <Button
            variant={sortBy === "stale" ? "default" : "outline"}
            size="sm"
            className="text-xs h-8 border-orange-200 text-orange-700 hover:bg-orange-50"
            onClick={() => setSortBy(sortBy === "stale" ? "newest" : "stale")}
          >
            <AlertCircle className="h-3 w-3 mr-1" />
            Ingen aktivitet ({staleCount})
          </Button>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-none">
        {STATUS_TABS.map((tab) => {
          const count = tab.key === "all" ? submissions.length : statusCounts[tab.key] || 0;
          const active = statusFilter === tab.key;
          if (tab.key !== "all" && count === 0) return null;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`ml-1.5 ${active ? "opacity-80" : "opacity-60"}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 items-stretch sm:items-center">
        <div className="relative flex-1 min-w-0 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk bestilling, kunde..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {categoryOptions.length > 0 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[130px] sm:w-40 shrink-0"><SelectValue placeholder="Kategori" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle kategorier</SelectItem>
                {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[120px] sm:w-36 shrink-0"><SelectValue placeholder="Prioritet" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="critical">Kritisk</SelectItem>
              <SelectItem value="high">Høy</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Lav</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[120px] sm:w-40 shrink-0"><SelectValue placeholder="Ansvarlig" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="mine">Mine</SelectItem>
              <SelectItem value="unassigned">Uten ansvarlig</SelectItem>
              <SelectItem value="assigned">Med ansvarlig</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[120px] sm:w-40 shrink-0"><SelectValue placeholder="Sortering" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Nyeste først</SelectItem>
              <SelectItem value="priority">Hastegrad</SelectItem>
              <SelectItem value="activity">Siste aktivitet</SelectItem>
              <SelectItem value="stale">Lengst uten aktivitet</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Laster...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">Ingen bestillinger funnet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((sub: any) => {
            const sc = ORDER_STATUS_CONFIG[sub.status as OrderFormSubmissionStatus];
            const qs = (sub.quality_score || "green") as QualityLevel;
            const isWaiting = ["missing_info", "waiting_customer"].includes(sub.status);
            const isNew = sub.status === "new";

            // Stale detection
            const lastAct = sub.last_activity_at || sub.submitted_at;
            const daysSinceActivity = differenceInDays(new Date(), new Date(lastAct));
            const isStale = daysSinceActivity >= 5 && !["closed", "rejected"].includes(sub.status);

            // Customer message awaiting internal response
            const unread = hasUnreadReply(sub);

            // Build display: site title primary, address secondary, BST + template + firma + bestiller meta
            const siteTitle = getSubmissionDisplayTitle(sub);
            const addressLine = getSubmissionAddressLine(sub);
            const firma = getSubmissionCompany(sub);
            const bestiller = getSubmissionContact(sub);
            const templateName = sub.order_form_templates?.name;
            const metaParts = [
              sub.submission_no,
              templateName,
              firma,
              bestiller,
            ].filter(Boolean);
            const metaLine = metaParts.join(" · ");
            // Avoid duplicating if siteTitle fell back to BST or address
            const showAddress = addressLine && addressLine !== siteTitle;
            const isDimmed = ["closed", "rejected"].includes(sub.status);

            return (
              <Card
                key={sub.id}
                className={`hover:shadow-md transition-shadow cursor-pointer group ${
                  isDimmed ? "opacity-60" : ""
                } ${
                  unread ? "border-l-4 border-l-success bg-success/5"
                  : isNew ? "border-l-4 border-l-primary"
                  : isWaiting ? "border-l-4 border-l-warning"
                  : isStale ? "border-l-4 border-l-warning/50"
                  : ""
                }`}
                onClick={() => navigate(`/orders/${sub.id}`)}
              >
                <CardContent className="p-4 sm:p-3.5">
                  <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <QualityDot score={qs} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <span className={`text-sm truncate ${unread ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>
                            {siteTitle}
                          </span>
                          {sub.priority !== "normal" && (
                            <Badge variant="outline" className="text-[10px] font-semibold border-warning/40 text-warning bg-warning/10">
                              {ORDER_PRIORITY_CONFIG[sub.priority]?.label || sub.priority}
                            </Badge>
                          )}
                          {unread && (
                            <Badge variant="outline" className="text-[10px] font-semibold border-success/40 text-success bg-success/10">
                              <MessageSquare className="h-2.5 w-2.5 mr-0.5" />
                              Ny melding fra bestiller
                            </Badge>
                          )}
                        </div>
                        {showAddress && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {addressLine}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                          {metaLine}
                        </p>
                        {/* Mobile-only meta row */}
                        <div className="flex items-center gap-2 mt-2 sm:hidden flex-wrap text-xs">
                          <Badge className={`text-xs ${sc?.color || ""}`}>
                            {sc?.label || sub.status}
                          </Badge>
                          {sub._assignee_name && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <User className="h-3 w-3" />
                              {sub._assignee_name}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(sub.submitted_at), "d. MMM", { locale: nb })}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Desktop-only right side */}
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      {isWaiting && (
                        <span className="text-[10px] text-warning flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          Venter svar
                        </span>
                      )}
                      {isStale && !isWaiting && (
                        <span className="text-[10px] text-warning flex items-center gap-0.5">
                          <AlertCircle className="h-3 w-3" />
                          {daysSinceActivity}d
                        </span>
                      )}
                      {sub._assignee_name && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <User className="h-3 w-3" />
                          {sub._assignee_name}
                        </span>
                      )}
                      {sub.assigned_to && !sub._assignee_name && (
                        <User className="h-3 w-3 text-muted-foreground" />
                      )}
                      <Badge className={`text-[10px] ${sc?.color || ""}`}>
                        {sc?.label || sub.status}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(sub.submitted_at), "d. MMM", { locale: nb })}
                      </span>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                          onClick={(e) => handleSoftDelete(e, sub)}
                          disabled={deletingId === sub.id}
                          title="Flytt til papirkurv"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
