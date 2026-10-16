import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, ArrowLeft, User, Building, Shield, Activity,
  Archive, ArchiveRestore, Plus, Trash2, Mail, RotateCcw, Ban, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PermissionsPanel } from "@/components/permissions/PermissionsPanel";
import { HardDeleteDialog } from "@/components/person/HardDeleteDialog";
import { CrossCompanyAccessCard } from "@/components/person/CrossCompanyAccessCard";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { PersonSecurityTab } from "@/components/security/PersonSecurityTab";
import { ResetOnboardingDialog } from "@/components/person/ResetOnboardingDialog";

interface PersonData {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
}

interface EmploymentData {
  id: string;
  company_id: string;
  department_id: string | null;
  is_plannable_resource: boolean;
  birth_date: string | null;
  hms_card_number: string | null;
  hms_card_expires_at: string | null;
  trade_certificate_type: string | null;
  driver_license_classes: string | null;
  notes: string | null;
  archived_at: string | null;
}

interface UserAccountData {
  id: string;
  auth_user_id: string;
  company_id: string;
  is_active: boolean;
}

interface RoleOption { id: string; name: string; description?: string | null; }
interface CompanyOption { id: string; name: string; departments: { id: string; name: string }[]; }

interface MembershipRow {
  company_id: string;
  department_id: string | null;
  role_id: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  target_type: string;
  metadata: any;
  created_at: string;
}

interface EmploymentProfileRow {
  id: string;
  company_id: string;
  company_name: string;
  department_id: string | null;
  department_name: string | null;
  is_plannable_resource: boolean;
  archived_at: string | null;
  relationship_type: string;
  include_in_hms_people: boolean;
}

const RELATIONSHIP_TYPES: { value: string; label: string }[] = [
  { value: "employee", label: "Ansatt" },
  { value: "contractor", label: "Innleid" },
  { value: "board", label: "Styre" },
  { value: "external_access", label: "Ekstern tilgang" },
  { value: "system_access", label: "Kun systemtilgang" },
  { value: "other", label: "Annet" },
];

export default function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isSuperAdmin, isAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const canViewSecurity = isSuperAdmin || isAdmin || hasPermission("security.view") || hasPermission("security.manage");
  const defaultTab = searchParams.get("tab") || "profile";
  const [person, setPerson] = useState<PersonData | null>(null);
  const [employment, setEmployment] = useState<EmploymentData | null>(null);
  const [account, setAccount] = useState<UserAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [resetOnboardingOpen, setResetOnboardingOpen] = useState(false);

  // Org tab
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [allEmployments, setAllEmployments] = useState<EmploymentProfileRow[]>([]);
  const [addingCompany, setAddingCompany] = useState(false);
  const [newCompanyId, setNewCompanyId] = useState("");

  // Permissions (unified)
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);
  const [scopes, setScopes] = useState<{ company_id: string; department_id: string | null }[]>([]);
  const [overrides, setOverrides] = useState<Record<string, "allow" | "deny">>({});
  const [scopeOverride, setScopeOverride] = useState("inherit");
  const [rolePermissions, setRolePermissions] = useState<Record<string, boolean>>({});
  const [rolePermSourceMap, setRolePermSourceMap] = useState<Record<string, string>>({});
  const [allRolePerms, setAllRolePerms] = useState<any[]>([]);
  const [allOverridesV2, setAllOverridesV2] = useState<any[]>([]);
  const [membershipRoles, setMembershipRoles] = useState<Record<string, string | null>>({});
  const [overrideCompanyId, setOverrideCompanyId] = useState<string | null>(null);
  const [effectiveRoleName, setEffectiveRoleName] = useState<string | null>(null);

  // Audit tab
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const [
      { data: pData },
      { data: allEpData },
      { data: uaData },
      { data: rolesData },
      { data: compsData },
      { data: deptsData },
    ] = await Promise.all([
      supabase.from("people").select("*").eq("id", id).single(),
      supabase.from("employment_profiles").select("*").eq("person_id", id),
      supabase.from("user_accounts").select("*").eq("person_id", id).maybeSingle(),
      supabase.from("roles").select("id, name, description").order("name"),
      supabase.from("internal_companies").select("id, name").eq("is_active", true),
      supabase.from("departments").select("id, name, company_id").eq("is_active", true),
    ]);

    setPerson(pData as any);
    const epList = (allEpData as any[]) || [];
    setEmployment(epList[0] || null);
    setAccount(uaData as any);
    setRoles((rolesData as any[]) || []);

    const companyOptions = (compsData as any[] || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      departments: (deptsData as any[] || []).filter((d: any) => d.company_id === c.id).map((d: any) => ({ id: d.id, name: d.name })),
    }));
    setCompanies(companyOptions);

    const compNameMap = new Map((compsData as any[] || []).map((c: any) => [c.id, c.name]));
    const deptNameMap = new Map((deptsData as any[] || []).map((d: any) => [d.id, d.name]));
    setAllEmployments(epList.map((ep: any) => ({
      id: ep.id,
      company_id: ep.company_id,
      company_name: compNameMap.get(ep.company_id) || "Ukjent",
      department_id: ep.department_id,
      department_name: ep.department_id ? deptNameMap.get(ep.department_id) || null : null,
      is_plannable_resource: ep.is_plannable_resource,
      archived_at: ep.archived_at,
      relationship_type: ep.relationship_type ?? "employee",
      include_in_hms_people: ep.include_in_hms_people ?? true,
    })));

    if (uaData) {
      const ua = uaData as any;
      const [
        { data: urData },
        { data: membershipData },
        { data: uoData },
        { data: rpData },
        { data: auditData },
      ] = await Promise.all([
        supabase.from("user_roles_v2").select("role_id").eq("user_account_id", ua.id),
        supabase.from("user_memberships").select("company_id, department_id, role_id").eq("user_id", ua.auth_user_id).eq("is_active", true),
        supabase.from("user_permission_overrides_v2").select("permission_key, mode, scope_company_id").eq("user_account_id", ua.id),
        supabase.from("role_permissions").select("role_id, permission_key, allowed"),
        supabase.from("audit_log").select("*").eq("target_id", id).order("created_at", { ascending: false }).limit(50),
      ]);

      const assignedRoleIds = (urData as any[] || []).map((r: any) => r.role_id);
      const memberships = (membershipData as MembershipRow[]) || [];
      const membershipRoleMap = memberships.reduce<Record<string, string | null>>((acc, membership) => {
        if (membership.department_id === null) {
          acc[membership.company_id] = membership.role_id || null;
        }
        return acc;
      }, {});

      setAssignedRoles(assignedRoleIds);
      setAllRolePerms((rpData as any[]) || []);
      setScopes(memberships.map((membership) => ({ company_id: membership.company_id, department_id: membership.department_id })));
      setMembershipRoles(membershipRoleMap);

      // Store all v2 overrides for per-company filtering
      const allOv = (uoData as any[] || []);
      setAllOverridesV2(allOv);

      // Set initial override company to first membership company
      const firstCompanyId = overrideCompanyId || memberships[0]?.company_id || null;
      setOverrideCompanyId(firstCompanyId);

      // Build overrides filtered by selected company
      applyOverridesForCompany(allOv, firstCompanyId);
      buildRolePermMaps(firstCompanyId, membershipRoleMap, assignedRoleIds, (rpData as any[]) || [], (rolesData as any[]) || []);
      setAuditEntries((auditData as any[]) || []);
    }

    setLoading(false);
  }, [id]);

  const applyOverridesForCompany = (allOv: any[], companyId: string | null) => {
    const ov: Record<string, "allow" | "deny"> = {};
    let sc = "inherit";
    for (const o of allOv) {
      // Match: global overrides (no scope_company_id) OR matching company
      if (!o.scope_company_id || o.scope_company_id === companyId) {
        if (o.permission_key.startsWith("scope.view.")) {
          if (o.mode === "allow") sc = o.permission_key;
        } else {
          ov[o.permission_key] = o.mode;
        }
      }
    }
    setOverrides(ov);
    setScopeOverride(sc);
  };

  const handleOverrideCompanyChange = (companyId: string) => {
    setOverrideCompanyId(companyId);
    applyOverridesForCompany(allOverridesV2, companyId);
    buildRolePermMaps(companyId, membershipRoles, assignedRoles, allRolePerms, roles);
  };

  const buildRolePermMaps = (
    companyId: string | null,
    membershipRoleMap: Record<string, string | null>,
    fallbackRoleIds: string[],
    rpData: any[],
    rolesData: any[]
  ) => {
    const companyRoleId = companyId ? membershipRoleMap[companyId] || null : null;
    const effectiveRoleIds = companyRoleId ? [companyRoleId] : fallbackRoleIds;
    const rp: Record<string, boolean> = {};
    const srcMap: Record<string, string> = {};
    const roleNameMap = new Map((rolesData || []).map((r: any) => [r.id, r.name]));
    const roleNames = effectiveRoleIds.map((roleId) => roleNameMap.get(roleId)).filter(Boolean);

    for (const p of (rpData || [])) {
      if (effectiveRoleIds.includes(p.role_id) && p.allowed) {
        rp[p.permission_key] = true;
        srcMap[p.permission_key] = roleNameMap.get(p.role_id) || "Rolle";
      }
    }

    setRolePermissions(rp);
    setRolePermSourceMap(srcMap);
    setEffectiveRoleName(roleNames.length > 0 ? roleNames.join(", ") : null);
  };

  // When assignedRoles change locally, rebuild perm maps
  const handleAssignedRolesChange = useCallback((newRoles: string[]) => {
    setAssignedRoles(newRoles);
    buildRolePermMaps(overrideCompanyId, membershipRoles, newRoles, allRolePerms, roles);
  }, [allRolePerms, membershipRoles, overrideCompanyId, roles]);

  const handleSelectedCompanyRoleChange = useCallback((roleId: string | null) => {
    if (!overrideCompanyId) return;

    const nextMembershipRoles = {
      ...membershipRoles,
      [overrideCompanyId]: roleId,
    };

    setMembershipRoles(nextMembershipRoles);
    buildRolePermMaps(overrideCompanyId, nextMembershipRoles, assignedRoles, allRolePerms, roles);
  }, [allRolePerms, assignedRoles, membershipRoles, overrideCompanyId, roles]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveProfile = async () => {
    if (!person || !employment) return;
    setSaving(true);
    await Promise.all([
      supabase.from("people").update({
        full_name: person.full_name,
        phone: person.phone,
      }).eq("id", person.id),
      supabase.from("employment_profiles").update({
        is_plannable_resource: employment.is_plannable_resource,
        birth_date: employment.birth_date || null,
        hms_card_number: employment.hms_card_number || null,
        hms_card_expires_at: employment.hms_card_expires_at || null,
        trade_certificate_type: employment.trade_certificate_type || null,
        driver_license_classes: employment.driver_license_classes || null,
        notes: employment.notes || null,
        company_id: employment.company_id,
        department_id: employment.department_id,
      }).eq("id", employment.id),
    ]);
    setSaving(false);
    toast.success("Profil oppdatert");
  };

  const handleArchiveToggle = async () => {
    if (!employment) return;
    setSaving(true);
    const isArchived = !!employment.archived_at;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("employment_profiles").update({
      archived_at: isArchived ? null : new Date().toISOString(),
      archived_by: isArchived ? null : user?.id || null,
    }).eq("id", employment.id);
    setSaving(false);
    toast.success(isArchived ? "Person gjenopprettet" : "Person arkivert");
    fetchData();
  };

  const handleAccessToggle = async () => {
    if (!account || !person) return;
    const activate = !account.is_active;
    if (!activate && !window.confirm(`Deaktiver tilgang for ${person.full_name}? Personen kan ikke lenger logge inn. Alle data beholdes.`)) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("delete-person", {
      body: { person_id: person.id, action: "set_access", active: activate },
    });
    setSaving(false);
    if (error || data?.error) {
      toast.error("Kunne ikke endre tilgang", { description: data?.error || error?.message });
      return;
    }
    toast.success(activate ? "Tilgang aktivert" : "Tilgang deaktivert – personen kan ikke logge inn");
    fetchData();
  };

  const handleSaveAll = async () => {
    if (!account) return;
    setSaving(true);
    // Throw on any failed write so nothing fails silently
    const must = async (p: PromiseLike<{ error: any }>) => {
      const { error } = await p;
      if (error) throw error;
    };
    try {
      // Save roles (v2 + legacy sync)
      await must(supabase.from("user_roles_v2").delete().eq("user_account_id", account.id));
      if (assignedRoles.length > 0) {
        await must(supabase.from("user_roles_v2").insert(
          assignedRoles.map((rid) => ({ user_account_id: account.id, role_id: rid }))
        ));
      }
      await must(supabase.from("user_role_assignments").delete().eq("user_id", account.auth_user_id));
      if (assignedRoles.length > 0) {
        await must(supabase.from("user_role_assignments").insert(
          assignedRoles.map((rid) => ({ user_id: account.auth_user_id, role_id: rid }))
        ));
      }

      // Save scopes (v2 + legacy sync)
      await must(supabase.from("user_scopes").delete().eq("user_account_id", account.id));
      if (scopes.length > 0) {
        await must(supabase.from("user_scopes").insert(
          scopes.map((s) => ({ user_account_id: account.id, company_id: s.company_id, department_id: s.department_id }))
        ));
      }
      await must(supabase.from("user_memberships").delete().eq("user_id", account.auth_user_id));
      if (scopes.length > 0) {
        await must(supabase.from("user_memberships").insert(
          scopes.map((s) => ({
            user_id: account.auth_user_id,
            company_id: s.company_id,
            department_id: s.department_id,
            role_id: s.department_id === null ? (membershipRoles[s.company_id] ?? null) : null,
          }))
        ));
      }

      // Save permission overrides (v2 + legacy sync) — scoped to selected company
      // Only delete overrides for the currently selected company (preserve other companies' overrides)
      if (overrideCompanyId) {
        await must(supabase.from("user_permission_overrides_v2")
          .delete()
          .eq("user_account_id", account.id)
          .eq("scope_company_id", overrideCompanyId));
      } else {
        // Fallback: delete global (null company) overrides only
        await must(supabase.from("user_permission_overrides_v2")
          .delete()
          .eq("user_account_id", account.id)
          .is("scope_company_id", null));
      }
      const rows: any[] = Object.entries(overrides).map(([key, mode]) => ({
        user_account_id: account.id, permission_key: key, mode,
        scope_company_id: overrideCompanyId || null,
      }));
      if (scopeOverride !== "inherit") {
        rows.push({ user_account_id: account.id, permission_key: scopeOverride, mode: "allow", scope_company_id: overrideCompanyId || null });
      }
      if (rows.length > 0) {
        await must(supabase.from("user_permission_overrides_v2").insert(rows));
      }

      // Update allOverridesV2 cache
      const remaining = allOverridesV2.filter((o: any) =>
        overrideCompanyId ? o.scope_company_id !== overrideCompanyId : o.scope_company_id !== null
      );
      setAllOverridesV2([...remaining, ...rows.map(r => ({ ...r, scope_company_id: r.scope_company_id }))]);

      // Legacy sync — flatten all v2 overrides to v1 (global)
      const { data: allV2 } = await supabase.from("user_permission_overrides_v2")
        .select("permission_key, mode")
        .eq("user_account_id", account.id);
      await must(supabase.from("user_permission_overrides").delete().eq("user_id", account.auth_user_id));
      const legacyRows = (allV2 || []).map((r: any) => ({
        user_id: account.auth_user_id,
        permission_key: r.permission_key,
        allowed: r.mode === "allow",
      }));
      if (legacyRows.length > 0) {
        await must(supabase.from("user_permission_overrides").insert(legacyRows));
      }

      toast.success("Roller, omfang og rettigheter lagret");
      fetchData();
    } catch (err: any) {
      toast.error("Feil", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/personer")}>
          <ArrowLeft className="h-4 w-4 mr-1" />Tilbake
        </Button>
        <p className="text-sm text-muted-foreground text-center py-12">Fant ikke persondata.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/personer")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{person.full_name}</h1>
              {employment?.archived_at ? (
                <Badge variant="destructive" className="text-[10px]">Arkivert</Badge>
              ) : account && !account.is_active ? null : (
                <Badge variant="outline" className="text-[10px]">Aktiv</Badge>
              )}
              {account && <Badge variant="secondary" className="text-[10px]">Brukerkonto</Badge>}
              {account && !account.is_active && <Badge variant="destructive" className="text-[10px]">Tilgang deaktivert</Badge>}
              {employment?.is_plannable_resource && <Badge variant="success" className="text-[10px]">Planleggbar</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{person.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && account && (
              <Button
                variant={account.is_active ? "outline" : "default"}
                size="sm"
                onClick={handleAccessToggle}
                disabled={saving}
                className="gap-1.5"
              >
                {account.is_active ? <><Ban className="h-4 w-4" />Deaktiver tilgang</> : <><CheckCircle2 className="h-4 w-4" />Aktiver tilgang</>}
              </Button>
            )}
            {isSuperAdmin && account && (
              <Button variant="outline" size="sm" onClick={() => setResetOnboardingOpen(true)} disabled={saving} className="gap-1.5">
                <RotateCcw className="h-4 w-4" />
                Nullstill onboarding
              </Button>
            )}
            {employment && (
              <Button
                variant={employment.archived_at ? "outline" : "destructive"}
                size="sm"
                onClick={handleArchiveToggle}
                disabled={saving}
              >
                {employment.archived_at ? <><ArchiveRestore className="h-4 w-4 mr-1" />Gjenopprett</> : <><Archive className="h-4 w-4 mr-1" />Arkiver</>}
              </Button>
            )}
            {isSuperAdmin && (
              <Button variant="destructive" size="sm" onClick={() => setHardDeleteOpen(true)} className="gap-1.5">
                <Trash2 className="h-4 w-4" />
                Slett permanent
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="profile"><User className="h-4 w-4 mr-1.5" />Profil</TabsTrigger>
            <TabsTrigger value="org"><Building className="h-4 w-4 mr-1.5" />Organisasjon</TabsTrigger>
            {account && <TabsTrigger value="permissions"><Shield className="h-4 w-4 mr-1.5" />Rettigheter</TabsTrigger>}
            {canViewSecurity && <TabsTrigger value="security"><Shield className="h-4 w-4 mr-1.5" />Sikkerhet</TabsTrigger>}
            <TabsTrigger value="audit"><Activity className="h-4 w-4 mr-1.5" />Aktivitet</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <div className="rounded-lg border p-4 sm:p-6 space-y-5 max-w-2xl">
              {employment && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Planleggbar ressurs</Label>
                      <p className="text-[11px] text-muted-foreground">Vises i ressursplanen</p>
                    </div>
                    <Switch
                      checked={employment.is_plannable_resource}
                      onCheckedChange={(v) => setEmployment({ ...employment, is_plannable_resource: v })}
                    />
                  </div>
                  <Separator />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Fullt navn</Label>
                      <Input value={person.full_name} onChange={(e) => setPerson({ ...person, full_name: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Telefon</Label>
                      <Input value={person.phone || ""} onChange={(e) => setPerson({ ...person, phone: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Fødselsdato</Label>
                      <Input type="date" value={employment.birth_date || ""} onChange={(e) => setEmployment({ ...employment, birth_date: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">HMS-kortnummer</Label>
                      <Input value={employment.hms_card_number || ""} onChange={(e) => setEmployment({ ...employment, hms_card_number: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">HMS-kort utløper</Label>
                      <Input type="date" value={employment.hms_card_expires_at || ""} onChange={(e) => setEmployment({ ...employment, hms_card_expires_at: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Fagbrev-type</Label>
                      <Input value={employment.trade_certificate_type || ""} onChange={(e) => setEmployment({ ...employment, trade_certificate_type: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Førerkortklasser</Label>
                      <Input value={employment.driver_license_classes || ""} onChange={(e) => setEmployment({ ...employment, driver_license_classes: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Notater</Label>
                    <Textarea value={employment.notes || ""} onChange={(e) => setEmployment({ ...employment, notes: e.target.value })} rows={3} />
                  </div>
                </>
              )}
              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre profil"}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Organisation Tab */}
          <TabsContent value="org">
            <div className="rounded-lg border p-4 sm:p-6 space-y-5 max-w-2xl">
              <div>
                <h3 className="text-sm font-medium mb-3">Tilknyttede selskaper</h3>
                {allEmployments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen selskaper tilknyttet.</p>
                ) : (
                  <div className="space-y-2">
                    {allEmployments.map((ep) => (
                      <div key={ep.id} className="rounded-md border border-border p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{ep.company_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {ep.department_name || "Ingen avdeling"}
                              {ep.is_plannable_resource && " · Planleggbar"}
                              {ep.archived_at && " · Arkivert"}
                            </p>
                          </div>
                          {(isSuperAdmin || isAdmin) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={async () => {
                                if (!confirm("Fjerne dette selskapsmedlemskapet?")) return;
                                await supabase.from("employment_profiles").delete().eq("id", ep.id);
                                toast.success("Medlemskap fjernet");
                                fetchData();
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        {(isSuperAdmin || isAdmin) && (
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 pt-1">
                            <div>
                              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tilknytningstype</Label>
                              <Select
                                value={ep.relationship_type}
                                onValueChange={async (v) => {
                                  setAllEmployments((prev) => prev.map((x) => x.id === ep.id ? { ...x, relationship_type: v } : x));
                                  const { error } = await supabase
                                    .from("employment_profiles")
                                    .update({ relationship_type: v } as any)
                                    .eq("id", ep.id);
                                  if (error) toast.error("Kunne ikke oppdatere tilknytningstype", { description: error.message });
                                }}
                              >
                                <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {RELATIONSHIP_TYPES.map((t) => (
                                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-end gap-2 pb-1">
                              <Switch
                                id={`hms-${ep.id}`}
                                checked={ep.include_in_hms_people}
                                onCheckedChange={async (checked) => {
                                  setAllEmployments((prev) => prev.map((x) => x.id === ep.id ? { ...x, include_in_hms_people: checked } : x));
                                  const { error } = await supabase
                                    .from("employment_profiles")
                                    .update({ include_in_hms_people: checked } as any)
                                    .eq("id", ep.id);
                                  if (error) toast.error("Kunne ikke oppdatere HMS-synlighet", { description: error.message });
                                }}
                              />
                              <Label htmlFor={`hms-${ep.id}`} className="text-xs cursor-pointer">Vis i HMS-ansattliste</Label>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add company */}
                <div className="flex items-center gap-2 mt-3">
                  <Select value={newCompanyId} onValueChange={setNewCompanyId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Velg selskap å legge til..." />
                    </SelectTrigger>
                    <SelectContent>
                      {companies
                        .filter((c) => !allEmployments.some((ep) => ep.company_id === c.id))
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!newCompanyId || addingCompany}
                    onClick={async () => {
                      if (!newCompanyId || !id) return;
                      setAddingCompany(true);
                      const { error } = await supabase.from("employment_profiles").insert({
                        person_id: id,
                        company_id: newCompanyId,
                        is_plannable_resource: false,
                      });
                      if (error) {
                        toast.error("Kunne ikke legge til selskap", { description: error.message });
                      } else {
                        toast.success("Selskap lagt til");
                        setNewCompanyId("");
                        fetchData();
                      }
                      setAddingCompany(false);
                    }}
                    className="gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Legg til
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Primary employment details */}
              {employment && (
                <>
                  <h3 className="text-sm font-medium">Primær ansattprofil</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Selskap</Label>
                      <Select value={employment.company_id} onValueChange={(v) => setEmployment({ ...employment, company_id: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {companies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Avdeling</Label>
                      <Select value={employment.department_id || "none"} onValueChange={(v) => setEmployment({ ...employment, department_id: v === "none" ? null : v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Ingen avdeling</SelectItem>
                          {companies.find((c) => c.id === employment.company_id)?.departments.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* Account status */}
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-2">Kontostatus</h3>
                {account ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      {account.is_active ? (
                        <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-700">Brukerkonto aktiv</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">Tilgang deaktivert – kan ikke logge inn</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">Auth ID: {account.auth_user_id.slice(0, 8)}…</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={async () => {
                          if (!person) return;
                          setSaving(true);
                          try {
                            const res = await supabase.functions.invoke("create-person", {
                              body: { full_name: person.full_name, email: person.email, company_id: employment?.company_id, send_invite: true },
                            });
                            if (res.error) throw res.error;
                            toast.success("Invitasjon sendt på nytt");
                          } catch (err: any) {
                            toast.error("Feil", { description: err.message });
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Send invitasjon på nytt
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={async () => {
                          if (!person?.email) return;
                          setSaving(true);
                          const { error } = await supabase.auth.resetPasswordForEmail(person.email, {
                            redirectTo: `${window.location.origin}/activate`,
                          });
                          setSaving(false);
                          if (error) {
                            toast.error("Feil", { description: error.message });
                          } else {
                            toast.success("E-post for passordtilbakestilling sendt");
                          }
                        }}
                        disabled={saving}
                      >
                        Nullstill passord
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Badge variant="outline" className="text-[10px]">Kun ansatt – ingen innlogging</Badge>
                    <p className="text-xs text-muted-foreground">Denne personen har ikke en brukerkonto ennå.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={async () => {
                        if (!person || !employment) return;
                        setSaving(true);
                        try {
                          const res = await supabase.functions.invoke("create-person", {
                            body: { full_name: person.full_name, email: person.email, company_id: employment.company_id, send_invite: true },
                          });
                          if (res.error) throw res.error;
                          toast.success("Invitasjon sendt");
                          fetchData();
                        } catch (err: any) {
                          toast.error("Feil", { description: err.message });
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Opprett konto og send invitasjon
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Permissions Tab – flat Tripletex-style */}
          {account && (
            <TabsContent value="permissions">
              <PermissionsPanel
                userAccountId={account.id}
                roles={roles}
                assignedRoles={assignedRoles}
                onAssignedRolesChange={handleAssignedRolesChange}
                rolePermissions={rolePermissions}
                rolePermSourceMap={rolePermSourceMap}
                overrides={overrides}
                onOverridesChange={setOverrides}
                scopeOverride={scopeOverride}
                onScopeOverrideChange={setScopeOverride}
                scopes={scopes}
                onScopesChange={setScopes}
                companies={companies}
                saving={saving}
                onSave={handleSaveAll}
                overrideCompanyId={overrideCompanyId}
                onOverrideCompanyChange={handleOverrideCompanyChange}
                selectedCompanyRoleId={overrideCompanyId ? (membershipRoles[overrideCompanyId] ?? null) : null}
                onSelectedCompanyRoleChange={handleSelectedCompanyRoleChange}
                effectiveRoleName={effectiveRoleName}
              />
              <div className="mt-6">
                <CrossCompanyAccessCard authUserId={account.auth_user_id} companies={companies as any} />
              </div>
            </TabsContent>
          )}

          {/* Audit Tab */}
          {canViewSecurity && person && (
            <TabsContent value="security">
              <PersonSecurityTab personId={person.id} />
            </TabsContent>
          )}

          {/* Audit Tab */}
          <TabsContent value="audit">
            <div className="rounded-lg border p-4 sm:p-6 max-w-2xl">
              {auditEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Ingen aktivitetslogg ennå.</p>
              ) : (
                <div className="space-y-3">
                  {auditEntries.map((e) => (
                    <Card key={e.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{e.action}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleString("nb-NO")}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{e.target_type}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {person && (
          <>
            <HardDeleteDialog
              open={hardDeleteOpen}
              onOpenChange={setHardDeleteOpen}
              personId={person.id}
              personName={person.full_name}
              personEmail={person.email}
              onDeleted={() => navigate("/admin/personer")}
            />
            <ResetOnboardingDialog
              open={resetOnboardingOpen}
              onOpenChange={setResetOnboardingOpen}
              personId={person.id}
              personName={person.full_name}
              personEmail={person.email}
              onReset={fetchData}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
