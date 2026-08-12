import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { Plus, Paperclip, BadgeCheck, Trash2, Pencil, X } from "lucide-react";
import {
  useCompetences, useCompetenceTypes, useCompetenceMutations, useCompetenceDocuments,
  type Competence, type CompetenceType,
} from "@/hooks/useCompliance";
import { COMPETENCE_STATUS_META, competenceStatus, formatDate, type ComplianceStatus } from "@/lib/compliance";

/**
 * Kompetanse-fane på ansattkortet – masterflate for kompetanse og dokumentasjon.
 * Ingen modaler: registrering/redigering skjer i en inline, ekspanderbar seksjon.
 */
export function PersonCompetenceTab({ personId, personName, canManage }: { personId: string; personName?: string; canManage: boolean }) {
  const types = useCompetenceTypes();
  const competences = useCompetences(personId);
  const { remove, verify } = useCompetenceMutations();
  const [editing, setEditing] = useState<{ competence: Competence | null } | null>(null);

  const typeList = types.data ?? [];
  const enriched = useMemo(() => {
    const byId = new Map(typeList.map((t) => [t.id, t]));
    return (competences.data ?? []).map((c) => {
      const t = c.competence_type_id ? byId.get(c.competence_type_id) : undefined;
      return {
        ...c,
        typeName: t?.name ?? c.type_label ?? "Annet",
        status: competenceStatus({
          expires_at: c.expires_at,
          has_document: !!c.document_id,
          requires_document: t?.requires_document ?? true,
        }) as ComplianceStatus,
      };
    }).sort((a, b) => a.typeName.localeCompare(b.typeName, "nb"));
  }, [competences.data, typeList]);

  const docs = useCompetenceDocuments(enriched.map((c) => c.id));

  const missingRequired = useMemo(
    () => typeList.filter((t) => t.required_for_all && !(competences.data ?? []).some((c) => c.competence_type_id === t.id)),
    [typeList, competences.data],
  );

  if (types.isLoading || competences.isLoading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {canManage && !editing && (
        <Button size="sm" onClick={() => setEditing({ competence: null })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Legg til kompetanse
        </Button>
      )}

      {editing && (
        <CompetenceInlineForm
          personId={personId}
          personName={personName}
          types={typeList}
          competence={editing.competence}
          onClose={() => setEditing(null)}
        />
      )}

      {missingRequired.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">Mangler påkrevd kompetanse</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{missingRequired.map((t) => t.name).join(", ")}</p>
        </div>
      )}

      {enriched.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen kompetanseposter registrert.</p>
      ) : (
        <div className="space-y-2">
          {enriched.map((c) => {
            const meta = COMPETENCE_STATUS_META[c.status];
            const doc = docs.data?.[c.id];
            return (
              <Card key={c.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{c.typeName}</p>
                      {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                    </div>
                    <ComplianceStatusBadge label={meta.label} tone={meta.tone} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                    <span>Gjennomført: {formatDate(c.issued_at)}</span>
                    <span>Gyldig til: {c.expires_at ? formatDate(c.expires_at) : "Ingen utløp"}</span>
                    <span>Utsteder: {c.issuer || "–"}</span>
                    <span>Referanse: {c.reference_number || "–"}</span>
                    <span>Verifisert: {c.verified_at ? formatDate(c.verified_at) : "Nei"}</span>
                    <span>Registrert: {formatDate(c.created_at)}</span>
                  </div>
                  {c.comment && <p className="text-xs">{c.comment}</p>}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {doc?.public_url ? (
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <a href={doc.public_url} target="_blank" rel="noreferrer">
                          <Paperclip className="mr-1 h-3 w-3" /> {doc.file_name}
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Ingen dokumentasjon</span>
                    )}
                    {canManage && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing({ competence: c })}>
                          <Pencil className="mr-1 h-3 w-3" /> {doc ? "Rediger / erstatt dokument" : "Rediger"}
                        </Button>
                        {!c.verified_at && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => verify.mutate(c.id)}>
                            <BadgeCheck className="mr-1 h-3 w-3" /> Verifiser
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => remove.mutate(c.id)}>
                          <Trash2 className="mr-1 h-3 w-3" /> Fjern
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompetenceInlineForm({
  personId, personName, types, competence, onClose,
}: {
  personId: string;
  personName?: string;
  types: CompetenceType[];
  competence: Competence | null;
  onClose: () => void;
}) {
  const { save } = useCompetenceMutations();
  const [typeId, setTypeId] = useState<string>(competence?.competence_type_id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    type_label: competence?.type_label ?? "",
    description: competence?.description ?? "",
    issuer: competence?.issuer ?? "",
    reference_number: competence?.reference_number ?? "",
    issued_at: competence?.issued_at ?? "",
    valid_from: competence?.valid_from ?? "",
    expires_at: competence?.expires_at ?? "",
    comment: competence?.comment ?? "",
  });

  const selectedType = types.find((t) => t.id === typeId);

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
    onClose();
  };

  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">
            {competence ? "Rediger kompetanse" : "Ny kompetanse"}{personName ? ` · ${personName}` : ""}
          </p>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Separator />

        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger><SelectValue placeholder="Velg kompetansetype" /></SelectTrigger>
            <SelectContent>
              {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Utsteder</Label>
            <Input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Referanse / bevisnr.</Label>
            <Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Gjennomført</Label>
            <Input type="date" value={form.issued_at} onChange={(e) => setForm({ ...form, issued_at: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Gyldig fra</Label>
            <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Gyldig til</Label>
            <Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Utløpsdato er valgfri – fagbrev og lignende har ingen utløp.</p>

        <div className="space-y-1.5">
          <Label>Dokumentasjon</Label>
          <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Avbryt</Button>
          <Button size="sm" onClick={submit} disabled={save.isPending || (!typeId && !form.type_label)}>
            {save.isPending ? "Lagrer…" : "Lagre"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
