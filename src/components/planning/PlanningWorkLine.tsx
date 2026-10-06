import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDown, AlertCircle, Plus } from "lucide-react";
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

  const ownerName = user(project.owner_user_id);
  const clientName = company(project.company_id);

  const missing: string[] = [];
  if (!project.company_id) missing.push("Avklar hvem som bestiller jobben (oppdragsgiver)");
  if (!project.customer_id) missing.push("Avklar hvem jobben gjøres for (kunde / sluttkunde)");
  if (!project.owner_user_id) missing.push("Utpek hvem som eier prosjektet");
  if (workPackages.length === 0) missing.push("Beskriv hva som skal gjøres – legg til første arbeidspakke");
  for (const w of workPackages) {
    if (!w.responsible_company_id && !w.external_vendor_name) missing.push(`Hvem skal utføre «${w.name}»?`);
    else if (!w.responsible_person_id) missing.push(`Hvem styrer «${w.name}»?`);
    if (!w.planned_start) missing.push(`Når skal «${w.name}» gjøres?`);
    if (!w.price_form || w.price_form === "unclear") missing.push(`Bli enige om pris for «${w.name}»`);
    const st = staffing?.[w.id];
    if (st?.event_id && st.needed && st.assigned_count < st.needed)
      missing.push(`«${w.name}» mangler ${st.needed - st.assigned_count} ${st.needed - st.assigned_count === 1 ? "person" : "personer"}`);
    else if (!w.linked_event_id && w.resource_count && w.planned_start && w.responsible_company_id)
      missing.push(`Send «${w.name}» til Ressursplan for bemanning`);
  }

  const Fact = ({ k, v, muted }: { k: string; v: React.ReactNode; muted?: boolean }) => (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
      <p className={`truncate text-sm ${muted ? "text-muted-foreground" : "font-medium text-foreground"}`}>{v}</p>
    </div>
  );

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Arbeidslinje</h2>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate(`/planlegging/${project.id}/arbeidspakker/ny`)}>
          <Plus className="h-4 w-4" /> Arbeidspakke
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Oppdragsgiver · bestiller jobben</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{clientName ?? "Ikke avklart"}</p>
          <p className="text-xs text-muted-foreground">{dept(project.department_id) ?? "Internt MCS-firma som initierer arbeidet"}</p>
        </div>
        <div className="rounded-lg border-l-4 border-muted-foreground/40 bg-muted/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kunde / sluttkunde · jobben gjøres for</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{customer ?? "Ikke avklart"}</p>
          <p className="text-xs text-muted-foreground">Den eksterne kunden prosjektet gjelder</p>
        </div>
      </div>
      <Down />
      <Step label="Prosjekt">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{project.name}</p>
          <p className="text-xs text-muted-foreground">{formatPeriod(project.expected_start, project.expected_end, project.period_label)}</p>
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          <Fact k="Prosjekteier" v={ownerName ?? "Ikke avklart"} muted={!ownerName} />
          <Fact
            k="Prisform"
            v={`${contractFormLabel(project.contract_form)}${finance?.contract_value ? ` · ${formatMoney(finance.contract_value)}` : ""}`}
            muted={project.contract_form === "unclear"}
          />
          <Fact k="Fakturerer" v={company(project.invoicing_company_id) ?? "Ikke avklart"} muted={!project.invoicing_company_id} />
          <Fact k="Faktureres til" v={project.invoice_recipient || customer || "Ikke avklart"} muted={!project.invoice_recipient && !customer} />
        </div>
      </Step>
      <Down />
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Arbeidspakker · hvem gjør hva</p>
        {workPackages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Ingen arbeidspakker ennå. Bare navn trengs for å komme i gang.
          </p>
        ) : (
          workPackages.map((w, i) => {
            const p = priceOf(w.id);
            const doer = [company(w.responsible_company_id) ?? w.external_vendor_name, dept(w.responsible_department_id)].filter(Boolean).join(" · ");
            const resp = person(w.responsible_person_id);
            const need = resourceNeedLabel(w.resource_count, w.estimated_hours);
            const price = `${contractFormLabel(w.price_form)}${p?.agreed_price ? ` · ${formatMoney(p.agreed_price)}` : p?.hourly_rate ? ` · ${formatMoney(p.hourly_rate)}/t` : ""}`;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => navigate(`/planlegging/${project.id}/arbeidspakker/${w.id}`)}
                className="w-full rounded-lg border border-border/60 p-3 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{i + 1}. {w.name}</p>
                  <Badge variant="secondary">{wpStatusLabel(w.status)}</Badge>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-5">
                  <Fact k="Utfører" v={doer || "Ikke avklart"} muted={!doer} />
                  <Fact k="Ansvarlig" v={resp ?? "Ikke avklart"} muted={!resp} />
                  <Fact k="Når" v={w.planned_start ? formatPeriod(w.planned_start, w.planned_end, null) : "Ikke avklart"} muted={!w.planned_start} />
                  <Fact k="Ressursbehov" v={need ?? "Ikke satt"} muted={!need} />
                  <Fact k="Prisform" v={price} muted={w.price_form === "unclear"} />
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
