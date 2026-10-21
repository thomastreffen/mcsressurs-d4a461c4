import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { PreviewPermissionOverrideProvider } from "@/hooks/usePermissions";

export interface PreviewTarget {
  type: "user" | "role";
  id: string;
  label: string;
  appRole?: AppRole;
}

export interface PreviewPermissionDetail {
  key: string;
  allowed: boolean;
  source: "role" | "override";
  roleName?: string;
}

interface PreviewModeContextType {
  active: boolean;
  target: PreviewTarget | null;
  permissions: Record<string, boolean>;
  permissionDetails: PreviewPermissionDetail[];
  scope: "own" | "company" | "all";
  loading: boolean;
  activate: (target: PreviewTarget) => Promise<void>;
  deactivate: () => void;
  effectiveRole: AppRole | null;
  realIsSuperAdmin: boolean;
}

const PreviewModeContext = createContext<PreviewModeContextType | undefined>(undefined);

export function PreviewModeProvider({ children }: { children: ReactNode }) {
  const { user, isSuperAdmin } = useAuth();
  const [active, setActive] = useState(false);
  const [target, setTarget] = useState<PreviewTarget | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [permissionDetails, setPermissionDetails] = useState<PreviewPermissionDetail[]>([]);
  const [scope, setScope] = useState<"own" | "company" | "all">("own");
  const [loading, setLoading] = useState(false);
  const [effectiveRole, setEffectiveRole] = useState<AppRole | null>(null);

  /**
   * Fetch permissions purely from DB – NO hardcoded admin defaults.
   * This ensures preview shows the REAL effective access.
   */
  const fetchUserPermissions = useCallback(async (authUserId: string) => {
    // Get role assignments from both v1 and v2
    const { data: v1Assignments } = await supabase
      .from("user_role_assignments")
      .select("role_id")
      .eq("user_id", authUserId);

    const roleIds = (v1Assignments || []).map((a: any) => a.role_id);

    // Also check v2
    const { data: ua } = await supabase
      .from("user_accounts")
      .select("id")
      .eq("auth_user_id", authUserId)
      .eq("is_active", true)
      .maybeSingle();

    if (ua) {
      const { data: v2Roles } = await supabase
        .from("user_roles_v2")
        .select("role_id")
        .eq("user_account_id", ua.id);
      for (const r of v2Roles || []) {
        if (!roleIds.includes((r as any).role_id)) roleIds.push((r as any).role_id);
      }
    }

    let roleNames: Record<string, string> = {};
    if (roleIds.length > 0) {
      const { data: roles } = await supabase
        .from("roles")
        .select("id, name")
        .in("id", roleIds);
      for (const r of roles || []) {
        roleNames[(r as any).id] = (r as any).name;
      }
    }

    let rolePerms: Record<string, boolean> = {};
    const details: PreviewPermissionDetail[] = [];
    if (roleIds.length > 0) {
      const { data: rp } = await supabase
        .from("role_permissions")
        .select("permission_key, allowed, role_id")
        .in("role_id", roleIds);
      for (const p of rp || []) {
        const pk = (p as any).permission_key;
        const allowed = (p as any).allowed;
        if (allowed) rolePerms[pk] = true;
        else if (!rolePerms[pk]) rolePerms[pk] = false;
        details.push({
          key: pk,
          allowed,
          source: "role",
          roleName: roleNames[(p as any).role_id] || "Ukjent rolle",
        });
      }
    }

    // v1 overrides
    const { data: overrides } = await supabase
      .from("user_permission_overrides")
      .select("permission_key, allowed")
      .eq("user_id", authUserId);

    const merged = { ...rolePerms };
    for (const o of overrides || []) {
      const pk = (o as any).permission_key;
      merged[pk] = (o as any).allowed;
      details.push({ key: pk, allowed: (o as any).allowed, source: "override" });
    }

    // v2 overrides
    if (ua) {
      const { data: v2Overrides } = await supabase
        .from("user_permission_overrides_v2")
        .select("permission_key, mode")
        .eq("user_account_id", ua.id);
      for (const o of v2Overrides || []) {
        const pk = (o as any).permission_key;
        merged[pk] = (o as any).mode === "allow";
        details.push({ key: pk, allowed: (o as any).mode === "allow", source: "override" });
      }
    }

    // Derive effective role from legacy table (for sidebar admin checks)
    const { data: legacyRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authUserId)
      .maybeSingle();

    const appRole = (legacyRole?.role as AppRole) || "montør";

    return { permissions: merged, details, appRole };
  }, []);

  const fetchRolePermissions = useCallback(async (roleId: string) => {
    const { data: rp } = await supabase
      .from("role_permissions")
      .select("permission_key, allowed")
      .eq("role_id", roleId);

    const merged: Record<string, boolean> = {};
    const details: PreviewPermissionDetail[] = [];
    for (const p of rp || []) {
      const pk = (p as any).permission_key;
      merged[pk] = (p as any).allowed;
      details.push({ key: pk, allowed: (p as any).allowed, source: "role" });
    }
    return { permissions: merged, details };
  }, []);

  const activate = useCallback(async (newTarget: PreviewTarget) => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setTarget(newTarget);

    try {
      let result: { permissions: Record<string, boolean>; details: PreviewPermissionDetail[] };
      let appRole: AppRole = "montør";

      if (newTarget.type === "user") {
        const r = await fetchUserPermissions(newTarget.id);
        result = r;
        appRole = r.appRole;
      } else {
        result = await fetchRolePermissions(newTarget.id);
        if (newTarget.appRole) appRole = newTarget.appRole;
        // Derive effective role from module.admin permission
        if (result.permissions["scope.view.all"] && result.permissions["module.admin"]) {
          appRole = "super_admin";
        } else if (result.permissions["module.admin"]) {
          appRole = "admin";
        }
      }

      setPermissions(result.permissions);
      setPermissionDetails(result.details);
      setEffectiveRole(appRole);

      if (result.permissions["scope.view.all"]) setScope("all");
      else if (result.permissions["scope.view.company"]) setScope("company");
      else setScope("own");

      setActive(true);

      // Audit log
      if (user) {
        await supabase.from("audit_log").insert({
          action: "preview_mode_activated",
          target_type: newTarget.type === "user" ? "user" : "role",
          target_id: newTarget.id,
          actor_user_account_id: null,
          metadata: {
            actor_auth_id: user.id,
            actor_name: user.name,
            target_label: newTarget.label,
            preview_type: newTarget.type,
          },
        });
      }
    } catch (err) {
      console.error("[PreviewMode] Failed to activate:", err);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, user, fetchUserPermissions, fetchRolePermissions]);

  const deactivate = useCallback(() => {
    setActive(false);
    setTarget(null);
    setPermissions({});
    setPermissionDetails([]);
    setScope("own");
    setEffectiveRole(null);
  }, []);

  const contextValue: PreviewModeContextType = {
    active,
    target,
    permissions,
    permissionDetails,
    scope,
    loading,
    activate,
    deactivate,
    effectiveRole,
    realIsSuperAdmin: isSuperAdmin,
  };

  return (
    <PreviewModeContext.Provider value={contextValue}>
      <PreviewPermissionOverrideProvider value={active ? { active, permissions, scope, loading } : null}>
        {children}
      </PreviewPermissionOverrideProvider>
    </PreviewModeContext.Provider>
  );
}

export function usePreviewMode() {
  const ctx = useContext(PreviewModeContext);
  if (!ctx) throw new Error("usePreviewMode must be used within PreviewModeProvider");
  return ctx;
}

/**
 * Effective app role for role-driven UI (home, navigation): the preview role while a
 * superadmin previews, otherwise the real role. Never used for authorization writes.
 */
export function useEffectiveAppRole() {
  const { user } = useAuth();
  const ctx = useContext(PreviewModeContext);
  const role: AppRole | null = ctx?.active && ctx.effectiveRole ? ctx.effectiveRole : user?.role ?? null;
  return {
    role,
    isMontor: role === "montør",
    isAdmin: role === "admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
  };
}
