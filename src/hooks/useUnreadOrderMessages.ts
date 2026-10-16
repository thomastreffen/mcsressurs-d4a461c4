import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Canonical "unread customer messages on orders" for the current internal user.
 *
 * Source of truth: `notifications` table where `type='order_message'` and
 * `read=false` for the current user. The DB trigger
 * `notify_order_message_customer` ensures only customer/external messages
 * generate these (interne meldinger gir ingen ny notification, og avsender
 * ekskluderes), så vi unngår dobbeltvarsler eller selvvarsler.
 */
export interface UnreadOrderNotification {
  id: string;
  submission_id: string | null;
  message: string | null;
  title: string;
  actor_name: string | null;
  link_url: string | null;
  created_at: string;
}

export interface UnreadOrderSubmission {
  submission_id: string;
  link_url: string;
  count: number;
  latest_at: string;
  latest_snippet: string | null;
  latest_sender: string | null;
  notification_ids: string[];
}

export function useUnreadOrderMessages() {
  const { user } = useAuth();
  const [rows, setRows] = useState<UnreadOrderNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!user) {
      setRows([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("id, message, title, actor_name, link_url, created_at, entity_type")
      .eq("user_id", user.id)
      .eq("type", "order_message")
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(200);
    const mapped: UnreadOrderNotification[] = (data || []).map((n: any) => {
      // link_url is "/orders/<submission_id>" — extract submission_id
      let submission_id: string | null = null;
      const url: string | null = n.link_url || null;
      if (url) {
        const m = url.match(/\/orders\/([0-9a-fA-F-]{20,})/);
        if (m) submission_id = m[1];
      }
      return {
        id: n.id,
        submission_id,
        message: n.message ?? null,
        title: n.title ?? "Ny melding",
        actor_name: n.actor_name ?? null,
        link_url: url,
        created_at: n.created_at,
      };
    });
    setRows(mapped);
    setLoading(false);
    if (import.meta.env.DEV) {
      console.debug("[useUnreadOrderMessages] fetched", {
        user_id: user.id,
        count: mapped.length,
        submission_ids: mapped.map((m) => m.submission_id).filter(Boolean),
      });
    }
  }, [user]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Re-fetch on window focus and visibility change so the badge can never
  // sit stale just because the tab was in the background while another tab
  // (or InPrivate window) marked messages as read — throttled so repeated
  // tab switches don't fire a request every time.
  const lastFetchAtRef = useRef(0);
  useEffect(() => {
    lastFetchAtRef.current = Date.now();
  });
  useEffect(() => {
    if (!user) return;
    const MIN_INTERVAL_MS = 30_000;
    const maybeRefetch = () => {
      if (Date.now() - lastFetchAtRef.current >= MIN_INTERVAL_MS) {
        lastFetchAtRef.current = Date.now();
        fetchRows();
      }
    };
    const onFocus = () => maybeRefetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") maybeRefetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, fetchRows]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`unread-order-msgs-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchRows(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, fetchRows]);

  // Group by submission_id
  const submissions = useMemo<UnreadOrderSubmission[]>(() => {
    const map = new Map<string, UnreadOrderSubmission>();
    for (const r of rows) {
      if (!r.submission_id || !r.link_url) continue;
      const existing = map.get(r.submission_id);
      if (existing) {
        existing.count += 1;
        existing.notification_ids.push(r.id);
        if (new Date(r.created_at) > new Date(existing.latest_at)) {
          existing.latest_at = r.created_at;
          existing.latest_snippet = r.message;
          existing.latest_sender = r.actor_name;
        }
      } else {
        map.set(r.submission_id, {
          submission_id: r.submission_id,
          link_url: r.link_url,
          count: 1,
          latest_at: r.created_at,
          latest_snippet: r.message,
          latest_sender: r.actor_name,
          notification_ids: [r.id],
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime(),
    );
  }, [rows]);

  const unreadMessageCount = rows.length;
  const unreadSubmissionCount = submissions.length;

  /** Mark every unread order_message notification as read for current user. */
  const markAllRead = useCallback(async () => {
    if (!user || rows.length === 0) return;
    const ids = rows.map((r) => r.id);
    await supabase
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() } as any)
      .in("id", ids);
    setRows([]);
  }, [user, rows]);

  /** Mark unread order_message notifications for a specific submission as read. */
  const markSubmissionRead = useCallback(
    async (submissionId: string) => {
      if (!user) return;
      const sub = submissions.find((s) => s.submission_id === submissionId);
      if (!sub || sub.notification_ids.length === 0) return;
      await supabase
        .from("notifications")
        .update({ read: true, read_at: new Date().toISOString() } as any)
        .in("id", sub.notification_ids);
      setRows((prev) => prev.filter((r) => !sub.notification_ids.includes(r.id)));
    },
    [user, submissions],
  );

  return {
    loading,
    unreadMessageCount,
    unreadSubmissionCount,
    submissions,
    rows,
    markAllRead,
    markSubmissionRead,
    refetch: fetchRows,
  };
}
