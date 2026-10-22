import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Reply, Send, X } from "lucide-react";
import { toast } from "sonner";
import { planningAudience } from "@/hooks/usePlanningExternal";
import { CHANNEL_LABELS, chosenRecipients, excludedRecipients, type ChannelMessage, type ChannelPerson, type PlanningChannel } from "@/lib/planning-external";

export function PlanningChannelConversation({ projectId, channel, token, participantId, readOnly = false }: {
  projectId: string; channel: PlanningChannel; token?: string; participantId?: string; readOnly?: boolean;
}) {
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [reply, setReply] = useState<ChannelMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const query = useQuery({
    queryKey: ["planning-channel", projectId, channel, token ? "external" : "internal"],
    refetchInterval: 15000,
    queryFn: async () => {
      if (token) {
        const { data, error } = await supabase.rpc("planning_external_channel", { _token: token, _project_id: projectId, _channel: channel });
        if (error) throw error;
        return data as unknown as { audience: ChannelPerson[]; messages: ChannelMessage[] };
      }
      const [audience, messages] = await Promise.all([
        planningAudience(projectId, channel),
        supabase.from("planning_messages").select("id,body,author_name,created_at,reply_to_id,recipient_snapshot")
          .eq("planning_project_id", projectId).eq("channel", channel).is("deleted_at", null).order("created_at"),
      ]);
      if (messages.error) throw messages.error;
      return { audience, messages: messages.data as unknown as ChannelMessage[] };
    },
  });
  const audience = query.data?.audience ?? [];
  useEffect(() => { setSelected([]); setReply(null); setBody(""); }, [projectId, channel, token]);
  const receiving = chosenRecipients(audience, participantId ? [...selected, participantId] : selected);
  const excluded = excludedRecipients(audience, participantId ? [...selected, participantId] : selected);
  const send = async () => {
    if (readOnly || !body.trim() || sending || !query.data) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc("planning_send_channel_message", {
        _project_id: projectId, _channel: channel, _body: body, _external_ids: selected,
        _request_id: requestId, _reply_to: reply?.id ?? undefined, _token: token,
      });
      if (error) throw error;
      setBody(""); setReply(null); setRequestId(crypto.randomUUID());
      await query.refetch();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Kunne ikke sende melding"); }
    finally { setSending(false); }
  };
  return <section className="min-w-0 space-y-4">
    <header className="space-y-2">
      <h2 className="text-lg font-semibold">{CHANNEL_LABELS[channel]}</h2>
      <p className="text-sm text-muted-foreground">{channel === "internal" ? "Kun interne MCS-deltakere. Ingen eksterne kan åpne denne samtalen." : "Eksterne ser bare meldinger de er valgt som mottaker av."}</p>
      <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium">Hvem har tilgang? ({audience.length})</summary>
        <ul className="space-y-2">{audience.map(p => <li key={p.kind + p.id}>{p.name} · {p.company_name || (p.kind === "internal" ? "MCS" : CHANNEL_LABELS[p.participant_type ?? "supplier"])}</li>)}</ul>
        {!token && <p className="mt-2 text-muted-foreground">Autoriserte MCS-planleggere og prosjektadministratorer kan også lese prosjektets samtaler.</p>}
      </details>
      <p className="break-words text-sm"><strong>Har tilgang til samtalen: </strong>{audience.map(p => p.name).join(", ") || "Interne MCS-planleggere"}</p>
      {token && <p className="text-sm text-muted-foreground">Autoriserte MCS-planleggere og prosjektadministratorer kan også lese meldingene.</p>}
    </header>
    {query.isError && <p role="alert" className="text-sm text-destructive">Kunne ikke åpne samtalen. Tilgangen kan være avsluttet.</p>}
    {query.isLoading && <p className="text-sm text-muted-foreground">Henter samtale…</p>}
    {query.data?.messages.length === 0 && <p className="py-6 text-sm text-muted-foreground">Ingen meldinger til deg i denne samtalen ennå.</p>}
    <div className="space-y-3">{query.data?.messages.map(m => <article key={m.id} className="rounded-md border border-border p-3">
      <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{m.author_name || "MCS"}</strong><time className="text-muted-foreground">{new Date(m.created_at).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" })}</time></div>
      {m.reply_to_id && <p className="mt-2 text-sm text-muted-foreground">Svar på tidligere melding</p>}
      <p className="my-3 whitespace-pre-wrap break-words text-sm">{m.body}</p>
      <details className="text-sm text-muted-foreground"><summary className="min-h-11 cursor-pointer py-3">Mottakere ved sending ({m.recipient_snapshot.length})</summary><p className="break-words">{m.recipient_snapshot.map(p => `${p.name}${p.company_name ? ` · ${p.company_name}` : ""}`).join(", ") || "Intern MCS-melding"}</p></details>
      <Button variant="ghost" className="min-h-11" disabled={readOnly} onClick={() => { setReply(m); setBody(""); setRequestId(crypto.randomUUID()); }}><Reply />Svar</Button>
    </article>)}</div>
    <div className="space-y-3 border-t border-border pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {reply && <div className="flex items-center justify-between gap-2 bg-muted p-2 text-sm"><p className="truncate">Svar til {reply.author_name}: {reply.body}</p><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Avbryt svar" onClick={() => setReply(null)}><X /></Button></div>}
      {audience.some(p => p.kind === "external" && p.id !== participantId) && <fieldset className="space-y-1" disabled={readOnly || sending}>
        <legend className="text-sm font-semibold">Velg eksterne mottakere</legend>
        {audience.filter(p => p.kind === "external" && p.id !== participantId).map(p => <label key={p.id} className="flex min-h-11 items-center gap-3 text-sm"><Checkbox checked={selected.includes(p.id)} onCheckedChange={checked => setSelected(ids => checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} /><span>{p.name} · {p.company_name || CHANNEL_LABELS[p.participant_type ?? "supplier"]}</span></label>)}
      </fieldset>}
      <p className="break-words text-sm"><strong>Kan lese denne meldingen: </strong>{receiving.map(p => p.name).join(", ") || "Interne MCS-planleggere"}</p>
      <p className="break-words text-sm text-muted-foreground"><strong>Får ikke meldingen: </strong>{excluded.map(p => p.name).join(", ") || "Ingen utelatte eksterne i denne samtalen"}</p>
      <Textarea aria-label="Melding" rows={3} value={body} disabled={readOnly || sending} onChange={e => { setBody(e.target.value); setRequestId(crypto.randomUUID()); }} placeholder="Skriv melding…" />
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{readOnly ? "Skrivebeskyttet forhåndsvisning" : "Meldingen lagres i prosjektrommet. Ingen automatisk e-post."}</p><Button className="min-h-11" disabled={readOnly || sending || !body.trim() || !query.data} onClick={send}><Send />{sending ? "Sender…" : "Send melding"}</Button></div>
    </div>
  </section>;
}