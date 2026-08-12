import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { Plus, ExternalLink, CheckCircle2, Pencil, Trash2, Search } from "lucide-react";
import { useRegulations, useRegulationMutations, useComplianceEmployees, type Regulation } from "@/hooks/useCompliance";
import { REGULATION_STATUSES, REGULATION_TYPES, daysUntil, formatDate, regulationReviewTone } from "@/lib/compliance";

const EMPTY: Partial<Regulation> = {
  name: "", short_name: "", reg_type: "forskrift", description: "", relevance: "",
  source_url: "", responsible_role: "", responsible_person_id: null,
  last_reviewed_at: null, next_review_at: null, review_interval_months: 12, status: "active", notes: "",
};

export default function ComplianceRegulationsPage() {
  const regs = useRegulations();
  const employees = useComplianceEmployees();
  const { save, markReviewed, remove } = useRegulationMutations();
  const [editing, setEditing] = useState<Partial<Regulation> | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const rows = useMemo(() => {
    return (regs.data ?? [])
      .filter((r) => (typeFilter === "all" ? true : r.reg_type === typeFilter))
      .filter((r) => (search ? `${r.name} ${r.short_name ?? ""}`.toLowerCase().includes(search.toLowerCase()) : true));
  }, [regs.data, typeFilter, search]);

  const set = (patch: Partial<Regulation>) => setEditing((e) => ({ ...(e ?? {}), ...patch }));

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Regelverksregister</h1>
          <p className="text-sm text-muted-foreground">Lover, forskrifter, normer og interne krav med dokumentert gjennomgang</p>
        </div>
        <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Nytt regelverk
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Søk regelverk…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[190px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle typer</SelectItem>
            {REGULATION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {regs.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen regelverk registrert ennå. Legg inn f.eks. El-tilsynsloven, Internkontrollforskriften, FEK, FSE, FEL, NEK 439 og NEK 400.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const tone = regulationReviewTone(r.next_review_at);
            const d = daysUntil(r.next_review_at);
            const statusMeta = REGULATION_STATUSES.find((s) => s.value === r.status);
            const responsible = (employees.data ?? []).find((p) => p.person_id === r.responsible_person_id);
            return (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.short_name ? `${r.short_name} – ` : ""}{r.name}</span>
                      <ComplianceStatusBadge label={REGULATION_TYPES.find((t) => t.value === r.reg_type)?.label ?? r.reg_type} tone="neutral" />
                      {statusMeta && <ComplianceStatusBadge label={statusMeta.label} tone={statusMeta.tone} />}
                    </div>
                    {r.relevance && <p className="text-sm text-muted-foreground">{r.relevance}</p>}
                    <p className="text-xs text-muted-foreground">
                      Ansvarlig: {responsible?.full_name ?? r.responsible_role ?? "–"} · Sist gjennomgått: {formatDate(r.last_reviewed_at)} · Neste: {formatDate(r.next_review_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.next_review_at && (
                      <ComplianceStatusBadge label={d! < 0 ? `Forfalt ${Math.abs(d!)} d` : `${d} d til gjennomgang`} tone={tone} />
                    )}
                    {r.source_url && (
                      <Button asChild size="sm" variant="outline" className="h-8">
                        <a href={r.source_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => markReviewed.mutate(r)}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Gjennomgått
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => remove.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Endre regelverk" : "Nytt regelverk"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Navn</Label>
                <Input value={editing?.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Kortnavn</Label>
                <Input value={editing?.short_name ?? ""} onChange={(e) => set({ short_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={editing?.reg_type ?? "forskrift"} onValueChange={(v) => set({ reg_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REGULATION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editing?.status ?? "active"} onValueChange={(v) => set({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REGULATION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Beskrivelse</Label>
              <Textarea rows={2} value={editing?.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Hvorfor relevant for MCS</Label>
              <Textarea rows={2} value={editing?.relevance ?? ""} onChange={(e) => set({ relevance: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Lenke til offisiell kilde</Label>
              <Input value={editing?.source_url ?? ""} onChange={(e) => set({ source_url: e.target.value })} placeholder="https://lovdata.no/…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ansvarlig person</Label>
                <Select value={editing?.responsible_person_id ?? "none"} onValueChange={(v) => set({ responsible_person_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ikke satt</SelectItem>
                    {(employees.data ?? []).map((p) => <SelectItem key={p.person_id} value={p.person_id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ansvarlig rolle</Label>
                <Input value={editing?.responsible_role ?? ""} onChange={(e) => set({ responsible_role: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Sist gjennomgått</Label>
                <Input type="date" value={editing?.last_reviewed_at ?? ""} onChange={(e) => set({ last_reviewed_at: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Neste gjennomgang</Label>
                <Input type="date" value={editing?.next_review_at ?? ""} onChange={(e) => set({ next_review_at: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Intervall (mnd)</Label>
                <Input type="number" value={editing?.review_interval_months ?? 12} onChange={(e) => set({ review_interval_months: Number(e.target.value) || null })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notater</Label>
              <Textarea rows={2} value={editing?.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Avbryt</Button>
            <Button
              disabled={!editing?.name || save.isPending}
              onClick={async () => { await save.mutateAsync(editing!); setEditing(null); }}
            >
              {save.isPending ? "Lagrer…" : "Lagre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
