import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { Plus, Pencil, Trash2, Printer } from "lucide-react";
import { useOrgRoles, useOrgRoleMutations, useComplianceEmployees, type OrgRole } from "@/hooks/useCompliance";
import { ORG_ROLE_TYPES, formatDate } from "@/lib/compliance";

const EMPTY: Partial<OrgRole> = {
  title: "", role_type: "other", person_id: null, deputy_person_id: null,
  responsibilities: "", tasks: "", authority: "", valid_from: null, valid_to: null, sort_order: 100,
};

export default function ComplianceOrganisationPage() {
  const roles = useOrgRoles();
  const employees = useComplianceEmployees();
  const { save, remove } = useOrgRoleMutations();
  const [editing, setEditing] = useState<Partial<OrgRole> | null>(null);

  const nameOf = (id: string | null | undefined) =>
    (employees.data ?? []).find((p) => p.person_id === id)?.full_name ?? "Ikke tildelt";

  const grouped = useMemo(() => {
    const map = new Map<string, OrgRole[]>();
    for (const r of roles.data ?? []) {
      const list = map.get(r.role_type) ?? [];
      list.push(r);
      map.set(r.role_type, list);
    }
    return ORG_ROLE_TYPES.map((t) => ({ ...t, items: map.get(t.value) ?? [] })).filter((g) => g.items.length > 0);
  }, [roles.data]);

  const set = (patch: Partial<OrgRole>) => setEditing((e) => ({ ...(e ?? {}), ...patch }));

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Organisasjon og ansvar</h1>
          <p className="text-sm text-muted-foreground">Dokumentert struktur, roller, ansvar, oppgaver og myndighet</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1 h-3.5 w-3.5" /> Skriv ut oversikt
          </Button>
          <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Ny rolle
          </Button>
        </div>
      </div>

      {roles.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen roller registrert. Legg inn HMS-ansvar, KS-ansvar og elektrofaglig ansvar for å kunne dokumentere organisasjonen ved tilsyn.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <Card key={g.value}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{g.label}</CardTitle></CardHeader>
              <CardContent className="space-y-2 p-4 pt-0">
                {g.items.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{r.title}</span>
                        <ComplianceStatusBadge label={nameOf(r.person_id)} tone={r.person_id ? "ok" : "warn"} />
                        {r.deputy_person_id && <span className="text-xs text-muted-foreground">Stedfortreder: {nameOf(r.deputy_person_id)}</span>}
                      </div>
                      {r.responsibilities && <p className="text-sm"><span className="text-muted-foreground">Ansvar:</span> {r.responsibilities}</p>}
                      {r.tasks && <p className="text-sm"><span className="text-muted-foreground">Oppgaver:</span> {r.tasks}</p>}
                      {r.authority && <p className="text-sm"><span className="text-muted-foreground">Myndighet:</span> {r.authority}</p>}
                      {(r.valid_from || r.valid_to) && (
                        <p className="text-xs text-muted-foreground">Gyldig {formatDate(r.valid_from)} – {r.valid_to ? formatDate(r.valid_to) : "løpende"}</p>
                      )}
                    </div>
                    <div className="flex gap-2 print:hidden">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => remove.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Endre rolle" : "Ny rolle"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Rolletittel</Label>
                <Input value={editing?.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="F.eks. Faglig ansvarlig" />
              </div>
              <div className="space-y-1.5">
                <Label>Type ansvar</Label>
                <Select value={editing?.role_type ?? "other"} onValueChange={(v) => set({ role_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ORG_ROLE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Person</Label>
                <Select value={editing?.person_id ?? "none"} onValueChange={(v) => set({ person_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ikke tildelt</SelectItem>
                    {(employees.data ?? []).map((p) => <SelectItem key={p.person_id} value={p.person_id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Stedfortreder</Label>
                <Select value={editing?.deputy_person_id ?? "none"} onValueChange={(v) => set({ deputy_person_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    {(employees.data ?? []).map((p) => <SelectItem key={p.person_id} value={p.person_id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ansvar</Label>
              <Textarea rows={2} value={editing?.responsibilities ?? ""} onChange={(e) => set({ responsibilities: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Oppgaver</Label>
              <Textarea rows={2} value={editing?.tasks ?? ""} onChange={(e) => set({ tasks: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Myndighet</Label>
              <Textarea rows={2} value={editing?.authority ?? ""} onChange={(e) => set({ authority: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Gyldig fra</Label>
                <Input type="date" value={editing?.valid_from ?? ""} onChange={(e) => set({ valid_from: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Gyldig til</Label>
                <Input type="date" value={editing?.valid_to ?? ""} onChange={(e) => set({ valid_to: e.target.value || null })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Avbryt</Button>
            <Button disabled={!editing?.title || save.isPending} onClick={async () => { await save.mutateAsync(editing!); setEditing(null); }}>
              {save.isPending ? "Lagrer…" : "Lagre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
