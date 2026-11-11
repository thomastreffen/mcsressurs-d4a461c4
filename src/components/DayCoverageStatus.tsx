import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  buildPerDayPlan, dayDeliveryState, aggregateDayCoverage,
  DAY_STATE_LABELS, DAY_COVERAGE_LABELS,
  type DayLinkRow, type DayDeliveryState,
} from "../../supabase/functions/_shared/multi-day-calendar";

const DAY_DATE_FMT = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short",
});

function badgeVariant(state: DayDeliveryState): "secondary" | "outline" | "destructive" {
  if (state === "synket") return "secondary";
  if (state === "feilet") return "destructive";
  return "outline";
}

/**
 * Per-day Outlook coverage for multi-day jobs: one chip per (technician × workday)
 * with state I Hub / Venter på Outlook / Synket / Feilet, plus an aggregate badge.
 * Renders nothing for single-day jobs (no schedule blocks).
 */
export function DayCoverageStatus({ eventId, technicians }: {
  eventId: string;
  technicians: { id: string; name: string }[];
}) {
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
          Hub og Min dag er alltid riktig kilde. Outlook-hendelser opprettes per dag når montøren har gyldig Microsoft-kobling.
        </p>
      )}
    </div>
  );
}
