import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  useMountLog("AUTH CONTEXT INIT");
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /** Non-blocking role fetch from DB — updates user if role differs */
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
        return; // keep metadata role
      }

      if (data?.role) {
        const dbRole = data.role as AppRole;
        const currentMetaRole = supaUser.user_metadata?.app_role;
        if (dbRole !== currentMetaRole) {
          console.log("[Auth] Role from DB differs, updating:", dbRole);
        }
        setUser((prev) =>
          prev && prev.id === supaUser.id ? { ...prev, role: dbRole } : prev
        );
      }
    } catch (err) {
      console.warn("[Auth] Role fetch exception, keeping default role");
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1. Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;
        console.log("[Auth] State change:", _event, !!newSession);
        setSession(newSession);

        if (newSession?.user) {
          // Set user immediately from metadata (non-blocking)
          const authUser = buildUserFromMeta(newSession.user);
          setUser(authUser);
          // Then fetch real role in background
          fetchRoleInBackground(newSession.user);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    // 2. Check existing session
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      if (!mounted) return;
      setSession(existing);
      if (existing?.user) {
        const authUser = buildUserFromMeta(existing.user);
        setUser(authUser);
        fetchRoleInBackground(existing.user);
      }
      setLoading(false);
    }).catch((err) => {
      console.error("[Auth] getSession failed:", err);
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRoleInBackground]);

  /**
   * Sign out: always callable, no dependency on loading state.
   * 1. Local Supabase sign-out
   * 2. Clear state
   * 3. Redirect to Microsoft logout to clear SSO session
   */
  const signOut = useCallback(async () => {
    console.log("[Auth] Signing out...");
    // Clear state immediately
    setUser(null);
    setSession(null);
    // Drop ALL user-scoped React Query cache so stale unread badges/counters
    // from the previous session cannot leak into the next login.
    try {
      queryClient.clear();
    } catch (err) {
      console.warn("[Auth] queryClient.clear failed", err);
    }
    // Global signout revokes server-side session too
    try {
      await supabase.auth.signOut({ scope: "global" });
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

  return (
    <AuthContext.Provider value={{ session, user, loading, isAdmin, isSuperAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
