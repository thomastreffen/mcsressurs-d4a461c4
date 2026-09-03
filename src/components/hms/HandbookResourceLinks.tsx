import { useMemo, useState } from "react";
import { Link2, Plus, Trash2, FlaskConical, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useChemicals } from "@/hooks/useChemicals";
import { useSaveSectionResources, type HandbookSectionResourceRow } from "@/hooks/useHandbookDistribution";
import {
  HMS_COVERAGE_AREAS, RESOURCE_TYPES, RESOURCE_TYPE_LABELS,
  suggestCoverageAreas, type HandbookResourceLink, type HandbookResourceType,
} from "@/lib/hms/handbookPackage";

/**
 * Admin: koble ressurser (kjemikalier, SDS, rutiner, sjekklister, SJA, beredskap …)
 * og dekningsområder til et HMS-kapittel. Følger automatisk med i utsendingen.
 */
export function HandbookResourceLinks({
  versionId,
  section,
}: {
  versionId: string;
  section: HandbookSectionResourceRow;
}) {
  const { data: chemicals = [] } = useChemicals();
  const saveMut = useSaveSectionResources();

  const [newType, setNewType] = useState<HandbookResourceType>("rutine");
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const suggested = useMemo(() => suggestCoverageAreas(section.heading), [section.heading]);

  const save = (patch: Parameters<typeof saveMut.mutate>[0]) =>
    saveMut.mutate(patch, {
      onSuccess: () => toast({ title: "Lagret" }),
      onError: (e: any) => toast({ title: "Feil", description: String(e.message || e), variant: "destructive" }),
    });

  const addLink = () => {
    if (!newLabel.trim()) {
      toast({ title: "Gi ressursen et navn", variant: "destructive" });
      return;
    }
    const next: HandbookResourceLink[] = [
      ...section.resource_links,
      { type: newType, label: newLabel.trim(), url: newUrl.trim() || null },
    ];
    setNewLabel("");
    setNewUrl("");
    save({ section_id: section.id, version_id: versionId, resource_links: next });
  };

  const removeLink = (i: number) =>
    save({
      section_id: section.id,
      version_id: versionId,
      resource_links: section.resource_links.filter((_, idx) => idx !== i),
    });

  const toggleChemical = (id: string) => {
    const next = section.chemical_ids.includes(id)
      ? section.chemical_ids.filter((x) => x !== id)
      : [...section.chemical_ids, id];
    save({ section_id: section.id, version_id: versionId, chemical_ids: next });
  };

  const toggleArea = (area: string) => {
    const next = section.coverage_areas.includes(area)
      ? section.coverage_areas.filter((x) => x !== area)
      : [...section.coverage_areas, area];
    save({ section_id: section.id, version_id: versionId, coverage_areas: next });
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Koblede ressurser og dekning
          {saveMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Vedlegg og lenker</Label>
          {section.resource_links.length === 0 && (
            <p className="text-xs text-muted-foreground">Ingen ressurser koblet til kapittelet enda.</p>
          )}
          <div className="space-y-1.5">
            {section.resource_links.map((l, i) => (
              <div key={`${l.label}-${i}`} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {RESOURCE_TYPE_LABELS[l.type as HandbookResourceType] ?? l.type}
                </Badge>
                <span className="flex-1 truncate">{l.label}</span>
                {l.url && <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">{l.url}</span>}
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeLink(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[160px_1fr_1fr_auto]">
            <Select value={newType} onValueChange={(v) => setNewType(v as HandbookResourceType)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{RESOURCE_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="h-9" placeholder="Navn (f.eks. SJA-mal skjøtestøp)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <Input className="h-9" placeholder="Lenke (valgfritt)" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
            <Button className="h-9" variant="outline" onClick={addLink}>
              <Plus className="h-4 w-4 mr-1" /> Legg til
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" /> Kjemikalier fra stoffkartoteket
          </Label>
          <ScrollArea className="h-36 rounded-md border p-2">
            {chemicals.length === 0 ? (
              <p className="text-xs text-muted-foreground p-1">Ingen kjemikalier registrert.</p>
            ) : (
              <div className="space-y-1">
                {chemicals.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm py-0.5">
                    <Checkbox checked={section.chemical_ids.includes(c.id)} onCheckedChange={() => toggleChemical(c.id)} />
                    <span className="flex-1 truncate">{c.product_name}</span>
                    {c.is_high_risk && <Badge variant="outline" className="text-[10px] border-red-300 bg-red-50 text-red-700">Høyrisiko</Badge>}
                  </label>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Dekningsområder</Label>
          {suggested.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Foreslått ut fra tittel: {suggested.join(", ")}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {HMS_COVERAGE_AREAS.map((a) => {
              const on = section.coverage_areas.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleArea(a)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
