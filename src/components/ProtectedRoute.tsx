import { Navigate } from "react-router-dom";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { CompanyModuleGate } from "@/components/CompanyModuleGate";
import { useLocation } from "react-router-dom";
import { moduleForPath } from "@/lib/company-module-access";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
  /** If set, user must have this permission OR be admin/super_admin */
  requiredPermission?: string;
}

export function ProtectedRoute({ children, requiredRoles, requiredPermission }: ProtectedRouteProps) {
  const location = useLocation();
  const { session, user, loading, isAdmin } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const [roleSettled, setRoleSettled] = useState(false);

  // Give the background role fetch a moment to complete before checking roles
  useEffect(() => {
    if (!loading && user) {
      const timer = setTimeout(() => setRoleSettled(true), 300);
      return () => clearTimeout(timer);
    }
    if (!loading && !user) {
      setRoleSettled(true);
    }
  }, [loading, user, user?.role]);

  if (loading || (!roleSettled && user) || (requiredPermission && permLoading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && user && !requiredRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  if (requiredPermission && !isAdmin && !hasPermission(requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  return <CompanyModuleGate module={moduleForPath(location.pathname)} level={requiredPermission?.endsWith(".manage") ? "edit" : "view"}>{children}</CompanyModuleGate>;
}
