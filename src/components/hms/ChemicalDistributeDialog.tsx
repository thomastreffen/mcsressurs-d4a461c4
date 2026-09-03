import { useMemo, useState } from "react";
import { Copy, Loader2, Send, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { useSendableEmployees } from "@/hooks/useHandbookDistribution";
import { useSendChemicalInfo, type ChemicalRow, type SendChemicalResult } from "@/hooks/useChemicals";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chemical: ChemicalRow;
  /** HMS-kapitler som er koblet til kjemikaliet. */
  sections: { section_id: string; heading: string }[];
  /** Forhåndsvalgte ansatte (brukes fra Ressursplan-hurtighandling). */
  presetPersonIds?: string[];
}

export function ChemicalDistributeDialog({ open, onOpenChange, chemical, sections, presetPersonIds }: Props) {
  const { data: employees = [], isLoading } = useSendableEmployees();
  const sendMut = useSendChemicalInfo();

  const [selected, setSelected] = useState<string[]>(presetPersonIds ?? []);
  const [sectionIds, setSectionIds] = useState<string[]>(sections.map((s) => s.section_id));
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<SendChemicalResult | null>(null);

  const chosen = useMemo(() => employees.filter((e) => selected.includes(e.person_id)), [employees, selected]);

  const toggle = (id: string, list: string[], set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const send = async () => {
    if (!email && !sms) {
      toast({ title: "Velg minst én kanal", variant: "destructive" });
      return;
    }
    if (chosen.length === 0) {
      toast({ title: "Velg minst én ansatt", variant: "destructive" });
      return;
    }
    try {
      const res = await sendMut.mutateAsync({
        chemical_id: chemical.id,
        section_ids: sectionIds,
        channels: [email ? "email" : null, sms ? "sms" : null].filter(Boolean) as string[],
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
        recipients: chosen.map((e) => ({
          person_id: e.person_id, user_id: e.user_id, full_name: e.full_name, email: e.email, phone: e.phone,
        })),
      });
      setResult(res);
      const failed = res.recipients.filter((r) => r.status === "failed").length;
      toast({
        title: "Kjemikalieinfo sendt",
        description: failed > 0 ? `${failed} e-post feilet – bruk SMS-lenken i stedet.` : `${res.recipients.length} mottaker(e).`,
        variant: failed > 0 ? "destructive" : undefined,
      });
    } catch (e: any) {
      toast({ title: "Utsending feilet", description: String(e.message || e), variant: "destructive" });
    }
  };

  const close = () => {
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Send info og be om bekreftelse
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Personlige lenker er opprettet. SMS-tekst kan kopieres og sendes fra mobilen.
            </p>
            <div className="space-y-2">
              {result.recipients.map((r) => (
                <div key={r.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{r.full_name ?? r.email ?? "Mottaker"}</span>
                    <Badge variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "outline"}>
                      {r.status === "sent" ? "E-post sendt" : r.status === "failed" ? "E-post feilet" : "Kun lenke"}
                    </Badge>
                  </div>
                  {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                  <div className="flex items-center gap-2">
                    <Input readOnly value={r.sms_text ?? r.link} className="h-8 text-xs" />
                    <Button
                      size="sm" variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(r.sms_text ?? r.link);
                        toast({ title: "Kopiert" });
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={close}>Ferdig</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
              <div className="text-sm font-medium">{chemical.product_name}</div>
              <div className="flex flex-wrap gap-1.5">
                {chemical.is_high_risk && <Badge variant="destructive" className="text-[10px]">Høyrisiko</Badge>}
                {chemical.requires_sja && <Badge variant="outline" className="text-[10px]">Krever SJA</Badge>}
                {chemical.requires_training && <Badge variant="outline" className="text-[10px]">Krever opplæring</Badge>}
                <Badge variant={chemical.sds_path ? "outline" : "destructive"} className="text-[10px]">
                  {chemical.sds_path ? "SDS følger med" : "SDS mangler"}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">1. HMS-rutiner som følger med</Label>
              {sections.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Ingen HMS-kapitler er koblet til dette produktet ennå. Kjemikalieinfo og SDS sendes uten rutinetekst.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {sections.map((s) => (
                    <label key={s.section_id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={sectionIds.includes(s.section_id)}
                        onCheckedChange={() => toggle(s.section_id, sectionIds, setSectionIds)}
                      />
                      {s.heading}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                2. Ansatte {selected.length > 0 && `(${selected.length})`}
              </Label>
              <ScrollArea className="h-44 rounded-md border p-2">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground p-2">Laster ansatte…</p>
                ) : employees.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">Ingen aktive ansatte funnet.</p>
                ) : (
                  employees.map((e) => (
                    <label key={e.person_id} className="flex items-center gap-2 py-1 text-sm">
                      <Checkbox
                        checked={selected.includes(e.person_id)}
                        onCheckedChange={() => toggle(e.person_id, selected, setSelected)}
                      />
                      <span className="flex-1">{e.full_name}</span>
                      <span className="text-xs text-muted-foreground">{e.email ?? e.phone ?? "mangler kontaktinfo"}</span>
                    </label>
                  ))
                )}
              </ScrollArea>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">3. Kanal</Label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={email} onCheckedChange={(v) => setEmail(!!v)} /> Send e-post
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={sms} onCheckedChange={(v) => setSms(!!v)} /> Lag personlig SMS-lenke
                </label>
              </div>
              <Input placeholder="Emne (valgfritt)" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <Textarea
                placeholder="Melding (valgfritt)"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={close}>Avbryt</Button>
              <Button onClick={send} disabled={sendMut.isPending}>
                {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
