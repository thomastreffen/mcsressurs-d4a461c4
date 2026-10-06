import { useEffect, useState } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";

const sb = supabase as any;

interface NeedItem {
  id: string;
  title: string;
  customer: string | null;
  address: string | null;
  description: string | null;
  internal_number: string | null;
  start_time: string;
  end_time: string;
  department: string | null;
}

/**
 * Ressursbehov sendt fra Planlegging som ennå ikke har personer.
 * Vises over ukematrisen slik at de ikke forsvinner fordi ingen montør er valgt.
 */
export function PlanningNeedsStrip({
  weekStart,
  weekEnd,
  companyId,
  allowedCompanyIds,
  refreshKey,
  onPick,
}: {
  weekStart: Date;
  weekEnd: Date;
  companyId?: string | null;
  allowedCompanyIds?: string[];
  refreshKey?: number;
  onPick: (ev: CalendarEvent) => void;
}) {
  const [items, setItems] = useState<NeedItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let q = sb
        .from("events")
        .select("id, title, customer, address, description, internal_number, start_time, end_time, technician_id, department_id, company_id, event_technicians(id), departments(name)")
        .not("planning_work_package_id", "is", null)
        .is("deleted_at", null)
        .lt("start_time", weekEnd.toISOString())
        .gt("end_time", weekStart.toISOString())
        .order("start_time");
      if (companyId) q = q.eq("company_id", companyId);
      else if (allowedCompanyIds?.length) q = q.in("company_id", allowedCompanyIds);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        console.warn("[PlanningNeedsStrip]", error.message);
        setItems([]);
        return;
      }
      setItems(
        (data ?? [])
          .filter((e: any) => !e.technician_id && (e.event_technicians ?? []).length === 0)
          .map((e: any) => ({ ...e, department: e.departments?.name ?? null })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [weekStart.getTime(), weekEnd.getTime(), companyId, allowedCompanyIds?.join(","), refreshKey]);

  if (items.length === 0) return null;

  return (
    <div className="mb-3 rounded-xl border border-warning/40 bg-warning/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <UsersRound className="h-4 w-4 text-warning" />
        Ubemannede ressursbehov fra Planlegging denne perioden ({items.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() =>
              onPick({
                id: it.id,
                microsoftEventId: "",
                title: it.title || "",
                customer: it.customer || "",
                address: it.address || "",
                description: it.description || "",
                start: new Date(it.start_time),
                end: new Date(it.end_time),
                status: "Planlagt" as any,
                technicianIds: [],
                attendeeStatuses: [],
                technicians: [],
                internalNumber: it.internal_number || null,
              } as CalendarEvent)
            }
            className="rounded-lg border bg-card px-3 py-1.5 text-left text-xs hover:bg-accent"
            title="Åpne for å velge personer"
          >
            <span className="font-medium text-foreground">{it.title}</span>
            <span className="ml-2 text-muted-foreground">
              {format(new Date(it.start_time), "EEE d. MMM", { locale: nb })}
              {it.department ? ` · ${it.department}` : " · Avdeling ikke satt"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
