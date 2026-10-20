import { supabase } from "@/integrations/supabase/client";

let refreshing: ReturnType<typeof supabase.auth.refreshSession> | null = null;
async function refresh() {
  refreshing ??= supabase.auth.refreshSession();
  try { return await refreshing; } finally { refreshing = null; }
}
function isRead(name: string, action: unknown) {
  return (name === "ms-calendar" && action === "availability") ||
    (name === "tripletex-import" && ["search", "preview", "search_hub_customers", "project_open_status"].includes(String(action)));
}
/** Await session hydration and pin the bearer for this request and its RLS queries. */
export async function invokeWithSession<T = any>(name: string, options: { body: Record<string, unknown> }) {
  const initial = await supabase.auth.getSession();
  let session = initial.data.session;
  if (initial.error || !session?.access_token) {
    return { data: null, error: new Error("Innloggingen er utløpt. Logg inn på nytt.") };
  }
  const userId = session.user.id;
  if (session.expires_at && session.expires_at * 1000 <= Date.now() + 60_000) {
    const renewed = await refresh();
    session = renewed.data.session;
    if (renewed.error || !session?.access_token || session.user.id !== userId) {
      return { data: null, error: new Error("Innloggingen kunne ikke fornyes. Logg inn på nytt.") };
    }
  }
  const invoke = (token: string) => supabase.functions.invoke<T>(name, {
    ...options, headers: { Authorization: `Bearer ${token}` },
  });
  const result = await invoke(session.access_token);
  if (result.error?.context?.status !== 401 || !isRead(name, options.body.action)) return result;
  const renewed = await refresh();
  const next = renewed.data.session;
  if (renewed.error || !next?.access_token || next.user.id !== userId) return result;
  return invoke(next.access_token); // Exactly one retry; never replay a mutation.
}
