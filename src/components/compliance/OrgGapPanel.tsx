import { AlertTriangle, ShieldCheck, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrgGap, RoleSuggestion } from "@/lib/org-overview";

interface Props {
  gaps: OrgGap[];
  suggestions: RoleSuggestion[];
  onFix: (roleId: string) => void;
  onAcceptSuggestion: (s: RoleSuggestion) => void;
}

export function OrgGapPanel({ gaps, suggestions, onFix, onAcceptSuggestion }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4" /> Systemkontroll
            <Badge variant="secondary" className="text-[10px]">Systemfakta</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0">
          {gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen mangler funnet. Alle sentrale roller er tildelt aktive ansatte med dokumentert ansvar og myndighet.</p>
          ) : (
            gaps.map((g) => (
              <div key={g.id} className="flex items-start gap-2 rounded-lg border p-2.5">
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${g.severity === "alert" ? "text-destructive" : "text-amber-600"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{g.title}</p>
                  <p className="text-xs text-muted-foreground">{g.detail}</p>
                </div>
                {g.roleId && (
                  <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => onFix(g.roleId!)}>
                    Rett opp
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4" /> Foreslåtte roller
            <Badge variant="outline" className="text-[10px]">Må bekreftes</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0">
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen forslag – organisasjonsrollene dekker de sentrale ansvarsområdene.</p>
          ) : (
            suggestions.map((s) => (
              <div key={s.spec.key} className="flex items-start gap-2 rounded-lg border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.spec.label}</p>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                  <p className="text-[11px] text-muted-foreground/80">{s.spec.basis}</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => onAcceptSuggestion(s)}>
                  Opprett og bekreft
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
