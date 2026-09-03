import { useMemo, useState } from "react";
import { Loader2, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  useAllChemicalRecipients, useChemicals, useSendChemicalInfo, type ChemicalRow,
} from "@/hooks/useChemicals";
import { matchesChemicalRisk } from "@/lib/hms/chemicals";

interface Props {
  /** Tekst fra oppgave/prosjekt (tittel, beskrivelse, HMS-områder) som sjekkes mot risikoord. */
  riskText: string;
  /** Montører som er planlagt på oppdraget. */
  technicians: { person_id?: string | null; user_id?: string | null; full_name?: string | null; email?: string | null; phone?: string | null }[];
}

/** Ikke-blokkerende varsel: planlagte montører mangler bekreftet kjemikalieinformasjon. */
export function ChemicalRiskAlert({ riskText, technicians }: Props) {
  const { data: chemicals = [] } = useChemicals();
  const { data: recipients = [] } = useAllChemicalRecipients();
  const sendMut = useSendChemicalInfo();
  const [sent, setSent] = useState(false);

  const riskHits = useMemo(() => matchesChemicalRisk(riskText), [riskText]);

  const relevant = useMemo(
    () =>
      riskHits.length === 0
        ? []
        : chemicals.filter((c) => c.status === "active" && c.requires_acknowledgement),
    [chemicals, riskHits]
  );


  const ackedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of recipients) {
      if (r.acknowledged_at) {
        if (r.person_id) s.add(`${r.chemical_id}:p:${r.person_id}`);
        if (r.user_id) s.add(`${r.chemical_id}:u:${r.user_id}`);
      }
    }
    return s;
  }, [recipients]);

  const gaps = useMemo(() => {
    const out: { chemical: ChemicalRow; tech: Props["technicians"][number] }[] = [];
    for (const c of relevant) {
      for (const t of technicians) {
        const ok =
          (t.person_id && ackedKeys.has(`${c.id}:p:${t.person_id}`)) ||
          (t.user_id && ackedKeys.has(`${c.id}:u:${t.user_id}`));
        if (!ok) out.push({ chemical: c, tech: t });
      }
    }
    return out;
  }, [relevant, technicians, ackedKeys]);

  if (relevant.length === 0 || gaps.length === 0 || sent) return null;

  const names = [...new Set(gaps.map((g) => g.tech.full_name ?? "Ansatt"))];

  const sendAll = async () => {
    try {
      for (const c of relevant) {
        const techs = gaps.filter((g) => g.chemical.id === c.id).map((g) => g.tech);
        if (techs.length === 0) continue;
        await sendMut.mutateAsync({
          chemical_id: c.id,
          channels: ["email"],
          subject: `Viktig sikkerhetsinformasjon: ${c.product_name}`,
          message: "Du er planlagt på arbeid der dette produktet brukes. Les rutine og sikkerhetsdatablad, og bekreft før arbeidet starter.",
          recipients: techs.map((t) => ({
            person_id: t.person_id, user_id: t.user_id, full_name: t.full_name, email: t.email, phone: t.phone,
          })),
        });
      }
      setSent(true);
      toast({ title: "Informasjon sendt", description: "Ansatte er bedt om å bekrefte." });
    } catch (e: any) {
      toast({ title: "Utsending feilet", description: String(e.message || e), variant: "destructive" });
    }
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 text-amber-600" />
        <div className="space-y-1">
          <div className="text-sm font-medium">Ansatt mangler bekreftet epoxy-/kjemikalieinformasjon</div>
          <p className="text-xs text-muted-foreground">
            {names.join(", ")} mangler bekreftelse for {relevant.map((c) => c.product_name).join(", ")}. Planleggingen blokkeres ikke, men risikoen bør håndteres.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {relevant.filter((c) => c.is_high_risk).map((c) => (
              <Badge key={c.id} variant="destructive" className="text-[10px]">Høyrisiko: {c.product_name}</Badge>
            ))}
          </div>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={sendAll} disabled={sendMut.isPending}>
        {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
        Send info og be om bekreftelse
      </Button>
    </div>
  );
}
