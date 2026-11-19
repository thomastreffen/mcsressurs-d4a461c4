// Editable INTERNAL order draft from Avtalevakt. Not an order: no submission row, no notifications, no job, no assignment.
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LeadCustomerPicker, type LeadCustomerValue } from "@/components/leads/LeadCustomerPicker";
import { toast } from "sonner";

export interface Draft {
  id: string; company_id: string; status: string; suggested_type: string; version: number;
  customer_id: string | null; customer_account_id: string | null; contact_id: string | null;
  work_site: string | null; description: string | null; agreed_date: string | null; agreed_time: string | null;
  sensitive_flag: boolean; attachment_refs: { name: string; contentType: string; size: number; decision: string }[];
  source_mailbox: string | null; source_internet_message_id: string | null;
}
const missing = (d: { customer_id: string | null; work_site: string; description: string }) =>
  [!d.customer_id && "Kunde", !d.work_site.trim() && "Arbeidssted", !d.description.trim() && "Arbeidsbeskrivelse"].filter(Boolean) as string[];
const ERR: Record<string, string> = { version_conflict: "Utkastet er endret av andre – last på nytt", customer_invalid: "Kunden finnes ikke i dette selskapet", account_not_of_customer: "Avdelingen hører ikke til kunden", contact_not_of_customer: "Kontakten hører ikke til kunden", draft_discarded: "Utkastet er forkastet" };

export function ContractWatchDraftEditor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [cust, setCust] = useState<LeadCustomerValue | null>(null);
  const [contactId, setContactId] = useState<string | null>(draft.contact_id);
  const [type, setType] = useState(draft.suggested_type);
  const [site, setSite] = useState(draft.work_site ?? "");
  const [desc, setDesc] = useState(draft.description ?? "");
  const [date, setDate] = useState(draft.agreed_date ?? "");
  const [time, setTime] = useState(draft.agreed_time ?? "");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const customerId = cust?.mode === "existing" ? cust.customer.id : draft.customer_id;
  const miss = missing({ customer_id: customerId, work_site: site, description: desc });

  const save = async (status?: "draft" | "ready" | "discarded") => {
    setBusy(true);
    const patch: Record<string, unknown> = { suggested_type: type, work_site: site, description: desc, agreed_date: date, agreed_time: time, contact_id: contactId ?? "" };
    if (cust?.mode === "existing") { patch.customer_id = cust.customer.id; patch.customer_account_id = cust.accountId ?? ""; }
    if (status) patch.status = status;
    const { error } = await supabase.rpc("cw_draft_save", { _id: draft.id, _version: draft.version, _patch: patch as never });
    setBusy(false);
    if (error) { toast.error(ERR[error.message.match(/\w+$/)?.[0] ?? ""] ?? error.message); return; }
    toast.success(status === "ready" ? "Merket klar for kontroll – ingen bestilling er opprettet" : status === "discarded" ? "Utkast forkastet" : "Utkast lagret");
    onSaved(); if (status) onClose();
  };

  return (
    <Sheet open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto" mobileWorkspace>
        <SheetHeader>
          <SheetTitle>Bestillingsutkast (intern kladd)</SheetTitle>
          <SheetDescription>Dette er ikke en bestilling. Ingen jobb, montør, varsel eller e-post opprettes herfra.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4 text-sm">
          <div className="flex flex-wrap gap-2"><Badge variant="outline">Status: {draft.status === "ready" ? "Klar for kontroll" : "Kladd"}</Badge>{draft.sensitive_flag && <Badge variant="destructive">Mulig sensitiv info – kontroller teksten</Badge>}</div>
          <div className="space-y-1"><Label>Kunde, avdeling og kontakt</Label>
            {draft.customer_id && !cust && <p className="text-muted-foreground">Kunde er foreslått. Søk for å bekrefte eller bytte.</p>}
            <LeadCustomerPicker companyId={draft.company_id} value={cust} onChange={setCust} onContactPick={(c) => setContactId(c.id)} />
          </div>
          <div className="space-y-1"><Label>Type</Label>
            <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="service_order">Servicebestilling</SelectItem><SelectItem value="project">Prosjekt (foreslått)</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1"><Label htmlFor="cw-site">Arbeidssted</Label><Input id="cw-site" value={site} onChange={(e) => setSite(e.target.value)} maxLength={500} /></div>
          <div className="space-y-1"><Label htmlFor="cw-desc">Arbeidsbeskrivelse</Label><Textarea id="cw-desc" value={desc} onChange={(e) => setDesc(e.target.value)} className="min-h-32" maxLength={5000} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor="cw-date">Avtalt dato</Label><Input id="cw-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="cw-time">Tid</Label><Input id="cw-time" value={time} placeholder="f.eks. 08:00" onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          <p className="text-muted-foreground">Dato og tid fylles bare ut automatisk når de står eksplisitt i e-posten.</p>
          <div className="space-y-1"><Label>Kilde</Label><p className="text-muted-foreground">{draft.source_mailbox ?? "–"} · e-posttråd lagres som referanse, ikke kopi.</p></div>
          <div className="space-y-1"><Label>Vedlegg</Label>
            {draft.attachment_refs.length === 0 ? <p className="text-muted-foreground">Ingen vedlegg.</p> :
              <ul className="space-y-1">{draft.attachment_refs.map((a, i) => <li key={i}>{a.name} – {a.decision === "reference_only" ? "kun referanse, ikke hentet" : "avvist"}</li>)}</ul>}
            <p className="text-muted-foreground">Bilder og PDF hentes ikke til Hub før lesing er godkjent og du bekrefter vedlegget.</p>
          </div>
          {miss.length > 0 && <p className="text-destructive">Mangler: {miss.join(", ")}</p>}
          <label className="flex items-center gap-2"><Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} />Jeg har kontrollert kunde, sted, tekst og dato</label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => save()}>Lagre kladd</Button>
            <Button size="sm" disabled={busy || miss.length > 0 || !checked} onClick={() => save("ready")}>Merk klar for kontroll</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save("discarded")}>Forkast</Button>
          </div>
          <div className="rounded-xl border border-border p-3 text-muted-foreground">
            «Opprett bestilling» er sperret i fase 1. En ekte bestilling utløser varsler i dag og må aktiveres separat med varsling slått av som standard.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
