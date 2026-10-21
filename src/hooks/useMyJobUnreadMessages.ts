import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface MyJobUnreadMessage {
  id: string;
  projectId: string;
  author: string;
  preview: string;
  createdAt: string;
}

/**
 * Unread job-thread messages (task_threads/task_thread_reads, same model as EventDrawer)
 * limited to the jobs the technician is personally scheduled on. Broad permissions never widen this.
 */
export function useMyJobUnreadMessages(projectIds: string[], limit = 3) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MyJobUnreadMessage[]>([]);
  const key = [...new Set(projectIds)].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    if (!user || ids.length === 0) { setMessages([]); return; }
    (async () => {
      const sb = supabase as any;
      const { data: threads } = await sb.from("task_threads").select("id,task_id").in("task_id", ids);
      if (!threads?.length) { if (!cancelled) setMessages([]); return; }
      const threadIds = threads.map((t: any) => t.id);
      const { data: reads } = await sb.from("task_thread_reads").select("thread_id,last_read_at").eq("user_id", user.id).in("thread_id", threadIds);
      const lastRead = new Map<string, string>((reads || []).map((r: any) => [r.thread_id, r.last_read_at]));
      const oldest = threadIds.reduce((min: string, id: string) => {
        const v = lastRead.get(id) || "1970-01-01T00:00:00Z";
        return v < min ? v : min;
      }, "9999");
      const { data: msgs } = await sb
        .from("task_messages")
        .select("id,thread_id,task_id,body,subject,author_name,author_user_id,created_at")
        .in("thread_id", threadIds)
        .is("deleted_at", null)
        .or(`author_user_id.is.null,author_user_id.neq.${user.id}`)
        .gt("created_at", oldest)
        .order("created_at", { ascending: false })
        .limit(50);
      const unread = (msgs || [])
        .filter((m: any) => m.created_at > (lastRead.get(m.thread_id) || "1970-01-01T00:00:00Z"))
        .slice(0, limit)
        .map((m: any) => ({
          id: m.id,
          projectId: m.task_id,
          author: m.author_name || "Ukjent",
          preview: String(m.body || m.subject || "").replace(/\s+/g, " ").trim().slice(0, 120),
          createdAt: m.created_at,
        }));
      if (!cancelled) setMessages(unread);
    })().catch((e) => console.warn("[MyJobUnread]", e));
    return () => { cancelled = true; };
  }, [key, user, limit]);

  return messages;
}
