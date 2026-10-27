import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { useMountLog } from "@/lib/debugMount";

export type AppRole = "super_admin" | "admin" | "montør" | "customer_user";

const AZURE_TENANT_ID = "e1b96c2a-c273-40b9-bb46-a2a7b570e133";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
}

interface AuthContextType {
  session: Session | null;
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  /** True once the DB role check for the current person has finished. */
  roleReady: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Build an AuthUser immediately from Supabase User (metadata only, no DB call) */
function buildUserFromMeta(supaUser: User): AuthUser {
  return {
    id: supaUser.id,
    email: supaUser.email || "",
    name: supaUser.user_metadata?.full_name || supaUser.email || "",
    role: (supaUser.user_metadata?.app_role as AppRole) || "montør",
  };
}

/** Minimum time between background account/role re-checks for the same signed-in user. */
const ROLE_RECHECK_MS = 5 * 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  useMountLog("AUTH CONTEXT INIT");
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleReady, setRoleReady] = useState(false);
  // Mirror of `user` so auth events can compare against the current person
  // without re-subscribing. Keeping the same object identity for the same
  // person is what stops the app shell from re-running every user-dependent
  // effect (and showing loading gates) when the tab regains focus.
  const userRef = useRef<AuthUser | null>(null);
  const lastRoleCheck = useRef(0);

  /** Non-blocking role fetch from DB — updates user only if the role actually differs */
  const fetchRoleInBackground = useCallback(async (supaUser: User) => {
    try {
      // Deactivated accounts may not use the system, even with a still-valid session
      const { data: ua } = await supabase
        .from("user_accounts")
        .select("is_active")
        .eq("auth_user_id", supaUser.id)
        .maybeSingle();
      if (ua && ua.is_active === false) {
        console.warn("[Auth] Account deactivated — signing out");
        await supabase.auth.signOut();
        window.location.href = "/?deaktivert=1";
        return;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", supaUser.id)
        .maybeSingle();

      if (error) {
        console.warn("[Auth] DB role query error:", error.message);
        return; // keep current role
      }

      if (data?.role) {
        const dbRole = data.role as AppRole;
        const prev = userRef.current;
        if (prev && prev.id === supaUser.id && prev.role !== dbRole) {
          const next = { ...prev, role: dbRole };
          userRef.current = next;
          setUser(next);
        }
      }
    } catch (err) {
      console.warn("[Auth] Role fetch exception, keeping current role");
    } finally {
      if (userRef.current?.id === supaUser.id) setRoleReady(true);
    }
  }, []);

  /**
   * Apply a session from Supabase. Supabase re-emits SIGNED_IN / TOKEN_REFRESHED
   * every time the browser tab becomes visible again; for the same person this
   * must be a no-op for the app (same user object, same role), otherwise every
   * provider and gate below re-initialises and the whole Hub appears to reload.
   */
  const applySession = useCallback((next: Session | null) => {
    setSession((prev) =>
      prev && next && prev.access_token === next.access_token && prev.user?.id === next.user?.id ? prev : next
    );

    if (!next?.user) {
      userRef.current = null;
      setUser(null);
      setRoleReady(false);
      return;
    }

    const meta = buildUserFromMeta(next.user);
    const prev = userRef.current;
    if (prev && prev.id === meta.id) {
      if (prev.email !== meta.email || prev.name !== meta.name) {
        const updated = { ...prev, email: meta.email, name: meta.name };
        userRef.current = updated;
        setUser(updated);
      }
      if (Date.now() - lastRoleCheck.current > ROLE_RECHECK_MS) {
        lastRoleCheck.current = Date.now();
        fetchRoleInBackground(next.user);
      }
      return;
    }

    // New person (first load or account switch)
    userRef.current = meta;
    setUser(meta);
    setRoleReady(false);
    lastRoleCheck.current = Date.now();
    fetchRoleInBackground(next.user);
  }, [fetchRoleInBackground]);

  useEffect(() => {
    let mounted = true;

    // 1. Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;
        if (import.meta.env.DEV) console.debug("[Auth] State change:", _event, !!newSession);
        applySession(newSession);
        setLoading(false);
      }
    );

    // 2. Check existing session
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      if (!mounted) return;
      applySession(existing);
      setLoading(false);
    }).catch((err) => {
      console.error("[Auth] getSession failed:", err);
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  /**
   * Sign out: always callable, no dependency on loading state.
   * 1. Local Supabase sign-out
   * 2. Clear state
   * 3. Redirect to Microsoft logout to clear SSO session
   */
  const signOut = useCallback(async () => {
    console.log("[Auth] Signing out...");
    // Clear state immediately
    userRef.current = null;
    setUser(null);
    setSession(null);
    // Drop ALL user-scoped React Query cache so stale unread badges/counters
    // from the previous session cannot leak into the next login.
    try {
      queryClient.clear();
    } catch (err) {
      console.warn("[Auth] queryClient.clear failed", err);
    }
    // Revoke only THIS browser's server-side session. A global sign-out would
    // also revoke the user's connected OAuth clients (ChatGPT/MCP), whose
    // refresh then fails with "We couldn't connect your account".
    try {
      await supabase.auth.signOut({ scope: HUB_SIGN_OUT_SCOPE });
    } catch (err) {
      console.error("[Auth] signOut error:", err);
    }
    // Clear any remaining Supabase keys + any app-persisted state keys.
    Object.keys(localStorage).forEach((key) => {
      if (
        key.startsWith("sb-") ||
        key.startsWith("mcs.") ||
        key.startsWith("react-query") ||
        key.startsWith("unread-")
      ) {
        localStorage.removeItem(key);
      }
    });
    try {
      sessionStorage.clear();
    } catch {
      /* noop */
    }
    // Redirect to Microsoft logout to clear SSO session, then land on the public marketing site
    const postLogoutRedirect = encodeURIComponent(`${window.location.origin}/`);
    window.location.href = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/logout?post_logout_redirect_uri=${postLogoutRedirect}`;
  }, [queryClient]);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";

  const value = useMemo(
    () => ({ session, user, loading, isAdmin, isSuperAdmin, roleReady, signOut }),
    [session, user, loading, isAdmin, isSuperAdmin, roleReady, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
