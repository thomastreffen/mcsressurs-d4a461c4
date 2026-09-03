import { useMemo, useState } from "react";
import { Copy, FlaskConical, Loader2, Package, Send, Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useSendableEmployees, useSendHandbook, useHandbookSectionResources, type SendResultRecipient,
} from "@/hooks/useHandbookDistribution";
import { useChemicals } from "@/hooks/useChemicals";
import { sdsState, SDS_STATE_LABELS } from "@/lib/hms/chemicals";
import {
  CHEMICAL_AUDIENCE_TAGS, CHEMICAL_MODE_LABELS, RESOURCE_TYPE_LABELS,
  type ChemicalInclusionMode, type HandbookResourceType,
} from "@/lib/hms/handbookPackage";

interface ChapterOption { id: string; heading: string; is_mandatory?: boolean }

export function HandbookDistributeDialog({
  open,
  onOpenChange,
  handbookId,
  handbookTitle,
  versionId,
  versionNumber,
  chapters,
  preselectedChapterId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  handbookId: string;
  handbookTitle: string;
  versionId: string | null;
  versionNumber?: number | null;
  chapters: ChapterOption[];
  preselectedChapterId?: string | null;
}) {
  const { data: employees = [], isLoading } = useSendableEmployees();
  const { data: sectionResources = [] } = useHandbookSectionResources(versionId);
  const { data: chemicals = [] } = useChemicals();
  const sendMut = useSendHandbook();

  const [scope, setScope] = useState<"full" | "chapters">(preselectedChapterId ? "chapters" : "full");
  const [selectedChapters, setSelectedChapters] = useState<string[]>(preselectedChapterId ? [preselectedChapterId] : []);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [useEmail, setUseEmail] = useState(true);
  const [useSms, setUseSms] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<SendResultRecipient[] | null>(null);
  const [chemMode, setChemMode] = useState<ChemicalInclusionMode>("all_relevant");
  const [audience, setAudience] = useState<string[]>([]);
  const [specificChemicals, setSpecificChemicals] = useState<string[]>([]);

  const selected = useMemo(
    () => employees.filter((e) => selectedPeople.includes(e.person_id)),
    [employees, selectedPeople],
  );

  const toggle = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  /** Forhåndsvisning av pakken – samme regler som i utsendingsfunksjonen. */
  const pkg = useMemo(() => {
    const includedSections =
      scope === "chapters" ? sectionResources.filter((s) => selectedChapters.includes(s.id)) : sectionResources;
    const sectionChemIds = new Set(includedSections.flatMap((s) => s.chemical_ids));
    const chosenChemicals = chemicals.filter((c) => {
      if (sectionChemIds.has(c.id)) return true;
      if (chemMode === "none") return false;
      if (chemMode === "specific") return specificChemicals.includes(c.id);
      if (c.status === "expired") return false;
      if (chemMode === "all_relevant") return c.relevant_for_all || c.is_high_risk;
      return c.relevant_for_all || (c.audience_tags ?? []).some((t) => audience.includes(t));
    });
    const resources = includedSections.flatMap((s) =>
      s.resource_links.map((l) => ({ ...l, section_heading: s.heading })),
    );
    return {
      sections: includedSections,
      chemicals: chosenChemicals,
      resources,
      mandatory: includedSections.filter((s) => s.is_mandatory),
      missingSds: chosenChemicals.filter((c) => sdsState(c) !== "ok"),
    };
  }, [scope, selectedChapters, sectionResources, chemicals, chemMode, specificChemicals, audience]);

  const send = async () => {
    if (!versionId) {
      toast({ title: "Ingen publisert utgave", description: "Publiser håndboken før utsending.", variant: "destructive" });
      return;
    }
    if (scope === "chapters" && selectedChapters.length === 0) {
      toast({ title: "Velg minst ett kapittel", variant: "destructive" });
      return;
    }
    if (selected.length === 0) {
      toast({ title: "Velg minst én ansatt", variant: "destructive" });
      return;
    }
    if (!useEmail && !useSms) {
      toast({ title: "Velg e-post og/eller SMS-lenke", variant: "destructive" });
      return;
    }
    try {
      const res = await sendMut.mutateAsync({
        handbook_id: handbookId,
        version_id: versionId,
        section_ids: scope === "chapters" ? selectedChapters : [],
        channels: [useEmail ? "email" : null, useSms ? "sms" : null].filter(Boolean) as string[],
        subject: subject || undefined,
        message: message || undefined,
        chemical_mode: chemMode,
        chemical_ids: chemMode === "specific" ? specificChemicals : undefined,
        audience_tags: chemMode === "audience" ? audience : undefined,
        recipients: selected.map((e) => ({
          person_id: e.person_id, user_id: e.user_id, full_name: e.full_name, email: e.email, phone: e.phone,
        })),
      });
      setResults(res.recipients);
      const failed = res.recipients.filter((r) => r.status === "failed").length;
      toast({
        title: "Sendt",
        description: failed
          ? `${res.recipients.length - failed} sendt, ${failed} feilet – bruk lenkene under.`
          : `${res.recipients.length} mottaker(e) er varslet.`,
      });
    } catch (e: any) {
      toast({ title: "Utsending feilet", description: String(e.message || e), variant: "destructive" });
    }
  };

  const close = () => {
    onOpenChange(false);
    setResults(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send til ansatte</DialogTitle>
          <DialogDescription>
            {handbookTitle}
            {versionNumber ? ` · utgave ${versionNumber}` : ""} – mottakerne får en personlig lenke med
            mobilvennlig visning og «Jeg har lest og forstått».
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Lenkene under kan limes rett inn i SMS eller annen melding.
            </p>
            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.id} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{r.full_name ?? r.email ?? "Mottaker"}</span>
                    <Badge variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                      {r.status === "sent" ? "E-post sendt" : r.status === "failed" ? "E-post feilet" : "Kun lenke"}
                    </Badge>
                  </div>
                  {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                  <div className="flex items-center gap-2">
                    <Input readOnly value={r.sms_text ?? r.link} className="h-8 text-xs" />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0"
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
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">1. Innhold</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={scope === "full" ? "default" : "outline"} onClick={() => setScope("full")}>
                  Hele håndboken
                </Button>
                <Button size="sm" variant={scope === "chapters" ? "default" : "outline"} onClick={() => setScope("chapters")}>
                  Valgte kapitler
                </Button>
              </div>
              {scope === "chapters" && (
                <p className="text-xs text-muted-foreground">
                  Velg ett eller flere kapitler. Mottakerne ser kun disse, og bekreftelsen gjelder hvert valgte kapittel.
                </p>
              )}
              {scope === "chapters" && (
                <ScrollArea className="h-40 rounded-md border p-2">
                  <div className="space-y-1.5">
                    {chapters.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm py-1">
                        <Checkbox
                          checked={selectedChapters.includes(c.id)}
                          onCheckedChange={() => setSelectedChapters((p) => toggle(p, c.id))}
                        />
                        <span className="flex-1">{c.heading}</span>
                        {c.is_mandatory && <Badge variant="outline" className="text-[10px]">Obligatorisk</Badge>}
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  2. Mottakere {selected.length > 0 && `(${selected.length})`}
                </Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    setSelectedPeople(selectedPeople.length === employees.length ? [] : employees.map((e) => e.person_id))
                  }
                >
                  <Users className="h-3.5 w-3.5 mr-1" />
                  {selectedPeople.length === employees.length ? "Fjern alle" : "Velg alle"}
                </Button>
              </div>
              <ScrollArea className="h-48 rounded-md border p-2">
                {isLoading ? (
                  <p className="text-xs text-muted-foreground p-2">Laster ansatte…</p>
                ) : employees.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">Ingen aktive ansatte funnet.</p>
                ) : (
                  <div className="space-y-1">
                    {employees.map((e) => (
                      <label key={e.person_id} className="flex items-center gap-2 text-sm py-1">
                        <Checkbox
                          checked={selectedPeople.includes(e.person_id)}
                          onCheckedChange={() => setSelectedPeople((p) => toggle(p, e.person_id))}
                        />
                        <span className="flex-1">{e.full_name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {e.email ?? "ingen e-post"}
                          {e.phone ? ` · ${e.phone}` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" /> 3. Stoffkartotek og kjemikalier
              </Label>
              <Select value={chemMode} onValueChange={(v) => setChemMode(v as ChemicalInclusionMode)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CHEMICAL_MODE_LABELS) as ChemicalInclusionMode[]).map((m) => (
                    <SelectItem key={m} value={m}>{CHEMICAL_MODE_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Kjemikalier som er koblet til kapitlene følger alltid med.
              </p>
              {chemMode === "audience" && (
                <div className="flex flex-wrap gap-1.5">
                  {CHEMICAL_AUDIENCE_TAGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAudience((p) => toggle(p, t))}
                      className={`rounded-full border px-2.5 py-1 text-[11px] ${
                        audience.includes(t) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              {chemMode === "specific" && (
                <ScrollArea className="h-36 rounded-md border p-2">
                  <div className="space-y-1">
                    {chemicals.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm py-0.5">
                        <Checkbox
                          checked={specificChemicals.includes(c.id)}
                          onCheckedChange={() => setSpecificChemicals((p) => toggle(p, c.id))}
                        />
                        <span className="flex-1 truncate">{c.product_name}</span>
                        {c.is_high_risk && <Badge variant="outline" className="text-[10px]">Høyrisiko</Badge>}
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Package className="h-4 w-4" /> Dette sendes til ansatte
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>
                  <span className="text-foreground font-medium">{handbookTitle}</span>
                  {versionNumber ? ` – utgave ${versionNumber}` : ""} ·{" "}
                  {scope === "full" ? "hele håndboken" : "valgte kapitler"}
                </li>
                <li>{pkg.sections.length} kapitler, hvorav {pkg.mandatory.length} obligatoriske med egen bekreftelse</li>
                <li>
                  {pkg.chemicals.length} kjemikalier med sikkerhetsdatablad
                  {pkg.missingSds.length > 0 && (
                    <span className="text-amber-700"> · {pkg.missingSds.length} uten gyldig SDS</span>
                  )}
                </li>
                <li>{pkg.resources.length} koblede ressurser og lenker</li>
              </ul>
              {pkg.resources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pkg.resources.slice(0, 8).map((r, i) => (
                    <Badge key={`${r.label}-${i}`} variant="outline" className="text-[10px]">
                      {RESOURCE_TYPE_LABELS[r.type as HandbookResourceType] ?? r.type}: {r.label}
                    </Badge>
                  ))}
                  {pkg.resources.length > 8 && (
                    <span className="text-[10px] text-muted-foreground">+{pkg.resources.length - 8} flere</span>
                  )}
                </div>
              )}
              {pkg.missingSds.length > 0 && (
                <p className="text-[11px] text-amber-700">
                  {pkg.missingSds.map((c) => `${c.product_name} (${SDS_STATE_LABELS[sdsState(c)]})`).join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">4. Kanal</Label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={useEmail} onCheckedChange={(v) => setUseEmail(!!v)} /> E-post
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={useSms} onCheckedChange={(v) => setUseSms(!!v)} /> SMS-lenke (kopieres etterpå)
                </label>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Emne (valgfritt)</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`${handbookTitle} – les og bekreft`} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Melding (valgfritt)</Label>
                <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Kort beskjed til ansatte…" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={close}>Avbryt</Button>
              <Button onClick={send} disabled={sendMut.isPending}>
                {sendMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Send
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
