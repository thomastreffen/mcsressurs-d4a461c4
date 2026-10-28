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
  const [applying, setApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const value = text ?? finding.response_text ?? "";
  const approved = !!finding.response_approved_at;
  const busy = loading || applying || save.isPending;

  const applyDraft = async () => {
    if (!draft?.text.trim() || busy) return;
    const nextText = draft.text;
    setApplying(true);
    setErrorMessage(null);
    setApplied(false);
    try {
      await save.mutateAsync({
        id: finding.id, inspection_id: inspectionId, response_text: nextText,
        response_approved_at: null, response_approved_by: null,
      });
      setText(nextText);
      setDraft(null);
      setApplied(true);
      toast.success("AI-forslaget er satt inn og lagret som svartekst");
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Kunne ikke lagre svarforslaget. Prøv igjen.");
    } finally {
      setApplying(false);
    }
  };

  const suggest = async () => {
    setLoading(true);
    setErrorMessage(null);
    setApplied(false);
    try {
      const { data, error } = await supabase.functions.invoke("finding-response-draft", {
        body: {
          inspection_id: inspectionId,
          finding_id: finding.id,
          system_facts: systemFacts,
          unresolved_gaps: unresolvedGaps,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "Kunne ikke lage forslag til svartekst");
      if (typeof data.response_text !== "string" || !data.response_text.trim()) {
        throw new Error("AI returnerte ingen svartekst. Prøv igjen.");
      }
      setDraft({ text: data.response_text, missing: data.missing_information ?? [] });
    } catch (e: any) {
      const message = e?.message ?? "Kunne ikke lage forslag til svartekst";
      setErrorMessage(message);
      toast.error(message);
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
        <Label htmlFor={`response-${finding.id}`} className="text-xs">Svartekst som brukes i svarpakken</Label>
        <Textarea
          id={`response-${finding.id}`}
          rows={5}
          value={value}
          disabled={!canEdit || applying}
          placeholder="Skriv svaret til myndigheten, eller la AI foreslå et utkast."
          onChange={(e) => { setText(e.target.value); setApplied(false); setErrorMessage(null); }}
          onBlur={() => {
            if (text === null || text === (finding.response_text ?? "")) return;
            save.mutate({
              id: finding.id, inspection_id: inspectionId,
              response_text: text || null,
              // enhver endring opphever tidligere godkjenning
              response_approved_at: null, response_approved_by: null,
            } as any, {
              onError: (e) => setErrorMessage(e instanceof Error ? e.message : "Kunne ikke lagre svarteksten. Prøv igjen."),
            });
          }}
        />
      </div>

      {applied && <p role="status" className="flex items-center gap-1.5 text-xs text-primary">
        <CheckCircle2 className="h-3.5 w-3.5" /> AI-forslaget er satt inn og lagret som svartekst. Ikke godkjent ennå.
      </p>}
      {errorMessage && <p role="alert" className="text-xs text-destructive">{errorMessage}</p>}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={suggest} disabled={busy}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            Foreslå svartekst
          </Button>
          {!approved && value.trim() && (
            <Button size="sm" disabled={busy} onClick={() => save.mutate({
              id: finding.id, inspection_id: inspectionId,
              response_text: value,
              response_approved_at: new Date().toISOString(), response_approved_by: user?.id ?? null,
            } as any)}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Godkjenn svartekst
            </Button>
          )}
          {approved && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save.mutate({
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
              <Button size="sm" disabled={busy || !draft.text.trim()} onClick={applyDraft}>
                {applying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {applying ? "Setter inn…" : "Bruk som svartekst"}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setDraft(null); setErrorMessage(null); }}>Avvis forslag</Button>
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
