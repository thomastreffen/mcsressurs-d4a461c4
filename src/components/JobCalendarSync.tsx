import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithSession } from "@/lib/invoke-session";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CalendarCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Unplug,
  Wrench,
  Clock,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Send,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

// ── Types ──

interface StructuredError {
  error_code: string;
  message: string;
  recommendation: string;
  graph_status?: number;
}

interface CalendarLink {
  id: string;
  technician_id: string;
  user_id: string;
  calendar_event_id: string | null;
  calendar_event_url: string | null;
  sync_status: string;
  last_synced_at: string | null;
  last_error: string | null;
  last_sync_hash: string | null;
  technician_name?: string;
}

interface AvailabilityResult {
  technician_id: string;
  user_id: string;
  name: string;
  busy: boolean;
  busy_slots: { status: string; subject: string | null; start: string; end: string; is_private: boolean }[];
}

interface AuditEntry {
  id: string;
  action: string;
  performed_by: string;
  operation_id: string;
  technicians_count: number;
  successes_count: number;
  failures_count: number;
  override_conflicts: boolean;
  started_at: string;
  finished_at: string | null;
  summary: any;
}

interface JobCalendarSyncProps {
  jobId: string;
  jobStart: Date;
  jobEnd: Date;
  technicianIds: string[];
  isAdmin: boolean;
  calendarDirty?: boolean;
  calendarLastSyncedAt?: string | null;
  onSynced?: () => void;
}

// ── Helpers ──

const SYNC_STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  linked: { label: "Synkronisert", icon: CheckCircle2, className: "text-[hsl(var(--status-approved))]" },
  failed: { label: "Feilet", icon: XCircle, className: "text-destructive" },
  unlinked: { label: "Ikke koblet", icon: Unplug, className: "text-muted-foreground" },
};

function parseStructuredError(raw: string | null): StructuredError | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error_code) return parsed;
  } catch { /* not JSON */ }
  return { error_code: "unknown", message: raw || "Ukjent feil", recommendation: "Prøv igjen." };
}

// ── Component ──

export function JobCalendarSync({
  jobId,
  jobStart,
  jobEnd,
  technicianIds,
  isAdmin,
  calendarDirty,
  calendarLastSyncedAt,
  onSynced,
}: JobCalendarSyncProps) {
  const { user } = useAuth();
  const [links, setLinks] = useState<CalendarLink[]>([]);
  const [availability, setAvailability] = useState<AvailabilityResult[] | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [sendingNotify, setSendingNotify] = useState<string | null>(null);
  const [recentNotifs, setRecentNotifs] = useState<Map<string, string>>(new Map());

  // Conflict modal state
  const [conflictModal, setConflictModal] = useState<{
    open: boolean;
    conflicts: AvailabilityResult[];
  }>({ open: false, conflicts: [] });

  // Tech user map (must be before fetchRecentNotifs)
  const [techUserMap, setTechUserMap] = useState<Map<string, { user_id: string; name: string }>>(new Map());
  useEffect(() => {
    if (!technicianIds.length) return;
    supabase
      .from("technicians")
      .select("id, user_id, name")
      .in("id", technicianIds)
      .then(({ data }) => {
        const map = new Map<string, { user_id: string; name: string }>();
        for (const t of data || []) {
          map.set(t.id, { user_id: t.user_id, name: t.name });
        }
        setTechUserMap(map);
      });
  }, [technicianIds]);

  const fetchLinks = useCallback(async () => {
    setLoadingLinks(true);
    const { data } = await supabase
      .from("job_calendar_links")
      .select("*, technicians(name)")
      .eq("job_id", jobId);

    setLinks(
      (data || []).map((d: any) => ({
        ...d,
        technician_name: d.technicians?.name || "Ukjent",
      }))
    );
    setLoadingLinks(false);
  }, [jobId]);

  const fetchAudit = useCallback(async () => {
    const { data } = await supabase
      .from("job_calendar_audit")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(5);
    setAuditEntries((data as AuditEntry[]) || []);
  }, [jobId]);

  // Fetch recent ms_connect_request notifications for throttle display
  const fetchRecentNotifs = useCallback(async () => {
    const techUserIds = Array.from(techUserMap.values()).map(t => t.user_id);
    if (!techUserIds.length) return;
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("notifications")
      .select("user_id, created_at")
      .eq("type", "ms_connect_request")
      .eq("event_id", jobId)
      .gte("created_at", twoHoursAgo)
      .order("created_at", { ascending: false });
    const map = new Map<string, string>();
    for (const n of data || []) {
      for (const [tid, info] of techUserMap.entries()) {
        if (info.user_id === n.user_id && !map.has(tid)) {
          map.set(tid, n.created_at);
        }
      }
    }
    setRecentNotifs(map);
  }, [jobId, techUserMap]);

  useEffect(() => {
    fetchLinks();
    fetchAudit();
  }, [fetchLinks, fetchAudit]);

  useEffect(() => {
    if (techUserMap.size > 0) fetchRecentNotifs();
  }, [techUserMap, fetchRecentNotifs]);

  // ── Check availability ──
  const checkAvailability = async () => {
    const userIds = Array.from(techUserMap.values()).map((t) => t.user_id);
    if (!userIds.length) { toast.error("Ingen teknikere å sjekke"); return; }

    setLoadingAvail(true);
    setAvailability(null);
    try {
      const { data, error } = await invokeWithSession("ms-calendar", {
        body: { action: "availability", user_ids: userIds, start: jobStart.toISOString(), end: jobEnd.toISOString() },
      });
      if (error) throw error;
      setAvailability(data.results || []);
      if (data.results?.some((r: AvailabilityResult) => r.busy)) {
        toast.warning("Noen teknikere har konflikter i dette tidsrommet");
      } else {
        toast.success("Alle teknikere er ledige!");
      }
    } catch (e: any) {
      toast.error("Kunne ikke sjekke tilgjengelighet", { description: e.message });
    } finally {
      setLoadingAvail(false);
    }
  };

  // ── Sync to Outlook (with conflict pre-check) ──
  const initiateSync = async () => {
    const userIds = Array.from(techUserMap.values()).map((t) => t.user_id);
    if (!userIds.length) { toast.error("Ingen teknikere å synke"); return; }

    setSyncing(true);
    try {
      // Pre-check availability
      const { data: availData, error: availErr } = await invokeWithSession("ms-calendar", {
        body: { action: "availability", user_ids: userIds, start: jobStart.toISOString(), end: jobEnd.toISOString() },
      });

      if (!availErr && availData?.results?.some((r: AvailabilityResult) => r.busy)) {
        // Show conflict modal
        setConflictModal({
          open: true,
          conflicts: availData.results.filter((r: AvailabilityResult) => r.busy),
        });
        setSyncing(false);
        return;
      }

      // No conflicts, proceed
      await executeSyncToOutlook(false);
    } catch (e: any) {
      toast.error("Synk feilet", { description: e.message });
      setSyncing(false);
    }
  };

  const executeSyncToOutlook = async (overrideConflicts: boolean) => {
    setSyncing(true);
    try {
      const userIds = Array.from(techUserMap.values()).map((t) => t.user_id);
      const { data, error } = await supabase.functions.invoke("ms-calendar", {
        body: { action: "upsert_job_events", job_id: jobId, user_ids: userIds, override_conflicts: overrideConflicts },
      });
      if (error) throw error;
      const successCount = (data.results || []).filter((r: any) => r.status !== "failed" && r.status !== "in_progress").length;
      const inProgressCount = (data.results || []).filter((r: any) => r.status === "in_progress").length;

      if (inProgressCount > 0 && inProgressCount === (data.results?.length || 0)) {
        toast.info("Synk pågår allerede", { description: "Prøv igjen om noen sekunder." });
      } else if (inProgressCount > 0) {
        toast.warning(`Delvis synk: ${successCount} synket, ${inProgressCount} pågår allerede`);
      } else {
        toast.success(`Outlook synkronisert`, { description: `${successCount}/${data.results?.length || 0} teknikere` });
      }
      fetchLinks();
      fetchAudit();
      onSynced?.();
    } catch (e: any) {
      toast.error("Synk feilet", { description: e.message });
    } finally {
      setSyncing(false);
      setConflictModal({ open: false, conflicts: [] });
    }
  };

  // ── Unlink ──
  const unlinkTechnician = async (userId: string) => {
    setUnlinking(userId);
    try {
      const { error } = await supabase.functions.invoke("ms-calendar", {
        body: { action: "unlink_job_events", job_id: jobId, user_ids: [userId] },
      });
      if (error) throw error;
      toast.success("Outlook-hendelse fjernet");
      fetchLinks();
      fetchAudit();
    } catch (e: any) {
      toast.error("Feil ved fjerning", { description: e.message });
    } finally {
      setUnlinking(null);
    }
  };

  // ── Repair ──
  const repairSync = async () => {
    setRepairing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ms-calendar", {
        body: { action: "repair_sync", job_id: jobId },
      });
      if (error) throw error;

      const readyCount = data.ready_for_resync || 0;
      const verifiedMissing = data.verified_missing || 0;
      if (verifiedMissing > 0) {
        toast.warning(`${verifiedMissing} hendelse(r) mangler i Outlook`, { description: "Klikk 'Reparer synk' igjen for å klargjøre for ny synk." });
      } else if (readyCount > 0) {
        toast.success(`${readyCount} tekniker(e) klargjort for ny synk`, { description: "Trykk 'Synk til Outlook' for å fullføre." });
      } else {
        toast.info("Ingen teknikere kunne repareres automatisk. Se anbefalinger.");
      }
      fetchLinks();
    } catch (e: any) {
      toast.error("Reparasjon feilet", { description: e.message });
    } finally {
      setRepairing(false);
    }
  };

  // ── Send connection request notification to technician ──
  const sendConnectionRequest = async (techId: string) => {
    const techInfo = techUserMap.get(techId);
    if (!techInfo) return;

    // Throttle: check if already notified in last 2 hours
    const recentNotif = recentNotifs.get(techId);
    if (recentNotif) {
      const elapsed = Date.now() - new Date(recentNotif).getTime();
      if (elapsed < 2 * 60 * 60 * 1000) {
        toast.info("Allerede varslet", {
          description: `Varsel ble sendt ${format(new Date(recentNotif), "d. MMM HH:mm", { locale: nb })}. Neste varsel kan sendes om ${Math.ceil((2 * 60 * 60 * 1000 - elapsed) / 60000)} min.`,
        });
        return;
      }
    }

    setSendingNotify(techId);
    try {
      await supabase.from("notifications").insert({
        user_id: techInfo.user_id,
        type: "ms_connect_request",
        title: "Koble Microsoft 365",
        message: `Admin ber deg koble Microsoft 365-kontoen din for å motta jobber i Outlook. Gå til Integrasjoner-siden for å koble til.`,
        event_id: jobId,
      });
      toast.success(`Varsel sendt til ${techInfo.name}`);
      fetchRecentNotifs();
    } catch (e: any) {
      toast.error("Kunne ikke sende varsel", { description: e.message });
    } finally {
      setSendingNotify(null);
    }
  };

  if (!isAdmin) return null;

  const hasFailedLinks = links.some((l) => l.sync_status === "failed");

  return (
    <>
      <div className="rounded-lg border bg-card p-4 space-y-4">
        {/* Dirty state banner */}
        {calendarDirty && (
          <div className="flex items-center gap-3 rounded-md border border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/30 p-3">
            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                Endringer ikke synket til Outlook
              </p>
              {calendarLastSyncedAt && (
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  Sist synket: {format(new Date(calendarLastSyncedAt), "d. MMM yyyy HH:mm", { locale: nb })}
                </p>
              )}
            </div>
            <Button size="sm" onClick={initiateSync} disabled={syncing} className="gap-1.5 shrink-0">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Synk nå
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" />
            Outlook-kalender
          </h3>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={checkAvailability} disabled={loadingAvail || syncing || !technicianIds.length} className="gap-1.5">
              {loadingAvail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sjekk tilgjengelighet
            </Button>
            <Button size="sm" onClick={initiateSync} disabled={syncing || loadingAvail || !technicianIds.length} className="gap-1.5">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
              {syncing ? "Synker..." : "Synk til Outlook"}
            </Button>
            {hasFailedLinks && (
              <Button size="sm" variant="outline" onClick={repairSync} disabled={repairing || syncing} className="gap-1.5">
                {repairing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                Reparer synk
              </Button>
            )}
          </div>
        </div>

        {/* Availability results */}
        {availability && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tilgjengelighet</p>
            {availability.map((r) => (
              <div
                key={r.technician_id}
                className={`flex items-center justify-between rounded-md border p-2.5 ${
                  r.busy ? "border-destructive/30 bg-destructive/5" : "border-[hsl(var(--status-approved))]/30 bg-[hsl(var(--status-approved))]/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  {r.busy ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-approved))]" />}
                  <span className="text-sm font-medium">{r.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.busy ? `${r.busy_slots.length} konflikt(er)` : "Ledig"}
                </div>
              </div>
            ))}
            {availability.some((r) => r.busy) && (
              <div className="space-y-1">
                {availability.filter((r) => r.busy).flatMap((r) =>
                  r.busy_slots.map((s, i) => (
                    <p key={`${r.technician_id}-${i}`} className="text-xs text-muted-foreground pl-6">
                      {r.name}: {s.is_private ? "Privat avtale" : s.subject || "Opptatt"},{" "}
                      {new Date(s.start).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}–
                      {new Date(s.end).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Sync status per technician */}
        {!loadingLinks && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Synk-status</p>
            {technicianIds.map((tid) => {
              const techInfo = techUserMap.get(tid);
              const link = links.find((l) => l.technician_id === tid);
              const config = SYNC_STATUS_CONFIG[link?.sync_status || "unlinked"] || SYNC_STATUS_CONFIG.unlinked;
              const Icon = config.icon;
              const parsedErr = link?.sync_status === "failed" ? parseStructuredError(link.last_error) : null;
              const isExpanded = expandedError === tid;

              return (
                <div key={tid} className="space-y-1">
                  <div className="flex items-center justify-between rounded-md border p-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`h-4 w-4 shrink-0 ${config.className}`} />
                      <span className="text-sm font-medium truncate">{link?.technician_name || techInfo?.name || tid.slice(0, 8)}</span>
                      <Badge variant="outline" className="text-xs shrink-0">{config.label}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {link?.last_synced_at && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {format(new Date(link.last_synced_at), "d. MMM HH:mm", { locale: nb })}
                        </span>
                      )}
                      {parsedErr && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => setExpandedError(isExpanded ? null : tid)}>
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          Detaljer
                        </Button>
                      )}
                      {parsedErr?.error_code === "missing_token" && !isExpanded && (
                        <>
                          {recentNotifs.has(tid) ? (
                            <span className="text-[10px] text-muted-foreground">
                              Varslet {format(new Date(recentNotifs.get(tid)!), "d. MMM HH:mm", { locale: nb })}
                            </span>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            disabled={sendingNotify === tid || recentNotifs.has(tid)}
                            onClick={() => sendConnectionRequest(tid)}
                            title={recentNotifs.has(tid) ? "Allerede varslet nylig" : "Send varsel til teknikeren om å koble Microsoft"}
                          >
                            {sendingNotify === tid ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            Varsle
                          </Button>
                        </>
                      )}
                      {link?.calendar_event_url && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(link.calendar_event_url!, "_blank")} title="Åpne i Outlook">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {link?.sync_status === "linked" && (
                        <Button
                          size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          disabled={unlinking === techInfo?.user_id}
                          onClick={() => techInfo && unlinkTechnician(techInfo.user_id)}
                          title="Fjern Outlook-hendelse"
                        >
                          {unlinking === techInfo?.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded error details */}
                  {isExpanded && parsedErr && (
                    <div className="rounded-md bg-destructive/5 border border-destructive/20 p-3 ml-6 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0" />
                        <p className="text-xs font-medium text-destructive">{parsedErr.message}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Kode:</span> {parsedErr.error_code}
                        {parsedErr.graph_status && <> · <span className="font-medium">HTTP:</span> {parsedErr.graph_status}</>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Anbefaling:</span> {parsedErr.recommendation}
                      </p>
                      {parsedErr.error_code === "missing_token" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs mt-1"
                          disabled={sendingNotify === tid}
                          onClick={() => sendConnectionRequest(tid)}
                        >
                          {sendingNotify === tid ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                          Be teknikeren koble Microsoft
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {loadingLinks && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laster synk-status...
          </div>
        )}

        {/* Audit history */}
        <div className="space-y-2">
          <button
            onClick={() => setShowAudit(!showAudit)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
          >
            <Clock className="h-3.5 w-3.5" />
            Synk-historikk ({auditEntries.length})
            {showAudit ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showAudit && auditEntries.length > 0 && (
            <div className="space-y-1.5">
              {auditEntries.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 text-xs rounded-md border p-2">
                  <div className={`h-2 w-2 rounded-full mt-1 shrink-0 ${entry.failures_count > 0 ? "bg-destructive" : "bg-[hsl(var(--status-approved))]"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium capitalize">{entry.action}</span>
                      <span className="text-muted-foreground">
                        {entry.successes_count}/{entry.technicians_count} OK
                      </span>
                      {entry.override_conflicts && (
                        <Badge variant="outline" className="text-[10px] px-1">Konflikter overstyrt</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {entry.started_at ? format(new Date(entry.started_at), "d. MMM HH:mm", { locale: nb }) : "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Conflict confirmation modal */}
      <Dialog open={conflictModal.open} onOpenChange={(open) => { if (!open) setConflictModal({ open: false, conflicts: [] }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Kalenderkonflikter oppdaget
            </DialogTitle>
            <DialogDescription>
              Følgende teknikere har eksisterende avtaler i dette tidsrommet. Vil du synke likevel?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {conflictModal.conflicts.map((r) => (
              <div key={r.technician_id} className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="text-sm font-medium">{r.name}</p>
                {r.busy_slots.map((s, i) => (
                  <p key={i} className="text-xs text-muted-foreground pl-2">
                    {s.is_private ? "Privat avtale" : s.subject || "Opptatt"},{" "}
                    {new Date(s.start).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}–
                    {new Date(s.end).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                ))}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConflictModal({ open: false, conflicts: [] })}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={() => executeSyncToOutlook(true)}
              disabled={syncing}
              className="gap-1.5"
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              Synk likevel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
