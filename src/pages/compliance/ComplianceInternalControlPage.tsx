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
import { Plus, Pencil, Trash2, ListChecks } from "lucide-react";
import {
  useComplianceAudits, useAuditMutations, useAuditActions, useComplianceEmployees,
  type ComplianceAudit,
} from "@/hooks/useCompliance";
import { AUDIT_STATUSES, formatDate } from "@/lib/compliance";

const EMPTY: Partial<ComplianceAudit> = {
  title: "", audit_type: "internal_control", planned_date: null, performed_at: null,
  responsible_person_id: null, participants: [], areas: [],
  findings: "", deviations: "", improvements: "", conclusion: "", status: "planned",
};

export default function ComplianceInternalControlPage() {
  const audits = useComplianceAudits();
  const employees = useComplianceEmployees();
  const actions = useAuditActions();
  const { save, remove, createAction } = useAuditMutations();
  const [editing, setEditing] = useState<Partial<ComplianceAudit> | null>(null);
  const [actionFor, setActionFor] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState({ title: "", description: "", due_date: "" });

  const nameOf = (id: string | null | undefined) =>
    (employees.data ?? []).find((p) => p.person_id === id)?.full_name ?? "–";

  const { last, next } = useMemo(() => {
    const list = audits.data ?? [];
    const performed = list.filter((a) => a.performed_at).sort((a, b) => (a.performed_at! < b.performed_at! ? 1 : -1));
    const planned = list.filter((a) => !a.performed_at && a.planned_date).sort((a, b) => (a.planned_date! > b.planned_date! ? 1 : -1));
    return { last: performed[0] ?? null, next: planned[0] ?? null };
  }, [audits.data]);

  const set = (patch: Partial<ComplianceAudit>) => setEditing((e) => ({ ...(e ?? {}), ...patch }));

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Internkontroll</h1>
          <p className="text-sm text-muted-foreground">Dokumentert periodisk gjennomgang av internkontrollsystemet</p>
        </div>
        <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Ny internrevisjon
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Siste internrevisjon</p>
            <p className="text-lg font-semibold">{last ? formatDate(last.performed_at) : "Ikke registrert"}</p>
            <p className="text-xs text-muted-foreground">{last?.title ?? "Ingen gjennomført revisjon"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Neste planlagte</p>
            <p className="text-lg font-semibold">{next ? formatDate(next.planned_date) : "Ikke planlagt"}</p>
            <p className="text-xs text-muted-foreground">{next?.title ?? "Legg inn en planlagt revisjon"}</p>
          </CardContent>
        </Card>
      </div>

      {audits.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (audits.data ?? []).length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen internrevisjoner registrert.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {(audits.data ?? []).map((a) => {
            const statusMeta = AUDIT_STATUSES.find((s) => s.value === a.status);
            const own = (actions.data ?? []).filter((x) => x.compliance_audit_id === a.id);
            return (
              <Card key={a.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{a.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {a.performed_at ? `Gjennomført ${formatDate(a.performed_at)}` : `Planlagt ${formatDate(a.planned_date)}`}
                      {" · Ansvarlig: "}{nameOf(a.responsible_person_id)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusMeta && <ComplianceStatusBadge label={statusMeta.label} tone={statusMeta.tone} />}
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => remove.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {a.areas?.length > 0 && <p><span className="text-muted-foreground">Områder:</span> {a.areas.join(", ")}</p>}
                  {a.participants?.length > 0 && <p><span className="text-muted-foreground">Deltakere:</span> {a.participants.join(", ")}</p>}
                  {a.findings && <p><span className="text-muted-foreground">Funn:</span> {a.findings}</p>}
                  {a.deviations && <p><span className="text-muted-foreground">Avvik:</span> {a.deviations}</p>}
                  {a.improvements && <p><span className="text-muted-foreground">Forbedringspunkter:</span> {a.improvements}</p>}
                  {a.conclusion && <p><span className="text-muted-foreground">Konklusjon:</span> {a.conclusion}</p>}

                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <ListChecks className="h-3.5 w-3.5" /> Tiltak ({own.length})
                      </p>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setActionFor(a.id); setActionForm({ title: "", description: "", due_date: "" }); }}>
                        <Plus className="mr-1 h-3 w-3" /> Nytt tiltak
                      </Button>
                    </div>
                    {own.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {own.map((x) => (
                          <li key={x.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">{x.title}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {x.due_date ? formatDate(x.due_date) : "uten frist"} · {x.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-[11px] text-muted-foreground">Tiltak gjenbruker HMS-tiltakssystemet og følges opp der.</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Revisjonsdialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Endre internrevisjon" : "Ny internrevisjon"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tittel</Label>
              <Input value={editing?.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="Årlig gjennomgang av internkontroll" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Planlagt</Label>
                <Input type="date" value={editing?.planned_date ?? ""} onChange={(e) => set({ planned_date: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Gjennomført</Label>
                <Input type="date" value={editing?.performed_at ?? ""} onChange={(e) => set({ performed_at: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editing?.status ?? "planned"} onValueChange={(v) => set({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AUDIT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ansvarlig</Label>
              <Select value={editing?.responsible_person_id ?? "none"} onValueChange={(v) => set({ responsible_person_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ikke satt</SelectItem>
                  {(employees.data ?? []).map((p) => <SelectItem key={p.person_id} value={p.person_id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Deltakere (kommaseparert)</Label>
              <Input
                value={(editing?.participants ?? []).join(", ")}
                onChange={(e) => set({ participants: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Områder gjennomgått (kommaseparert)</Label>
              <Input
                value={(editing?.areas ?? []).join(", ")}
                onChange={(e) => set({ areas: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="Kompetanse, FSE, dokumentasjon, avvikshåndtering"
              />
            </div>
            {(["findings", "deviations", "improvements", "conclusion"] as const).map((k) => (
              <div key={k} className="space-y-1.5">
                <Label>
                  {k === "findings" ? "Funn" : k === "deviations" ? "Avvik" : k === "improvements" ? "Forbedringspunkter" : "Konklusjon"}
                </Label>
                <Textarea rows={2} value={(editing?.[k] as string) ?? ""} onChange={(e) => set({ [k]: e.target.value } as any)} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Avbryt</Button>
            <Button disabled={!editing?.title || save.isPending} onClick={async () => { await save.mutateAsync(editing!); setEditing(null); }}>
              {save.isPending ? "Lagrer…" : "Lagre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tiltaksdialog */}
      <Dialog open={!!actionFor} onOpenChange={(v) => !v && setActionFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nytt tiltak</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tittel</Label>
              <Input value={actionForm.title} onChange={(e) => setActionForm({ ...actionForm, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Beskrivelse</Label>
              <Textarea rows={2} value={actionForm.description} onChange={(e) => setActionForm({ ...actionForm, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Frist</Label>
              <Input type="date" value={actionForm.due_date} onChange={(e) => setActionForm({ ...actionForm, due_date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionFor(null)}>Avbryt</Button>
            <Button
              disabled={!actionForm.title || createAction.isPending}
              onClick={async () => {
                await createAction.mutateAsync({
                  audit_id: actionFor!,
                  title: actionForm.title,
                  description: actionForm.description || undefined,
                  due_date: actionForm.due_date || null,
                });
                setActionFor(null);
              }}
            >
              Opprett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
