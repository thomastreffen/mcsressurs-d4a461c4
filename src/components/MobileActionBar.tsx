import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ALL_STATUSES,
  JOB_STATUS_CONFIG,
  canSetStatus,
  type JobStatus,
} from "@/lib/job-status";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveAppRole } from "@/hooks/usePreviewMode";
import { toast } from "sonner";
import {
  ChevronRight,
  Copy,
  Archive,
  Trash2,
  Mail,
  Settings2,
  CircleDot,
  Loader2,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface MobileActionBarProps {
  job: {
    id: string;
    status: JobStatus;
    title: string;
  };
  onStatusChanged: (newStatus: JobStatus) => void;
  onScrollToEmail: () => void;
}

export function MobileActionBar({
  job,
  onStatusChanged,
  onScrollToEmail,
}: MobileActionBarProps) {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const role = useEffectiveAppRole().role ?? "montør";

  const [statusOpen, setStatusOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const handleStatusChange = async (newStatus: JobStatus) => {
    if (!user) return;
    if (!canSetStatus(role, newStatus)) {
      toast.error("Du har ikke tilgang til å sette denne statusen");
      return;
    }
    setStatusUpdating(true);
    const { error } = await supabase
      .from("events")
      .update({ status: newStatus, updated_by: user.id })
      .eq("id", job.id);
    if (error) {
      toast.error("Kunne ikke oppdatere status", { description: error.message });
    } else {
      await supabase.from("event_logs").insert({
        event_id: job.id,
        action_type: "status_changed",
        performed_by: user.id,
        change_summary: `Status endret fra "${JOB_STATUS_CONFIG[job.status].label}" til "${JOB_STATUS_CONFIG[newStatus].label}"`,
      });
      onStatusChanged(newStatus);
      toast.success("Status oppdatert", {
        description: JOB_STATUS_CONFIG[newStatus].label,
      });
    }
    setStatusUpdating(false);
    setStatusOpen(false);
  };

  const [linkedBlockCount, setLinkedBlockCount] = useState(0);
  const [blockAction, setBlockAction] = useState<"keep" | "delete">("keep");

  // Check for linked schedule_blocks when delete dialog opens
  useEffect(() => {
    if (!deleteConfirmOpen) return;
    supabase
      .from("schedule_blocks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", job.id)
      .is("deleted_at", null)
      .then(({ count }) => setLinkedBlockCount(count || 0));
  }, [deleteConfirmOpen, job.id]);

  const handleSoftDelete = async () => {
    if (!user) return;

    // Handle linked schedule_blocks
    if (linkedBlockCount > 0 && blockAction === "delete") {
      await supabase
        .from("schedule_blocks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("project_id", job.id);
    }
    // Since we soft-delete (not hard delete), we need to manually unlink and restore title
    if (linkedBlockCount > 0 && blockAction === "keep") {
      // Fetch blocks to restore original outlook_subject as title
      const { data: linkedBlocks } = await supabase
        .from("schedule_blocks")
        .select("id, outlook_subject, title")
        .eq("project_id", job.id)
        .is("deleted_at", null);

      if (linkedBlocks && linkedBlocks.length > 0) {
        for (const lb of linkedBlocks) {
          await supabase
            .from("schedule_blocks")
            .update({
              project_id: null,
              match_state: "external",
              match_reason: "Prosjekt slettet – beholdt som ekstern",
              title: lb.outlook_subject || lb.title || "Ekstern blokk",
            } as any)
            .eq("id", lb.id);
        }
      }
    }

    await supabase
      .from("events")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      } as any)
      .eq("id", job.id);
    toast.success("Flyttet til papirkurv", { description: job.title });
    navigate("/projects");
  };

  const handleDuplicate = () => {
    toast.info("Dupliser-funksjon kommer snart");
    setActionsOpen(false);
  };

  const handleArchive = () => {
    toast.info("Arkiver-funksjon kommer snart");
    setActionsOpen(false);
  };

  const allowedStatuses = ALL_STATUSES.filter((s) => canSetStatus(role, s));

  return (
    <>
      {/* ── Fixed bottom bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card safe-area-bottom">
        <div className="flex items-center gap-2 px-3 py-2">
          <Button
            variant="outline"
            className="flex-1 rounded-xl gap-1.5 h-11 text-sm font-medium"
            onClick={() => setStatusOpen(true)}
            disabled={statusUpdating}
          >
            <CircleDot className="h-4 w-4" />
            Status
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-xl gap-1.5 h-11 text-sm font-medium"
            onClick={() => {
              onScrollToEmail();
            }}
          >
            <Mail className="h-4 w-4" />
            E-post
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-xl gap-1.5 h-11 text-sm font-medium"
            onClick={() => setActionsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
            Handlinger
          </Button>
        </div>
      </div>

      {/* ── Status Drawer ── */}
      <Drawer open={statusOpen} onOpenChange={setStatusOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Endre status</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-1">
            {allowedStatuses.map((s) => {
              const config = JOB_STATUS_CONFIG[s];
              const isActive = job.status === s;
              return (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={statusUpdating || isActive}
                  className={`flex items-center justify-between w-full rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${config.dotClass}`}
                    />
                    {config.label}
                  </div>
                  {isActive && (
                    <span className="text-xs text-muted-foreground">
                      Nåværende
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Actions Drawer ── */}
      <Drawer open={actionsOpen} onOpenChange={setActionsOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Handlinger</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-1">
            <button
              onClick={handleDuplicate}
              className="flex items-center justify-between w-full rounded-xl px-4 py-3 text-sm font-medium hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <Copy className="h-4 w-4 text-muted-foreground" />
                Dupliser
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={handleArchive}
              className="flex items-center justify-between w-full rounded-xl px-4 py-3 text-sm font-medium hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <Archive className="h-4 w-4 text-muted-foreground" />
                Arkiver
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>

            <div className="border-t border-border my-2" />

            <button
              onClick={() => {
                setActionsOpen(false);
                setTimeout(() => setDeleteConfirmOpen(true), 300);
              }}
              className="flex items-center justify-between w-full rounded-xl px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="h-4 w-4" />
                Flytt til papirkurv
              </div>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flytte til papirkurv?</AlertDialogTitle>
            <AlertDialogDescription>
              "{job.title}" flyttes til papirkurven og kan gjenopprettes senere.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {linkedBlockCount > 0 && (
            <div className="space-y-2 py-2">
              <p className="text-sm font-medium">
                Dette prosjektet har {linkedBlockCount} planlagte tidsblokk{linkedBlockCount > 1 ? "er" : ""}. Hva skal skje med dem?
              </p>
              <RadioGroup value={blockAction} onValueChange={(v) => setBlockAction(v as "keep" | "delete")} className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="keep" id="keep-blocks" />
                  <Label htmlFor="keep-blocks" className="text-sm">Behold som eksterne blokker</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="delete" id="delete-blocks" />
                  <Label htmlFor="delete-blocks" className="text-sm">Slett blokkene også</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSoftDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Flytt til papirkurv
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
