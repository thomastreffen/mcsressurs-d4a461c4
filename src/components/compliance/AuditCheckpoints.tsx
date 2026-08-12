/**
 * Manuelle kontrollpunkter i internrevisjonen.
 * Brukeren må selv ta stilling til forhold systemet ikke kan fastslå.
 * AI kan foreslå punkter – forslag er tydelig merket til de er besvart.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { ChevronDown, ChevronUp, ListChecks, Plus, Sparkles, Trash2, Wrench } from "lucide-react";
import { CHECKPOINT_ANSWERS, checkpointAnswerMeta, newCheckpoint, type AuditCheckpoint, type CheckpointAnswer } from "@/lib/internal-control";

const sb = supabase as any;

function useComplianceDocuments() {
  const { activeCompanyId } = useCompanyContext();
  return useQuery<{ id: string; file_name: string }[]>({
    queryKey: ["compliance-doc-options", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("documents")
        .select("id, file_name, created_at")
        .eq("company_id", activeCompanyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function AuditCheckpoints({
  checkpoints, onChange, onSuggest, onCreateAction, canCreateAction,
}: {
  checkpoints: AuditCheckpoint[];
  onChange: (next: AuditCheckpoint[]) => void;
  onSuggest: () => void;
  /** Oppretter tiltak i eksisterende HMS-tiltakssystem */
  onCreateAction?: (cp: AuditCheckpoint) => Promise<string | null>;
  canCreateAction?: boolean;
}) {
  const docs = useComplianceDocuments();
  const [open, setOpen] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const patch = (id: string, p: Partial<AuditCheckpoint>) =>
    onChange(checkpoints.map((c) => (c.id === id ? { ...c, ...p } : c)));

  const answer = (c: AuditCheckpoint, value: CheckpointAnswer) =>
    patch(c.id, {
      answer: value,
      ai_suggested: false,
      answered_at: value ? new Date().toISOString() : null,
    });

  const unanswered = checkpoints.filter((c) => !c.answer).length;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" /> Kontrollpunkter ({checkpoints.length})
        </p>
        <div className="flex items-center gap-2">
          {unanswered > 0 && <span className="text-xs text-muted-foreground">{unanswered} ubesvart</span>}
          <Button size="sm" variant="outline" className="h-8" onClick={onSuggest}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Foreslå kontrollpunkter
          </Button>
        </div>
      </div>

      {checkpoints.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Ingen kontrollpunkter registrert. Legg til egne punkter eller la systemet foreslå punkter ut fra bakgrunn,
          områder og systemfakta.
        </p>
      )}

      <div className="space-y-2">
        {checkpoints.map((c) => {
          const meta = checkpointAnswerMeta(c.answer);
          const expanded = open === c.id;
          return (
            <div key={c.id} className="rounded-md border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.ai_suggested && (
                      <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">
                        <Sparkles className="mr-1 h-3 w-3" /> AI-forslag
                      </Badge>
                    )}
                    {c.area && <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.area}</span>}
                  </div>
                  <p className="text-sm">{c.question}</p>
                  {c.comment && !expanded && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{c.comment}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <ComplianceStatusBadge label={meta.label} tone={meta.tone} />
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(expanded ? null : c.id)}>
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-destructive"
                    onClick={() => onChange(checkpoints.filter((x) => x.id !== c.id))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {expanded && (
                <div className="space-y-2 border-t px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {CHECKPOINT_ANSWERS.map((a) => (
                      <Button key={a.value} size="sm" className="h-8"
                        variant={c.answer === a.value ? "default" : "outline"}
                        onClick={() => answer(c, c.answer === a.value ? null : a.value)}>
                        {a.label}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kommentar / vurdering</Label>
                    <Textarea rows={2} value={c.comment ?? ""} onChange={(e) => patch(c.id, { comment: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Dokumentasjon</Label>
                    <Select
                      value={c.document_id ?? "none"}
                      onValueChange={(v) =>
                        patch(c.id, {
                          document_id: v === "none" ? null : v,
                          document_name: v === "none" ? null : (docs.data ?? []).find((d) => d.id === v)?.file_name ?? null,
                        })
                      }
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Ingen dokumentasjon koblet" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ingen dokumentasjon koblet</SelectItem>
                        {(docs.data ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.file_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className="h-8"
                      disabled={!canCreateAction || !onCreateAction}
                      onClick={async () => {
                        const id = await onCreateAction?.(c);
                        if (id) patch(c.id, { action_ids: [...c.action_ids, id] });
                      }}>
                      <Wrench className="mr-1 h-3.5 w-3.5" /> Opprett tiltak fra kontrollpunktet
                    </Button>
                    {c.action_ids.length > 0 && (
                      <span className="text-xs text-muted-foreground">{c.action_ids.length} tiltak opprettet</span>
                    )}
                    {!canCreateAction && (
                      <span className="text-xs text-muted-foreground">Lagre revisjonen først for å opprette tiltak</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1 space-y-1.5">
          <Label className="text-xs">Nytt kontrollpunkt</Label>
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Hva skal kontrolleres?" />
        </div>
        <Button size="sm" disabled={!manual.trim()}
          onClick={() => { onChange([...checkpoints, newCheckpoint(manual.trim())]); setManual(""); }}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Legg til
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Tiltak og avvik gjenbruker HMS-systemet. AI kan foreslå kontrollpunkter, men kan aldri svare på dem.
      </p>
    </div>
  );
}
