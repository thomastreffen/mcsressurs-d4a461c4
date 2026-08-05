import { memo, useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  X, ExternalLink, Check, ArrowRight, MapPin,
  Calendar as CalendarIcon, User, FileText, Sparkles,
  Plus, Link2, Globe, Trash2, Loader2, Search, Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getResourceCardTitle, extractOrderRef } from "@/lib/resource-card-title";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { ScheduleBlock } from "@/hooks/useScheduleBlocks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Props {
  block: ScheduleBlock;
  onClose: () => void;
  onConfirmed?: (deletedBlockIds?: string[]) => void;
}

const stateLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  auto: { label: "Automatisk koblet", variant: "default" },
  confirmed: { label: "Bekreftet", variant: "default" },
  needs_confirmation: { label: "Trenger bekreftelse", variant: "secondary" },
  external: { label: "Privat / ekstern", variant: "outline" },
  external_confirmed: { label: "Privat (bekreftet)", variant: "outline" },
  manual: { label: "Manuelt koblet", variant: "default" },
};

interface ProjectOption {
  id: string;
  title: string;
  customer: string | null;
  internal_number: string | null;
}

export const ScheduleBlockDetailPanel = memo(function ScheduleBlockDetailPanel({ block, onClose, onConfirmed }: Props) {
  const navigate = useNavigate();
  const stateInfo = stateLabels[block.match_state] || stateLabels.external;
  const isOutlook = block.source === "outlook";
  const isSystem = block.source === "system" || block.source === "manual" || (block.source as string) === "linked_outlook";
  const hasProject = !!block.project_id;

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [clientRequestId] = useState(() => crypto.randomUUID());

  const [showProjectSearch, setShowProjectSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProjectOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Search projects
  useEffect(() => {
    if (!showProjectSearch || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const { data } = await supabase
        .from("events")
        .select("id, title, customer, internal_number")
        .is("deleted_at", null)
        .or(`title.ilike.%${searchQuery}%,customer.ilike.%${searchQuery}%,internal_number.ilike.%${searchQuery}%`)
        .order("title", { ascending: true })
        .limit(8);
      setSearchResults(data || []);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, showProjectSearch]);

  // Create new job
  const handleCreateJob = async () => {
    if (actionLoading || submitted) return;
    setActionLoading("create");
    try {
      const { data, error } = await supabase.functions.invoke("create-job-from-schedule-block", {
        body: {
          client_request_id: clientRequestId,
          schedule_block_id: block.id,
          title: block.outlook_subject || block.title || "Nytt prosjekt",
          address: block.outlook_location || block.location || null,
          description: block.outlook_preview || block.description || null,
          start_time: block.start_at.toISOString(),
          end_time: block.end_at.toISOString(),
          technician_id: block.technician_id,
          company_id: block.company_id || null,
        },
      });

      if (error) {
        toast.error("Kunne ikke opprette prosjekt", { description: error.message });
        return;
      }

      setSubmitted(true);
      setCreatedEventId(data.event_id);
      toast.success(data.idempotent ? "Allerede opprettet ✓" : "Prosjekt opprettet ✓");
      onConfirmed?.();
    } catch (err: any) {
      toast.error("Feil", { description: err?.message });
    } finally {
      setActionLoading(null);
    }
  };

  // Link to existing project
  const handleLinkProject = async (projectId: string) => {
    setActionLoading("link");
    try {
      const { error } = await supabase.from("schedule_blocks").update({
        project_id: projectId,
        match_state: "confirmed",
        match_reason: "Manuelt koblet",
      }).eq("id", block.id);

      if (error) { toast.error("Kunne ikke koble"); return; }

      const subject = block.outlook_subject || block.title || "";
      const tokens = subject.split(/[\s–\-,.:;/()]+/).filter(w => w.length > 2).map(w => w.toLowerCase());
      try {
        await supabase.from("confirmation_learnings").insert({
          company_id: block.company_id,
          technician_id: block.technician_id,
          project_id: projectId,
          signal_tokens: tokens,
          source_block_id: block.id,
        });
      } catch { /* ignore */ }

      toast.success("Koblet til prosjekt ✓");
      onConfirmed?.();
      onClose();
    } catch (err: any) {
      toast.error("Feil", { description: err?.message });
    } finally {
      setActionLoading(null);
    }
  };

  // Unlink
  const handleUnlinkProject = async () => {
    setActionLoading("unlink");
    try {
      const restoredTitle = block.outlook_subject || block.title || "Ekstern";
      const { error } = await supabase.from("schedule_blocks").update({
        project_id: null,
        match_state: "external",
        match_reason: "Manuelt frakoblet",
        title: restoredTitle,
      } as any).eq("id", block.id);

      if (error) { toast.error("Kunne ikke koble fra"); return; }

      toast.success("Frakoblet ✓");
      onConfirmed?.();
      onClose();
    } catch (err: any) {
      toast.error("Feil", { description: err?.message });
    } finally {
      setActionLoading(null);
    }
  };

  // Mark as external
  const handleMarkExternal = async () => {
    setActionLoading("external");
    try {
      const { error } = await supabase.from("schedule_blocks").update({
        match_state: "external_confirmed",
        project_id: null,
      }).eq("id", block.id);

      if (error) toast.error("Feil ved markering");
      else {
        toast.success("Markert som privat");
        onConfirmed?.();
        onClose();
      }
    } catch (err: any) {
      toast.error("Feil", { description: err?.message });
    } finally {
      setActionLoading(null);
    }
  };

  // Confirm AI suggestion
  const handleConfirmSuggestion = async () => {
    if (!block.project_id) return;
    setActionLoading("confirm");
    try {
      const { error } = await supabase.from("schedule_blocks").update({
        match_state: "confirmed",
        match_reason: "Manuelt bekreftet",
      }).eq("id", block.id);

      if (error) { toast.error("Feil ved bekreftelse"); return; }

      const subject = block.outlook_subject || block.title || "";
      const tokens = subject.split(/[\s–\-,.:;/()]+/).filter(w => w.length > 2).map(w => w.toLowerCase());
      try {
        await supabase.from("confirmation_learnings").insert({
          company_id: block.company_id,
          technician_id: block.technician_id,
          project_id: block.project_id,
          signal_tokens: tokens,
          source_block_id: block.id,
        });
      } catch { /* ignore */ }

      toast.success("Bekreftet ✓");
      onConfirmed?.();
      onClose();
    } catch (err: any) {
      toast.error("Feil", { description: err?.message });
    } finally {
      setActionLoading(null);
    }
  };

  // Delete / remove from plan
  const handleDelete = async (forceDeleteOutlook?: boolean) => {
    setActionLoading("delete");
    const origin = isSystem ? "system" : "imported";
    const requestTrace = {
      source: block.source,
      schedule_block_id: block.id,
      technician_id: block.technician_id,
      user_id: (block as any).user_id ?? null,
      outlook_event_id: block.outlook_event_id,
      calendar_event_id: block.outlook_event_id,
      external_event_id: block.outlook_event_id,
      calendar_id: block.calendar_id,
      origin,
      force_delete_outlook: forceDeleteOutlook ?? false,
      start: block.start_at?.toISOString?.(),
      end: block.end_at?.toISOString?.(),
      title: block.outlook_subject || block.title,
    };

    console.info("[ScheduleBlockDetailPanel] Delete request", requestTrace);

    try {
      const { data, error } = await supabase.functions.invoke("delete-schedule-block", {
        body: {
          schedule_block_id: block.id,
          force_delete_outlook: forceDeleteOutlook ?? false,
        },
      });

      if (error) {
        console.error("[ScheduleBlockDetailPanel] Delete failed", { request: requestTrace, error });
        toast.error("Kunne ikke fjerne", { description: error.message });
        return;
      }

      const result = data as any;
      console.info("[ScheduleBlockDetailPanel] Delete response", {
        request: requestTrace,
        result,
      });

      if (result?.status === "ok") {
        if (result.deleted_in_outlook) {
          toast.success("Fjernet fra plan og Outlook ✓", {
            description: `${result.outlook_events_removed} Outlook-hendelse(r) slettet.`,
          });
        } else if ((forceDeleteOutlook ?? false) || isSystem) {
          toast.warning("Delvis sletting", {
            description: result.outlook_error || "Outlook-avtale ble ikke bekreftet slettet.",
          });
        } else if (isOutlook && !forceDeleteOutlook) {
          toast.success("Fjernet fra plan", {
            description: "Outlook-avtalen er beholdt.",
          });
        } else {
          toast.success("Fjernet fra plan ✓");
        }
      } else {
        toast.error("Feil ved fjerning");
      }

      const deletedIds: string[] = result?.block_ids_soft_deleted ?? [block.id];
      onConfirmed?.(deletedIds);
      onClose();
    } catch (err: any) {
      console.error("[ScheduleBlockDetailPanel] Delete exception", { request: requestTrace, err });
      toast.error("Feil", { description: err?.message });
    } finally {
      setActionLoading(null);
      setShowDeleteConfirm(false);
    }
  };

  const outlookUrl = block.outlook_weblink
    || (block.calendar_id && block.outlook_event_id
      ? `https://outlook.office.com/calendar/item/${encodeURIComponent(block.outlook_event_id)}`
      : null);

  const isLoading = actionLoading !== null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="fixed right-4 top-24 z-50 w-80 bg-card border border-border/60 rounded-2xl shadow-xl p-4 space-y-3 animate-in slide-in-from-right-4 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {isOutlook && (
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Fra Outlook</span>
              </div>
            )}
            {isSystem && (
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Systemopprettet</span>
              </div>
            )}
            <p className="text-sm font-semibold truncate">{getResourceCardTitle({
              eventTitle: block.job_title,
              parentTitle: block.project_title,
              blockTitle: block.title,
              outlookSubject: block.outlook_subject,
              sourceOrderNumber: extractOrderRef(block.title, block.description, block.outlook_preview),
              fallbackRef: block.job_number_resolved || block.internal_number,
            })}</p>

            {(block.internal_number || block.job_number) && (
              <span className="inline-block font-mono text-[10px] font-semibold bg-primary/10 text-primary rounded px-1.5 py-0.5 mt-0.5">
                {(() => {
                  const num = block.internal_number || block.job_number || "";
                  return num.startsWith("JOB-") ? num : `JOB-${num}`;
                })()}
              </span>
            )}
            <p className="text-xs text-muted-foreground">
              {block.technician_name} · {format(block.start_at, "EEE d. MMM HH:mm", { locale: nb })}–{format(block.end_at, "HH:mm")}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Location */}
        {(block.outlook_location || block.location) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{block.outlook_location || block.location}</span>
          </div>
        )}

        {/* Organizer */}
        {block.outlook_organizer && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{block.outlook_organizer}</span>
          </div>
        )}

        {/* Preview */}
        {block.outlook_preview && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 line-clamp-3">{block.outlook_preview}</p>
        )}

        {/* Match state badge */}
        <Badge variant={stateInfo.variant} className="text-[10px]">{stateInfo.label}</Badge>

        {/* AI match info */}
        {block.match_state === "auto" && block.match_reason && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-primary/5 rounded-lg p-2">
            <Sparkles className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
            <span>{block.match_reason}</span>
          </div>
        )}

        {/* Link to project */}
        {hasProject && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Link2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Koblet til prosjekt</span>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 rounded-lg w-full justify-start"
              onClick={() => navigate(`/projects/${block.project_id}`)}>
              <ArrowRight className="h-3 w-3" />
              Åpne prosjekt
            </Button>
          </div>
        )}

        {/* Actions based on state */}
        {block.match_state === "needs_confirmation" && hasProject && (
          <div className="flex gap-1.5">
            <Button variant="default" size="sm" className="h-7 text-xs gap-1 rounded-lg flex-1"
              onClick={handleConfirmSuggestion} disabled={isLoading}>
              <Check className="h-3 w-3" /> Bekreft
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 rounded-lg flex-1"
              onClick={handleMarkExternal} disabled={isLoading}>
              <Globe className="h-3 w-3" /> Privat
            </Button>
          </div>
        )}

        {/* Create / link project */}
        {!hasProject && !submitted && !showProjectSearch && (
          <div className="space-y-1.5">
            <Button variant="default" size="sm" className="h-7 text-xs gap-1 rounded-lg w-full"
              onClick={handleCreateJob} disabled={isLoading}>
              {actionLoading === "create" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Opprett prosjekt
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 rounded-lg w-full"
              onClick={() => setShowProjectSearch(true)} disabled={isLoading}>
              <Search className="h-3 w-3" />
              Koble til eksisterende
            </Button>
            {(block.match_state as string) !== "external_confirmed" && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 rounded-lg w-full"
                onClick={handleMarkExternal} disabled={isLoading}>
                <Globe className="h-3 w-3" />
                Marker som privat
              </Button>
            )}
          </div>
        )}

        {/* Unlink */}
        {hasProject && (block.match_state === "confirmed" || block.match_state === "auto" || block.match_state === "manual" || block.match_state === "needs_confirmation") && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 rounded-lg w-full justify-start text-muted-foreground"
            onClick={handleUnlinkProject} disabled={isLoading}>
            {actionLoading === "unlink" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
            Koble fra prosjekt
          </Button>
        )}

        {/* Project search */}
        {showProjectSearch && (
          <div className="space-y-2">
            <Input
              placeholder="Søk prosjekt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 text-xs"
              autoFocus
            />
            {searchLoading && <p className="text-xs text-muted-foreground">Søker…</p>}
            {searchResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {searchResults.map((p) => (
                  <button
                    key={p.id} type="button"
                    onClick={() => handleLinkProject(p.id)}
                    disabled={isLoading}
                    className="w-full text-left rounded-md px-2.5 py-1.5 text-xs hover:bg-muted transition-colors"
                  >
                    <p className="font-medium truncate">{p.title}</p>
                    <p className="text-[10px] text-muted-foreground">{p.internal_number} · {p.customer || "Ingen kunde"}</p>
                  </button>
                ))}
              </div>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs w-full"
              onClick={() => { setShowProjectSearch(false); setSearchQuery(""); }}>
              Avbryt
            </Button>
          </div>
        )}

        {/* Success state */}
        {submitted && createdEventId && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <Check className="h-4 w-4 text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-green-700 dark:text-green-400">Prosjekt opprettet ✓</p>
            </div>
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 shrink-0"
              onClick={() => navigate(`/projects/${createdEventId}`)}>
              Åpne <ArrowRight className="h-2.5 w-2.5" />
            </Button>
          </div>
        )}

        {/* Outlook link */}
        {outlookUrl && (
          <a href={outlookUrl} target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 rounded-lg w-full justify-start">
              <ExternalLink className="h-3 w-3" />
              Åpne i Outlook
            </Button>
          </a>
        )}

        {/* Remove from plan */}
        <div className="border-t border-border/40 pt-2">
          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs gap-1.5 rounded-lg w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isLoading}
          >
            {actionLoading === "delete" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Fjern fra plan
          </Button>
        </div>

        {/* Delete confirmation — different dialog based on source */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isSystem ? "Fjern oppdrag?" : "Fjern fra plan?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isSystem
                  ? "Dette fjerner oppdraget fra planen og sletter avtalen fra montørens Outlook-kalender. Kan ikke angres."
                  : "Denne hendelsen ble importert fra Outlook. Velg om du bare vil fjerne den fra planoversikten, eller også slette den fra Outlook."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading === "delete"}>Avbryt</AlertDialogCancel>
              {isOutlook ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleDelete(false)}
                    disabled={actionLoading === "delete"}
                    className="gap-1.5"
                  >
                    {actionLoading === "delete" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Bare fjern fra plan
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(true)}
                    disabled={actionLoading === "delete"}
                    className="gap-1.5"
                  >
                    {actionLoading === "delete" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Fjern også fra Outlook
                  </Button>
                </>
              ) : (
                <AlertDialogAction
                  onClick={() => handleDelete(false)}
                  disabled={actionLoading === "delete"}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {actionLoading === "delete" && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Fjern
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
});
