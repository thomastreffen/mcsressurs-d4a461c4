import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowRight, AlertCircle, Plus } from "lucide-react";
import {
  usePlanningAssignees,
  usePlanningFinance,
  usePlanningLookups,
  usePlanningStaffing,
  type PlanningProject,
  type PlanningWorkPackage,
} from "@/hooks/usePlanning";
import { contractFormLabel, formatMoney, formatPeriod, resourceNeedLabel, wpStatusLabel } from "@/lib/planning";
import { WorkPackageStaffing } from "./WorkPackageStaffing";

function Step({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

const Down = () => (
  <div className="flex justify-center py-1 text-muted-foreground">
    <ArrowDown className="h-4 w-4" />
  </div>
);

/** Arbeidslinjen: oppdragsgiver → prosjekt → arbeidspakker, med ansvar, folk, tid, pris og status. */
export function PlanningWorkLine({ project, workPackages }: { project: PlanningProject; workPackages: PlanningWorkPackage[] }) {
  const navigate = useNavigate();
  const { data: lookups } = usePlanningLookups();
  const { data: staffing } = usePlanningStaffing(project.id);
  const { data: assignees } = usePlanningAssignees(project.id);
  const { data: finance } = usePlanningFinance(project.id);

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null | undefined) =>
    (id && list?.find((x) => x.id === id)?.name) || null;
  const company = (id: string | null | undefined) => nameOf(lookups?.companies, id);
  const dept = (id: string | null | undefined) => nameOf(lookups?.departments as any, id);
  const person = (id: string | null | undefined) => nameOf(lookups?.people as any, id);
  const user = (id: string | null | undefined) => (id && lookups?.users.find((u) => u.user_id === id)?.name) || null;
  const customer = nameOf(lookups?.customers, project.customer_id);
  const priceOf = (id: string) => finance?.work_packages.find((x) => x.id === id);

  const missing: string[] = [];
  if (!project.company_id) missing.push("Oppdragsgiver er ikke satt");
  if (!project.customer_id) missing.push("Kunde / sluttkunde er ikke satt");
  if (!project.owner_user_id) missing.push("Overordnet prosjekteier er ikke satt");
  if (workPackages.length === 0) missing.push("Ingen arbeidspakker – hva skal gjøres?");
  for (const w of workPackages) {
    if (!w.responsible_company_id && !w.external_vendor_name) missing.push(`${w.name}: utførende firma mangler`);
    if (!w.responsible_person_id) missing.push(`${w.name}: arbeidspakkeansvarlig mangler`);
    if (!w.planned_start) missing.push(`${w.name}: dato mangler`);
    if (!w.price_form || w.price_form === "unclear") missing.push(`${w.name}: prisform ikke avklart`);
    const st = staffing?.[w.id];
    if (st?.event_id && st.needed && st.assigned_count < st.needed) missing.push(`${w.name}: ${st.needed - st.assigned_count} person(er) mangler`);
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Arbeidslinje</h2>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate(`/planlegging/${project.id}/arbeidspakker/ny`)}>
          <Plus className="h-4 w-4" /> Arbeidspakke
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Step label="Oppdragsgiver">
          <p className="text-sm font-medium text-foreground">{company(project.company_id) ?? "Ikke satt"}</p>
          {dept(project.department_id) && <p className="text-xs text-muted-foreground">{dept(project.department_id)}</p>}
        </Step>
        <Step label="Kunde / sluttkunde">
          <p className="text-sm font-medium text-foreground">{customer ?? "Ikke satt"}</p>
        </Step>
      </div>
      <Down />
      <Step label="Prosjekt">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{project.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatPeriod(project.expected_start, project.expected_end, project.period_label)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Eier: {user(project.owner_user_id) ?? "ikke satt"} · {contractFormLabel(project.contract_form)}
          {finance?.contract_value ? ` ${formatMoney(finance.contract_value)}` : ""}
          {" · "}
          {company(project.invoicing_company_id) ?? "Fakturerer ikke satt"}
          <ArrowRight className="mx-1 inline h-3 w-3" />
          {project.invoice_recipient || customer || "Kunde"}
        </p>
      </Step>
      <Down />
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Arbeidspakker</p>
        {workPackages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Ingen arbeidspakker ennå.
          </p>
        ) : (
          workPackages.map((w, i) => {
            const p = priceOf(w.id);
            const need = resourceNeedLabel(w.resource_count, w.estimated_hours);
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => navigate(`/planlegging/${project.id}/arbeidspakker/${w.id}`)}
                className="w-full rounded-lg border border-border/60 p-3 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {i + 1}. {w.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[company(w.responsible_company_id) ?? w.external_vendor_name, dept(w.responsible_department_id)].filter(Boolean).join(" · ") ||
                        "Utførende ikke satt"}
                      {" · "}Ansvarlig: {person(w.responsible_person_id) ?? "ikke satt"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[need, formatPeriod(w.planned_start, w.planned_end, null)].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {company(w.billing_from_company_id) ?? w.external_vendor_name ?? "?"}
                      <ArrowRight className="mx-1 inline h-3 w-3" />
                      {company(w.billing_to_company_id) ?? "?"} · {contractFormLabel(w.price_form)}
                      {p?.agreed_price ? ` ${formatMoney(p.agreed_price)}` : p?.hourly_rate ? ` ${formatMoney(p.hourly_rate)}/t` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary">{wpStatusLabel(w.status)}</Badge>
                </div>
                <div className="mt-2">
                  <WorkPackageStaffing assignmentState={w.assignment_state} staffing={staffing?.[w.id]} assignees={assignees?.[w.id]} compact />
                </div>
              </button>
            );
          })
        )}
      </div>

      {missing.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <AlertCircle className="h-3.5 w-3.5 text-warning" /> Mangler avklaring ({missing.length})
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            {missing.slice(0, 8).map((m) => <li key={m}>• {m}</li>)}
            {missing.length > 8 && <li>… og {missing.length - 8} til</li>}
          </ul>
        </div>
      )}
    </Card>
  );
}
