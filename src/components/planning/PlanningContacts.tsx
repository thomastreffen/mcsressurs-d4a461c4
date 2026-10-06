import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Mail, Phone, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { usePlanningMutations, type PlanningContact, type PlanningExternalRef } from "@/hooks/usePlanning";
import { CONTACT_TYPES, EXTERNAL_SYSTEMS, contactTypeLabel } from "@/lib/planning";

function ContactEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: Partial<PlanningContact>;
  onCancel: () => void;
  onSave: (c: Partial<PlanningContact>) => void;
}) {
  const [c, setC] = useState<Partial<PlanningContact>>(initial);
  const set = (p: Partial<PlanningContact>) => setC({ ...c, ...p });
  return (
    <Card className="space-y-4 border-primary/40 p-4 sm:col-span-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-name">Navn *</Label>
          <Input id="c-name" autoFocus value={c.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={c.contact_type ?? "internal"} onValueChange={(v) => set({ contact_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {c.contact_type === "external" && <SelectItem value="external">Ekstern</SelectItem>}
              {CONTACT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-company">Firma</Label>
          <Input id="c-company" value={c.company_name ?? ""} onChange={(e) => set({ company_name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-role">Rolle / tittel</Label>
          <Input id="c-role" value={c.role ?? ""} onChange={(e) => set({ role: e.target.value })} placeholder="F.eks. Prosjektleder" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-phone">Telefon</Label>
          <Input id="c-phone" value={c.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-email">E-post</Label>
          <Input id="c-email" value={c.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-notes">Kommentar</Label>
        <Textarea id="c-notes" rows={2} value={c.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Avbryt</Button>
        <Button onClick={() => onSave(c)}>Lagre</Button>
      </div>
    </Card>
  );
}

export function PlanningContacts({
  projectId,
  contacts,
  externalRefs,
}: {
  projectId: string;
  contacts: PlanningContact[];
  externalRefs: PlanningExternalRef[];
}) {
  const { saveContact, deleteContact, saveExternalRef, deleteExternalRef } = usePlanningMutations(projectId);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [refDraft, setRefDraft] = useState<Partial<PlanningExternalRef>>({ system: EXTERNAL_SYSTEMS[0] });

  const save = async (draft: Partial<PlanningContact>) => {
    if (!draft.name?.trim()) {
      toast.error("Kontakten må ha et navn");
      return;
    }
    const patch: any = { ...draft };
    const id = patch.id;
    for (const k of ["id", "planning_project_id", "created_at", "created_by"]) delete patch[k];
    try {
      await saveContact.mutateAsync({ id, patch });
      setEditingId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke lagre");
    }
  };

  const saveRef = async () => {
    if (!refDraft.system) return;
    try {
      await saveExternalRef.mutateAsync(refDraft);
      setRefOpen(false);
      setRefDraft({ system: EXTERNAL_SYSTEMS[0] });
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke lagre");
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Kontakter</h2>
            <p className="text-sm text-muted-foreground">Kontakter gir ikke tilgang til prosjektet. Deltakere styres under Oversikt.</p>
          </div>
          {editingId !== "new" && (
            <Button size="sm" className="gap-2" onClick={() => setEditingId("new")}>
              <Plus className="h-4 w-4" /> Ny kontakt
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {editingId === "new" && (
            <ContactEditor initial={{ name: "", contact_type: "customer" }} onCancel={() => setEditingId(null)} onSave={save} />
          )}
          {contacts.length === 0 && editingId !== "new" && (
            <Card className="p-8 text-center text-sm text-muted-foreground sm:col-span-2">Ingen kontakter ennå.</Card>
          )}
          {contacts.map((c) =>
            editingId === c.id ? (
              <ContactEditor key={c.id} initial={c} onCancel={() => setEditingId(null)} onSave={save} />
            ) : (
              <Card key={c.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[c.role, c.company_name, c.department_name].filter(Boolean).join(" · ") || "Firma ikke satt"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={c.contact_type === "internal" ? "secondary" : "outline"}>{contactTypeLabel(c.contact_type)}</Badge>
                    <Button variant="ghost" size="icon" aria-label="Rediger" onClick={() => setEditingId(c.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Slett" onClick={() => { if (confirm("Slette kontakten?")) deleteContact.mutate(c.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {c.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a>
                    </p>
                  )}
                  {c.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                    </p>
                  )}
                  {c.notes && <p>{c.notes}</p>}
                </div>
              </Card>
            ),
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Eksterne systemer</h2>
            <p className="text-sm text-muted-foreground">Referanser og lenker til Business Central, SharePoint og andre.</p>
          </div>
          {!refOpen && (
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setRefOpen(true)}>
              <Plus className="h-4 w-4" /> Ny referanse
            </Button>
          )}
        </div>
        {refOpen && (
          <Card className="grid gap-3 border-primary/40 p-4 sm:grid-cols-[180px_1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>System</Label>
              <Select value={refDraft.system ?? EXTERNAL_SYSTEMS[0]} onValueChange={(v) => setRefDraft({ ...refDraft, system: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXTERNAL_SYSTEMS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-ref">Referanse</Label>
              <Input id="ref-ref" value={refDraft.reference ?? ""} onChange={(e) => setRefDraft({ ...refDraft, reference: e.target.value })} placeholder="F.eks. P-10484" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-url">Lenke</Label>
              <Input id="ref-url" value={refDraft.url ?? ""} onChange={(e) => setRefDraft({ ...refDraft, url: e.target.value })} placeholder="https://…" />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setRefOpen(false)}>Avbryt</Button>
              <Button onClick={saveRef}>Lagre</Button>
            </div>
          </Card>
        )}
        {externalRefs.length === 0 ? (
          !refOpen && <Card className="p-6 text-center text-sm text-muted-foreground">Ingen referanser ennå.</Card>
        ) : (
          <div className="space-y-2">
            {externalRefs.map((r) => (
              <Card key={r.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{r.system}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.reference || r.url || "–"}</p>
                </div>
                {r.url && (
                  <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <a href={r.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Åpne
                    </a>
                  </Button>
                )}
                <Button variant="ghost" size="icon" aria-label="Slett" onClick={() => { if (confirm("Slette referansen?")) deleteExternalRef.mutate(r.id); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
