import { invokeWithSession } from "@/lib/invoke-session";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GraphConflict {
  eventId: string;
  graphVersion: {
    start: string;
    end: string;
    subject: string;
  } | null;
}

/**
 * Hook for syncing internal events to Microsoft Graph (Outlook).
 * Returns fire-and-forget helpers that show toasts on failure.
 */
export function useCalendarSync() {
  const [conflict, setConflict] = useState<GraphConflict | null>(null);

  const syncCreate = useCallback(async (eventId: string) => {
    try {
      const { data, error } = await invokeWithSession("calendar-write-sync", {
        body: { action: "create", event_id: eventId },
      });
      if (error) {
        console.error("[CalendarSync] create invoke error:", error);
        return;
      }
      if (data?.deliveryStatus === "partial" || data?.deliveryStatus === "failed") {
        // Lav varselstøy: jobben er lagret, og status per montør ligger vedvarende
        // i jobbkortet (Utsending per montør). Ingen oransje alarm per ny jobb.
        toast.info("Jobben er lagret – se Outlook-status per montør i jobbkortet");
      } else if (data?.status === "created") {
        console.log("[CalendarSync] Outlook event created:", data.graph_event_id);
      } else if (data?.status === "no_token") {
        toast.error("Oppgaven er lagret, men Outlook mangler Microsoft-kobling");
      } else if (data?.status === "error") {
        console.error("[CalendarSync] create error:", data.code, data.detail);
        toast.error("Oppdraget ble lagret, men kalendersynk feilet", {
          description: `Feilkode ${data.code}. Du kan prøve på nytt.`,
          action: {
            label: "Prøv igjen",
            onClick: () => syncCreate(eventId),
          },
        });
      }
    } catch (err) {
      console.error("[CalendarSync] create exception:", err);
    }
  }, []);

  const syncUpdate = useCallback(async (
    eventId: string,
    opts?: { silent?: boolean; updateOnly?: boolean },
  ): Promise<"synced" | "conflict" | "error" | "no_token" | "no_link" | "missing_days" | "unknown"> => {
    try {
      const { data, error } = await invokeWithSession("calendar-write-sync", {
        body: { action: "update", event_id: eventId, ...(opts?.updateOnly ? { update_only: true } : {}) },
      });
      if (error) {
        console.error("[CalendarSync] update invoke error:", error);
        return "error";
      }
      // «Oppdater Outlook» oppretter aldri nye dager. Manglende dager må opprettes
      // eksplisitt via «Opprett manglende kalenderdager».
      const hasMissingDays = Array.isArray(data?.results) && data.results.some((r: any) => r?.status === "missing_days");
      if (opts?.updateOnly && hasMissingDays) return "missing_days";
      if (data?.deliveryStatus === "partial" || data?.deliveryStatus === "failed") {
        // Ved eksplisitt «Oppdater Outlook» (silent) vises status per mottaker
        // i mottakerlisten – ingen gjentatt oransje samlevarsel.
        if (!opts?.silent) toast.error("Outlook er ikke oppdatert for alle montører");
        return "error";
      }
      if (data?.status === "no_link") {
        return "no_link";
      }
      if (data?.status === "updated" || data?.status === "created") {
        console.log("[CalendarSync] Outlook synced");
        return "synced";
      } else if (data?.status === "conflict") {
        setConflict({
          eventId,
          graphVersion: data.graph_version || null,
        });
        toast.warning("Outlook-konflikt oppdaget", {
          description: "Hendelsen har blitt endret i Outlook. Velg hvilken versjon du vil beholde.",
          duration: 8000,
        });
        return "conflict";
      } else if (data?.status === "no_token") {
        return "no_token";
      } else if (data?.status === "error") {
        toast.error("Outlook ble ikke oppdatert", {
          description: `Feilkode ${data.code}`,
        });
        return "error";
      }
      return "unknown";
    } catch (err) {
      console.error("[CalendarSync] update exception:", err);
      return "error";
    }
  }, []);

  const syncDelete = useCallback(async (eventId: string): Promise<"deleted" | "not_found" | "error" | "no_token" | "unknown"> => {
    try {
      const { data, error } = await invokeWithSession("calendar-write-sync", {
        body: { action: "delete", event_id: eventId },
      });
      if (error) {
        console.error("[CalendarSync] delete invoke error:", error);
        return "error";
      }
      if (data?.status === "deleted") {
        return "deleted";
      }
      if (data?.status === "not_found") {
        toast.warning("Outlook-hendelsen kunne ikke bekreftes slettet", {
          description: "Oppgaven ble fjernet fra planen, men Outlook-koblingen må kanskje ryddes opp manuelt.",
        });
        return "not_found";
      }
      if (data?.status === "no_token") {
        return "no_token";
      }
      if (data?.status === "error") {
        toast.error("Outlook-event ble ikke slettet", {
          description: `Feilkode ${data.code}`,
        });
        return "error";
      }
      return "unknown";
    } catch (err) {
      console.error("[CalendarSync] delete exception:", err);
      return "error";
    }
  }, []);

  /**
   * Eksplisitt «Opprett manglende kalenderdager»: oppretter KUN dager uten Outlook-hendelse
   * (idempotent nøkkel per jobb/montør/dag). Ingen e-post, ingen Hub-varsel om oppdrag,
   * ingen endring/sletting av eksisterende hendelser. Returnerer kvittering per dag.
   */
  const createMissingDays = useCallback(async (eventId: string): Promise<{
    ok: boolean;
    results: { techId: string; techName: string; status: string; dayResults?: { workDate: string; state: string; error?: string; outcome?: string }[] }[];
  }> => {
    try {
      const { data, error } = await invokeWithSession("calendar-write-sync", {
        body: { action: "create_missing_days", event_id: eventId },
      });
      if (error) return { ok: false, results: [] };
      return { ok: true, results: Array.isArray(data?.results) ? data.results : [] };
    } catch (err) {
      console.error("[CalendarSync] create_missing_days exception:", err);
      return { ok: false, results: [] };
    }
  }, []);

  const forceUpdate = useCallback(async (eventId: string) => {
    try {
      const { data, error } = await invokeWithSession("calendar-write-sync", {
        body: { action: "force_update", event_id: eventId },
      });
      if (error) {
        console.error("[CalendarSync] force_update invoke error:", error);
        return;
      }
      if (data?.status === "force_updated") {
        toast.success("Konflikt løst. Valgt: Systemtid ✓", {
          description: "Outlook er oppdatert med systemets tidspunkt.",
        });
        // Audit log
        await supabase.from("event_logs").insert({
          event_id: eventId,
          action_type: "conflict_resolved",
          change_summary: "Konflikt løst: Systemtid valgt (force_update)",
        });
        setConflict(null);
      } else if (data?.status === "error") {
        toast.error("Kunne ikke tvinge Outlook-oppdatering");
      }
    } catch (err) {
      console.error("[CalendarSync] force_update exception:", err);
    }
  }, []);

  const acceptGraphVersion = useCallback(async (eventId: string, graphStart: string, graphEnd: string) => {
    try {
      await supabase.from("events").update({
        start_time: new Date(graphStart).toISOString(),
        end_time: new Date(graphEnd).toISOString(),
      }).eq("id", eventId);

      toast.success("Konflikt løst. Valgt: Outlook-tid ✓", {
        description: "Databasen er oppdatert med Outlook-tidspunktet.",
      });
      // Audit log
      await supabase.from("event_logs").insert({
        event_id: eventId,
        action_type: "conflict_resolved",
        change_summary: `Konflikt løst: Outlook-tid valgt (${graphStart} – ${graphEnd})`,
      });
      setConflict(null);
    } catch (err) {
      console.error("[CalendarSync] acceptGraph exception:", err);
      toast.error("Kunne ikke oppdatere med Outlook-tid");
    }
  }, []);

  const dismissConflict = useCallback(() => setConflict(null), []);

  return {
    syncCreate,
    syncUpdate,
    syncDelete,
    createMissingDays,
    forceUpdate,
    acceptGraphVersion,
    conflict,
    dismissConflict,
  };
}
