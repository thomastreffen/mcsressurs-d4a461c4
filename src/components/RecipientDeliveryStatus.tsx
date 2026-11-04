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
};

interface Row {
  technician_id: string;
  channel: "calendar" | "email";
  status: "pending" | "sent" | "failed" | "skipped";
  reason_code: string | null;
  last_attempt_at: string;
}

export function deliveryLabel(r: Pick<Row, "channel" | "status" | "reason_code">): string {
  const what = r.channel === "calendar" ? "Kalender" : "E-post";
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
  rows: Pick<Row, "technician_id" | "status">[],
): DeliveryLight {
  if (technicianIds.length === 0) return "green";
  let anyFailed = false, anyOpen = false;
  for (const id of technicianIds) {
    const mine = rows.filter((r) => r.technician_id === id);
    if (mine.length === 0) { anyOpen = true; continue; }
    if (mine.some((r) => r.status === "failed" || r.status === "skipped")) anyFailed = true;
    else if (mine.some((r) => r.status !== "sent")) anyOpen = true;
  }
  return anyFailed ? "red" : anyOpen ? "yellow" : "green";
}

const LIGHT_TEXT: Record<DeliveryLight, string> = {
  green: "Alle montører har fått avtalen",
  yellow: "Venter på eller mangler status for noen montører",
  red: "Noen montører har IKKE fått avtalen",
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
        .select("technician_id, channel, status, reason_code, last_attempt_at")
        .eq("event_id", eventId);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!eventId,
  });
  if (!data || technicians.length === 0) return null;
  const light = deliveryLight(technicians.map((t) => t.id), data);
  const retry = async () => {
    setRetrying(true);
    const { error } = await supabase.functions.invoke("calendar-write-sync", { body: { event_id: eventId, action: "create" } });
    setRetrying(false);
    if (error) toast.error("Nytt forsøk feilet"); else toast.success("Nytt forsøk fullført");
    refetch();
  };

  return (
    <div className="space-y-1.5" data-light={light}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Utsending per montør</p>
        {light !== "green" && (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={retrying} onClick={retry}>
            {retrying ? "Prøver…" : "Prøv igjen"}
          </Button>
        )}
      </div>
      <Badge variant={light === "red" ? "destructive" : light === "yellow" ? "outline" : "secondary"}>{LIGHT_TEXT[light]}</Badge>
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
