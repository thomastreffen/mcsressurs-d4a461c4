import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveAppRole } from "@/hooks/usePreviewMode";
import { homePathForRole } from "@/lib/home-route";

function Spinner() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

/** Redirects to the role's home once the DB role is confirmed (metadata role may be stale). */
export function RoleHomeRedirect() {
  const { user, loading, roleReady } = useAuth();
  const { role } = useEffectiveAppRole();
  if (loading || (user && !roleReady)) return <Spinner />;
  return <Navigate to={homePathForRole(role)} replace />;
}

/** Montør never sees the leader overview; they are sent to Min dag. */
export function OverviewForRole({ children }: { children: React.ReactNode }) {
  const { user, loading, roleReady } = useAuth();
  const { role } = useEffectiveAppRole();
  if (loading || (user && !roleReady)) return <Spinner />;
  if (homePathForRole(role) === "/my-day") return <Navigate to="/my-day" replace />;
  return <>{children}</>;
}
