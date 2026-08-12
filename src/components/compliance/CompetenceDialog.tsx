import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip } from "lucide-react";
import { useCompetenceMutations, type Competence, type CompetenceType } from "@/hooks/useCompliance";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  personId: string;
  personName?: string;
  types: CompetenceType[];
  competence?: Competence | null;
  defaultTypeId?: string | null;
}

export function CompetenceDialog({ open, onOpenChange, personId, personName, types, competence, defaultTypeId }: Props) {
  const { save } = useCompetenceMutations();
  const [typeId, setTypeId] = useState<string>("");
  const [form, setForm] = useState({
    type_label: "",
    description: "",
    issuer: "",
    reference_number: "",
    issued_at: "",
    valid_from: "",
    expires_at: "",
    comment: "",
  });
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setTypeId(competence?.competence_type_id ?? defaultTypeId ?? "");
    setForm({
      type_label: competence?.type_label ?? "",
      description: competence?.description ?? "",
      issuer: competence?.issuer ?? "",
      reference_number: competence?.reference_number ?? "",
      issued_at: competence?.issued_at ?? "",
      valid_from: competence?.valid_from ?? "",
      expires_at: competence?.expires_at ?? "",
      comment: competence?.comment ?? "",
    });
  }, [open, competence, defaultTypeId]);

  const selectedType = types.find((t) => t.id === typeId);

  // Auto-foreslå utløpsdato ut fra type og utstedt dato
  useEffect(() => {
    if (!selectedType?.default_validity_months) return;
    const base = form.issued_at || form.valid_from;
    if (!base || form.expires_at) return;
    const d = new Date(base + "T00:00:00");
    d.setMonth(d.getMonth() + selectedType.default_validity_months);
    setForm((f) => ({ ...f, expires_at: d.toISOString().slice(0, 10) }));
  }, [selectedType, form.issued_at, form.valid_from, form.expires_at]);

  const submit = async () => {
    await save.mutateAsync({
      id: competence?.id,
      person_id: personId,
      competence_type_id: typeId || null,
      type_label: typeId ? null : form.type_label || null,
      description: form.description || null,
      issuer: form.issuer || null,
      reference_number: form.reference_number || null,
      issued_at: form.issued_at || null,
      valid_from: form.valid_from || null,
      expires_at: form.expires_at || null,
      comment: form.comment || null,
      file,
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {competence ? "Endre kompetanse" : "Ny kompetanse"}
            {personName ? ` · ${personName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Velg kompetansetype" /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!typeId && (
              <Input
                placeholder="Egendefinert type (hvis ikke i listen)"
                value={form.type_label}
                onChange={(e) => setForm({ ...form, type_label: e.target.value })}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Beskrivelse</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="F.eks. FSE lavspenning – årlig oppfriskning" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Utsteder</Label>
              <Input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Referanse / bevisnr.</Label>
              <Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Utstedt</Label>
              <Input type="date" value={form.issued_at} onChange={(e) => setForm({ ...form, issued_at: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Gyldig fra</Label>
              <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Utløper</Label>
              <Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Utløpsdato er valgfri – fagbrev og lignende har ingen utløp.</p>

          <div className="space-y-1.5">
            <Label>Dokument</Label>
            <div className="flex items-center gap-2">
              <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            {competence?.document_id && !file && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3" /> Dokument er allerede lastet opp. Ny fil erstatter referansen.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Kommentar</Label>
            <Textarea rows={2} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={submit} disabled={save.isPending || (!typeId && !form.type_label)}>
            {save.isPending ? "Lagrer…" : "Lagre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
