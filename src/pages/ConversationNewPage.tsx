import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { triggerConversationEmailSend } from "@/lib/conversation-email";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { ArrowLeft, Send, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function ConversationNewPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setPendingFiles(prev => [...prev, ...files]);
    e.target.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim() || !user || !projectId) return;
    setSending(true);

    const { data: ua } = await supabase
      .from("user_accounts")
      .select("id, company_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    const companyId = ua?.company_id || activeCompanyId;
    if (!companyId) {
      toast.error("Mangler selskaps-tilknytning");
      setSending(false);
      return;
    }

    // Create thread
    const { data: thread, error: threadErr } = await (supabase as any)
      .from("conversation_threads")
      .insert({
        company_id: companyId,
        project_id: projectId,
        title: title.trim(),
        thread_type: "conversation",
        created_by: ua?.id || null,
      })
      .select("id")
      .single();

    if (threadErr || !thread) {
      toast.error("Kunne ikke opprette samtale", { description: threadErr?.message });
      setSending(false);
      return;
    }

    // Auto-add creator as participant
    if (ua?.id) {
      await (supabase as any).from("conversation_thread_participants").insert({
        thread_id: thread.id,
        company_id: companyId,
        project_id: projectId,
        user_account_id: ua.id,
        participant_type: "internal",
        receive_email: true,
        can_invite_internal: true,
        can_invite_external: true,
      }).then(() => {}).catch(() => {});
    }

    // Create first post
    const { data: post, error: postErr } = await (supabase as any)
      .from("conversation_posts")
      .insert({
        thread_id: thread.id,
        company_id: companyId,
        author_id: ua?.id || null,
        post_type: "internal_message",
        subject: title.trim(),
        body_text: body.trim(),
        body_html: `<p>${body.trim().replace(/\n/g, "<br/>")}</p>`,
      })
      .select("id")
      .single();

    // Upload attachments
    if (!postErr && post && pendingFiles.length > 0) {
      for (const file of pendingFiles) {
        const filePath = `${companyId}/${projectId}/${thread.id}/${Date.now()}_${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("conversation-files")
          .upload(filePath, file);

        if (!uploadErr) {
          await (supabase as any).from("conversation_attachments").insert({
            post_id: post.id,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type || null,
            storage_path: filePath,
          });
        }
      }
    }

    // Trigger email send for first post via centralized backend
    if (!postErr && post) {
      triggerConversationEmailSend(thread.id, "new_post", { post_id: post.id })
        .catch(() => {});
    }

    if (postErr) {
      toast.error("Samtale opprettet, men innlegg feilet");
    } else {
      toast.success("Samtale startet");
    }

    setSending(false);
    navigate(`/projects/${projectId}/conversations/${thread.id}`);
  };

  return (
    <div className="min-h-dvh bg-muted/40">
      <div className="sticky top-0 z-30 border-b border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Tilbake
          </button>
          <h1 className="text-lg font-bold text-foreground">Ny samtale</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <div className="rounded-[14px] border border-border bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Tittel</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Hva handler dette om?"
              className="text-base h-12"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Melding</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Skriv din melding her…"
              className="min-h-[200px] text-sm"
            />
          </div>

          {/* Pending files */}
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendingFiles.map((f, i) => (
                <Badge key={i} variant="outline" className="text-[10px] gap-1 pr-1">
                  <Paperclip className="h-2.5 w-2.5" />
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button onClick={() => removePendingFile(i)} className="ml-0.5 hover:text-destructive cursor-pointer">×</button>
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Paperclip className="h-4 w-4" />
              Legg ved fil
            </button>

            <Button
              onClick={handleSubmit}
              disabled={!title.trim() || !body.trim() || sending}
              className="gap-2 rounded-xl h-10 px-6"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publiser samtale
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
