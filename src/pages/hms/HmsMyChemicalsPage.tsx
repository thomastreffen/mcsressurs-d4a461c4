import { useState } from "react";
import { Beaker, CheckCircle2, FileText, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { fetchSdsUrl, useMyChemicals } from "@/hooks/useChemicals";

export default function HmsMyChemicalsPage() {
  const { data = [], isLoading } = useMyChemicals();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const rows = data.filter((r) => {
    const t = `${r.chemical.product_name} ${r.chemical.category ?? ""} ${r.chemical.supplier ?? ""}`.toLowerCase();
    return t.includes(q.toLowerCase());
  });

  const openSds = async (chemicalId: string) => {
    setBusy(chemicalId);
    try {
      const res = await fetchSdsUrl({ chemical_id: chemicalId });
      window.open(res.url, "_blank", "noopener");
    } catch (e: any) {
      toast({ title: "Kunne ikke åpne SDS", description: String(e.message || e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Kjemikalier</h1>
        <p className="text-sm text-muted-foreground">
          Sikkerhetsdatablad, verneutstyr og førstehjelp for produktene vi bruker.
        </p>
      </div>

      <Input placeholder="Søk etter produkt…" value={q} onChange={(e) => setQ(e.target.value)} />

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-2">
            <Beaker className="h-8 w-8 mx-auto text-muted-foreground/40" />
            Ingen kjemikalier registrert enda.
          </CardContent>
        </Card>
      ) : (
        rows.map(({ chemical: c, acknowledged_at, needs_new_ack }) => (
          <Card key={c.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-medium">{c.product_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[c.supplier, c.category].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                {needs_new_ack ? (
                  <Badge variant="destructive" className="text-[10px]">Ny SDS – bekreft på nytt</Badge>
                ) : acknowledged_at ? (
                  <Badge className="text-[10px] gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {format(new Date(acknowledged_at), "d. MMM yy", { locale: nb })}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Ikke bekreftet</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {c.is_high_risk && <Badge variant="destructive" className="text-[10px]">Høyrisiko</Badge>}
                {c.requires_sja && <Badge variant="outline" className="text-[10px]">Krever SJA</Badge>}
                {c.requires_special_ppe && <Badge variant="outline" className="text-[10px]">Særskilt PVU</Badge>}
              </div>

              {c.sds_path ? (
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => openSds(c.id)} disabled={busy === c.id}>
                  {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                  Sikkerhetsdatablad
                  {c.sds_revision_date && <span className="ml-auto text-xs text-muted-foreground">rev. {c.sds_revision_date}</span>}
                </Button>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                  <ShieldAlert className="h-3.5 w-3.5 text-destructive" /> Sikkerhetsdatablad mangler
                </div>
              )}

              <Accordion type="single" collapsible>
                {[
                  ["Personlig verneutstyr", c.ppe_requirements],
                  ["Førstehjelp", c.first_aid],
                  ["Ventilasjon", c.ventilation_requirements],
                  ["Lagring", c.storage_requirements],
                  ["Avfallshåndtering", c.waste_handling],
                  ["Fare (H-setninger)", (c.h_statements ?? []).join("\n")],
                  ["Sikkerhet (P-setninger)", (c.p_statements ?? []).join("\n")],
                ]
                  .filter(([, v]) => !!v)
                  .map(([label, value]) => (
                    <AccordionItem key={label as string} value={label as string}>
                      <AccordionTrigger className="text-sm">{label}</AccordionTrigger>
                      <AccordionContent className="text-sm whitespace-pre-line">{value}</AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
