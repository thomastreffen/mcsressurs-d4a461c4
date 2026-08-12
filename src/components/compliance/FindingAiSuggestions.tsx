/**
 * AI-UTKAST – «AI foreslår».
 *
 * AI-forslagene fylles automatisk inn som utkast i de operative feltene under
 * «Intern behandling». Brukeren trenger IKKE godkjenne hvert felt for å få dem
 * inn – de er merket som utkast, kan redigeres fritt, bekreftes samlet eller
 * forkastes. Eksplisitt godkjenning beholdes kun der forslaget medfører en
 * faktisk operativ handling (tiltak, bevis, status, svar, internkontroll).
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, X, ListChecks } from "lucide-react";
import {
  AI_DRAFT_FIELDS, AI_SUGGESTION_LABELS, confirmAiDrafts, discardAiDrafts,
} from "@/lib/finding-workflow";
import { useFindingMutations, type Finding } from "@/hooks/useInspections";

export function FindingAiSuggestions({
  finding, inspectionId, canEdit, onCreateActionFromSolution,
}: {
  finding: Finding;
  inspectionId: string;
  canEdit: boolean;
  /** Kalles når bruker vil gjøre foreslått løsning om til et ordinært tiltak */
  onCreateActionFromSolution?: (solution: string) => void;
}) {
  const { save } = useFindingMutations(inspectionId);
  const suggestions = (finding.ai_suggestions ?? {}) as Record<string, any>;
  const state = (finding.ai_suggestion_state ?? {}) as Record<string, string>;

  const hasAny =
    AI_DRAFT_FIELDS.some((f) => !!suggestions[f]) ||
    (Array.isArray(suggestions.needed_documentation) && suggestions.needed_documentation.length > 0);
  if (!hasAny) return null;

  const draftFields = AI_DRAFT_FIELDS.filter((f) => state[f] === "draft");
  const docs: string[] = Array.isArray(suggestions.needed_documentation) ? suggestions.needed_documentation : [];
  const docsDiscarded = state.needed_documentation === "discarded";

  const confirmAll = () =>
    save.mutate({
      id: finding.id, inspection_id: inspectionId,
      ai_suggestion_state: confirmAiDrafts(finding.ai_suggestion_state),
    } as any);

  const discardAll = () => {
    const { state: next, cleared } = discardAiDrafts(finding.ai_suggestion_state);
    save.mutate({ id: finding.id, inspection_id: inspectionId, ...cleared, ai_suggestion_state: next } as any);
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI foreslår</p>
        {draftFields.length > 0
          ? <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">Utkast – ikke bekreftet</Badge>
          : <Badge variant="outline" className="text-[10px]">Behandlet</Badge>}
      </div>

      {draftFields.length > 0 ? (
        <>
          <p className="text-[11px] text-muted-foreground">
            AI har fylt inn utkast i {draftFields.map((f) => AI_SUGGESTION_LABELS[f].toLowerCase()).join(", ")} under
            «Intern behandling». Rediger fritt – ingenting er bekreftet før du gjør det selv.
          </p>
          {canEdit && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={confirmAll}>
                <Check className="mr-1 h-3.5 w-3.5" /> Bekreft utkastet
              </Button>
              <Button size="sm" variant="ghost" onClick={discardAll}>
                <X className="mr-1 h-3.5 w-3.5" /> Forkast AI-utkast
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Feltene under «Intern behandling» er dine egne – AI-utkastet er bekreftet eller forkastet.
        </p>
      )}

      {finding.proposed_solution && canEdit && onCreateActionFromSolution && (
        <Button size="sm" variant="outline" onClick={() => onCreateActionFromSolution(finding.proposed_solution!)}>
          <ListChecks className="mr-1 h-3.5 w-3.5" /> Opprett tiltak fra foreslått løsning
        </Button>
      )}

      {docs.length > 0 && !docsDiscarded && (
        <div className="rounded-md border bg-card px-3 py-2">
          <p className="text-xs font-medium">{AI_SUGGESTION_LABELS.needed_documentation}</p>
          <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground">
            {docs.map((d) => <li key={d}>{d}</li>)}
          </ul>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Dokumentene kobles som bevis under «Dokumentasjon og bevis» – det krever din godkjenning.
          </p>
        </div>
      )}
    </div>
  );
}
