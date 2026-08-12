/**
 * SVAR TIL MYNDIGHETEN.
 *
 * AI kan foreslå svartekst basert på funnet, interne tiltak, systemfakta og
 * koblede bevis – men teksten blir aldri godkjent automatisk. Bruker må
 * eksplisitt godkjenne teksten før funnet kan settes klart for oversendelse.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFindingMutations, type Finding, type FindingEvidence, type InspectionAction } from "@/hooks/useInspections";
import { formatDate } from "@/lib/compliance";

export function FindingResponseSection({
  finding, inspectionId, inspectionTitle, authorityName, actions, evidence, systemFacts, unresolvedGaps = [], canEdit,
}: {
  finding: Finding;
  inspectionId: string;
  inspectionTitle: string | null;
  authorityName: string | null;
  actions: InspectionAction[];
  evidence: FindingEvidence[];
  systemFacts: string[];
  /** Forhold systemet fortsatt viser som ikke rettet – AI må ikke påstå at de er lukket */
  unresolvedGaps?: string[];
  canEdit: boolean;
}) {
  const { user } = useAuth();
  const { save } = useFindingMutations(inspectionId);
  const [text, setText] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; missing: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const value = text ?? finding.response_text ?? "";
  const approved = !!finding.response_approved_at;

  const suggest = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("finding-response-draft", {
        body: {
          inspection_title: inspectionTitle,
          authority_name: authorityName,
          finding: {
            title: finding.title,
            original_text: finding.original_text,
            legal_basis_text: finding.legal_basis_text,
            authority_requirement: finding.authority_requirement,
            deadline: finding.deadline,
            internal_assessment: finding.internal_assessment,
            proposed_solution: finding.proposed_solution,
            internal_deadline: finding.internal_deadline,
            condition_corrected_at: finding.condition_corrected_at ?? null,
            documentation_complete_at: finding.documentation_complete_at ?? null,
          },
          actions: actions.map((a) => ({ title: a.title, status: a.status, due_date: a.due_date, description: a.description ?? null })),
          evidence: evidence.map((e) => e.label ?? e.note ?? "Bevis"),
          system_facts: systemFacts,
          unresolved_gaps: unresolvedGaps,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "Kunne ikke lage forslag til svartekst");
      setDraft({ text: data.response_text ?? "", missing: data.missing_information ?? [] });
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke lage forslag til svartekst");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Svar til tilsynsmyndigheten</p>
        {approved ? (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
            Godkjent {formatDate(finding.response_approved_at)}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">Ikke godkjent</Badge>
        )}
      </div>

      <div>
        <Label className="text-xs">Svartekst som brukes i svarpakken</Label>
        <Textarea
          rows={5}
          value={value}
          disabled={!canEdit}
          placeholder="Skriv svaret til myndigheten, eller la AI foreslå et utkast."
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text === null || text === (finding.response_text ?? "")) return;
            save.mutate({
              id: finding.id, inspection_id: inspectionId,
              response_text: text || null,
              // enhver endring opphever tidligere godkjenning
              response_approved_at: null, response_approved_by: null,
            } as any);
          }}
        />
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={suggest} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            Foreslå svartekst
          </Button>
          {!approved && value.trim() && (
            <Button size="sm" onClick={() => save.mutate({
              id: finding.id, inspection_id: inspectionId,
              response_approved_at: new Date().toISOString(), response_approved_by: user?.id ?? null,
            } as any)}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Godkjenn svartekst
            </Button>
          )}
          {approved && (
            <Button size="sm" variant="ghost" onClick={() => save.mutate({
              id: finding.id, inspection_id: inspectionId, response_approved_at: null, response_approved_by: null,
            } as any)}>
              <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Opphev godkjenning
            </Button>
          )}
        </div>
      )}

      {draft && (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI foreslår</span>
            <Badge variant="outline" className="text-[10px]">Utkast</Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm">{draft.text}</p>
          {draft.missing.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <p className="font-medium">Mangler for et komplett svar:</p>
              <ul className="ml-4 list-disc">{draft.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => {
                setText(draft.text);
                save.mutate({
                  id: finding.id, inspection_id: inspectionId, response_text: draft.text,
                  response_approved_at: null, response_approved_by: null,
                } as any);
                setDraft(null);
              }}>Bruk som svartekst</Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Avvis forslag</Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Forslaget er ikke lagret før du bruker det, og må godkjennes separat.
          </p>
        </div>
      )}
    </div>
  );
}
