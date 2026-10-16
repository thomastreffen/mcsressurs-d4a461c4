import { AlertTriangle, ShieldCheck } from "lucide-react";
import { ReactNode, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useModuleVisibility } from "@/hooks/useModuleVisibility";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompanyModuleAccess } from "@/hooks/useCompanyModuleAccess";

type HmsContextState = {
  companyId: string | null;
  ready: boolean;
  loading: boolean;
  error: Error | null;
  noAccess: boolean;
  canManageHms: boolean;
  employeeProfiles: EmployeeProfileLookup[];
  refetch: () => void;
};

export type EmployeeProfileLookup = {
  user_id: string;
  external_employee_id: string | null;
  name: string | null;
  email: string | null;
};

export function useHmsEmployeeProfiles(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["employee-profiles", "hms-context", companyId],
    enabled: !!companyId && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("employee_work_profiles")
        .select("user_id, external_employee_id")
        .eq("company_id", companyId);
      if (error) throw error;

      const profiles = (data ?? []) as { user_id: string; external_employee_id: string | null }[];
      const userIds = [...new Set(profiles.map((p) => p.user_id).filter(Boolean))];
      let accountInfo: Record<string, { name: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: accounts, error: accountError } = await sb
          .from("user_accounts")
          .select("auth_user_id, person:people!user_accounts_person_id_fkey(full_name, email)")
          .in("auth_user_id", userIds);
        if (accountError) throw accountError;
        accountInfo = Object.fromEntries(
          (accounts ?? []).map((a: any) => [
            a.auth_user_id,
            { name: a.person?.full_name ?? null, email: a.person?.email ?? null },
          ])
        );
      }

      return profiles.map((p) => ({
        ...p,
        name: accountInfo[p.user_id]?.name ?? null,
        email: accountInfo[p.user_id]?.email ?? null,
      })) as EmployeeProfileLookup[];
    },
  });
}

export function useHmsContextReady(): HmsContextState {
  const { user, isAdmin } = useAuth();
  const company = useCompanyContext();
  const permissions = usePermissions();
  const access = useCompanyModuleAccess();
  const modules = useModuleVisibility();
  const companyId = company.activeCompanyId;
  const employeeProfilesQuery = useHmsEmployeeProfiles(companyId, !!user?.id && access.can("hms"));

  const moduleVisible = modules.isModuleVisible("hms");
  const canViewHms = access.can("hms");
  const canManageHms = access.can("hms", "edit");
  const loading = company.loading || access.loading || permissions.loading || modules.loading || (canViewHms && employeeProfilesQuery.isLoading);
  const error = access.error ?? permissions.error ?? modules.error ?? (employeeProfilesQuery.error as Error | null) ?? null;
  const ready = !!companyId && !!user?.id && !loading && !error && moduleVisible && canViewHms;

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("[HMS init] context", {
        companyId,
        companyLoading: company.loading,
        memberships: company.userMemberships.length,
        permissionsLoaded: !permissions.loading,
        moduleSettingsLoaded: !modules.loading,
        employeeProfilesLoaded: !employeeProfilesQuery.isLoading,
        employeeProfiles: employeeProfilesQuery.data?.length ?? 0,
        moduleVisible,
        canViewHms,
        ready,
      });
    }
  }, [company.loading, company.userMemberships.length, companyId, employeeProfilesQuery.data?.length, employeeProfilesQuery.isLoading, moduleVisible, modules.loading, permissions.loading, canViewHms, ready]);

  return useMemo(() => ({
    companyId,
    ready,
    loading,
    error,
    noAccess: !!companyId && !loading && !error && (!moduleVisible || !canViewHms),
    canManageHms,
    employeeProfiles: employeeProfilesQuery.data ?? [],
    refetch: () => {
      permissions.refetch();
      modules.refetch();
      employeeProfilesQuery.refetch();
    },
  }), [canManageHms, canViewHms, companyId, employeeProfilesQuery, error, loading, moduleVisible, modules, permissions, ready]);
}

export function HmsContextGate({ children, label = "Laster HMS & HR…" }: { children: ReactNode; label?: string }) {
  const context = useHmsContextReady();

  if (context.loading) return <HmsLoading label={label} />;

  if (!context.companyId) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Velg selskap for HMS &amp; HR</AlertTitle>
          <AlertDescription>HMS-data må åpnes i ett valgt selskap for å unngå blandet cache og feil tilgangsbilde.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (context.error) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Kunne ikke laste HMS &amp; HR</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{context.error.message || "En grunnleggende HMS-spørring feilet."}</p>
            <Button variant="outline" size="sm" onClick={context.refetch}>Prøv igjen</Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (context.noAccess) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Ingen tilgang til HMS &amp; HR</AlertTitle>
          <AlertDescription>HMS &amp; HR er ikke aktivert for denne brukeren eller dette selskapet.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}

export function HmsLoading({ label = "Laster HMS & HR…" }: { label?: string }) {
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <ShieldCheck className="h-5 w-5 animate-pulse" />
        </div>
        <span>{label}</span>
      </div>
      <Skeleton className="h-24" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}