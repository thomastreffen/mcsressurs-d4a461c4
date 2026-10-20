import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useConversationPosts, type ConversationPost } from "@/hooks/useConversations";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import { useMessageReads } from "@/hooks/useMessageReads";
import { useMentions, filterMentionUsers } from "@/hooks/useMentions";
import { useContextBinding } from "@/hooks/useContextBinding";
import { useAIMessageActions, type SuggestedMessageAction } from "@/hooks/useAIMessageActions";
import { useInbox } from "@/hooks/useInbox";
import { useMediaAnnotations } from "@/hooks/useMediaAnnotations";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { triggerConversationEmailSend } from "@/lib/conversation-email";
import { format, isSameDay, differenceInMinutes } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Send, Loader2, Paperclip, AlertTriangle, RotateCw, X,
  Reply, Pin, Inbox, Plus, Camera, Mic, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChatBubble } from "./ChatBubble";
import { CreateTaskFromMessageDialog } from "./CreateTaskFromMessageDialog";
import { CreateDeviationFromMessageDialog } from "./CreateDeviationFromMessageDialog";
import { CreateFDVNoteFromMessageDialog } from "./CreateFDVNoteFromMessageDialog";
import { TypingIndicator } from "./TypingIndicator";
import { VoiceRecorder } from "./VoiceRecorder";
import { CameraCapture } from "./CameraCapture";
import { ContextChips } from "./ContextChips";
import { ContextPicker } from "./ContextPicker";
import { ChatFilterPanel, type ChatFilter } from "./ChatFilterPanel";
import { InboxMode } from "./InboxMode";

interface ThreadDetailProps {
  threadId: string;
  threadTitle: string;
  threadType: "conversation" | "email_thread";
  projectId: string;
  companyId: string;
  isClosed?: boolean;
  emailEnabled?: boolean;
}

interface FailedEmail {
  id: string;
  post_id: string;
  subject: string | null;
  error: string | null;
  created_at: string;
}

/* ── Avatar helpers ── */
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700",
  "bg-purple-100 text-purple-700", "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700", "bg-orange-100 text-orange-700",
];

function avatarColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function authorKey(post: ConversationPost): string {
  if (post.post_type === "email") return post.from_email || post.from_name || "unknown";
  return post.author_id || post.author_name || "unknown";
}

function authorDisplay(post: ConversationPost): string {
  if (post.post_type === "email") return post.from_name || post.from_email || "Ukjent";
  return post.author_name || "Ukjent";
}

/* ── Group messages ── */
interface PostGroup {
  sender: string;
  senderDisplay: string;
  timestamp: Date;
  posts: ConversationPost[];
  isOwn: boolean;
}

function groupPosts(posts: ConversationPost[], currentUserAccountId: string | null): { date: Date; groups: PostGroup[] }[] {
  const days: { date: Date; groups: PostGroup[] }[] = [];
  let currentDay: { date: Date; groups: PostGroup[] } | null = null;
  let currentGroup: PostGroup | null = null;

  for (const post of posts) {
    if (post.post_type === "system") {
      const ts = new Date(post.sent_at || post.created_at);
      if (!currentDay || !isSameDay(currentDay.date, ts)) {
        currentDay = { date: ts, groups: [] };
        days.push(currentDay);
      }
      currentGroup = null;
      currentDay.groups.push({
        sender: "__system__",
        senderDisplay: "System",
        timestamp: ts,
        posts: [post],
        isOwn: false,
      });
      continue;
    }

    const ts = new Date(post.sent_at || post.created_at);
    const key = authorKey(post);
    const isOwn = !!(currentUserAccountId && post.author_id === currentUserAccountId);

    if (!currentDay || !isSameDay(currentDay.date, ts)) {
      currentDay = { date: ts, groups: [] };
      days.push(currentDay);
      currentGroup = null;
    }

    if (currentGroup && currentGroup.sender === key && differenceInMinutes(ts, currentGroup.timestamp) <= 3) {
      currentGroup.posts.push(post);
      currentGroup.timestamp = ts;
    } else {
      currentGroup = {
        sender: key,
        senderDisplay: authorDisplay(post),
        timestamp: ts,
        posts: [post],
        isOwn,
      };
      currentDay.groups.push(currentGroup);
    }
  }
  return days;
}

export function ThreadDetail({ threadId, threadTitle, threadType, projectId, companyId, isClosed = false, emailEnabled = true }: ThreadDetailProps) {
  const { posts, loading, refresh } = useConversationPosts(threadId);
  const { user, isAdmin } = useAuth();
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [failedEmail, setFailedEmail] = useState<FailedEmail | null>(null);
  const [resending, setResending] = useState(false);
  const [currentUaId, setCurrentUaId] = useState<string | null>(null);
  const [replyToPost, setReplyToPost] = useState<ConversationPost | null>(null);
  const [taskPost, setTaskPost] = useState<ConversationPost | null>(null);
  const [deviationPost, setDeviationPost] = useState<{ post: ConversationPost; suggestion?: SuggestedMessageAction } | null>(null);
  const [fdvPost, setFdvPost] = useState<{ post: ConversationPost; suggestion?: SuggestedMessageAction } | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"chat" | "inbox">("chat");
  const [chatFilter, setChatFilter] = useState<ChatFilter>({});
  const [adminSelectMode, setAdminSelectMode] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "single" | "multi" | "thread"; postId?: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const { getReactionsForPost, toggleReaction } = useMessageReactions(threadId, currentUaId);
  const { users: mentionUsers } = useMentions(companyId);
  const contextBinding = useContextBinding();
  const aiActions = useAIMessageActions(threadId);
  const inbox = useInbox(threadId, currentUaId);

  const postIds = useMemo(() => posts.map(p => p.id), [posts]);
  const mediaAnnotations = useMediaAnnotations(threadId, postIds);
  const { markAsRead, getReadCount } = useMessageReads(threadId, currentUaId, postIds);

  const filteredMentions = useMemo(
    () => mentionQuery !== null ? filterMentionUsers(mentionUsers, mentionQuery) : [],
    [mentionUsers, mentionQuery]
  );

  const postMap = useMemo(() => {
    const map = new Map<string, ConversationPost>();
    for (const p of posts) map.set(p.id, p);
    return map;
  }, [posts]);

  const pinnedPosts = useMemo(() => posts.filter(p => (p as any).is_pinned), [posts]);

  // Filter posts based on chatFilter
  const filteredPosts = useMemo(() => {
    if (!chatFilter.location && !chatFilter.objectType && (!chatFilter.tags || chatFilter.tags.length === 0)) {
      return posts;
    }
    return posts.filter(p => {
      const loc = (p as any).context_location_text;
      const objType = (p as any).context_object_type;
      const tags: string[] = (p as any).context_tags || [];

      if (chatFilter.location && (!loc || !loc.toLowerCase().includes(chatFilter.location.toLowerCase()))) return false;
      if (chatFilter.objectType && objType !== chatFilter.objectType) return false;
      if (chatFilter.tags && chatFilter.tags.length > 0 && !chatFilter.tags.some(t => tags.includes(t))) return false;
      return true;
    });
  }, [posts, chatFilter]);

  const filterCount = (chatFilter.location ? 1 : 0) + (chatFilter.objectType ? 1 : 0) + (chatFilter.tags?.length || 0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_accounts")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      setCurrentUaId(data?.id || null);
    })();
  }, [user]);

  const grouped = useMemo(() => groupPosts(filteredPosts, currentUaId), [filteredPosts, currentUaId]);

  useEffect(() => {
    if (viewMode === "chat") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    if (posts.length > 0) {
      const otherPostIds = posts.filter(p => p.author_id !== currentUaId && p.post_type !== "system").map(p => p.id);
      markAsRead(otherPostIds);
    }
  }, [posts.length, viewMode]);

  // Failed email check
  useEffect(() => {
    if (!threadId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("conversation_email_messages")
        .select("id, post_id, subject, error, created_at")
        .eq("thread_id", threadId)
        .eq("direction", "outbound")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setFailedEmail(data ?? null);
    })();
  }, [threadId, sending]);

  const handleResendEmail = async () => {
    if (!failedEmail) return;
    setResending(true);
    try {
      const result = await triggerConversationEmailSend(threadId, "resend", { post_id: failedEmail.post_id });
      if (result.sent) {
        await (supabase as any).from("conversation_email_messages").update({ status: "resent" }).eq("id", failedEmail.id);
        toast.success("E-post sendt på nytt");
        setFailedEmail(null);
      } else {
        toast.error(result.error || "Sending feilet igjen");
      }
    } catch (err: any) {
      toast.error(err.message || "Kunne ikke sende på nytt");
    } finally { setResending(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setPendingFiles(prev => [...prev, ...files]);
    e.target.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadAttachments = async (postId: string) => {
    for (const file of pendingFiles) {
      const filePath = `${companyId}/${projectId}/${threadId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("conversation-files").upload(filePath, file);
      if (uploadErr) { toast.error(`Kunne ikke laste opp ${file.name}`); continue; }
      await (supabase as any).from("conversation_attachments").insert({
        post_id: postId, file_name: file.name, file_size: file.size,
        mime_type: file.type || null, storage_path: filePath,
      });
    }
  };

  const triggerEmailSend = async (postId: string) => {
    if (!emailEnabled) return;
    try {
      const result = await triggerConversationEmailSend(threadId, "new_post", { post_id: postId });
      if (result.sent) console.log("Email sent for post", postId);
      else if (!result.skipped) console.warn("Email send failed", result.error);
    } catch { console.warn("Email send failed silently"); }
  };

  const handleReply = async () => {
    if ((!replyText.trim() && pendingFiles.length === 0) || !user) return;
    setSending(true);

    const insertData: any = {
      thread_id: threadId,
      company_id: companyId,
      author_id: currentUaId || null,
      post_type: "internal_message",
      body_text: replyText.trim() || null,
      body_html: replyText.trim() ? `<p>${replyText.trim().replace(/\n/g, "<br/>")}</p>` : null,
      body_clean: replyText.trim() || null,
      reply_to_post_id: replyToPost?.id || null,
    };

    // Add context fields if set (Sprint 3)
    if (contextBinding.hasContext) {
      if (contextBinding.context.location_text) insertData.context_location_text = contextBinding.context.location_text;
      if (contextBinding.context.object_type) insertData.context_object_type = contextBinding.context.object_type;
      if (contextBinding.context.object_ref) insertData.context_object_ref = contextBinding.context.object_ref;
      if (contextBinding.context.tags.length > 0) insertData.context_tags = contextBinding.context.tags;
    }

    const { data: post, error } = await (supabase as any).from("conversation_posts").insert(insertData).select("id").single();

    if (error) {
      toast.error("Kunne ikke sende melding");
      setSending(false);
      return;
    }

    if (pendingFiles.length > 0 && post) {
      setUploading(true);
      await uploadAttachments(post.id);
      setUploading(false);
    }

    if (post) {
      triggerEmailSend(post.id);
      // Trigger AI analysis (Sprint 4)
      if (replyText.trim()) {
        aiActions.triggerAnalysis(post.id, replyText.trim(), contextBinding.context.tags);
      }
    }

    contextBinding.commitContext();
    setReplyText("");
    setPendingFiles([]);
    setReplyToPost(null);
    setMentionQuery(null);
    contextBinding.clearContext();
    setSending(false);
    refresh();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(i => i.type.startsWith("image/"));
    if (imageItems.length > 0) {
      e.preventDefault();
      const files = imageItems.map(i => i.getAsFile()).filter(Boolean) as File[];
      setPendingFiles(prev => [...prev, ...files]);
    }
  };

  const [dragOver, setDragOver] = useState(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) setPendingFiles(prev => [...prev, ...files]);
  };

  const scrollToPost = useCallback((postId: string) => {
    const el = document.getElementById(`post-${postId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-primary/5");
      setTimeout(() => el.classList.remove("bg-primary/5"), 2000);
    }
  }, []);

  const handlePinToggle = async (post: ConversationPost) => {
    const isPinned = (post as any).is_pinned;
    if (!isPinned && pinnedPosts.length >= 3) {
      toast.error("Maks 3 festede meldinger");
      return;
    }
    const { error } = await (supabase as any)
      .from("conversation_posts")
      .update({ is_pinned: !isPinned })
      .eq("id", post.id);
    if (error) toast.error("Kunne ikke oppdatere");
    else { toast.success(isPinned ? "Melding løsnet" : "Melding festet"); refresh(); }
  };

  const handleAIActionClick = (postId: string, action: SuggestedMessageAction) => {
    const post = postMap.get(postId);
    if (!post) return;
    aiActions.recordClick(postId, action.action_type);

    if (action.action_type === "task") {
      setTaskPost(post);
    } else if (action.action_type === "deviation") {
      setDeviationPost({ post, suggestion: action });
    } else if (action.action_type === "fdv_note") {
      setFdvPost({ post, suggestion: action });
    } else {
      toast.info(`Handling "${action.action_type}" er ikke implementert ennå`);
    }
  };

  // @mention detection
  const handleTextChange = (value: string) => {
    setReplyText(value);
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = replyText.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (!mentionMatch) return;
    const start = cursorPos - mentionMatch[0].length;
    const hasSpace = name.includes(" ");
    const mention = hasSpace ? `@"${name}" ` : `@${name} `;
    const newText = replyText.substring(0, start) + mention + replyText.substring(cursorPos);
    setReplyText(newText);
    setMentionQuery(null);
    textarea.focus();
  };

  // Filter helpers
  const applyFilterFromBadge = useCallback((type: "location" | "objectType" | "tag", value: string) => {
    if (type === "location") setChatFilter(f => ({ ...f, location: value }));
    else if (type === "objectType") setChatFilter(f => ({ ...f, objectType: value }));
    else if (type === "tag") setChatFilter(f => ({ ...f, tags: [...(f.tags || []), value] }));
  }, []);

  // Admin message moderation
  const canModerate = isAdmin;

  const handleDeletePost = useCallback(async (postId: string) => {
    const { error } = await (supabase as any)
      .from("conversation_posts")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id })
      .eq("id", postId);
    if (error) { toast.error("Kunne ikke slette melding"); return; }
    // Insert system message
    await (supabase as any).from("conversation_posts").insert({
      thread_id: threadId, company_id: companyId, author_id: currentUaId,
      post_type: "system", body_text: "Melding slettet av administrator",
    });
    // Log to activity_log
    await supabase.from("activity_log").insert({
      entity_id: threadId, entity_type: "conversation_thread",
      action: "message_deleted", type: "note",
      title: "Melding slettet", description: "En melding ble slettet av administrator",
      performed_by: user?.id,
    });
    toast.success("Melding slettet");
    refresh();
  }, [threadId, companyId, currentUaId, user, refresh]);

  const handleDeleteSelected = useCallback(async () => {
    const ids = Array.from(selectedPostIds);
    if (ids.length === 0) return;
    const { error } = await (supabase as any)
      .from("conversation_posts")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id })
      .in("id", ids);
    if (error) { toast.error("Kunne ikke slette meldinger"); return; }
    await (supabase as any).from("conversation_posts").insert({
      thread_id: threadId, company_id: companyId, author_id: currentUaId,
      post_type: "system", body_text: `${ids.length} meldinger slettet av administrator`,
    });
    await supabase.from("activity_log").insert({
      entity_id: threadId, entity_type: "conversation_thread",
      action: "messages_bulk_deleted", type: "note",
      title: `${ids.length} meldinger slettet`,
      performed_by: user?.id,
    });
    toast.success(`${ids.length} meldinger slettet`);
    setSelectedPostIds(new Set());
    setAdminSelectMode(false);
    refresh();
  }, [selectedPostIds, threadId, companyId, currentUaId, user, refresh]);

  const handleDeleteThread = useCallback(async () => {
    const { error } = await (supabase as any)
      .from("conversation_threads")
      .update({ is_archived: true, status: "closed", closed_at: new Date().toISOString(), closed_by: user?.id })
      .eq("id", threadId);
    if (error) { toast.error("Kunne ikke slette samtale"); return; }
    await supabase.from("activity_log").insert({
      entity_id: threadId, entity_type: "conversation_thread",
      action: "thread_deleted", type: "note",
      title: `Samtale "${threadTitle}" slettet`,
      performed_by: user?.id,
    });
    toast.success("Samtale slettet");
    refresh();
  }, [threadId, threadTitle, user, refresh]);

  const togglePostSelection = useCallback((postId: string) => {
    setSelectedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Failed email banner */}
      {failedEmail && (
        <div className="flex items-center gap-3 px-5 py-3 bg-destructive/5 border-b border-destructive/20">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-destructive">E-postsending feilet</p>
            <p className="text-[10px] text-destructive/70 truncate">
              {failedEmail.error || "Ukjent feil"} — {format(new Date(failedEmail.created_at), "d. MMM HH:mm", { locale: nb })}
            </p>
          </div>
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs gap-1 border-destructive/30 text-destructive hover:bg-destructive/10 shrink-0"
            onClick={handleResendEmail} disabled={resending}
          >
            {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
            Send på nytt
          </Button>
        </div>
      )}

      {/* Mode toggle + filter bar – compact on mobile */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-1 sm:py-1.5 border-b border-border/10 bg-card">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode("chat")}
            className={cn(
              "text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer",
              viewMode === "chat" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Chat
          </button>
          <button
            onClick={() => setViewMode("inbox")}
            className={cn(
              "text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1",
              viewMode === "inbox" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Inbox className="h-3 w-3" />
            Innboks
            {inbox.items.length > 0 && (
              <span className="h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
                {inbox.items.length}
              </span>
            )}
          </button>
        </div>
        {viewMode === "chat" && (
          <ChatFilterPanel filter={chatFilter} onFilterChange={setChatFilter} activeCount={filterCount} />
        )}
      </div>

      {/* Pinned messages bar */}
      {viewMode === "chat" && pinnedPosts.length > 0 && (
        <div className="border-b border-border/20 bg-amber-50/50 dark:bg-amber-900/10 px-4 py-2">
          <div className="flex items-center gap-2 text-xs max-w-[900px] mx-auto">
            <Pin className="h-3 w-3 text-amber-600 shrink-0" />
            <span className="font-medium text-amber-700 dark:text-amber-400">Festet:</span>
            <div className="flex-1 flex gap-3 overflow-x-auto">
              {pinnedPosts.map(p => (
                <button
                  key={p.id}
                  onClick={() => scrollToPost(p.id)}
                  className="text-[11px] text-amber-800 dark:text-amber-300 hover:underline cursor-pointer truncate max-w-[200px] shrink-0"
                >
                  {(p as any).body_clean || p.body_text || "Melding"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-primary/5 border-2 border-dashed border-primary/30 rounded-[14px] flex items-center justify-center pointer-events-none">
          <p className="text-sm font-medium text-primary">Slipp filer her</p>
        </div>
      )}

      {/* Inbox Mode (Sprint 5) */}
      {viewMode === "inbox" && (
        <InboxMode
          items={inbox.items}
          loading={inbox.loading}
          onMarkHandled={inbox.markHandled}
          onScrollToPost={(postId) => {
            setViewMode("chat");
            setTimeout(() => scrollToPost(postId), 100);
          }}
          onSwitchToChat={() => setViewMode("chat")}
        />
      )}

      {/* Chat messages */}
      {viewMode === "chat" && (
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 relative">
          <div className="max-w-[900px] mx-auto space-y-1">
            {grouped.map((day, di) => (
              <div key={di}>
                <div className="flex items-center justify-center py-3">
                  <div className="h-px flex-1 bg-border/20" />
                  <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-4">
                    {format(day.date, "EEEE d. MMMM", { locale: nb })}
                  </span>
                  <div className="h-px flex-1 bg-border/20" />
                </div>

                {day.groups.map((group, gi) => {
                  if (group.sender === "__system__") {
                    const p = group.posts[0];
                    return (
                      <div key={`sys-${gi}`} className="flex items-center justify-center py-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40 border border-border/20">
                          <span className="text-[11px] text-muted-foreground/70">
                            {p.body_text || p.subject || "Systemhendelse"}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const colorClass = avatarColor(group.sender);
                  const ini = initials(group.senderDisplay);
                  const isOwn = group.isOwn;

                  return (
                    <div
                      key={`g-${gi}`}
                      className={cn("flex gap-2.5 mb-3", isOwn ? "flex-row-reverse" : "flex-row")}
                    >
                      {/* Avatar */}
                      {!isOwn ? (
                        <div className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold shrink-0 mt-5",
                          colorClass
                        )}>
                          {ini}
                        </div>
                      ) : (
                        <div className="w-8 shrink-0" />
                      )}

                      <div className={cn("flex flex-col max-w-[75%] min-w-0", isOwn ? "items-end" : "items-start")}>
                        {/* Sender name + time */}
                        {!isOwn ? (
                          <div className="flex items-baseline gap-2 mb-0.5 px-1">
                            <span className="text-[13px] font-semibold text-foreground/80">{group.senderDisplay}</span>
                            <span className="text-[10px] text-muted-foreground/50">
                              {format(group.posts[0].sent_at ? new Date(group.posts[0].sent_at) : group.timestamp, "HH:mm")}
                            </span>
                            {group.posts[0].post_type === "email" && group.posts[0].direction === "inbound" && (
                              <Badge variant="outline" className="text-[8px] px-1 py-0 border-accent/30 text-accent">
                                E-post
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-2 mb-0.5 px-1">
                            <span className="text-[10px] text-muted-foreground/50">
                              {format(group.posts[0].sent_at ? new Date(group.posts[0].sent_at) : group.timestamp, "HH:mm")}
                            </span>
                          </div>
                        )}

                        {group.posts.map((post, pi) => {
                          const replyTarget = (post as any).reply_to_post_id
                            ? postMap.get((post as any).reply_to_post_id) || null
                            : null;

                          const aiRow = aiActions.getSuggestionsForPost(post.id);

                          return (
                            <ChatBubble
                              key={post.id}
                              post={post}
                              isOwn={isOwn}
                              isFirst={pi === 0}
                              isLast={pi === group.posts.length - 1}
                              reactions={getReactionsForPost(post.id)}
                              onToggleReaction={toggleReaction}
                              onReply={(p) => {
                                setReplyToPost(p);
                                textareaRef.current?.focus();
                              }}
                              onCreateTask={setTaskPost}
                              onPinToggle={handlePinToggle}
                              replyToPost={replyTarget}
                              onScrollToPost={scrollToPost}
                              readCount={isOwn ? getReadCount(post.id) : undefined}
                              // Sprint 3
                              onFilterByTag={(tag) => applyFilterFromBadge("tag", tag)}
                              onFilterByObjectType={(type) => applyFilterFromBadge("objectType", type)}
                              onFilterByLocation={(loc) => applyFilterFromBadge("location", loc)}
                              // Sprint 4
                              aiSuggestions={aiRow?.suggested_actions as SuggestedMessageAction[] | undefined}
                              aiDismissed={!!aiRow?.dismissed_at}
                              onDismissAI={aiActions.dismissSuggestions}
                              onClickAIAction={handleAIActionClick}
                              // Annotations
                              annotations={mediaAnnotations.getAnnotationsForPost(post.id)}
                              hasBeforeAfterPair={mediaAnnotations.beforeAfterPairs.has(post.id)}
                              projectId={projectId}
                              companyId={companyId}
                              onFilterByDocType={(dt) => setChatFilter(f => ({ ...f, tags: [...(f.tags || []), dt] }))}
                              onFilterByObjectLabel={(label) => setChatFilter(f => ({ ...f, location: label }))}
                              onAnnotationSaved={mediaAnnotations.refresh}
                              // Admin moderation
                              canModerate={canModerate}
                              onDeleteMessage={(postId) => setDeleteConfirm({ type: "single", postId })}
                              adminSelectMode={adminSelectMode}
                              isSelected={selectedPostIds.has(post.id)}
                              onToggleSelect={togglePostSelection}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Typing indicator placeholder */}
            <TypingIndicator names={[]} />

            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {/* Composer – sticky to keyboard on mobile */}
      {isClosed ? (
        <div className="px-5 py-4 bg-muted/30 border-t border-border/20">
          <p className="text-xs text-muted-foreground text-center">
            Denne tråden er lukket. Kun administratorer kan gjenåpne den.
          </p>
        </div>
      ) : viewMode === "chat" ? (
        <div className="border-t border-border/20 bg-card sticky bottom-0 z-20 safe-area-bottom">
          <div className="max-w-[900px] mx-auto p-3">
            {/* Reply preview */}
            {replyToPost && (
              <div className="flex items-start gap-2 mb-2 px-2 py-1.5 rounded-lg bg-muted/40 border-l-2 border-primary/40">
                <Reply className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-semibold text-foreground/80 block">
                    Svar til {replyToPost.author_name || replyToPost.from_name || "Ukjent"}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate block">
                    {(replyToPost as any).body_clean || replyToPost.body_text || ""}
                  </span>
                </div>
                <button onClick={() => setReplyToPost(null)} className="shrink-0 hover:text-destructive cursor-pointer">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            )}

            {/* Context chips + picker (Sprint 3) */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <ContextPicker
                context={contextBinding.context}
                recentLocations={contextBinding.recentLocations}
                workTypeOptions={contextBinding.WORK_TYPE_OPTIONS}
                objectTypeOptions={contextBinding.OBJECT_TYPE_OPTIONS}
                onSetLocation={contextBinding.setLocationText}
                onSetObjectType={contextBinding.setObjectType}
                onSetObjectRef={contextBinding.setObjectRef}
                onAddTag={contextBinding.addTag}
                onRemoveTag={contextBinding.removeTag}
              />
              {contextBinding.hasContext && (
                <ContextChips
                  context={contextBinding.context}
                  onRemoveLocation={() => contextBinding.setLocationText("")}
                  onRemoveObjectType={() => contextBinding.setObjectType(null)}
                  onRemoveTag={contextBinding.removeTag}
                />
              )}
            </div>

            {/* Pending files */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 px-1">
                {pendingFiles.map((f, i) => {
                  const isImage = f.type.startsWith("image/");
                  return (
                    <div key={i} className="relative group">
                      {isImage ? (
                        <div className="relative h-16 w-16 rounded-lg overflow-hidden border border-border/40">
                          <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover" />
                          <button
                            onClick={() => removePendingFile(i)}
                            className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-foreground/70 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px] gap-1 pr-1">
                          <Paperclip className="h-2.5 w-2.5" />
                          <span className="max-w-[120px] truncate">{f.name}</span>
                          <button onClick={() => removePendingFile(i)} className="ml-0.5 hover:text-destructive">×</button>
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* @Mention autocomplete */}
            {mentionQuery !== null && filteredMentions.length > 0 && (
              <div className="mb-2 bg-card border border-border/40 rounded-lg shadow-lg overflow-hidden">
                {filteredMentions.map((u, i) => (
                  <button
                    key={u.id}
                    onClick={() => insertMention(u.name)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer",
                      i === mentionIndex ? "bg-primary/10" : "hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold",
                      avatarColor(u.name)
                    )}>
                      {initials(u.name)}
                    </div>
                    <span className="text-foreground/80">{u.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Admin multi-select bar */}
            {adminSelectMode && (
              <div className="flex items-center gap-2 mb-2 px-2 py-2 rounded-xl bg-destructive/5 border border-destructive/20">
                <Trash2 className="h-4 w-4 text-destructive shrink-0" />
                <span className="text-xs font-medium text-destructive flex-1">
                  {selectedPostIds.size} valgt
                </span>
                <Button
                  variant="outline" size="sm"
                  className="h-7 text-xs border-border"
                  onClick={() => { setAdminSelectMode(false); setSelectedPostIds(new Set()); }}
                >
                  Avbryt
                </Button>
                <Button
                  variant="destructive" size="sm"
                  className="h-7 text-xs"
                  disabled={selectedPostIds.size === 0}
                  onClick={() => setDeleteConfirm({ type: "multi" })}
                >
                  Slett valgte
                </Button>
              </div>
            )}

            <div className="flex items-end gap-1.5">
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

              {/* Mobile: + menu for attachments & camera */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center justify-center h-10 w-10 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted/50 cursor-pointer shrink-0"
                  >
                    <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2 text-xs">
                    <Paperclip className="h-3.5 w-3.5" /> Vedlegg
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Camera – desktop visible, mobile inside + menu is handled by the button above */}
              <div className="hidden sm:block">
                <CameraCapture
                  onCapture={(files) => setPendingFiles(prev => [...prev, ...files])}
                  disabled={sending}
                />
              </div>

              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={replyText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="Skriv melding..."
                  rows={1}
                  className={cn(
                    "w-full resize-none rounded-2xl border border-border/40 bg-muted/30",
                    "px-4 py-3 sm:py-2.5 text-[15px] sm:text-sm leading-relaxed",
                    "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30",
                    "max-h-36 overflow-y-auto"
                  )}
                  style={{ minHeight: "56px" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "56px";
                    const maxH = 5 * 24 + 24; // ~5 lines + padding
                    el.style.height = Math.min(el.scrollHeight, maxH) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (mentionQuery !== null && filteredMentions.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setMentionIndex(i => Math.min(i + 1, filteredMentions.length - 1));
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setMentionIndex(i => Math.max(i - 1, 0));
                        return;
                      }
                      if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        insertMention(filteredMentions[mentionIndex].name);
                        return;
                      }
                      if (e.key === "Escape") {
                        setMentionQuery(null);
                        return;
                      }
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleReply();
                    }
                  }}
                />
              </div>

              <VoiceRecorder
                disabled={sending}
                onRecorded={async (blob, duration) => {
                  const voiceFile = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
                  setPendingFiles(prev => [...prev, voiceFile]);
                  setTimeout(() => handleReply(), 100);
                }}
              />

              <button
                onClick={handleReply}
                disabled={(!replyText.trim() && pendingFiles.length === 0) || sending || uploading}
                className={cn(
                  "flex items-center justify-center h-10 w-10 sm:h-9 sm:w-9 rounded-full shrink-0 transition-colors",
                  (!replyText.trim() && pendingFiles.length === 0) || sending || uploading
                    ? "text-muted-foreground/30 cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                )}
              >
                {sending || uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Create task dialog */}
      {taskPost && (
        <CreateTaskFromMessageDialog
          post={taskPost}
          projectId={projectId}
          threadId={threadId}
          open={!!taskPost}
          onOpenChange={(open) => { if (!open) setTaskPost(null); }}
          onCreated={refresh}
        />
      )}

      {/* Create deviation dialog (Sprint 4) */}
      {deviationPost && (
        <CreateDeviationFromMessageDialog
          post={deviationPost.post}
          suggestion={deviationPost.suggestion}
          projectId={projectId}
          threadId={threadId}
          open={!!deviationPost}
          onOpenChange={(open) => { if (!open) setDeviationPost(null); }}
          onCreated={refresh}
        />
      )}

      {/* Create FDV note dialog (Sprint 4) */}
      {fdvPost && (
        <CreateFDVNoteFromMessageDialog
          post={fdvPost.post}
          suggestion={fdvPost.suggestion}
          projectId={projectId}
          threadId={threadId}
          open={!!fdvPost}
          onOpenChange={(open) => { if (!open) setFdvPost(null); }}
          onCreated={refresh}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.type === "thread" ? "Slett samtale" : deleteConfirm?.type === "multi" ? "Slett valgte meldinger" : "Slett melding"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === "thread"
                ? "Hele samtalen vil bli arkivert og lukket. Denne handlingen logges."
                : deleteConfirm?.type === "multi"
                  ? `${selectedPostIds.size} meldinger vil bli slettet. Denne handlingen logges.`
                  : "Meldingen vil bli slettet og erstattet med en systemmelding. Denne handlingen logges."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm?.type === "single" && deleteConfirm.postId) handleDeletePost(deleteConfirm.postId);
                else if (deleteConfirm?.type === "multi") handleDeleteSelected();
                else if (deleteConfirm?.type === "thread") handleDeleteThread();
                setDeleteConfirm(null);
              }}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
