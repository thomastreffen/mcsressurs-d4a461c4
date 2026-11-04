import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

const REASON_LABEL: Record<string, string> = {
  no_ms_connection: "Mangler Microsoft-kobling",
  no_login_link: "Mangler brukerkobling",
  no_email: "Mangler e-post",
  sender_no_ms_connection: "Avsender mangler Microsoft-kobling",
  graph_conflict: "Kalenderkonflikt",
  graph_error: "Microsoft avviste sendingen",
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
  if (r.status === "sent") return `${what} sendt`;
  if (r.status === "pending") return `${what} pågår`;
  const reason = r.reason_code ? REASON_LABEL[r.reason_code] ?? r.reason_code : null;
  if (r.status === "skipped") return `${what}: ${reason ?? "ikke sendt"}`;
  return `${what} feilet${reason ? ` – ${reason}` : ""}`;
}

export function RecipientDeliveryStatus({ eventId, technicians }: {
  eventId: string;
  technicians: { id: string; name: string }[];
}) {
  const { data } = useQuery({
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
  if (!data || data.length === 0 || technicians.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Utsending per montør</p>
      {technicians.map((t) => {
        const rows = data.filter((r) => r.technician_id === t.id);
        if (rows.length === 0) return null;
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
