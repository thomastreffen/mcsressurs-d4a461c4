import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Home,
  FolderKanban,
  Users,
  TrendingUp,
  Inbox,
  CalendarDays,
  ChevronDown,
  Settings,
  LayoutGrid,
  Receipt,
  Gauge,
  BarChart3,
  FileText,
  Target,
  BookOpen,
  CalendarOff,
  FileSearch,
  ClipboardList,
  Calculator,
  Briefcase,
  ShieldCheck,
  SlidersHorizontal,

  AlertTriangle,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { usePermissions } from "@/hooks/usePermissions";
import { useModuleVisibility } from "@/hooks/useModuleVisibility";
import { supabase } from "@/integrations/supabase/client";
import { useUnreadOrderMessages } from "@/hooks/useUnreadOrderMessages";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * TWO-LAYER MODULE ACCESS:
 *   1. module_settings (global toggle) – is the module enabled for the tenant?
 *   2. module.* permission (user/role) – does this user have access to the module?
 *
 * Both must be true for the module to show in the sidebar.
 */

const mainNav = [
  { title: "Hjem", url: "/overview", icon: Home, moduleKey: "overview", modulePermission: "module.overview" },
  { title: "Prosjekter", url: "/projects", icon: FolderKanban, moduleKey: "projects", modulePermission: "module.projects", requiredPermission: "jobs.view" },
  { title: "Ressursplan", url: "/projects/plan", icon: CalendarDays, moduleKey: "resource_plan", modulePermission: "module.resource_plan", requiredPermission: "resourceplan.view" },
  { title: "Fravær", url: "/absence", icon: CalendarOff, moduleKey: "absence", modulePermission: "module.absence" },
  { title: "Fakturagrunnlag", url: "/invoice-basis", icon: Receipt, moduleKey: "invoice_basis", modulePermission: "module.invoice_basis", requiredPermission: "jobs.view_pricing" },
  { title: "Bestillinger", url: "/orders", icon: ClipboardList, moduleKey: "orders", modulePermission: "module.orders" },
  { title: "Fagstøtte", url: "/fag", icon: BookOpen, moduleKey: "fag", modulePermission: "module.fag", requiredPermission: "regulation.review" },
];

const adminItems = [
  { title: "Firma", url: "/admin/company", requireSuperAdmin: true, moduleKey: "admin_company" },
  { title: "Organisasjon", url: "/admin/organisasjon", requireSuperAdmin: true, moduleKey: "admin_org" },
  { title: "Personer", url: "/admin/personer", moduleKey: "admin_people" },
  { title: "Roller", url: "/admin/roller", requireSuperAdmin: true, moduleKey: "admin_roles" },
  { title: "Postkontoret", url: "/admin/superoffice", requirePostkontorAdmin: true, moduleKey: "admin_postkontor" },
  { title: "Skjema & maler", url: "/admin/forms", moduleKey: "admin_forms" },
  { title: "Bestillingsmaler", url: "/admin/order-forms", moduleKey: "admin_order_forms" },
  { title: "Integrasjoner", url: "/settings/integrations", moduleKey: "admin_integrations" },
  { title: "Integrasjonshelse", url: "/admin/integration-health", moduleKey: "admin_integration_health" },
  { title: "Systemhelse", url: "/admin/system-health", moduleKey: "admin_system_health" },
  { title: "Dataintegritet", url: "/admin/data-integrity", moduleKey: "admin_data_integrity" },
  { title: "Kontraktvarsler", url: "/admin/contract-cron", moduleKey: "admin_contract_cron" },
  { title: "Microsoft", url: "/admin/microsoft", requireSuperAdmin: true, moduleKey: "admin_microsoft" },
  { title: "Innstillinger", url: "/admin/settings", moduleKey: "admin_settings" },
  { title: "Papirkurv", url: "/admin/trash", moduleKey: "admin_trash" },
  { title: "Tripletex import", url: "/admin/tripletex", moduleKey: "admin_tripletex" },
  
  { title: "Selskapsmigrering", url: "/admin/company-migration", requireSuperAdmin: true, moduleKey: "admin_company_migration" },
];

function NavItem({ item, isActive, collapsed, badge }: {
  item: { title: string; url: string; icon?: React.ElementType };
  isActive: (url: string) => boolean;
  collapsed: boolean;
  badge?: number;
}) {
  const active = isActive(item.url);
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.title}
        className={cn(
          "rounded-xl h-10 transition-all duration-150",
          active
            ? "bg-primary/10 text-primary font-semibold shadow-sm"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        )}
      >
        <NavLink to={item.url} end={item.url === "/overview"}>
          {Icon && <Icon className="h-[19px] w-[19px]" />}
          {!Icon && <div className="h-[19px] w-[19px]" />}
          <span className="text-[13px] flex-1">{item.title}</span>
          {!collapsed && badge !== undefined && badge > 0 && (
            <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-4 ml-auto bg-primary/10 text-primary border-0">
              {badge}
            </Badge>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarLoadingRows({ collapsed }: { collapsed: boolean }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <SidebarMenuItem key={i}>
          <div className="flex h-10 items-center gap-3 rounded-xl px-3">
            <Skeleton className="h-[19px] w-[19px] rounded-md" />
            {!collapsed && <Skeleton className="h-3.5 flex-1" />}
          </div>
        </SidebarMenuItem>
      ))}
    </>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin: realIsAdmin, isSuperAdmin: realIsSuperAdmin, user } = useAuth();
  const { activeCompanyId, loading: companyLoading } = useCompanyContext();
  const permissions = usePermissions();
  const { hasPermission, loading: permissionsLoading, error: permissionsError } = permissions;
  const modules = useModuleVisibility();
  const { isModuleVisible, loading: modulesLoading, error: modulesError } = modules;
  const { active: previewActive, effectiveRole } = usePreviewMode();
  const location = useLocation();

  // In preview mode, derive isAdmin/isSuperAdmin from effective role
  const isAdmin = previewActive
    ? (effectiveRole === "admin" || effectiveRole === "super_admin")
    : realIsAdmin;
  const isSuperAdmin = previewActive
    ? effectiveRole === "super_admin"
    : realIsSuperAdmin;

  const [projectCount, setProjectCount] = useState<number>(0);
  const [inboxCount, setInboxCount] = useState<number>(0);
  const [offerCount, setOfferCount] = useState<number>(0);
  const { unreadSubmissionCount: orderUnreadCount } = useUnreadOrderMessages();

  useEffect(() => {
    if (!user) return;
    supabase.from("events")
      .select("id", { count: "exact", head: true })
      .in("status", ["requested", "approved", "scheduled", "in_progress", "time_change_proposed"])
      .is("deleted_at", null)
      .then(({ count }) => setProjectCount(count || 0));

    supabase.from("cases")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "triage"])
      .then(({ count }) => setInboxCount(count || 0));

    supabase.from("calculations")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("status", ["draft", "generated", "sent"] as any)
      .then(({ count }) => setOfferCount(count || 0));
  }, [user]);

  const isActive = (url: string) =>
    url === "/overview" ? location.pathname === "/overview" : location.pathname.startsWith(url);

  /**
   * Two-layer check:
   *   1. isModuleVisible(moduleKey) – global tenant toggle (module_settings)
   *   2. hasPermission(modulePermission) – user/role level (module.* permission)
   */
  const canAccessModule = (moduleKey: string, modulePermission?: string) => {
    // Layer 1: global toggle
    if (!isModuleVisible(moduleKey)) return false;
    // Layer 2: user permission (if defined). Admins bypass this check.
    if (modulePermission && !isAdmin && !hasPermission(modulePermission)) return false;
    return true;
  };

  const hasPostkontor = hasPermission("postkontor.view") || isAdmin;
  const hasPostkontorAdmin = hasPermission("postkontor.admin") || isAdmin;

  const visibleMainNav = mainNav.filter((item) => {
    if (!canAccessModule(item.moduleKey, item.modulePermission)) return false;
    // Additional action-level permission check
    if (item.requiredPermission && !isAdmin && !hasPermission(item.requiredPermission)) return false;
    return true;
  });

  const filteredAdmin = adminItems.filter((item) => {
    if (!isModuleVisible(item.moduleKey)) return false;
    if ('requireSuperAdmin' in item && item.requireSuperAdmin) return isSuperAdmin;
    if ('requirePostkontorAdmin' in item && (item as any).requirePostkontorAdmin) return hasPostkontorAdmin;
    return true;
  });

  const adminActive = filteredAdmin.some((item) => isActive(item.url));

  const navLoading = companyLoading || permissionsLoading || modulesLoading;
  const navError = permissionsError ?? modulesError;

  useEffect(() => {
    if (import.meta.env.DEV && !navLoading && !navError) {
      console.debug("[HMS init] sidebar items built", {
        companyId: activeCompanyId,
        permissionsLoaded: !permissionsLoading,
        enabledModulesLoaded: !modulesLoading,
        hmsVisible: canAccessModule("hms", "module.hms"),
        hmsItems: canAccessModule("hms", "module.hms") ? 12 : 0,
      });
    }
  }, [activeCompanyId, modulesLoading, navError, navLoading, permissionsLoading]);

  const getBadge = (url: string): number | undefined => {
    if (url === "/projects") return projectCount > 0 ? projectCount : undefined;
    if (url === "/orders") return orderUnreadCount > 0 ? orderUnreadCount : undefined;
    return undefined;
  };

  // Show admin section only for super_admin users
  const showAdmin = isSuperAdmin;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            M
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sm font-semibold leading-tight text-sidebar-foreground tracking-tight">MCS Service</h1>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {navLoading && (
                <SidebarLoadingRows collapsed={collapsed} />
              )}
              {!navLoading && navError && (
                <SidebarMenuItem>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-2">
                    {!collapsed && <p>Kunne ikke laste menytilganger.</p>}
                    {!collapsed && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { permissions.refetch(); modules.refetch(); }}>Prøv igjen</Button>}
                    {collapsed && <AlertTriangle className="h-4 w-4" />}
                  </div>
                </SidebarMenuItem>
              )}
              {!navLoading && !navError && <>
              {visibleMainNav.map((item) => (
                <NavItem key={item.url} item={item} isActive={isActive} collapsed={collapsed} badge={getBadge(item.url)} />
              ))}
              {hasPostkontor && canAccessModule("inbox", "module.inbox") && (
                <NavItem
                  item={{ title: "Postkontoret", url: "/inbox", icon: Inbox }}
                  isActive={isActive}
                  collapsed={collapsed}
                  badge={inboxCount > 0 ? inboxCount : undefined}
                />
              )}
               {canAccessModule("sales", "module.sales") && (
                 <>
                   <SidebarMenuItem>
                     <Collapsible defaultOpen={isActive("/sales")}>
                       <CollapsibleTrigger asChild>
                         <SidebarMenuButton
                           tooltip="Salg"
                           className={cn(
                             "rounded-xl h-10 transition-all duration-150",
                             isActive("/sales")
                               ? "bg-primary/10 text-primary font-semibold shadow-sm"
                               : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                           )}
                         >
                           <TrendingUp className="h-[19px] w-[19px]" />
                           <span className="text-[13px] flex-1">Salg</span>
                           {!collapsed && <ChevronDown className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />}
                         </SidebarMenuButton>
                       </CollapsibleTrigger>
                       <CollapsibleContent>
                         <SidebarMenu className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border/40 pl-2">
                           <NavItem item={{ title: "Oversikt", url: "/sales", icon: BarChart3 }} isActive={(url) => location.pathname === "/sales"} collapsed={collapsed} />
                           <NavItem item={{ title: "Saker", url: "/sales/cases", icon: Briefcase }} isActive={isActive} collapsed={collapsed} />
                           <NavItem item={{ title: "Leads", url: "/sales/leads", icon: Target }} isActive={isActive} collapsed={collapsed} />
                            <NavItem item={{ title: "Tilbud", url: "/sales/offers", icon: FileText }} isActive={isActive} collapsed={collapsed} badge={offerCount > 0 ? offerCount : undefined} />
                            <NavItem item={{ title: "Kalkyler", url: "/sales/calc-engine", icon: Calculator }} isActive={isActive} collapsed={collapsed} />
                          </SidebarMenu>
                       </CollapsibleContent>
                     </Collapsible>
                   </SidebarMenuItem>
                 </>
               )}
               {canAccessModule("hms", "module.hms") && (
                 <SidebarMenuItem>
                   <Collapsible defaultOpen={isActive("/hms")}>
                     <CollapsibleTrigger asChild>
                       <SidebarMenuButton
                         tooltip="HMS & HR"
                         className={cn(
                           "rounded-xl h-10 transition-all duration-150",
                           isActive("/hms")
                             ? "bg-primary/10 text-primary font-semibold shadow-sm"
                             : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                         )}
                       >
                         <ShieldCheck className="h-[19px] w-[19px]" />
                         <span className="text-[13px] flex-1">HMS & HR</span>
                         {!collapsed && <ChevronDown className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />}
                       </SidebarMenuButton>
                     </CollapsibleTrigger>
                     <CollapsibleContent>
                       <SidebarMenu className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border/40 pl-2">
                         <NavItem item={{ title: "Oversikt", url: "/hms", icon: Gauge }} isActive={(url) => location.pathname === "/hms"} collapsed={collapsed} />
                         <NavItem item={{ title: "Ansatte", url: "/hms/people", icon: Users }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Min HMS-håndbok", url: "/hms/handbok", icon: BookOpen }} isActive={(url) => location.pathname.startsWith("/hms/handbok") && !location.pathname.startsWith("/hms/handbooks")} collapsed={collapsed} />
                        <NavItem item={{ title: "Håndbøker", url: "/hms/handbooks", icon: BookOpen }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Avvik / RUH", url: "/hms/incidents", icon: ShieldAlert }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "AML-status", url: "/hms/aml", icon: AlertTriangle }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Regelsett", url: "/hms/rulesets", icon: Settings }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Overtid", url: "/hms/overtime", icon: Clock }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "SJA & sjekklister", url: "/hms/templates", icon: ClipboardList }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Innsendinger", url: "/hms/submissions", icon: ClipboardList }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Mobil utfylling", url: "/hms/mobile", icon: ClipboardList }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Importbatcher", url: "/hms/import/batches", icon: FileText }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Rapporter", url: "/hms/reports", icon: BarChart3 }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Bransjeområder", url: "/hms/areas", icon: ClipboardList }} isActive={isActive} collapsed={collapsed} />
                       </SidebarMenu>
                     </CollapsibleContent>
                   </Collapsible>
                 </SidebarMenuItem>
               )}
               {canAccessModule("hms", "module.hms") && (
                 <SidebarMenuItem>
                   <Collapsible defaultOpen={isActive("/compliance")}>
                     <CollapsibleTrigger asChild>
                       <SidebarMenuButton
                         tooltip="Elsikkerhet & Compliance"
                         className={cn(
                           "rounded-xl h-10 transition-all duration-150",
                           isActive("/compliance")
                             ? "bg-primary/10 text-primary font-semibold shadow-sm"
                             : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                         )}
                       >
                         <ShieldAlert className="h-[19px] w-[19px]" />
                         <span className="text-[13px] flex-1">Elsikkerhet</span>
                         {!collapsed && <ChevronDown className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />}
                       </SidebarMenuButton>
                     </CollapsibleTrigger>
                     <CollapsibleContent>
                       <SidebarMenu className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border/40 pl-2">
                         <NavItem item={{ title: "Oversikt", url: "/compliance", icon: Gauge }} isActive={(url) => location.pathname === "/compliance"} collapsed={collapsed} />
                         <NavItem item={{ title: "Kompetanse", url: "/compliance/kompetanse", icon: ShieldCheck }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Kompetansekrav", url: "/compliance/kompetansekrav", icon: SlidersHorizontal }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Regelverk", url: "/compliance/regelverk", icon: BookOpen }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Organisasjon & ansvar", url: "/compliance/organisasjon", icon: Users }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Internkontroll", url: "/compliance/internkontroll", icon: ClipboardList }} isActive={isActive} collapsed={collapsed} />
                         <NavItem item={{ title: "Tilsyn & revisjoner", url: "/compliance/tilsyn", icon: FileSearch }} isActive={isActive} collapsed={collapsed} />
                       </SidebarMenu>
                     </CollapsibleContent>
                   </Collapsible>
                 </SidebarMenuItem>
               )}
               {canAccessModule("management" /* no moduleKey in module_settings yet */, "module.management") && (
                 <NavItem item={{ title: "Lederoversikt", url: "/management", icon: Gauge }} isActive={isActive} collapsed={collapsed} />
               )}
               {canAccessModule("customers", "module.customers") && (hasPermission("jobs.view") || isAdmin) && (
                <NavItem item={{ title: "Kunder", url: "/customers", icon: Users }} isActive={isActive} collapsed={collapsed} />
              )}
              </>}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showAdmin && (
          <SidebarGroup className="mt-6 pt-4 border-t border-sidebar-border/60">
            <Collapsible defaultOpen={adminActive}>
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors">
                <span className="flex items-center gap-1.5">
                  <Settings className="h-3 w-3" />
                  Admin
                </span>
                {!collapsed && <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1 mt-2">
                    {filteredAdmin.map((item) => (
                      <NavItem key={item.url} item={item} isActive={isActive} collapsed={collapsed} />
                    ))}
                    {isSuperAdmin && (
                      <NavItem
                        item={{ title: "Moduler", url: "/admin/modules", icon: LayoutGrid }}
                        isActive={isActive}
                        collapsed={collapsed}
                      />
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
