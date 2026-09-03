import { useEffect, useMemo, useState } from "react";
import { Loader2, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { RISK_TAGS, suggestRiskTags, type RiskTagKey } from "@/lib/hms/workReadiness";
import { useEventRiskTags, useSetEventRiskTags } from "@/hooks/useWorkReadiness";

interface Props {
  eventId: string;
  /** Fritekst som brukes til å foreslå tagger. */
  suggestFrom?: string;
}

/** Risikotagger på planlagt aktivitet – styrer hvilke HMS-krav som gjelder. */
export function RiskTagPicker({ eventId, suggestFrom }: Props) {
  const { data: saved = [], isLoading } = useEventRiskTags(eventId);
  const setTags = useSetEventRiskTags();
  const [tags, setTagsLocal] = useState<string[]>([]);

  useEffect(() => setTagsLocal(saved), [saved.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = useMemo(
    () => suggestRiskTags(suggestFrom).filter((t) => !tags.includes(t)),
    [suggestFrom, tags]
  );

  const toggle = async (key: RiskTagKey) => {
    const next = tags.includes(key) ? tags.filter((t) => t !== key) : [...tags, key];
    setTagsLocal(next);
    try {
      await setTags.mutateAsync({ eventId, tags: next });
    } catch (e: any) {
      setTagsLocal(tags);
      toast({ title: "Kunne ikke lagre risikotagger", description: e.message, variant: "destructive" });
    }
  };

  const groups = ["Kjemikalier", "Elsikkerhet", "Arbeidsforhold"] as const;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Tag className="h-4 w-4 text-muted-foreground" />
        Risikotagger
        {(isLoading || setTags.isPending) && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground">
        Taggene avgjør hvilke HMS-krav som kontrolleres for planlagte montører.
      </p>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-muted-foreground">Foreslått:</span>
          {suggestions.map((s) => (
            <Button key={s} size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => toggle(s)}>
              + {RISK_TAGS.find((t) => t.key === s)?.label}
            </Button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {groups.map((g) => (
          <div key={g} className="flex flex-wrap items-center gap-1">
            <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{g}</span>
            {RISK_TAGS.filter((t) => t.group === g).map((t) => {
              const active = tags.includes(t.key);
              return (
                <Badge
                  key={t.key}
                  variant="outline"
                  onClick={() => toggle(t.key)}
                  className={`cursor-pointer select-none text-xs ${
                    active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}
                >
                  {t.label}
                </Badge>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
