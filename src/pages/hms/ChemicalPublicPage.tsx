import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Beaker, CheckCircle2, FileText, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { renderHandbookBody } from "@/lib/hms/handbookText";
import { fetchSdsUrl } from "@/hooks/useChemicals";

const CONFIRMATION_TEXT = "Jeg har lest og forstått rutine og sikkerhetsdatablad for dette produktet.";

interface Payload {
  error?: string;
  recipient?: { id: string; full_name: string | null; acknowledged_at: string | null; expires_at: string; sds_revision_date: string | null };
  chemical?: any;
  sections?: { id: string; heading: string; body: string | null }[];
}

export default function ChemicalPublicPage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const [loadingSds, setLoadingSds] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["chemical-public", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hms_chemical_open_by_token", { p_token: token });
      if (error) throw error;
      return data as Payload;
    },
  });

  const ackMut = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await (supabase as any).rpc("hms_chemical_ack_by_token", {
        p_token: token,
        p_user_agent: navigator.userAgent.slice(0, 250),
        p_confirmation_text: CONFIRMATION_TEXT,
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
    },
    onSuccess: () => {
      toast({ title: "Takk – bekreftelsen er registrert" });
      qc.invalidateQueries({ queryKey: ["chemical-public", token] });
    },
    onError: (e: any) => toast({ title: "Kunne ikke bekrefte", description: String(e.message || e), variant: "destructive" }),
  });

  const chem = data?.chemical;
  const sections = useMemo(() => data?.sections ?? [], [data]);

  const openSds = async () => {
    setLoadingSds(true);
    try {
      const res = await fetchSdsUrl({ token });
      window.open(res.url, "_blank", "noopener");
    } catch (e: any) {
      toast({ title: "Kunne ikke åpne sikkerhetsdatablad", description: String(e.message || e), variant: "destructive" });
    } finally {
      setLoadingSds(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl p-4 space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!data || data.error || !chem) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-2 text-sm text-muted-foreground">
            <Beaker className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <div className="font-medium text-foreground">
              {data?.error === "expired" ? "Lenken er utløpt" : "Lenken er ikke gyldig"}
            </div>
            <p>Ta kontakt med HMS-ansvarlig for å få tilsendt ny lenke.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const acked = !!data.recipient?.acknowledged_at;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-3">
        <div className="mx-auto max-w-2xl space-y-0.5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Kjemikalieinformasjon
          </div>
          <h1 className="text-lg font-semibold leading-tight">{chem.product_name}</h1>
          <p className="text-xs text-muted-foreground">
            {[chem.supplier, chem.category].filter(Boolean).join(" · ") || "Stoffkartotek"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4 space-y-3 pb-36">
        {data.recipient?.full_name && (
          <p className="text-sm text-muted-foreground">
            Hei {data.recipient.full_name}. Les gjennom før bruk, og bekreft nederst.
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {chem.is_high_risk && <Badge variant="destructive" className="text-[10px]">Høyrisiko kjemikalie</Badge>}
          {chem.requires_sja && <Badge variant="outline" className="text-[10px]">Krever SJA før bruk</Badge>}
          {chem.requires_training && <Badge variant="outline" className="text-[10px]">Krever opplæring</Badge>}
          {chem.requires_special_ppe && <Badge variant="outline" className="text-[10px]">Særskilt verneutstyr</Badge>}
        </div>

        {chem.sds_path ? (
          <Button variant="outline" className="w-full justify-start" onClick={openSds} disabled={loadingSds}>
            {loadingSds ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
            Åpne sikkerhetsdatablad
            {chem.sds_revision_date && (
              <span className="ml-auto text-xs text-muted-foreground">rev. {chem.sds_revision_date}</span>
            )}
          </Button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            Sikkerhetsdatablad mangler – kontakt HMS-ansvarlig før du bruker produktet.
          </div>
        )}

        <InfoBlock title="Bruksområde" text={chem.usage_area} />
        <InfoBlock title="Personlig verneutstyr" text={chem.ppe_requirements} highlight />
        <InfoBlock title="Ventilasjon" text={chem.ventilation_requirements} />
        <InfoBlock title="Førstehjelp" text={chem.first_aid} highlight />
        <ListBlock title="Fare (H-setninger)" items={chem.h_statements} />
        <ListBlock title="Sikkerhet (P-setninger)" items={chem.p_statements} />
        <InfoBlock title="Lagring" text={chem.storage_requirements} />
        <InfoBlock title="Avfallshåndtering" text={chem.waste_handling} />

        {sections.length > 0 && (
          <Card>
            <CardContent className="p-2">
              <div className="px-2 pt-2 pb-1 text-xs uppercase tracking-wider text-muted-foreground">HMS-rutiner</div>
              <Accordion type="single" collapsible>
                {sections.map((s) => (
                  <AccordionItem key={s.id} value={s.id}>
                    <AccordionTrigger className="text-sm text-left">{s.heading}</AccordionTrigger>
                    <AccordionContent>{renderHandbookBody(s.body ?? "")}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur p-4">
        <div className="mx-auto max-w-2xl">
          {acked ? (
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Bekreftet {format(new Date(data.recipient!.acknowledged_at!), "d. MMM yyyy 'kl.' HH:mm", { locale: nb })}
            </div>
          ) : (
            <Button className="w-full h-12" onClick={() => ackMut.mutate()} disabled={ackMut.isPending}>
              {ackMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Jeg har lest og forstått rutine og sikkerhetsdatablad
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ title, text, highlight }: { title: string; text?: string | null; highlight?: boolean }) {
  if (!text) return null;
  return (
    <Card className={highlight ? "border-amber-300 bg-amber-50/50" : undefined}>
      <CardContent className="p-4 space-y-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
        <p className="text-sm whitespace-pre-line">{text}</p>
      </CardContent>
    </Card>
  );
}

function ListBlock({ title, items }: { title: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
        <ul className="text-sm space-y-1 list-disc pl-4">
          {items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}
