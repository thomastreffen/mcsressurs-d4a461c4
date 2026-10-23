import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, UserPlus, Send, UserX, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithSession } from "@/lib/invoke-session";
import { usePlanningExternal } from "@/hooks/usePlanningExternal";
import { CHANNEL_LABELS, type ExternalType } from "@/lib/planning-external";

const STATUS: Record<string, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Akseptert", tone: "default" },
  sent: { label: "Invitasjon sendt", tone: "secondary" },
  pending: { label: "Klargjøres", tone: "outline" },
  send_failed: { label: "Sending feilet", tone: "destructive" },
  revoked: { label: "Tilgang avsluttet", tone: "outline" },
  paused: { label: "Satt på pause", tone: "outline" },
};
const typeLabel = (t: ExternalType) => (t === "customer" ? "Kunde" : "Leverandør / samarbeidspartner");

/** Eksterne prosjektdeltakere – egen liste og inline invitasjon (ingen modal). */
export function PlanningExternalParticipants({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { participants, canManage, refresh } = usePlanningExternal(projectId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState<ExternalType>("supplier");
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const list = participants.data ?? [];
  const activeCount = list.filter((p) => p.status !== "revoked").length;

  const resume = async (participantId: string) => {
    const { error } = await supabase.rpc("planning_external_resume", { _participant_id: participantId });
    if (error) { toast.error(error.message); return; }
    toast.success("Tilgangen er aktiv igjen. Send en ny tilgangslenke ved behov.");
    await refresh();
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || sending) return;
    setSending(true);
    try {
      const { data, error } = await invokeWithSession<{ ok: boolean; error?: string }>("planning-external-invite", { body: { project_id: projectId, name, email, company, type } });
      if (error || !data?.ok) throw error || new Error(data?.error || "Kunne ikke sende invitasjonen");
      toast.success("Invitasjonen er sendt");
      setOpen(false); setName(""); setEmail(""); setCompany("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Kunne ikke sende invitasjonen"); }
    finally { await refresh(); setSending(false); }
  };
  const revoke = async (id: string) => {
    if (!canManage) return;
    const { error } = await supabase.rpc("planning_revoke_external", { _id: id });
    if (error) toast.error(error.message); else { setConfirmRevoke(null); toast.success("Tilgangen er avsluttet"); await refresh(); }
  };
  const resend = async (id: string) => {
    if (!canManage || resending) return;
    setResending(id);
    try {
      const { data, error } = await invokeWithSession<{ ok: boolean; error?: string }>("planning-external-login", { body: { participant_id: id, project_id: projectId } });
      if (error || !data?.ok) throw error || new Error(data?.error || "Kunne ikke sende tilgangslenken");
      toast.success("Tilgangslenken er sendt"); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Kunne ikke sende tilgangslenken"); }
    finally { setResending(null); }
  };
  const channel = CHANNEL_LABELS[type];

  return (
    <Card className="space-y-3 p-4" aria-labelledby="external-participants-heading">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <h2 id="external-participants-heading" className="text-sm font-semibold text-foreground">Eksterne deltakere</h2>
        <span className="text-xs text-muted-foreground">{activeCount}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Kunder og leverandører utenfor MCS. De ser kun dette prosjektet – aldri resten av MCS Hub.
      </p>

      {canManage && !open && (
        <Button variant="outline" className="min-h-11 w-full" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" /> Inviter ekstern
        </Button>
      )}

      {open && (
        <form onSubmit={send} className="space-y-3 rounded-lg border border-border p-3">
          <div className="space-y-1"><Label htmlFor="external-name">Navn</Label><Input id="external-name" className="min-h-11" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="external-email">E-post</Label><Input id="external-email" className="min-h-11" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="external-company">Firma</Label><Input id="external-company" className="min-h-11" maxLength={200} value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ExternalType)}>
              <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Kunde</SelectItem>
                <SelectItem value="supplier">Leverandør / samarbeidspartner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Tilgang</Label>
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">Standard prosjekttilgang</p>
          </div>

          <div className="space-y-2 border-l-2 border-primary pl-3 text-sm">
            <p className="font-semibold">{name || "Personen"} får tilgang til</p>
            <ul className="space-y-1">
              {[`Prosjektet «${projectName}»`, `Samtalene ${channel} og Alle`, `Filer, oppgaver og arbeidspakker delt med ${channel.toLowerCase()} eller alle`].map((t) => (
                <li key={t} className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{t}</li>
              ))}
            </ul>
            <p className="pt-1 font-semibold">Får ikke tilgang til</p>
            <ul className="space-y-1 text-muted-foreground">
              {["Intern plan og " + (type === "customer" ? "Leverandør" : "Kunde") + "-samtalen", "Innhold merket «Kun MCS»", "Andre prosjekter, Ressursplan, kunder, ansatte, HMS og intern økonomi"].map((t) => (
                <li key={t} className="flex gap-1.5"><X className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Engangslenke sendes til {email || "e-postadressen over"} og gjelder i 48 timer.</p>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button type="submit" className="min-h-11 flex-1" disabled={sending}><Send className="h-4 w-4" />{sending ? "Sender…" : "Send invitasjon"}</Button>
          </div>
        </form>
      )}

      {participants.isError && <p role="alert" className="text-sm text-destructive">Kunne ikke hente eksterne deltakere.</p>}
      {list.length === 0 && !participants.isLoading && <p className="text-xs text-muted-foreground">Ingen eksterne er invitert ennå.</p>}
      <ul className="space-y-2">
        {list.map((p) => {
          const s = STATUS[p.status] ?? { label: p.status, tone: "outline" as const };
          const revoked = p.status === "revoked";
          return (
            <li key={p.id} className="space-y-1.5 rounded-lg border border-border/40 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-foreground">{p.name}</p>
                  <p className="break-words text-xs text-muted-foreground">{[p.company_name, typeLabel(p.participant_type)].filter(Boolean).join(" · ")}</p>
                  <p className="break-all text-xs text-muted-foreground">{p.email}</p>
                </div>
                <Badge variant={s.tone} className="shrink-0">{s.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {revoked ? "Ingen tilgang" : `Tilgang: dette prosjektet · ${CHANNEL_LABELS[p.participant_type]} + Alle`}
              </p>
              {canManage && p.status === "paused" && (
                <Button variant="outline" size="sm" className="min-h-11 w-full justify-start" onClick={() => resume(p.id)}>Aktiver tilgang igjen</Button>
              )}
              {canManage && !revoked && p.status !== "paused" && (
                <div className="space-y-1">
                  <Button variant="outline" size="sm" className="min-h-11 w-full justify-start whitespace-normal text-left" disabled={!!resending} onClick={() => resend(p.id)}><Send className="h-4 w-4 shrink-0" />{resending === p.id ? "Sender…" : "Send tilgangslenke på nytt"}</Button>
                  {confirmRevoke === p.id ? <div className="space-y-2 border-l-2 border-destructive pl-3"><p className="text-sm">Avslutte {p.name} sin tilgang til dette prosjektet?</p><div className="flex flex-wrap gap-2"><Button variant="ghost" className="min-h-11" onClick={() => setConfirmRevoke(null)}>Behold tilgang</Button><Button variant="destructive" className="min-h-11" onClick={() => revoke(p.id)}>Avslutt tilgang</Button></div></div>
                  : <Button variant="ghost" size="sm" className="min-h-11 w-full justify-start text-destructive" onClick={() => setConfirmRevoke(p.id)}><UserX className="h-4 w-4" /> Avslutt tilgang</Button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
