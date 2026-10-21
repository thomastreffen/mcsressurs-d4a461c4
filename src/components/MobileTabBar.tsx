import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  Plus,
  CalendarDays,
  Bell,
  Briefcase,
  Users,
  FileText,
  ScrollText,
  CalendarPlus,
  Sun,
  MoreHorizontal,
  TrendingUp,
  Target,
  CalendarOff,
  Receipt,
  BookOpen,
  Gauge,
  Inbox,
  ClipboardList,
  HardHat,
  ShieldAlert,
  Eye,
  FileCheck,
  LogOut,
  Download,
  Info, EyeOff } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { useActionRequired } from "@/hooks/useActionRequired";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveAppRole } from "@/hooks/usePreviewMode";
import { useMontorPreview } from "@/hooks/useMontorPreview";
import { usePermissions } from "@/hooks/usePermissions";
import { useModuleVisibility } from "@/hooks/useModuleVisibility";
import { useCompanyModuleAccess } from "@/hooks/useCompanyModuleAccess";
import { moduleForMenu, moduleForPath } from "@/lib/company-module-access";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InstallAppDialog } from "@/components/pwa/InstallAppDialog";
import { PwaStatusDialog } from "@/components/pwa/PwaStatusDialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";

interface QuickAction {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path?: string;
  permission: string | null;
  /** Company-module access level this action needs (defaults to "edit" for write actions). */
  level?: "view" | "edit" | "admin";
  onAction?: () => void;
}

const baseQuickActions: QuickAction[] = [
  {
    label: "Nytt prosjekt",
    description: "Opprett et nytt prosjekt",
    icon: Briefcase,
    path: "/projects/new",
    permission: null,
  },
  {
    label: "Ny lead",
    description: "Registrer en ny salgsmulighet",
    icon: Users,
    path: "/leads?new=1",
    permission: "sales.create",
  },
  {
    label: "Nytt tilbud",
    description: "Lag et nytt kundetilbud",
    icon: FileText,
    path: "/sales/offers/new",
    permission: "offers.create",
  },
  {
    label: "Ny kontrakt",
    description: "Opprett en ny kontrakt",
    icon: ScrollText,
    path: "/contracts?new=1",
    permission: "contracts.create",
  },
];

const planAction: QuickAction = {
  label: "Ny aktivitet",
  description: "Planlegg arbeid direkte i kalenderen",
  icon: CalendarPlus,
  permission: null,
  onAction: () => window.dispatchEvent(new CustomEvent("resource-plan:new-activity")),
};

const hmsActions: QuickAction[] = [
  {
    label: "Meld avvik / RUH",
    description: "Rapporter HMS-avvik, nestenulykke eller skade",
    icon: ShieldAlert,
    path: "/hms/incidents/new",
    permission: "hms.view",
    level: "view",
  },
  {
    label: "HMS-observasjon",
    description: "Registrer en sikker eller utrygg observasjon",
    icon: Eye,
    path: "/hms/incidents/new?type=observation",
    permission: "hms.view",
    level: "view",
  },
  {
    label: "Ny SJA",
    description: "Start sikker jobbanalyse på mobil",
    icon: ClipboardList,
    path: "/hms/mobile?start=sja",
    permission: "hms.view",
    level: "view",
  },
  {
    label: "Ny sjekkliste",
    description: "Fyll ut HMS-sjekkliste",
    icon: FileCheck,
    path: "/hms/mobile?start=checklist",
    permission: "hms.view",
    level: "view",
  },
];

/* ── "More" menu items derived from same module model as desktop sidebar ── */
interface MoreMenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  moduleKey: string;
  modulePermission?: string;
  requiredPermission?: string;
}

const moreMenuItems: MoreMenuItem[] = [
  { label: "Planlegging", icon: CalendarDays, path: "/planlegging", moduleKey: "planning" },
  { label: "Min håndbok", icon: BookOpen, path: "/hms/handbok", moduleKey: "self_service" },
  { label: "Klar for arbeid", icon: HardHat, path: "/hms/klar-for-arbeid", moduleKey: "self_service" },
  { label: "Dokumentasjon / Eksport", icon: FileText, path: "/hms/documentation", moduleKey: "hms", modulePermission: "module.hms", requiredPermission: "hms.manage" },
  { label: "HMS & HR", icon: HardHat, path: "/hms", moduleKey: "hms", modulePermission: "module.hms" },
  { label: "Bestillinger", icon: ClipboardList, path: "/orders", moduleKey: "orders", modulePermission: "module.orders" },
  { label: "Fravær", icon: CalendarOff, path: "/absence", moduleKey: "absence", modulePermission: "module.absence" },
  { label: "Fakturagrunnlag", icon: Receipt, path: "/invoice-basis", moduleKey: "invoice_basis", modulePermission: "module.invoice_basis", requiredPermission: "jobs.view_pricing" },
  { label: "Fagstøtte", icon: BookOpen, path: "/fag", moduleKey: "fag", modulePermission: "module.fag", requiredPermission: "regulation.review" },
  { label: "Salg", icon: TrendingUp, path: "/sales", moduleKey: "sales", modulePermission: "module.sales" },
  { label: "Leads", icon: Target, path: "/sales/leads", moduleKey: "sales", modulePermission: "module.sales" },
  { label: "Tilbud", icon: FileText, path: "/sales/offers", moduleKey: "sales", modulePermission: "module.sales" },
  { label: "Kunder", icon: Users, path: "/customers", moduleKey: "customers", modulePermission: "module.customers", requiredPermission: "jobs.view" },
  { label: "Lederoversikt", icon: Gauge, path: "/management", moduleKey: "management", modulePermission: "module.management" },
  { label: "Postkontoret", icon: Inbox, path: "/inbox", moduleKey: "inbox", modulePermission: "module.inbox" },
];

export function MobileTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const { isModuleVisible } = useModuleVisibility();
  const companyAccess = useCompanyModuleAccess();
  const { isAdmin, isMontor: isMontør } = useEffectiveAppRole();
  const montorPreview = useMontorPreview();
  const { unreadCount } = useNotifications();
  const actionRequiredCount = useActionRequired();
  const [fabOpen, setFabOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const jobsDot = actionRequiredCount > 0;
  const isOnPlan = location.pathname === "/projects/plan";
  const isOnHms = location.pathname.startsWith("/hms");

  const quickActions: QuickAction[] = isMontør
    ? hmsActions
    : isOnHms ? hmsActions
    : isOnPlan ? [planAction]
    : location.pathname.startsWith("/sales") ? baseQuickActions.slice(1, 3)
    : location.pathname.startsWith("/contracts") ? baseQuickActions.slice(3)
    : location.pathname === "/projects" ? baseQuickActions.slice(0, 1)
    : [];

  const availableActions = quickActions.filter((action) => {
    const companyModule = action.path ? moduleForPath(action.path) : "resource_plan";
    if (companyModule && !companyAccess.can(companyModule, action.level ?? "edit")) return false;
    if (!action.permission) return true;
    if (isAdmin) return true;
    return hasPermission(action.permission);
  });

  /** Same two-layer check as desktop sidebar */
  const canAccessModule = (moduleKey: string, modulePermission?: string) => {
    const companyModule = moduleForMenu(moduleKey);
    if (companyModule && !companyAccess.can(companyModule)) return false;
    if (!isModuleVisible(moduleKey)) return false;
    if (modulePermission && !isAdmin && !hasPermission(modulePermission)) return false;
    return true;
  };

  const visibleMoreItems = moreMenuItems.filter((item) => {
    if (item.moduleKey === "self_service") return true;
    if (isMontør && ["sales", "invoice_basis", "management"].includes(item.moduleKey)) return false;
    if (!canAccessModule(item.moduleKey, item.modulePermission)) return false;
    if (item.requiredPermission && !isAdmin && !hasPermission(item.requiredPermission)) return false;
    return true;
  });

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);

  // Primary tabs: always from same module model
  const showOverview = !isMontør && canAccessModule("overview", "module.overview");
  const showProjects = canAccessModule("projects", "module.projects") && (isAdmin || hasPermission("jobs.view"));
  const showPlan = canAccessModule("resource_plan", "module.resource_plan") && (isAdmin || hasPermission("resourceplan.view"));

  return (
    <>
      <nav aria-label="Mobilnavigasjon" className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-card md:hidden safe-area-bottom shadow-sm">
        <div className="flex items-stretch">
          {/* Min dag – for montører */}
          {isMontør && (
            <TabButton
              label="Min dag"
              icon={Sun}
              active={isActive("/my-day")}
              onClick={() => navigate("/my-day")}
            />
          )}

          {showOverview && (
            <TabButton
              label="Oversikt"
              icon={LayoutDashboard}
              active={isActive("/overview")}
              onClick={() => navigate("/overview")}
            />
          )}

          {showProjects && (
            <TabButton
              label="Prosjekter"
              icon={FolderKanban}
              active={isActive("/projects") && !isActive("/projects/plan")}
              onClick={() => navigate("/projects")}
              dot={jobsDot}
            />
          )}

          {/* FAB center */}
          {availableActions.length > 0 && <Button variant="ghost"
            onClick={() => setFabOpen(true)}
            className="flex flex-1 items-center justify-center py-1"
            aria-label="Ny handling"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 -mt-4 transition-transform active:scale-95">
              <Plus className="h-6 w-6" strokeWidth={2.5} />
            </span>
          </Button>}

          {showPlan && !isMontør && (
            <TabButton
              label="Plan"
              icon={CalendarDays}
              active={isActive("/projects/plan")}
              onClick={() => navigate("/projects/plan")}
            />
          )}

          {isMontør && <TabButton label="Varsler" icon={Bell} active={isActive("/notifications")} onClick={() => navigate("/notifications")} badge={unreadCount} />}

          {/* More – replaces Varsler as 5th tab, gives access to all other modules */}
          <TabButton
            label="Mer"
            icon={MoreHorizontal}
            active={moreOpen}
            onClick={() => setMoreOpen(true)}
            badge={unreadCount}
          />
        </div>
      </nav>

      {/* Quick-action Drawer */}
      <Drawer open={fabOpen} onOpenChange={setFabOpen}>
        <DrawerContent>
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-base">Ny handling</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            {availableActions.map((action) => (
              <DrawerClose key={action.label} asChild>
                <Button variant="ghost"
                  onClick={() => {
                    setFabOpen(false);
                    if (action.onAction) {
                      action.onAction();
                    } else if (action.path) {
                      navigate(action.path);
                    }
                  }}
                  className="h-auto min-h-16 shrink-0 justify-start flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-secondary active:bg-secondary/80"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <action.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                  </div>
                </Button>
              </DrawerClose>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      {/* "More" Drawer – shows all modules user has access to */}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent className="max-h-[88dvh]">
          <DrawerHeader className="pb-2 shrink-0">
            <DrawerTitle className="text-base">Moduler</DrawerTitle>
          </DrawerHeader>
          <div
            className="flex flex-col gap-0.5 px-4 overflow-y-auto overscroll-contain flex-1 min-h-0"
            style={{
              WebkitOverflowScrolling: "touch",
              paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
            }}
          >
            {/* Notifications always available */}
            <DrawerClose asChild>
              <Button variant="ghost"
                onClick={() => { setMoreOpen(false); navigate("/notifications"); }}
                className="h-auto min-h-16 shrink-0 justify-start flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-secondary active:bg-secondary/80"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary relative">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Varsler</p>
                  {unreadCount > 0 && <p className="text-xs text-muted-foreground">{unreadCount} ulest</p>}
                </div>
              </Button>
            </DrawerClose>

            {visibleMoreItems.length > 0 && (
              <div className="h-px bg-border/50 my-1" />
            )}

            {visibleMoreItems.map((item) => (
              <DrawerClose key={item.path} asChild>
                <Button variant="ghost"
                  onClick={() => { setMoreOpen(false); navigate(item.path); }}
                  className={cn(
                    "h-auto min-h-16 shrink-0 justify-start flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-secondary active:bg-secondary/80",
                    isActive(item.path) && "bg-primary/10"
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                </Button>
              </DrawerClose>
            ))}
            <div className="border-t border-border mt-3 pt-3 space-y-1">
              <DrawerClose asChild><Button variant="ghost" className="w-full justify-start" onClick={() => setInstallOpen(true)}><Download />Installer app</Button></DrawerClose>
              {montorPreview.canUse && (montorPreview.active
                ? <DrawerClose asChild><Button variant="ghost" className="w-full justify-start" onClick={montorPreview.stop}><EyeOff />Avslutt forhåndsvisning</Button></DrawerClose>
                : <DrawerClose asChild><Button variant="ghost" className="w-full justify-start" disabled={montorPreview.starting} onClick={montorPreview.start}><Eye />Test som montør</Button></DrawerClose>)}
              <DrawerClose asChild><Button variant="ghost" className="w-full justify-start" onClick={() => setStatusOpen(true)}><Info />App-status</Button></DrawerClose>
              <DrawerClose asChild><Button variant="ghost" className="w-full justify-start" onClick={signOut}><LogOut />Logg ut</Button></DrawerClose>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
      <InstallAppDialog open={installOpen} onOpenChange={setInstallOpen} />
      <PwaStatusDialog open={statusOpen} onOpenChange={setStatusOpen} />
    </>
  );
}

/* ─── Tab Button sub-component ─── */
function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
  badge,
  dot,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  badge?: number;
  dot?: boolean;
}) {
  return (
    <Button variant="ghost"
      onClick={onClick}
      className={cn(
        "flex flex-1 h-auto min-w-0 flex-col items-center gap-0.5 px-1 py-2 text-xs font-medium transition-colors relative min-h-[56px] active:bg-secondary/50",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      {active && (
        <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2.5px] w-6 rounded-full bg-primary" />
      )}
      <div className="relative mt-0.5">
        <Icon className="h-[22px] w-[22px]" />
        {(badge ?? 0) > 0 && (
          <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
            {(badge ?? 0) > 9 ? "9+" : badge}
          </span>
        )}
        {dot && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent" />
        )}
      </div>
      {label}
    </Button>
  );
}
