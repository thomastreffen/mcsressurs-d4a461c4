import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { usePlanningFinance, usePlanningLookups, usePlanningMutations, type PlanningProject, type PlanningWorkPackage } from "@/hooks/usePlanning";
import { CONTRACT_FORMS, contractFormLabel, formatMoney } from "@/lib/planning";

const NONE = "__none__";

export function PlanningEconomy({
  project,
  workPackages,
}: {
  project: PlanningProject;
  workPackages: PlanningWorkPackage[];
}) {
  const { data: lookups } = usePlanningLookups();
  const { updateProject } = usePlanningMutations(project.id);
  const { data: finance, isLoading: financeLoading } = usePlanningFinance(project.id);
  const [draft, setDraft] = useState<Partial<PlanningProject>>({});

  const merged: any = { ...project, ...(finance ?? {}) };
  const v = <K extends keyof PlanningProject>(k: K): any => (draft[k] !== undefined ? draft[k] : merged[k]);
  const num = (s: string) => (s === "" ? null : Number(s));
  const nameOf = (id: string | null) => (id && lookups?.companies.find((c) => c.id === id)?.name) || null;

  const dirty = Object.keys(draft).length > 0;

  const save = async () => {
    try {
      await updateProject.mutateAsync({ id: project.id, patch: draft, logSummary: "Økonomi oppdatert" });
      setDraft({});
      toast.success("Økonomi lagret");
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke lagre");
    }
  };

  if (!financeLoading && !finance) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Du har ikke tilgang til økonomiinformasjon for dette prosjektet.
      </Card>
    );
  }

  const priced = workPackages.map((w) => {
    const f = finance?.work_packages.find((x) => x.id === w.id);
    return { ...w, agreed_price: f?.agreed_price ?? null, hourly_rate: f?.hourly_rate ?? null };
  });
  workPackages = priced;

  const internal = workPackages.filter((w) => w.billing_from_company_id && w.billing_to_company_id);
  const wpFixedSum = workPackages.reduce((s, w) => s + Number(w.agreed_price ?? 0), 0);
  const wpHours = workPackages.reduce((s, w) => s + Number(w.estimated_hours ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Økonomi</h2>
        <p className="text-sm text-muted-foreground">
          Enkel prosjektøkonomi – hovedkontrakt mot kunde og hvordan arbeidspakkene faktureres.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-foreground">Hovedkontrakt</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Kontraktsform</Label>
            <Select value={v("contract_form") ?? "unclear"} onValueChange={(x) => setDraft({ ...draft, contract_form: x })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTRACT_FORMS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fakturerende selskap</Label>
            <Select
              value={v("invoicing_company_id") ?? NONE}
              onValueChange={(x) => setDraft({ ...draft, invoicing_company_id: x === NONE ? null : x })}
            >
              <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Ikke valgt</SelectItem>
                {(lookups?.planCompanies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fakturamottaker</Label>
            <Input
              value={v("invoice_recipient") ?? ""}
              onChange={(e) => setDraft({ ...draft, invoice_recipient: e.target.value })}
              placeholder="Kunde eller annen mottaker"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kontraktsverdi</Label>
            <Input
              type="number"
              value={v("contract_value") ?? ""}
              onChange={(e) => setDraft({ ...draft, contract_value: num(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Budsjettert verdi</Label>
            <Input
              type="number"
              value={v("budget_value") ?? ""}
              onChange={(e) => setDraft({ ...draft, budget_value: num(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Timepris</Label>
            <Input
              type="number"
              value={v("hourly_rate") ?? ""}
              onChange={(e) => setDraft({ ...draft, hourly_rate: num(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Estimerte timer</Label>
            <Input
              type="number"
              value={v("estimated_hours") ?? ""}
              onChange={(e) => setDraft({ ...draft, estimated_hours: num(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Estimerte materialkostnader</Label>
            <Input
              type="number"
              value={v("estimated_material_cost") ?? ""}
              onChange={(e) => setDraft({ ...draft, estimated_material_cost: num(e.target.value) })}
            />
          </div>
        </div>
        {dirty && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft({})}>Forkast</Button>
            <Button onClick={save} disabled={updateProject.isPending}>Lagre</Button>
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-semibold text-foreground">Fakturering per arbeidspakke</h3>
        {workPackages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen arbeidspakker ennå.</p>
        ) : (
          <div className="space-y-2">
            {workPackages.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {nameOf(w.billing_from_company_id) || w.external_vendor_name || "Fakturerende ikke satt"} →{" "}
                    {nameOf(w.billing_to_company_id) || "Mottaker ikke satt"}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{contractFormLabel(w.price_form)}</Badge>
                  <span className="text-muted-foreground">
                    {w.agreed_price ? formatMoney(w.agreed_price) : w.hourly_rate ? `${formatMoney(w.hourly_rate)}/t` : "–"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-3 pt-2 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Hovedkontrakt</p>
            <p className="font-semibold">{formatMoney(finance?.contract_value ?? null)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sum fastpris arbeidspakker</p>
            <p className="font-semibold">{formatMoney(wpFixedSum || null)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sum estimerte timer</p>
            <p className="font-semibold">{wpHours ? `${wpHours} t` : "–"}</p>
          </div>
        </div>
        {internal.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {internal.length} arbeidspakke(r) har intern- eller kryssfakturering registrert.
          </p>
        )}
      </Card>
    </div>
  );
}
