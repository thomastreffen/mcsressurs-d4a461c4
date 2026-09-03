import { useState } from "react";
import { Link } from "react-router-dom";
import { Beaker, ExternalLink, FileText, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { fetchSdsUrl, useChemical, useChemicalSections } from "@/hooks/useChemicals";

/** Viser SDS og HMS-rutine for kjemikaliet et avvik er koblet til. */
export function IncidentChemicalPanel({ chemicalId, issueType }: { chemicalId: string; issueType?: string | null }) {
  const { data: chem } = useChemical(chemicalId);
  const { data: sections = [] } = useChemicalSections(chemicalId);
  const [busy, setBusy] = useState(false);

  if (!chem) return null;

  const openSds = async () => {
    setBusy(true);
    try {
      const res = await fetchSdsUrl({ chemical_id: chemicalId });
      window.open(res.url, "_blank", "noopener");
    } catch (e: any) {
      toast({ title: "Kunne ikke åpne SDS", description: String(e.message || e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-amber-300/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Beaker className="h-4 w-4" /> Kjemikalie: {chem.product_name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-1.5">
          {issueType && <Badge variant="outline" className="text-[10px]">{issueType}</Badge>}
          {chem.is_high_risk && <Badge variant="destructive" className="text-[10px]">Høyrisiko</Badge>}
          {chem.requires_sja && <Badge variant="outline" className="text-[10px]">Krever SJA</Badge>}
        </div>

        {chem.ppe_requirements && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Verneutstyr</div>
            <div className="whitespace-pre-wrap">{chem.ppe_requirements}</div>
          </div>
        )}
        {chem.first_aid && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Førstehjelp</div>
            <div className="whitespace-pre-wrap">{chem.first_aid}</div>
          </div>
        )}

        {sections.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">HMS-rutiner</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {sections.map((s) => <li key={s.section_id}>{s.heading}</li>)}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {chem.sds_path ? (
            <Button size="sm" variant="outline" onClick={openSds} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <FileText className="h-3.5 w-3.5 mr-2" />}
              Sikkerhetsdatablad
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 text-destructive">
              <ShieldAlert className="h-3.5 w-3.5" /> Sikkerhetsdatablad mangler
            </div>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/hms/kjemikalier/${chemicalId}`}>
              Åpne produkt <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Aktuelle tiltak: oppdater SDS, oppdater HMS-rutine, send ny informasjon og krev ny bekreftelse, eller gjennomfør ny SJA.
        </p>
      </CardContent>
    </Card>
  );
}
