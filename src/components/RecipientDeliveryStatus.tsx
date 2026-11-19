import { communicationLight, evidenceState } from "../../supabase/functions/_shared/communication-policy";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CENTRAL_WAITING, projectQueue } from "@/lib/job-calendar-presentation";

const REASON_LABEL: Record<string, string> = {
  no_ms_connection: "Montøren har ikke egen Microsoft-kobling, og sentral kalender er ikke aktivert for denne dagen",
  central_app_pending: "Venter på sentral kalender (krever administratorgodkjenning)",
  central_partial_target_blocked: "Stoppet: sentral kalender er bare godkjent for noen av dagene",
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
  missing_calendar_days: "Mangler kalenderdager – se Kalenderdekning per dag",
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
  if (r.reason_code === "unknown_graph_outcome") return `${what}: ukjent resultat – avstemming kreves`;
  const state = evidenceState({ ...r, technician_id: "" });
  if (state === "verified") return `${what}: ${r.verification_signal === "attendee_accepted" ? "deltaker har akseptert" : "kontrollert objekt"}`;
  if (state === "awaiting") return `${what}: avventer bekreftelse`;
  if (state === "not_required") return `${what}: ikke påkrevd`;
  if (r.status === "sent") return `${what} overlevert til Microsoft`;
  if (r.status === "pending" && r.reason_code === "missing_calendar_days") return `${what}: ${REASON_LABEL.missing_calendar_days}`;
  if (r.status === "pending") return `${what} pågår`;
  const reason = r.reason_code ? REASON_LABEL[r.reason_code] ?? r.reason_code : null;
  if (r.status === "skipped") return `${what}: ${reason ?? "ikke sendt"}`;
  return `${what} feilet${reason ? ` – ${reason}` : ""}`;
}

/**
 * Intent rows in m365_communication_queue belong to the central Microsoft calendar app,
 * which is OFF until pilot approval. An untouched intent is dormant – never "pending work".
 */
export function queueLine(
  item: { operation: string; status: string; reason_code: string | null; attempt_count: number },
  techName?: string,
): string {
  if (!techName) return `Køhistorikk uten aktiv mottaker · ${item.attempt_count} forsøk · krever avstemming`;
  const who = techName;
  const op = item.operation === "delete" ? "fjerning" : item.operation === "update" ? "endring" : "opprettelse";
  if (item.status === "pending" && item.attempt_count === 0) {
    return `${who} · ${CENTRAL_WAITING}`;
  }
  const state = item.status === "uncertain" ? "Ukjent resultat – avstemming kreves" : item.status === "failed" ? "Feilet" : item.status === "processing" ? "Behandles" : "Venter";
  const reason = item.reason_code ? ` · ${REASON_LABEL[item.reason_code] ?? "Kontroll kreves"}` : "";
  return `${who} · Sentral Microsoft-kalender (${op}): ${state}${reason} · ${item.attempt_count} forsøk`;
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
  red: "Registrert kanalfeil – se historikk per montør",
};

export function RecipientDeliveryStatus({ eventId, technicians }: {
  eventId: string;
  technicians: { id: string; name: string }[];
}) {
  const { isSuperAdmin } = useAuth();
  const { data } = useQuery({
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
      const result = await supabase.from("m365_communication_queue").select("id,technician_id,operation,status,reason_code,attempt_count,updated_at").eq("event_id", eventId);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!eventId,
  });
  if (!data || technicians.length === 0) return null;
  const projection = projectQueue(queue ?? [], technicians.map(t => t.id));
  const historical = (r: Row) => r.channel === "calendar" && r.status === "failed" && r.reason_code === "no_ms_connection";
  const light = deliveryLight(technicians.map((t) => t.id), data.filter(r => !historical(r)));
  const dormantIds = new Set(projection.dormant.map(i => i.technician_id));
  const attempted = projection.current.filter(i => !projection.dormant.includes(i));
  const actualQueueFailure = attempted.some(i => i.status === "failed" || i.status === "uncertain");
  const displayLight = actualQueueFailure ? "red" : light;
  const fmtAttempt = (date: string) => Number.isNaN(Date.parse(date)) ? "Tidspunkt ikke registrert" : new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date));

  return (
    <div className="space-y-1.5 min-w-0" data-light={displayLight}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Utsending per montør</p>
      </div>
      <Badge className="whitespace-normal" variant={displayLight === "red" ? "destructive" : displayLight === "yellow" ? "outline" : "secondary"}>{LIGHT_TEXT[displayLight]}</Badge>
      {projection.dormant.length > 0 && <div className="space-y-1 text-xs text-muted-foreground">
        <p>{CENTRAL_WAITING}</p>
        <p>{technicians.filter(t => dormantIds.has(t.id)).map(t => t.name).join(", ")}</p>
        {isSuperAdmin ? <Button asChild size="sm" variant="link" className="min-h-11 h-auto p-0 text-xs"><Link to="/admin/microsoft">Se Microsoft-pilotstatus</Link></Button> : <p>Systemadministrator må avklare pilot og Microsoft-rettigheter.</p>}
      </div>}
      {attempted.map(item => (
        <p key={item.id} className="text-xs text-muted-foreground break-words">
          {queueLine(item, technicians.find((t) => t.id === item.technician_id)?.name)}
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
            {!rows.some(r => r.channel === "email") && <Badge variant="outline">E-post: ingen utsending registrert – ukjent historikk</Badge>}
            {rows.map((r) => (
              <span key={r.channel} className="min-w-0">
                <Badge className="whitespace-normal" variant={historical(r) ? "outline" : r.status === "failed" ? "destructive" : r.status === "sent" ? "secondary" : "outline"}>
                  {historical(r) ? "Tidligere personlig kalenderforsøk feilet – manglet Microsoft-kobling" : deliveryLabel(r)}
                </Badge>
                <span className="block text-xs text-muted-foreground">{fmtAttempt(r.last_attempt_at)}{r.channel === "email" && r.status === "sent" ? " · Akseptert, ikke bekreftet levert" : ""}</span>
              </span>
            ))}
          </div>
        );
      })}
      {projection.audit.length > 0 && <details className="text-xs text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-3">Køhistorikk som krever avstemming ({projection.audit.length})</summary>
        {projection.audit.map((item, i) => <p key={item.id ?? i} className="break-words py-1">
          {item.operation === "delete" ? "Fjerningsintensjon" : "Endringsintensjon"} uten aktiv mottaker i denne jobben · {item.attempt_count} forsøk · {item.status === "pending" && item.attempt_count === 0 ? "Ingen utsending forsøkt" : "Tidligere resultat må avstemmes"} · {item.updated_at ? fmtAttempt(item.updated_at) : ""}. Beholdt i historikk; ingen automatisk handling.
        </p>)}
      </details>}
    </div>
  );
}
