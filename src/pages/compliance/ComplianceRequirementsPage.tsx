import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { Plus, Pencil, X, Users2, Briefcase, ChevronDown } from "lucide-react";
import { useCompetenceTypes, useComplianceEmployees } from "@/hooks/useCompliance";
import {
  useCompetenceRequirements, useRequirementImpact, useRequirementMutations,
  useJobRoles, useJobRoleMutations,
  type CompetenceRequirement, type RequirementScope,
} from "@/hooks/useComplianceRequirements";
import { REQUIREMENT_SCOPES, formatDate } from "@/lib/compliance";

export default function ComplianceRequirementsPage() {
  const types = useCompetenceTypes();
  const employees = useComplianceEmployees();
  const jobRoles = useJobRoles(true);
  const requirements = useCompetenceRequirements(true);
  const impact = useRequirementImpact();
  const { setActive } = useRequirementMutations();

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showRoles, setShowRoles] = useState(false);

  const [scopeFilter, setScopeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);

  const typeList = types.data ?? [];
  const typeById = useMemo(() => new Map(typeList.map((t) => [t.id, t])), [typeList]);

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees.data ?? []) if (e.department_id && e.department_name) map.set(e.department_id, e.department_name);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [employees.data]);

  const scopeName = (r: CompetenceRequirement) => {
    if (r.scope_type === "company") return "Hele virksomheten";
    if (r.scope_type === "department") return departments.find((d) => d.id === r.scope_id)?.name ?? "Avdeling";
    if (r.scope_type === "role") return (jobRoles.data ?? []).find((x) => x.id === r.scope_id)?.name ?? "Stilling";
    return (employees.data ?? []).find((p) => p.person_id === r.scope_id)?.full_name ?? "Person";
  };

  const rows = useMemo(() => {
    return (requirements.data ?? [])
      .filter((r) => (showInactive ? true : r.active))
      .filter((r) => (scopeFilter === "all" ? true : r.scope_type === scopeFilter))
      .filter((r) => (typeFilter === "all" ? true : r.competence_type_id === typeFilter))
      .filter((r) => (deptFilter === "all" ? true : r.scope_type === "department" && r.scope_id === deptFilter))
      .filter((r) => (roleFilter === "all" ? true : r.scope_type === "role" && r.scope_id === roleFilter))
      .sort((a, b) => {
        const order: Record<string, number> = { company: 0, department: 1, role: 2, person: 3 };
        if (order[a.scope_type] !== order[b.scope_type]) return order[a.scope_type] - order[b.scope_type];
        const an = typeById.get(a.competence_type_id)?.name ?? "";
        const bn = typeById.get(b.competence_type_id)?.name ?? "";
        return an.localeCompare(bn, "nb");
      });
  }, [requirements.data, showInactive, scopeFilter, typeFilter, deptFilter, roleFilter, typeById]);

  const loading = types.isLoading || requirements.isLoading || employees.isLoading;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Kompetansekrav</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Bestem hvilken kompetanse som er påkrevd – for hele virksomheten, en avdeling, en stilling eller en
            enkeltperson. Et mer spesifikt krav overstyrer et mer generelt: person går foran stilling, stilling foran
            avdeling, avdeling foran virksomhet.
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => { setCreating(true); setEditingId(null); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nytt krav
          </Button>
        )}
      </div>

      {creating && (
        <RequirementForm
          requirement={null}
          typeList={typeList}
          departments={departments}
          jobRoles={jobRoles.data ?? []}
          people={(employees.data ?? []).map((e) => ({ id: e.person_id, name: e.full_name }))}
          onClose={() => setCreating(false)}
        />
      )}

      {/* Stillinger */}
      <Card>
        <CardContent className="p-3">
          <button
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowRoles((v) => !v)}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Briefcase className="h-4 w-4 text-muted-foreground" /> Stillinger ({(jobRoles.data ?? []).filter((r) => r.is_active).length})
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showRoles ? "rotate-180" : ""}`} />
          </button>
          {showRoles && <JobRoleEditor />}
        </CardContent>
      </Card>

      {/* Filtre */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle nivåer</SelectItem>
            {REQUIREMENT_SCOPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle kompetansetyper</SelectItem>
            {typeList.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle avdelinger</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle stillinger</SelectItem>
            {(jobRoles.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Vis deaktiverte
        </label>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen krav matcher filteret. Opprett et krav for å komme i gang.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const t = typeById.get(r.competence_type_id);
            const isEditing = editingId === r.id;
            return (
              <Card key={r.id} className={r.active ? "" : "opacity-60"}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {t?.name ?? "Ukjent kompetanse"}
                        <ComplianceStatusBadge
                          label={r.required ? "Påkrevd" : "Ikke påkrevd"}
                          tone={r.required ? "ok" : "neutral"}
                        />
                        {!r.active && <ComplianceStatusBadge label="Deaktivert" tone="neutral" />}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Gjelder: {scopeName(r)} · {r.document_required ? "Dokumentasjon kreves" : "Dokumentasjon ikke påkrevd"}
                        {r.validity_months ? ` · Gyldighet ${r.validity_months} mnd` : " · Ingen utløpsdato"}
                        {r.warning_days ? ` · Varsling ${r.warning_days} dager før` : ""}
                      </p>
                      {r.reason && <p className="mt-1 text-xs">{r.reason}</p>}
                      {(r.valid_from || r.valid_to) && (
                        <p className="text-xs text-muted-foreground">
                          Kravet gjelder {r.valid_from ? `fra ${formatDate(r.valid_from)}` : ""} {r.valid_to ? `til ${formatDate(r.valid_to)}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                        <Users2 className="h-3 w-3" /> {impact.data?.[r.id] ?? 0} ansatte
                      </span>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditingId(isEditing ? null : r.id); setCreating(false); }}>
                        <Pencil className="mr-1 h-3 w-3" /> {isEditing ? "Lukk" : "Rediger"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setActive.mutate({ id: r.id, active: !r.active })}
                      >
                        {r.active ? "Deaktiver" : "Aktiver"}
                      </Button>
                    </div>
                  </div>

                  {isEditing && (
                    <RequirementForm
                      requirement={r}
                      typeList={typeList}
                      departments={departments}
                      jobRoles={jobRoles.data ?? []}
                      people={(employees.data ?? []).map((e) => ({ id: e.person_id, name: e.full_name }))}
                      onClose={() => setEditingId(null)}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RequirementForm({
  requirement, typeList, departments, jobRoles, people, onClose,
}: {
  requirement: CompetenceRequirement | null;
  typeList: { id: string; name: string; default_validity_months: number | null; requires_document: boolean }[];
  departments: { id: string; name: string }[];
  jobRoles: { id: string; name: string; is_active: boolean }[];
  people: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { save } = useRequirementMutations();
  const [form, setForm] = useState({
    competence_type_id: requirement?.competence_type_id ?? "",
    scope_type: (requirement?.scope_type ?? "company") as RequirementScope,
    scope_id: requirement?.scope_id ?? "",
    required: requirement?.required ?? true,
    document_required: requirement?.document_required ?? true,
    validity_months: requirement?.validity_months?.toString() ?? "",
    warning_days: requirement?.warning_days?.toString() ?? "90",
    reason: requirement?.reason ?? "",
    valid_from: requirement?.valid_from ?? "",
    valid_to: requirement?.valid_to ?? "",
  });

  const selectedType = typeList.find((t) => t.id === form.competence_type_id);
  const needsScopeId = form.scope_type !== "company";
  const scopeOptions =
    form.scope_type === "department" ? departments
      : form.scope_type === "role" ? jobRoles.filter((r) => r.is_active).map((r) => ({ id: r.id, name: r.name }))
        : people;

  const submit = async () => {
    await save.mutateAsync({
      id: requirement?.id,
      competence_type_id: form.competence_type_id,
      scope_type: form.scope_type,
      scope_id: needsScopeId ? form.scope_id : null,
      required: form.required,
      document_required: form.document_required,
      validity_months: form.validity_months ? Number(form.validity_months) : null,
      warning_days: form.warning_days ? Number(form.warning_days) : null,
      reason: form.reason || null,
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
      active: requirement?.active ?? true,
    });
    onClose();
  };

  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{requirement ? "Rediger krav" : "Nytt kompetansekrav"}</p>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <Separator />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Kompetanse</Label>
            <Select
              value={form.competence_type_id}
              onValueChange={(v) => {
                const t = typeList.find((x) => x.id === v);
                setForm((f) => ({
                  ...f,
                  competence_type_id: v,
                  validity_months: f.validity_months || (t?.default_validity_months?.toString() ?? ""),
                  document_required: requirement ? f.document_required : (t?.requires_document ?? true),
                }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Velg kompetanse" /></SelectTrigger>
              <SelectContent>
                {typeList.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Hvem gjelder kravet for?</Label>
            <Select
              value={form.scope_type}
              onValueChange={(v) => setForm({ ...form, scope_type: v as RequirementScope, scope_id: "" })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REQUIREMENT_SCOPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {needsScopeId && (
            <div className="space-y-1.5">
              <Label>Velg {form.scope_type === "department" ? "avdeling" : form.scope_type === "role" ? "stilling" : "ansatt"}</Label>
              <Select value={form.scope_id} onValueChange={(v) => setForm({ ...form, scope_id: v })}>
                <SelectTrigger><SelectValue placeholder="Velg…" /></SelectTrigger>
                <SelectContent>
                  {scopeOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Gyldighet (måneder)</Label>
            <Input
              type="number"
              min={0}
              placeholder="Tom = ingen utløpsdato"
              value={form.validity_months}
              onChange={(e) => setForm({ ...form, validity_months: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Varsle antall dager før utløp</Label>
            <Input
              type="number"
              min={0}
              value={form.warning_days}
              onChange={(e) => setForm({ ...form, warning_days: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Kravet gjelder fra</Label>
            <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Kravet gjelder til</Label>
            <Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.required} onCheckedChange={(v) => setForm({ ...form, required: v })} />
            Kompetansen er påkrevd
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.document_required} onCheckedChange={(v) => setForm({ ...form, document_required: v })} />
            Dokumentasjon kreves
          </label>
        </div>
        {!form.required && (
          <p className="text-xs text-muted-foreground">
            Kravet vises som «Ikke påkrevd» for de det gjelder, og overstyrer mer generelle krav.
          </p>
        )}

        <div className="space-y-1.5">
          <Label>Begrunnelse</Label>
          <Textarea
            rows={2}
            placeholder="F.eks. Årlig FSE-opplæring for alle som utfører arbeid på elektriske anlegg"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Avbryt</Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={save.isPending || !form.competence_type_id || (needsScopeId && !form.scope_id)}
          >
            {save.isPending ? "Lagrer…" : "Lagre krav"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function JobRoleEditor() {
  const roles = useJobRoles(true);
  const { save } = useJobRoleMutations();
  const [name, setName] = useState("");

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-muted-foreground">
        Stillinger brukes til å styre hvilke krav som gjelder hvem. Stilling settes på ansattkortet under HMS → Ansatte.
      </p>
      <div className="flex flex-wrap gap-2">
        {(roles.data ?? []).map((r) => (
          <span
            key={r.id}
            className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${r.is_active ? "" : "opacity-50"}`}
          >
            {r.name}
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => save.mutate({ id: r.id, is_active: !r.is_active })}
            >
              {r.is_active ? "Deaktiver" : "Aktiver"}
            </button>
          </span>
        ))}
        {(roles.data ?? []).length === 0 && <span className="text-xs text-muted-foreground">Ingen stillinger opprettet.</span>}
      </div>
      <div className="flex gap-2">
        <Input
          className="max-w-xs"
          placeholder="Ny stilling, f.eks. Elektriker"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!name.trim() || save.isPending}
          onClick={async () => { await save.mutateAsync({ name: name.trim() }); setName(""); }}
        >
          Legg til
        </Button>
      </div>
    </div>
  );
}
