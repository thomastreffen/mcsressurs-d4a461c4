import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Mail, Phone, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { usePlanningMutations, type PlanningContact, type PlanningExternalRef } from "@/hooks/usePlanning";
import { CONTACT_ROLES, EXTERNAL_SYSTEMS } from "@/lib/planning";

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
  const [editing, setEditing] = useState<Partial<PlanningContact> | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [refDraft, setRefDraft] = useState<Partial<PlanningExternalRef>>({ system: EXTERNAL_SYSTEMS[0] });

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast.error("Kontakten må ha et navn");
      return;
    }
    const patch = { ...editing };
    const id = patch.id;
    delete (patch as any).id;
    try {
      await saveContact.mutateAsync({ id, patch });
      setEditing(null);
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Kontakter</h2>
          <Button size="sm" className="gap-2" onClick={() => setEditing({ name: "", contact_type: "internal" })}>
            <Plus className="h-4 w-4" /> Ny kontakt
          </Button>
        </div>

        {contacts.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Ingen kontakter ennå.</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {contacts.map((c) => (
              <Card key={c.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[c.company_name, c.department_name].filter(Boolean).join(" · ") || "Firma ikke satt"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={c.contact_type === "external" ? "outline" : "secondary"}>
                      {c.contact_type === "external" ? "Ekstern" : "Intern"}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { if (confirm("Slette kontakten?")) deleteContact.mutate(c.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {c.role && <Badge variant="outline">{c.role}</Badge>}
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
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Eksterne systemer</h2>
            <p className="text-sm text-muted-foreground">Referanser og lenker til Business Central, SharePoint og andre.</p>
          </div>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setRefOpen(true)}>
            <Plus className="h-4 w-4" /> Ny referanse
          </Button>
        </div>
        {externalRefs.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Ingen referanser ennå.</Card>
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
                <Button variant="ghost" size="icon" onClick={() => deleteExternalRef.mutate(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Rediger kontakt" : "Ny kontakt"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Navn *</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Firma</Label>
                <Input
                  value={editing.company_name ?? ""}
                  onChange={(e) => setEditing({ ...editing, company_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Avdeling</Label>
                <Input
                  value={editing.department_name ?? ""}
                  onChange={(e) => setEditing({ ...editing, department_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rolle</Label>
                <Select
                  value={editing.role ?? ""}
                  onValueChange={(v) => setEditing({ ...editing, role: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Velg rolle" /></SelectTrigger>
                  <SelectContent>
                    {CONTACT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={editing.contact_type ?? "internal"}
                  onValueChange={(v) => setEditing({ ...editing, contact_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Intern</SelectItem>
                    <SelectItem value="external">Ekstern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-post</Label>
                <Input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Kommentar</Label>
                <Textarea
                  rows={2}
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Avbryt</Button>
            <Button onClick={save}>Lagre</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refOpen} onOpenChange={setRefOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny systemreferanse</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>System</Label>
              <Select
                value={refDraft.system ?? EXTERNAL_SYSTEMS[0]}
                onValueChange={(v) => setRefDraft({ ...refDraft, system: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXTERNAL_SYSTEMS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Referanse</Label>
              <Input
                value={refDraft.reference ?? ""}
                onChange={(e) => setRefDraft({ ...refDraft, reference: e.target.value })}
                placeholder="F.eks. P-10484"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lenke</Label>
              <Input
                value={refDraft.url ?? ""}
                onChange={(e) => setRefDraft({ ...refDraft, url: e.target.value })}
                placeholder="https://…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefOpen(false)}>Avbryt</Button>
            <Button onClick={saveRef}>Lagre</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
