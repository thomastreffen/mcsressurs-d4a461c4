import { useEffect, useState } from "react";
import { format, getISOWeek } from "date-fns";
import { nb } from "date-fns/locale";
import { ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export interface GlobalNeed {
  eventId: string;
  projectName: string;
  wpName: string;
  start: Date;
  department: string | null;
  needed: number;
  assigned: number;
}

/** Sorterer: ubemannet før delvis bemannet, deretter nærmeste oppstart. Ferdig bemannede fjernes. */
export function prioritizeNeeds(items: GlobalNeed[]): GlobalNeed[] {
  return items
    .filter((n) => n.assigned < n.needed)
    .sort((a, b) => {
      const ua = a.assigned === 0 ? 0 : 1;
      const ub = b.assigned === 0 ? 0 : 1;
      if (ua !== ub) return ua - ub;
      return a.start.getTime() - b.start.getTime();
    });
}

/**
 * Permanent sikkerhetsnett: alle fremtidige ubemannede/delvis bemannede
 * ressursbehov fra Planlegging, uavhengig av valgt uke.
 */
export function PlanningNeedsGlobal({
  companyId,
  allowedCompanyIds,
  refreshKey,
  onPick,
}: {
  companyId?: string | null;
  allowedCompanyIds?: string[];
  refreshKey?: number;
  onPick: (eventId: string, start: Date) => void;
}) {
  const [items, setItems] = useState<GlobalNeed[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let q = sb
        .from("events")
        .select(
          "id, start_time, technician_id, department_id, company_id, event_technicians(id), planning_work_packages!events_planning_work_package_id_fkey(name, resource_count, responsible_department_id, planning_projects(name, deleted_at))",
        )
        .not("planning_work_package_id", "is", null)
        .is("deleted_at", null)
        .gt("end_time", new Date().toISOString())
        .order("start_time")
        .limit(500);
      if (companyId) q = q.eq("company_id", companyId);
      else if (allowedCompanyIds?.length) q = q.in("company_id", allowedCompanyIds);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        console.warn("[PlanningNeedsGlobal]", error.message);
        setItems([]);
        return;
      }
      const rows = (data ?? []).filter((e: any) => e.planning_work_packages && !e.planning_work_packages.planning_projects?.deleted_at);
      const deptIds = [
        ...new Set(rows.map((e: any) => e.planning_work_packages.responsible_department_id || e.department_id).filter(Boolean)),
      ];
      const { data: depts } = deptIds.length
        ? await sb.from("departments").select("id, name").in("id", deptIds)
        : { data: [] };
      if (cancelled) return;
      const dn = new Map((depts ?? []).map((d: any) => [d.id, d.name as string]));
      const mapped: GlobalNeed[] = rows.map((e: any) => {
        const wp = e.planning_work_packages;
        const assigned = Math.max((e.event_technicians ?? []).length, e.technician_id ? 1 : 0);
        return {
          eventId: e.id,
          projectName: wp.planning_projects?.name ?? "Prosjekt",
          wpName: wp.name,
          start: new Date(e.start_time),
          department: (dn.get(wp.responsible_department_id || e.department_id) as string) ?? null,
          needed: Math.max(wp.resource_count ?? 1, 1),
          assigned,
        };
      });
      setItems(prioritizeNeeds(mapped));
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, allowedCompanyIds?.join(","), refreshKey]);

  if (items.length === 0) return null;
  const visible = showAll ? items : items.slice(0, 5);

  return (
    <section className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3" aria-label="Ubemannede behov fra Planlegging">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldAlert className="h-4 w-4 text-destructive" />
        Ubemannede behov fra Planlegging ({items.length})
      </div>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border bg-card">
        {visible.map((n) => {
          const none = n.assigned === 0;
          return (
            <li key={n.eventId}>
              <button
                type="button"
                onClick={() => onPick(n.eventId, n.start)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-accent"
                title="Gå til uken og åpne oppdraget"
              >
                <span className="font-medium text-foreground">{n.projectName}</span>
                <span className="text-muted-foreground">· {n.wpName}</span>
                <span className="text-muted-foreground">
                  · {format(n.start, "dd.MM", { locale: nb })} (uke {getISOWeek(n.start)})
                </span>
                <span className="text-muted-foreground">· {n.department ?? "Avdeling ikke satt"}</span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="font-mono text-xs text-foreground">
                    {n.assigned}/{n.needed} bemannet
                  </span>
                  <span
                    className={
                      none
                        ? "rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive"
                        : "rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning"
                    }
                  >
                    {none ? "Ubemannet" : "Delvis bemannet"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {items.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {showAll ? <>Vis færre <ChevronUp className="h-3.5 w-3.5" /></> : <>Vis alle ({items.length}) <ChevronDown className="h-3.5 w-3.5" /></>}
        </button>
      )}
    </section>
  );
}
