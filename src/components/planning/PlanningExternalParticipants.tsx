import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Send, UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithSession } from "@/lib/invoke-session";
import { usePlanningExternal } from "@/hooks/usePlanningExternal";
import { invitationSummary, type ExternalType } from "@/lib/planning-external";

export function PlanningExternalParticipants({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { participants, canManage, refresh } = usePlanningExternal(projectId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState<ExternalType>("customer");
  const [sending, setSending] = useState(false);
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
    const { error } = await supabase.rpc("planning_revoke_external", { _id: id });
    if (error) toast.error(error.message); else { toast.success("Tilgangen er avsluttet"); await refresh(); }
  };
  return <section className="space-y-4 border-t border-border pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Eksterne deltakere</h2>{canManage && <Button variant="outline" className="min-h-11" onClick={() => setOpen(v => !v)}><UserPlus />{open ? "Avbryt invitasjon" : "Inviter ekstern"}</Button>}</div>
    {open && <form onSubmit={send} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="external-name">Navn</Label><Input id="external-name" className="min-h-11" required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="external-email">E-post</Label><Input id="external-email" className="min-h-11" type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="external-company">Firma</Label><Input id="external-company" className="min-h-11" maxLength={200} value={company} onChange={e => setCompany(e.target.value)} /></div>
        <div className="space-y-1"><Label>Type</Label><Select value={type} onValueChange={v => setType(v as ExternalType)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="customer">Kunde</SelectItem><SelectItem value="supplier">Leverandør / samarbeidspartner</SelectItem></SelectContent></Select></div>
      </div>
      <div className="space-y-2 border-l-2 border-primary pl-4 text-sm"><h3 className="font-semibold">Dette får mottakeren tilgang til</h3><p>{invitationSummary(name, projectName, type)}</p><p className="text-muted-foreground">Personlige invitasjonslenker gjelder i 48 timer og kan brukes én gang. E-post sendes til {email || "adressen over"}.</p></div>
      <Button type="submit" className="min-h-11" disabled={sending}><Send />{sending ? "Sender…" : "Send invitasjon"}</Button>
    </form>}
    {participants.isError && <p role="alert" className="text-destructive">Kunne ikke hente deltakerne.</p>}
    <ul className="space-y-3">{participants.data?.map(p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3"><div className="min-w-0 break-words text-sm"><strong>{p.name}</strong> · {p.company_name}<p>{p.email} · {p.participant_type === "customer" ? "Kunde" : "Leverandør"} · {({ active: "Aktiv", pending: "Klargjort", sent: "Invitert", send_failed: "Sending feilet", revoked: "Avsluttet" } as Record<string,string>)[p.status] || p.status}</p></div>{canManage && <Button variant="ghost" className="min-h-11" onClick={() => revoke(p.id)}><UserX />Avslutt tilgang</Button>}</li>)}</ul>
  </section>;
}