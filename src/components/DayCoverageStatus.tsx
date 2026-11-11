import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarPlus } from "lucide-react";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { buildMissingDaysReceipt, type ReceiptLine } from "@/lib/day-calendar-receipt";
import {
  buildPerDayPlan, dayDeliveryState, aggregateDayCoverage,
  DAY_STATE_LABELS, DAY_COVERAGE_LABELS,
  type DayLinkRow, type DayDeliveryState,
} from "../../supabase/functions/_shared/multi-day-calendar";

const DAY_DATE_FMT = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short",
});
const WORK_DATE_FMT = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "UTC", weekday: "short", day: "numeric", month: "short",
});

function badgeVariant(state: DayDeliveryState): "secondary" | "outline" | "destructive" {
  if (state === "synket") return "secondary";
  if (state === "feilet") return "destructive";
  return "outline";
}

/**
 * Per-day Outlook coverage for multi-day jobs: one chip per (technician × workday)
 * with state I Hub / Venter på Outlook / Synket / Feilet, plus an aggregate badge.
 * Explicit "Opprett manglende kalenderdager" creates only missing days (no e-mail,
 * no change to existing events) and shows a per-day receipt.
 * Renders nothing for single-day jobs (no schedule blocks).
 */
export function DayCoverageStatus({ eventId, technicians, canCreateMissing = true }: {
  eventId: string;
  technicians: { id: string; name: string }[];
  canCreateMissing?: boolean;
}) {
  const queryClient = useQueryClient();
  const { createMissingDays } = useCalendarSync();
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptLine[] | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);

  const { data: blocks } = useQuery({
    queryKey: ["day-coverage-blocks", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_blocks")
        .select("technician_id,start_at,end_at")
        .eq("project_id", eventId)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });
  const { data: links } = useQuery({
    queryKey: ["day-coverage-links", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_calendar_day_links")
        .select("technician_id,work_date,start_at,end_at,outlook_event_id,status,last_error")
        .eq("event_id", eventId);
      if (error) throw error;
      return (data ?? []) as DayLinkRow[];
    },
    enabled: !!eventId,
  });

  if (!blocks || blocks.length === 0) return null;

  const plan = buildPerDayPlan(eventId, blocks);
  if (plan.length === 0) return null;

  const linkByKey = new Map((links ?? []).map((l) => [`${l.technician_id}|${l.work_date}`, l]));
  const states = plan.map((item) => dayDeliveryState(item, linkByKey.get(`${item.technicianId}|${item.workDate}`)));
  const coverage = aggregateDayCoverage(states);
  const techName = (id: string) => technicians.find((t) => t.id === id)?.name ?? "Montør";
  const missingCount = states.filter((s) => s === "i_hub" || s === "feilet").length;

  const run = async () => {
    if (running) return; // double-click guard (server is idempotent too)
    setRunning(true);
    setRequestFailed(false);
    try {
      const res = await createMissingDays(eventId);
      if (!res.ok) setRequestFailed(true);
      setReceipt(buildMissingDaysReceipt(res.results));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["day-coverage-links", eventId] }),
        queryClient.invalidateQueries({ queryKey: ["recipient-delivery", eventId] }),
      ]);
    } finally {
      setRunning(false);
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-1.5" data-testid="day-coverage" data-coverage={coverage}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Kalenderdekning per dag</p>
        <Badge variant={coverage === "full" ? "secondary" : coverage === "delvis" ? "outline" : "destructive"}>
          {DAY_COVERAGE_LABELS[coverage]}
        </Badge>
      </div>
      {plan.map((item, i) => {
        const state = states[i];
        const link = linkByKey.get(`${item.technicianId}|${item.workDate}`);
        return (
          <div key={item.operationKey} className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="min-w-0 truncate">{techName(item.technicianId)}</span>
            <span className="text-muted-foreground">{DAY_DATE_FMT.format(new Date(item.startAt))}</span>
            <Badge variant={badgeVariant(state)} title={link?.last_error ?? undefined}>
              {DAY_STATE_LABELS[state]}
            </Badge>
          </div>
        );
      })}
      {coverage !== "full" && (
        <p className="text-xs text-muted-foreground">
          Hub og Min dag er alltid riktig kilde. «Oppdater Outlook» endrer bare eksisterende dager – manglende dager må opprettes eksplisitt.
        </p>
      )}

      {missingCount > 0 && !confirming && (
        <Button
          variant="outline" size="sm" className="w-full min-h-11 text-xs gap-1.5"
          disabled={!canCreateMissing || running}
          onClick={() => { setReceipt(null); setConfirming(true); }}
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Opprett manglende kalenderdager ({missingCount})
        </Button>
      )}
      {confirming && (
        <div className="rounded-md border border-border bg-muted/40 p-2.5 space-y-2" role="group" aria-label="Bekreft oppretting av manglende kalenderdager">
          <p className="text-xs">
            Oppretter kun {missingCount} manglende dag(er) i montørenes egen Outlook-kalender. Ingen e-post, ingen nytt oppdragsvarsel,
            og eksisterende hendelser endres ikke. Montører uten Microsoft-kobling får ingen kalenderdag.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="min-h-11 flex-1 text-xs gap-1.5" disabled={running} onClick={run}>
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {running ? "Oppretter…" : "Bekreft"}
            </Button>
            <Button size="sm" variant="ghost" className="min-h-11 flex-1 text-xs" disabled={running} onClick={() => setConfirming(false)}>
              Avbryt
            </Button>
          </div>
        </div>
      )}
      {receipt && (
        <div className="rounded-md border border-border p-2.5 space-y-1" data-testid="day-receipt">
          <p className="text-xs font-medium">Kvittering per dag</p>
          {requestFailed && <p className="text-xs text-destructive">Forespørselen feilet – ingen dager er bekreftet.</p>}
          {receipt.length === 0 && !requestFailed && <p className="text-xs text-muted-foreground">Ingen dager å opprette.</p>}
          {receipt.map((l, i) => (
            <p key={i} className={`text-xs break-words ${l.tone === "fail" ? "text-destructive" : l.tone === "ok" ? "" : "text-muted-foreground"}`}>
              {l.techName}{l.workDate ? ` · ${WORK_DATE_FMT.format(new Date(`${l.workDate}T12:00:00Z`))}` : ""}: {l.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
