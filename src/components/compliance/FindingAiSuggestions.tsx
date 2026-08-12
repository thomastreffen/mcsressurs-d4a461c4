/**
 * AI-FORSLAG – «AI foreslår».
 *
 * Forslagene ligger på funnet som ai_suggestions og blir ALDRI operative data
 * før bruker godkjenner (eller endrer) dem. Ved godkjenning skrives verdien til
 * tilsvarende felt under «Intern behandling», og forslaget merkes «Godkjent».
 * Ingen sannsynlighet/prosent vises.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Check, Pencil, X, ListChecks, RotateCcw } from "lucide-react";
import { AI_SUGGESTION_LABELS, FINDING_PRIORITIES, findingPriorityMeta, type AiSuggestionField } from "@/lib/finding-workflow";
import { useFindingMutations, type Finding } from "@/hooks/useInspections";

const FIELDS: AiSuggestionField[] = [
  "internal_category", "priority", "internal_assessment", "proposed_solution", "needed_documentation",
];

/** Hvilket operativt felt et godkjent forslag skrives til */
const TARGET: Record<AiSuggestionField, keyof Finding | null> = {
  internal_category: "internal_category",
  priority: "priority",
  internal_assessment: "internal_assessment",
  proposed_solution: "proposed_solution",
  needed_documentation: null, // dokumentasjonsbehov håndteres i «Dokumentasjon og bevis»
};

const STATE_LABEL: Record<string, string> = {
  accepted: "Godkjent",
  edited: "Godkjent med endring",
  rejected: "Avvist",
};

function asText(v: unknown): string {
  if (Array.isArray(v)) return v.join("\n");
  if (typeof v === "string") return v;
  return "";
}

export function FindingAiSuggestions({
  finding, inspectionId, canEdit, onCreateActionFromSolution,
}: {
  finding: Finding;
  inspectionId: string;
  canEdit: boolean;
  /** Kalles når bruker vil gjøre godkjent løsningsforslag om til et ordinært tiltak */
  onCreateActionFromSolution?: (solution: string) => void;
}) {
  const { save } = useFindingMutations(inspectionId);
  const suggestions = (finding.ai_suggestions ?? {}) as Record<string, any>;
  const state = (finding.ai_suggestion_state ?? {}) as Record<string, string>;
  const [editing, setEditing] = useState<AiSuggestionField | null>(null);
  const [buffer, setBuffer] = useState("");

  const present = FIELDS.filter((f) => {
    const v = suggestions[f];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });

  if (!present.length) return null;

  const persist = (field: AiSuggestionField, value: string | null, mark: "accepted" | "edited" | "rejected" | null) => {
    const target = TARGET[field];
    const nextState = { ...state };
    if (mark === null) delete nextState[field];
    else nextState[field] = mark;
    const patch: any = { id: finding.id, inspection_id: inspectionId, ai_suggestion_state: nextState };
    if (target && mark && mark !== "rejected" && value) patch[target] = value;
    save.mutate(patch);
    setEditing(null);
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI foreslår</p>
        <Badge variant="outline" className="text-[10px]">AI-forslag</Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Godkjenn, endre eller avvis hvert punkt. Godkjente forslag skrives til feltene under «Intern behandling».
      </p>

      {present.map((field) => {
        const raw = suggestions[field];
        const display = field === "priority" ? findingPriorityMeta(String(raw)).label : asText(raw);
        const isEditing = editing === field;
        const mark = state[field];
        return (
          <div key={field} className="rounded-md border bg-card px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium">{AI_SUGGESTION_LABELS[field]}</p>
              {mark && (
                <Badge
                  variant="outline"
                  className={
                    "text-[10px] " +
                    (mark === "rejected" ? "text-muted-foreground" : "border-emerald-500/40 text-emerald-600")
                  }
                >
                  {STATE_LABEL[mark] ?? mark}
                </Badge>
              )}
            </div>
            {isEditing ? (
              field === "priority" ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {FINDING_PRIORITIES.map((p) => (
                    <Button key={p.value} size="sm" variant={buffer === p.value ? "default" : "outline"}
                      onClick={() => setBuffer(p.value)}>{p.label}</Button>
                  ))}
                </div>
              ) : field === "internal_category" ? (
                <Input className="mt-1" value={buffer} onChange={(e) => setBuffer(e.target.value)} />
              ) : (
                <Textarea className="mt-1" rows={3} value={buffer} onChange={(e) => setBuffer(e.target.value)} />
              )
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{display}</p>
            )}

            {canEdit && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {isEditing ? (
                  <>
                    <Button size="sm" onClick={() => persist(field, buffer.trim() || null, "edited")}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Lagre endret
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Avbryt</Button>
                  </>
                ) : !mark ? (
                  <>
                    <Button size="sm"
                      onClick={() => persist(field, field === "priority" ? String(raw) : asText(raw), "accepted")}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Godkjenn
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={() => { setEditing(field); setBuffer(field === "priority" ? String(raw) : asText(raw)); }}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Endre
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => persist(field, null, "rejected")}>
                      <X className="mr-1 h-3.5 w-3.5" /> Avvis
                    </Button>
                  </>
                ) : (
                  <>
                    {field === "proposed_solution" && mark !== "rejected" && onCreateActionFromSolution && (
                      <Button size="sm" onClick={() => onCreateActionFromSolution(finding.proposed_solution ?? asText(raw))}>
                        <ListChecks className="mr-1 h-3.5 w-3.5" /> Opprett tiltak fra forslag
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => persist(field, null, null)}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Vurder på nytt
                    </Button>
                  </>
                )}
              </div>
            )}
            {field === "needed_documentation" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Dokumentasjonen kobles som bevis i seksjonen «Dokumentasjon og bevis» – godkjenning her er kun en huskeliste.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
