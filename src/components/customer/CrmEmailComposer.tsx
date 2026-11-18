import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { selectableRecipients, type RegisterContact } from "@/lib/customer-register";

type Preview = { sender: string | null; sender_connected: boolean; reply_to: string; to: string[]; manual: string[]; customer_name: string; account_name: string | null; reuses_thread: boolean; send_enabled: boolean };
const ERR: Record<string, string> = {
  contact_not_available: "En valgt kontakt hører ikke til kunden eller har sluttet", manual_not_confirmed: "Bekreft manuelle adresser", invalid_manual_email: "Ugyldig manuell e-postadresse",
  no_recipients: "Velg minst én mottaker", too_many_recipients: "For mange mottakere", invalid_subject: "Emne mangler", invalid_body: "Meldingen er tom",
  not_available: "Du har ikke tilgang til å sende for denne kunden", send_disabled: "Utsending er ikke slått på ennå", no_ms_connection: "Din Microsoft-konto er ikke tilkoblet – ingen e-post ble sendt",
};

export function CrmEmailComposer({ companyId, customerId, accountId, leadId, contacts, onClose }: { companyId: string; customerId: string; accountId?: string | null; leadId?: string | null; contacts: RegisterContact[]; onClose: () => void }) {
  const options = selectableRecipients(contacts).filter((c) => !accountId || c.customer_account_id === accountId || !c.customer_account_id);
  const [picked, setPicked] = useState<string[]>([]); const [manual, setManual] = useState(""); const [manualOk, setManualOk] = useState(false);
  const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false);
  const requestId = useMemo(() => crypto.randomUUID(), []);
  const reset = () => { setPreview(null); setConfirmed(false); };
  const call = async (action: "preview" | "send") => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("crm-email-send", { body: { action, company_id: companyId, customer_id: customerId, account_id: accountId ?? null, lead_id: leadId ?? null,
      contact_ids: picked, manual_emails: manual.split(/[,;\s]+/).filter(Boolean), manual_confirmed: manualOk, subject, body, request_id: requestId, confirmed } });
    setBusy(false);
    let payload: any = data;
    if (error) { try { payload = await (error as any).context?.json?.(); } catch { payload = null; } }
    if (payload?.error && !payload?.status) { toast.error(ERR[payload.error] ?? "Kunne ikke klargjøre e-posten"); if (payload.preview) setPreview(payload.preview); return; }
    if (action === "preview") { setPreview(payload.preview); return; }
    if (payload.status === "accepted") toast.success("Akseptert av Microsoft (ikke bekreftet levert)");
    else if (payload.status === "uncertain") toast.warning("Uavklart utfall – sjekk Sendte elementer før du prøver igjen");
    else toast.error("Sending feilet – ingen e-post ble sendt");
    onClose();
  };
  return (
    <Sheet open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <SheetContent mobileWorkspace className="sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle>Send e-post</SheetTitle><SheetDescription>Sendes fra din egen Microsoft-konto. Svar kobles til kunden i Hub.</SheetDescription></SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2"><Label>Mottakere fra kunderegisteret</Label>
            {options.length === 0 && <p className="text-sm text-muted-foreground">Ingen aktive kontakter med e-post.</p>}
            {options.map((c) => <label key={c.id} className="flex items-center gap-2 text-sm min-h-11"><Checkbox checked={picked.includes(c.id)} onCheckedChange={(v) => { reset(); setPicked((p) => v ? [...p, c.id] : p.filter((x) => x !== c.id)); }} />{c.name} · {c.email}</label>)}
          </div>
          <div className="space-y-1"><Label htmlFor="crm-manual">Andre adresser (valgfritt)</Label><Input id="crm-manual" value={manual} onChange={(e) => { setManual(e.target.value); setManualOk(false); reset(); }} placeholder="adresse@firma.no" />
            {manual.trim() && <label className="flex items-center gap-2 text-sm"><Checkbox checked={manualOk} onCheckedChange={(v) => { setManualOk(!!v); reset(); }} />Jeg har kontrollert at manuelle adresser er riktige</label>}</div>
          <div className="space-y-1"><Label htmlFor="crm-subj">Emne</Label><Input id="crm-subj" value={subject} onChange={(e) => { setSubject(e.target.value); reset(); }} /></div>
          <div className="space-y-1"><Label htmlFor="crm-body">Melding</Label><Textarea id="crm-body" rows={8} value={body} onChange={(e) => { setBody(e.target.value); reset(); }} /></div>
          {!preview && <Button className="w-full min-h-11" variant="outline" disabled={busy} onClick={() => call("preview")}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Forhåndsvis</Button>}
          {preview && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm space-y-1" aria-label="Forhåndsvisning">
              <p><span className="text-muted-foreground">Fra:</span> {preview.sender ?? "Ukjent"} {!preview.sender_connected && "(Microsoft ikke tilkoblet)"}</p>
              <p><span className="text-muted-foreground">Til:</span> {preview.to.join(", ")}</p>
              {preview.manual.length > 0 && <p className="text-destructive">Manuelt lagt til: {preview.manual.join(", ")}</p>}
              <p><span className="text-muted-foreground">Svar til:</span> {preview.reply_to}</p>
              <p><span className="text-muted-foreground">Kobles til:</span> {preview.customer_name}{preview.account_name ? ` – ${preview.account_name}` : ""}{leadId ? " · henvendelse" : ""}{preview.reuses_thread ? " (eksisterende tråd)" : " (ny tråd)"}</p>
              {!preview.send_enabled && <p className="text-muted-foreground">Utsending er ikke slått på ennå. Ingenting sendes.</p>}
              <label className="flex items-center gap-2 pt-2"><Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />Mottakere og innhold er kontrollert</label>
              <Button className="w-full min-h-11 mt-2" disabled={busy || !confirmed || !preview.send_enabled || !preview.sender_connected} onClick={() => call("send")}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Send</Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
