import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithSession } from "@/lib/invoke-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkDeleteBar } from "@/components/BulkDeleteBar";
import { BulkReassignCompanyDialog } from "@/components/BulkReassignCompanyDialog";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Plus,
  Search,
  ArrowUpDown,
  ArrowRightLeft,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  CalendarCheck,
  Mail,
  Send,
} from "lucide-react";
import { JOB_STATUS_CONFIG, getDisplayNumber, type JobStatus } from "@/lib/job-status";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { SoftDeleteRowButton } from "@/components/shared/SoftDeleteRowButton";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompanyModuleAccess } from "@/hooks/useCompanyModuleAccess";
import { useMobileProjectRelevance } from "@/hooks/useMobileProjectRelevance";
import { MobileProjectList } from "@/components/project/MobileProjectList";
import { fetchFinancialProjectNumbers } from "@/lib/project-reference";

interface JobRow {
  companyId: string | null;
  parentId: string | null;
  displayNumber: string;
  id: string;
  title: string;
  customer: string;
  address: string;
  startTime: Date;
  endTime: Date;
  status: JobStatus;
  jobNumber: string | null;
  internalNumber: string | null;
  techNames: string[];
  techColors: string[];
}

const PAGE_SIZE = 25;

type StatusTab = "requested" | "scheduled" | "in_progress" | "completed" | "archive" | "all";

const STATUS_TAB_MAP: Record<StatusTab, JobStatus[]> = {
  requested: ["requested", "approved", "time_change_proposed", "rejected"],
  scheduled: ["scheduled"],
  in_progress: ["in_progress"],
  completed: ["completed", "ready_for_invoicing"],
  archive: ["invoiced"],
  all: [],
};

const TAB_LABELS: Record<StatusTab, string> = {
  requested: "Forespurt",
  scheduled: "Planlagt",
  in_progress: "Pågår",
  completed: "Ferdig",
  archive: "Arkiv",
  all: "Alle",
};

export default function JobsPage() {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const { activeCompanyId, allowedCompanyIds } = useCompanyContext();
  const isMobile = useIsMobile();
  const { hasPermission } = usePermissions();
  const companyAccess = useCompanyModuleAccess();
  const canBrowseAll = (isAdmin || isSuperAdmin || hasPermission("jobs.view")) && (companyAccess.can("resource_plan") || companyAccess.can("planning") || companyAccess.can("finance"));
  const [mobileScope, setMobileScope] = useState<"mine" | "all">("mine");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<StatusTab>(() => isMobile ? "all" : "requested");
  const [sortField, setSortField] = useState<"start" | "status" | "customer">("start");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sendingApproval, setSendingApproval] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const fetchVersion = useRef(0);
  const relevance = useMobileProjectRelevance(jobs, isMobile);
  const myRoles = relevance.data ?? new Map<string, string[]>();
  useEffect(() => { setMobileScope("mine"); setPage(0); }, [activeCompanyId, user?.id]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const fetchJobs = useCallback(async () => {
    const version = ++fetchVersion.current;
    setLoading(true);
    setJobs([]);
    let query = supabase
      .from("events")
      .select(`
        id, title, customer, address, start_time, end_time, status, job_number, internal_number, company_id, parent_project_id,
        event_technicians(technician_id, technicians(name, color))
      `)
      .is("deleted_at", null)
      .order("start_time", { ascending: false });

    if (activeCompanyId) {
      query = query.eq("company_id", activeCompanyId);
    } else if (allowedCompanyIds.length > 0) {
      query = query.in("company_id", allowedCompanyIds);
    }

    const { data } = await query;

    if (version !== fetchVersion.current) return;
    if (data) {
      const refs = isMobile ? await fetchFinancialProjectNumbers(data.map(e => e.id)) : new Map<string, string>();
      if (version !== fetchVersion.current) return;
      setJobs(
        data.map((e: any) => {
          const techs = (e.event_technicians || [])
            .filter((et: any) => et.technicians)
            .map((et: any) => et.technicians);
          return {
            id: e.id,
            companyId: e.company_id,
            parentId: e.parent_project_id,
            displayNumber: refs.get(e.id) ?? getDisplayNumber(e.job_number, e.internal_number),
            title: e.title,
            customer: e.customer || "",
            address: e.address || "",
            startTime: new Date(e.start_time),
            endTime: new Date(e.end_time),
            status: e.status as JobStatus,
            jobNumber: e.job_number,
            internalNumber: e.internal_number,
            techNames: techs.map((t: any) => t.name),
            techColors: techs.map((t: any) => t.color || "#6366f1"),
          };
        })
      );
    }
    setLoading(false);
  }, [activeCompanyId, allowedCompanyIds.join("|"), isMobile]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const tabCounts = useMemo(() => {
    const relevantJobs = isMobile && mobileScope === "mine" && !search.trim() ? jobs.filter(j => myRoles.has(j.id)) : jobs;
    const counts: Record<StatusTab, number> = { requested: 0, scheduled: 0, in_progress: 0, completed: 0, archive: 0, all: relevantJobs.length };
    for (const j of relevantJobs) {
      for (const [tab, statuses] of Object.entries(STATUS_TAB_MAP)) {
        if (tab !== "all" && statuses.includes(j.status)) {
          counts[tab as StatusTab]++;
        }
      }
    }
    return counts;
  }, [jobs, isMobile, mobileScope, search, relevance.data]);

  const filtered = useMemo(() => {
    let result = [...jobs];
    if (isMobile && mobileScope === "mine" && !search.trim()) result = result.filter(j => myRoles.has(j.id));

    // Tab filter
    const tabStatuses = STATUS_TAB_MAP[activeTab];
    if (tabStatuses.length > 0) {
      result = result.filter((j) => tabStatuses.includes(j.status));
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.customer.toLowerCase().includes(q) ||
          j.address.toLowerCase().includes(q) ||
          (j.internalNumber || "").toLowerCase().includes(q) ||
          (j.jobNumber || "").toLowerCase().includes(q) ||
          j.displayNumber.toLowerCase().includes(q) ||
          j.techNames.some((n) => n.toLowerCase().includes(q))
      );
    }

    // Sort
    result.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "start") return dir * (a.startTime.getTime() - b.startTime.getTime());
      if (sortField === "customer") return dir * a.customer.localeCompare(b.customer);
      return dir * a.status.localeCompare(b.status);
    });
    return result;
  }, [jobs, activeTab, search, sortField, sortDir, isMobile, mobileScope, relevance.data]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const handleSendApproval = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    setSendingApproval(jobId);
    try {
      const res = await invokeWithSession("create-approval", {
        body: { job_id: jobId },
      });
      if (res.error || res.data?.error) {
        toast.error("Kunne ikke sende godkjenning", { description: res.data?.error || String(res.error) });
      } else {
        toast.success("Godkjenning sendt");
        fetchJobs();
      }
    } catch {
      toast.error("Feil ved sending av godkjenning");
    }
    setSendingApproval(null);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1920px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            Prosjekter
          </h1>
          <p className="text-sm text-muted-foreground/70">{filtered.length} prosjekter</p>
        </div>
        {isAdmin && !isMobile && (
          <div className="flex items-center gap-2 self-start">
            <Button variant="outline" size="sm" onClick={() => setReassignOpen(true)} className="gap-1.5 rounded-xl text-xs">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Flytt selskap
            </Button>
            {isSuperAdmin && (
              <Button variant="outline" size="sm" onClick={() => navigate("/projects/import-tripletex")} className="gap-1.5 rounded-xl text-xs">
                Hent fra Tripletex TEST
              </Button>
            )}
            <Button onClick={() => navigate("/projects/new")} className="gap-1.5 rounded-xl">
              <Plus className="h-4 w-4" />
              Nytt prosjekt
            </Button>
          </div>
        )}
      </div>

      {isMobile && <div className="flex items-center gap-2" aria-label="Prosjektutvalg">
        <Button variant={mobileScope === "mine" ? "default" : "outline"} className="flex-1" onClick={() => { setMobileScope("mine"); setPage(0); }}>Mine prosjekter</Button>
        {canBrowseAll && <Button variant={mobileScope === "all" ? "default" : "outline"} className="flex-1" onClick={() => { setMobileScope("all"); setPage(0); }}>Alle</Button>}
      </div>}

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as StatusTab); setPage(0); setSelectedIds([]); }}>
        <TabsList className="h-auto md:h-10 w-full md:w-auto flex-wrap md:flex-nowrap bg-secondary/40 rounded-lg gap-0.5 p-1">
          {(Object.keys(TAB_LABELS) as StatusTab[]).map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-lg text-xs font-medium px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5"
            >
              {TAB_LABELS[tab]}
              {tabCounts[tab] > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-muted text-[10px] font-semibold px-1">
                  {tabCounts[tab]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Søk kunde, jobbnr, adresse, tittel..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="pl-9 rounded-xl"
        />
      </div>
      {isMobile && search.trim() && <p className="text-sm text-muted-foreground">Søker i alle tilgjengelige prosjekter</p>}
      {isMobile && relevance.isError && <div className="text-sm text-destructive">Kunne ikke hente dine tilordninger. <Button variant="outline" onClick={() => relevance.refetch()}>Prøv igjen</Button></div>}

      {/* Table */}
      {loading || (isMobile && !search.trim() && mobileScope === "mine" && relevance.isFetching) ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {selectedIds.length > 0 && (
            <BulkDeleteBar
              selectedIds={selectedIds}
              entityType="events"
              entityLabel="prosjekter"
              onComplete={() => { setSelectedIds([]); fetchJobs(); }}
              onCancel={() => setSelectedIds([])}
            />
          )}
          {isMobile ? <MobileProjectList projects={paged} roles={myRoles} onOpen={id => navigate(`/projects/${id}`)} /> : <div className="rounded-2xl border border-border/40 bg-card shadow-sm overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/30">
                  {isAdmin && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={paged.length > 0 && selectedIds.length === paged.length}
                        onCheckedChange={() => {
                          if (selectedIds.length === paged.length) setSelectedIds([]);
                          else setSelectedIds(paged.map(j => j.id));
                        }}
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-[110px] text-xs font-semibold uppercase tracking-wider">Jobb nr</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider min-w-[180px]">Tittel / Kunde</TableHead>
                  <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wider">Sted</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("start")} className="flex items-center gap-1 hover:text-foreground text-xs font-semibold uppercase tracking-wider">
                      Periode <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell text-xs font-semibold uppercase tracking-wider">Montør(er)</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("status")} className="flex items-center gap-1 hover:text-foreground text-xs font-semibold uppercase tracking-wider">
                      Status <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[100px] text-xs font-semibold uppercase tracking-wider text-right">Handlinger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground py-12">
                      <FolderKanban className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      Ingen prosjekter i denne kategorien.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((job) => (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer hover:bg-secondary/40 transition-colors group"
                      onClick={() => navigate(`/projects/${job.id}`)}
                    >
                      {isAdmin && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(job.id)}
                            onCheckedChange={() => toggleSelect(job.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {getDisplayNumber(job.jobNumber, job.internalNumber)}
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-[220px]">{job.title}</p>
                          <p className="text-xs text-muted-foreground/60 truncate max-w-[220px]">{job.customer}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground/70 truncate max-w-[180px]">
                        {job.address}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                        <div>
                          <span>{format(job.startTime, "d. MMM", { locale: nb })}</span>
                          {job.endTime && job.startTime.toDateString() !== job.endTime.toDateString() && (
                            <span className="text-muted-foreground/50"> – {format(job.endTime, "d. MMM", { locale: nb })}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1.5">
                          {job.techNames.slice(0, 2).map((name, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <div
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: job.techColors[i] }}
                              />
                              <span className="text-xs text-muted-foreground truncate max-w-[80px]">{name}</span>
                            </div>
                          ))}
                          {job.techNames.length > 2 && (
                            <span className="text-xs text-muted-foreground/50">+{job.techNames.length - 2}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className="text-[10px] whitespace-nowrap rounded-lg"
                          style={{
                            backgroundColor: `hsl(var(--status-${job.status.replace(/_/g, "-")}))`,
                            color: `hsl(var(--status-${job.status.replace(/_/g, "-")}-foreground))`,
                          }}
                        >
                          {JOB_STATUS_CONFIG[job.status]?.label || job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg"
                                onClick={(e) => { e.stopPropagation(); navigate(`/projects/${job.id}?tab=plan`); }}
                              >
                                <CalendarCheck className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Planlegg</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg"
                                onClick={(e) => { e.stopPropagation(); navigate(`/projects/${job.id}?tab=epost`); }}
                              >
                                <Mail className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>E-post</TooltipContent>
                          </Tooltip>
                          {isAdmin && (job.status === "requested" || job.status === "approved") && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-lg"
                                  disabled={sendingApproval === job.id}
                                  onClick={(e) => handleSendApproval(job.id, e)}
                                >
                                  {sendingApproval === job.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Send className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Send godkjenning</TooltipContent>
                            </Tooltip>
                          )}
                          <SoftDeleteRowButton table="events" id={job.id} entityLabel="Prosjekt" entityName={job.title} onDeleted={() => setJobs((prev) => prev.filter((j) => j.id !== job.id))} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Side {page + 1} av {totalPages} · {filtered.length} prosjekter
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-xl">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="rounded-xl">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      <BulkReassignCompanyDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        onComplete={fetchJobs}
      />
    </div>
  );
}
