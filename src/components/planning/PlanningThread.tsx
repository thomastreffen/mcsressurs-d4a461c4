import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Paperclip, Star, Reply, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, isToday } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeStorageFileName } from "@/lib/storage-path";
import { usePlanningLookups, usePlanningMutations, planningFileUrl, type PlanningMessage } from "@/hooks/usePlanning";
import { cn } from "@/lib/utils";

export function PlanningThread({ projectId, messages }: { projectId: string; messages: PlanningMessage[] }) {
  const { user } = useAuth();
  const { data: lookups } = usePlanningLookups();
  const { sendMessage } = usePlanningMutations(projectId);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<PlanningMessage | null>(null);
  const [important, setImportant] = useState(false);
  const [attachments, setAttachments] = useState<{ path: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => Object.fromEntries(messages.map((m) => [m.id, m])), [messages]);

  const attach = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const path = `planning/${projectId}/messages/${crypto.randomUUID()}-${sanitizeStorageFileName(file.name)}`;
      const { error } = await supabase.storage.from("job-attachments").upload(path, file);
      if (error) throw error;
      setAttachments((a) => [...a, { path, name: file.name }]);
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke laste opp vedlegg");
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    if (!body.trim() && attachments.length === 0) return;
    // @nevninger av personer løses mot brukere med konto
    const mentioned = (lookups?.users ?? [])
      .filter((u) => u.name && body.toLowerCase().includes(`@${u.name.toLowerCase().split(" ")[0]}`))
      .map((u) => u.user_id);
    try {
      await sendMessage.mutateAsync({
        body: body.trim(),
        replyToId: replyTo?.id ?? null,
        isImportant: important,
        attachments,
        mentionedUserIds: mentioned,
      });
      setBody("");
      setReplyTo(null);
      setImportant(false);
      setAttachments([]);
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke sende melding");
    }
  };

  const initials = (name: string | null) =>
    (name ?? "?")
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Samtale</h2>
        <p className="text-sm text-muted-foreground">
          Én felles tråd for prosjektet. Bruk @navn for å nevne personer eller avdelinger.
        </p>
      </div>

      <div className="space-y-3">
        {messages.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Ingen meldinger ennå.</Card>
        )}
        {messages.map((m) => {
          const mine = m.author_id === user?.id;
          const parent = m.reply_to_id ? byId[m.reply_to_id] : null;
          return (
            <div key={m.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">{initials(m.author_name)}</AvatarFallback>
              </Avatar>
              <div className={cn("max-w-[75%] space-y-1", mine && "items-end text-right")}>
                <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", mine && "justify-end")}>
                  <span className="font-medium text-foreground">{m.author_name ?? "Ukjent"}</span>
                  {m.author_company && <span>{m.author_company}</span>}
                  <span>
                    {isToday(new Date(m.created_at))
                      ? format(new Date(m.created_at), "HH:mm")
                      : format(new Date(m.created_at), "d. MMM HH:mm", { locale: nb })}
                  </span>
                  {m.is_important && (
                    <Badge variant="outline" className="border-warning/40 text-warning">Viktig</Badge>
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {parent && (
                    <p className={cn("mb-1 border-l-2 pl-2 text-xs opacity-80", mine ? "border-primary-foreground/40" : "border-border")}>
                      {parent.author_name}: {parent.body.slice(0, 80)}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  {(m.attachments ?? []).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {m.attachments.map((a) => (
                        <a
                          key={a.path}
                          href={planningFileUrl(a.path)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs underline"
                        >
                          <Paperclip className="h-3 w-3" /> {a.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() => setReplyTo(m)}
                >
                  <Reply className="h-3 w-3" /> Svar
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Card className="space-y-2 p-3">
        {replyTo && (
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
            <span className="truncate text-muted-foreground">
              Svarer {replyTo.author_name}: {replyTo.body.slice(0, 60)}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyTo(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <Badge key={a.path} variant="secondary" className="gap-1">
                <Paperclip className="h-3 w-3" /> {a.name}
              </Badge>
            ))}
          </div>
        )}
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Skriv en melding…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ""; }}
            />
            <Button
              variant={important ? "default" : "ghost"}
              size="icon"
              onClick={() => setImportant((v) => !v)}
              title="Marker som viktig beslutning"
            >
              <Star className="h-4 w-4" />
            </Button>
          </div>
          <Button className="gap-2" onClick={send} disabled={sendMessage.isPending}>
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
      </Card>
    </div>
  );
}
