import { communicationLight, evidenceState } from "../../supabase/functions/_shared/communication-policy";
import { invokeWithSession } from "@/lib/invoke-session";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

const REASON_LABEL: Record<string, string> = {
  no_ms_connection: "Mangler Microsoft-kobling",
  no_login_link: "Mangler brukerkobling",
  no_email: "Mangler e-post",
  sender_no_ms_connection: "Avsender mangler Microsoft-kobling",
  graph_conflict: "Kalenderkonflikt",
  graph_error: "Microsoft avviste sendingen",
  graph_forbidden: "Mangler tillatelse hos Microsoft",
  system_sender_unavailable: "Felles postboks utilgjengelig",
  network_error: "Nettverksfeil",
  send_failed: "Sending feilet",
  self_assigned: "Tildelt seg selv",
  in_progress: "Pågår",
  no_calendar_link: "Ingen kalenderkobling – opprettes ikke automatisk",
  pilot_blocked: "Avventer godkjent pilot og Microsoft-rettigheter",
  unknown_graph_outcome: "Ukjent resultat – må avstemmes før nytt forsøk",
  uncertain_operation: "Ukjent tidligere forsøk – må avstemmes",
};

interface Row {
  technician_id: string;
  channel: "calendar" | "email";
  status: "pending" | "sent" | "failed" | "skipped";
  delivery_state?: string | null;
  verification_signal?: string | null;
  reason_code: string | null;
  last_attempt_at: string;
}

export function deliveryLabel(r: Pick<Row, "channel" | "status" | "reason_code" | "delivery_state" | "verification_signal">): string {
  const what = r.channel === "calendar" ? "Kalender" : "E-post";
  const state = evidenceState({ ...r, technician_id: "" });
  if (state === "verified") return `${what}: ${r.verification_signal === "attendee_accepted" ? "deltaker har akseptert" : "kontrollert objekt"}`;
  if (state === "awaiting") return `${what}: avventer bekreftelse`;
  if (state === "not_required") return `${what}: ikke påkrevd`;
  if (r.status === "sent") return `${what} overlevert til Microsoft`;
  if (r.status === "pending") return `${what} pågår`;
  const reason = r.reason_code ? REASON_LABEL[r.reason_code] ?? r.reason_code : null;
  if (r.status === "skipped") return `${what}: ${reason ?? "ikke sendt"}`;
  return `${what} feilet${reason ? ` – ${reason}` : ""}`;
}

export type DeliveryLight = "green" | "yellow" | "red";

/** Aggregate for a task: green only when every assigned technician has every channel sent. */
export function deliveryLight(
  technicianIds: string[],
  rows: (Pick<Row, "technician_id" | "status"> & Partial<Row>)[],
): DeliveryLight {
  return communicationLight(technicianIds, rows);
}

const LIGHT_TEXT: Record<DeliveryLight, string> = {
  green: "Alle påkrevde kanaler har kontrollsignal",
  yellow: "Venter på eller mangler status for noen montører",
  red: "Utsending feilet for én eller flere montører",
};

export function RecipientDeliveryStatus({ eventId, technicians }: {
  eventId: string;
  technicians: { id: string; name: string }[];
}) {
  const [retrying, setRetrying] = useState(false);
  const { data, refetch } = useQuery({
    queryKey: ["recipient-delivery", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_recipient_delivery")
        .select("technician_id, channel, status, reason_code, last_attempt_at, delivery_state, verification_signal")
        .eq("event_id", eventId);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!eventId,
  });
  const { data: queue } = useQuery({
    queryKey: ["m365-queue", eventId],
    queryFn: async () => {
      const result = await supabase.from("m365_communication_queue").select("id,operation,status,reason_code,attempt_count").eq("event_id", eventId);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!eventId,
  });
  if (!data || technicians.length === 0) return null;
  const light = deliveryLight(technicians.map((t) => t.id), data);
  const retry = async () => {
    setRetrying(true);
    try {
      const { data: result, error } = await invokeWithSession("m365-dispatch", { body: { event_id: eventId } });
      if (error || result?.blocked) toast.error("Nytt forsøk er blokkert", { description: "Pilot og Microsoft-rettigheter må være godkjent." });
      else toast.info("Forsøket er behandlet – kontroller kanalstatus");
      await refetch();
    } finally { setRetrying(false); }
  };

  return (
    <div className="space-y-1.5" data-light={light}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Utsending per montør</p>
        {light !== "green" && (
          <Button size="sm" variant="outline" className="min-h-11 text-xs" disabled={retrying} onClick={retry}>
            {retrying ? "Prøver…" : "Prøv igjen"}
          </Button>
        )}
      </div>
      <Badge variant={light === "red" ? "destructive" : light === "yellow" ? "outline" : "secondary"}>{LIGHT_TEXT[light]}</Badge>
      {queue?.filter(item => item.status !== "accepted").map(item => (
        <p key={item.id} className="text-xs text-muted-foreground break-words">
          {item.operation === "delete" ? "Fjerning" : item.operation === "update" ? "Endring" : "Opprettelse"}: {item.status === "uncertain" ? "Ukjent resultat – avstemming kreves" : item.status === "failed" ? "Feilet" : item.status === "processing" ? "Behandles" : "Venter"}
          {item.reason_code ? ` · ${REASON_LABEL[item.reason_code] ?? "Kontroll kreves"}` : ""} · {item.attempt_count} forsøk
        </p>
      ))}
      {technicians.map((t) => {
        const rows = data.filter((r) => r.technician_id === t.id);
        if (rows.length === 0) return (
          <div key={t.id} className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="min-w-0 truncate">{t.name}</span>
            <Badge variant="outline">Ingen utsending registrert</Badge>
          </div>
        );
        return (
          <div key={t.id} className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="min-w-0 truncate">{t.name}</span>
            {rows.map((r) => (
              <Badge key={r.channel} variant={r.status === "failed" ? "destructive" : r.status === "sent" ? "secondary" : "outline"}>
                {deliveryLabel(r)}
              </Badge>
            ))}
          </div>
        );
      })}
    </div>
  );
}
