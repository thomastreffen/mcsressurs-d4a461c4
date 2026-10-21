import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, ClipboardList, FileCheck, BookOpen, ShieldAlert, Eye, HardHat, FlaskConical,
  ChevronRight, ArrowLeft, Clock, Inbox, Users, Loader2, ListChecks, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { startSubmission, STATUS_LABELS, type SubmissionStatus } from "@/lib/hms/submissions";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { HmsLoading } from "@/components/hms/HmsContextGate";
import { cn } from "@/lib/utils";

type View = "home" | "sja" | "checklist" | "mine" | "tiltak";

/**
 * Operativ HMS for felt (montør). Oppgave først: få store valg, ingen KPI-er.
 * Samme data og RLS som før; adminvalg ligger under «Mer HMS» kun når rettigheten finnes.
 */
export default function HmsMobilePage() {
  const { user } = useAuth();
  const { activeCompanyId: cid } = useCompanyContext();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hms.manage");
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const startParam = params.get("start");
  const viewParam = params.get("view");
  const view: View = startParam === "sja" || startParam === "checklist" ? startParam : viewParam === "mine" || viewParam === "tiltak" ? viewParam : "home";
  const go = (v: View) => {
    if (v === "home") setParams({});
    else if (v === "mine" || v === "tiltak") setParams({ view: v });
    else setParams({ start: v });
    window.scrollTo({ top: 0 });
  };

  const { data: templates, isLoading: tLoading, error: tError } = useQuery({
    queryKey: ["hms-mobile-templates", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hms_templates")
        .select("id, name, kind, category, description")
        .eq("company_id", cid)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  const { data: mine, isLoading: mLoading } = useQuery({
    queryKey: ["hms-mobile-mine", cid, user?.id],
    enabled: !!cid && !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hms_submissions")
        .select("id, title, status, kind, submitted_at, updated_at")
        .eq("company_id", cid)
        .eq("submitted_by", user!.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
  });

  // Kompakt teller: åpne AML-/arbeidstidsvarsler + overtid til godkjenning.
  // Selve listene ligger på egne undersider — ikke i førstebildet. RLS avgrenser innholdet.
  const { data: worktime } = useQuery({
    queryKey: ["hms-mobile-worktime-counts", cid],
    enabled: !!cid,
    queryFn: async () => {
      const sb = supabase as any;
      const [alerts, overtime] = await Promise.all([
        sb.from("worktime_alerts").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "open"),
        sb.from("overtime_approvals").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "pending"),
      ]);
      return { openAlerts: alerts.count ?? 0, pendingOvertime: overtime.count ?? 0 };
    },
  });

  const startMut = useMutation({
    mutationFn: async (templateId: string) => {
      if (!cid || !user) throw new Error("Mangler kontekst");
      return startSubmission({ companyId: cid, templateId, userId: user.id, userName: user.name || user.email });
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["hms-mobile-mine"] });
      navigate(`/hms/mobile/fill/${id}`);
    },
    onError: (e: any) => toast({ title: "Kunne ikke starte", description: e?.message ?? "Ukjent feil", variant: "destructive" }),
  });

  const sja = useMemo(() => (templates ?? []).filter((t) => t.kind === "sja"), [templates]);
  const checklists = useMemo(() => (templates ?? []).filter((t) => t.kind === "checklist"), [templates]);
  const drafts = (mine ?? []).filter((s) => s.status === "draft");

  if (tLoading || mLoading) return <HmsLoading label="Laster HMS…" />;
  if (tError) return <div className="p-4 text-base text-destructive">Kunne ikke laste HMS: {(tError as Error).message}</div>;

  const isMontor = user?.role === "montør";

  return (
    <div className="mx-auto max-w-xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4">
      {view === "home" ? (
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight">HMS</h1>

          {drafts[0] && (
            <Link
              to={`/hms/mobile/fill/${drafts[0].id}`}
              className="flex min-h-[72px] items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground active:scale-[0.99] transition-transform"
            >
              <Clock className="h-6 w-6 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">Fortsett {drafts[0].kind === "sja" ? "SJA" : "sjekkliste"}</span>
                <span className="block truncate text-sm opacity-90">{drafts[0].title || "Uten tittel"}</span>
              </span>
              <ChevronRight className="h-6 w-6" />
            </Link>
          )}

          <div className="space-y-3">
            <ActionCard icon={ClipboardList} label="Start SJA" onClick={() => go("sja")} primary={!drafts[0]} />
            <ActionCard icon={ListChecks} label="Utfør sjekkliste" onClick={() => go("checklist")} />
            <ActionCard icon={ShieldAlert} label="Meld RUH / avvik" onClick={() => navigate("/hms/incidents/new")} tone="alert" />
            <ActionCard icon={HardHat} label="Klar for arbeid" onClick={() => navigate("/hms/klar-for-arbeid")} />
            <ActionCard icon={BookOpen} label="HMS-håndbok" onClick={() => navigate("/hms/handbok")} />
            <ActionCard icon={FlaskConical} label="Kjemikalier" onClick={() => navigate("/hms/mine-kjemikalier")} />
          </div>

          <div className="space-y-1 pt-2">
            <SecondaryRow icon={FileCheck} label="Mine innsendte" hint={drafts.length ? `${drafts.length} utkast` : undefined} onClick={() => go("mine")} />
          </div>

          <div className="space-y-1">
            <div className="px-1 pb-1 text-sm font-medium text-muted-foreground">Mer HMS</div>
            <SecondaryRow icon={Eye} label="HMS-observasjon" onClick={() => navigate("/hms/incidents/new?type=observation")} />
            <SecondaryRow icon={ShieldAlert} label="Mine avvik / RUH" onClick={() => navigate("/hms/incidents?scope=mine")} />
            <SecondaryRow
              icon={AlertTriangle}
              label="Arbeidstid og AML-varsler"
              hint={worktime?.openAlerts ? `${worktime.openAlerts} åpne` : undefined}
              onClick={() => navigate("/hms/aml")}
            />
            <SecondaryRow
              icon={Clock}
              label="Overtid til godkjenning"
              hint={worktime?.pendingOvertime ? `${worktime.pendingOvertime} venter` : undefined}
              onClick={() => navigate("/hms/overtime")}
            />
            {canManage && (
              <>
                <SecondaryRow icon={Inbox} label="Alle innsendinger" onClick={() => navigate("/hms/submissions")} />
                <SecondaryRow icon={Users} label="Ansatte" onClick={() => navigate("/hms/people")} />
                <SecondaryRow icon={FlaskConical} label="Stoffkartotek (admin)" onClick={() => navigate("/hms/kjemikalier")} />
              </>
            )}
            {!isMontor && <SecondaryRow icon={ShieldCheck} label="HMS-oversikt (admin)" onClick={() => navigate("/hms?vis=oversikt")} />}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => go("home")}
            className="-ml-2 flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-base text-muted-foreground active:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" /> HMS
          </button>

          {view === "mine" ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Mine innsendte</h1>
              {(mine ?? []).length === 0 ? (
                <p className="py-10 text-center text-base text-muted-foreground">Ingen innsendinger ennå.</p>
              ) : (
                <div className="space-y-2">
                  {(mine ?? []).map((s) => (
                    <Link
                      key={s.id}
                      to={`/hms/mobile/fill/${s.id}`}
                      className="flex min-h-[64px] items-center gap-3 rounded-xl border bg-card p-4 active:scale-[0.99] transition-transform"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-medium">{s.title || "Uten tittel"}</span>
                        <span className="block text-sm text-muted-foreground">
                          {s.kind === "sja" ? "SJA" : "Sjekkliste"} · {formatDistanceToNow(new Date(s.submitted_at || s.updated_at), { addSuffix: true, locale: nb })}
                        </span>
                      </span>
                      <StatusText status={s.status} />
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">{view === "sja" ? "Velg SJA" : "Velg sjekkliste"}</h1>
              {(view === "sja" ? sja : checklists).length === 0 ? (
                <p className="py-10 text-center text-base text-muted-foreground">
                  Ingen {view === "sja" ? "SJA-maler" : "sjekklister"} er satt opp. Kontakt HMS-ansvarlig.
                </p>
              ) : (
                <div className="space-y-2">
                  {(view === "sja" ? sja : checklists).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={startMut.isPending}
                      onClick={() => startMut.mutate(t.id)}
                      className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border bg-card p-4 text-left active:scale-[0.99] transition-transform disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium">{t.name}</span>
                        {t.description && <span className="mt-0.5 block line-clamp-1 text-sm text-muted-foreground">{t.description}</span>}
                      </span>
                      {startMut.isPending && startMut.variables === t.id
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActionCard({
  icon: Icon, label, onClick, primary, tone,
}: { icon: React.ElementType; label: string; onClick: () => void; primary?: boolean; tone?: "alert" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[64px] w-full items-center gap-4 rounded-2xl border p-4 text-left active:scale-[0.99] transition-transform",
        primary ? "border-primary/40 bg-primary/5" : tone === "alert" ? "border-destructive/30 bg-destructive/5" : "bg-card",
      )}
    >
      <span className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
        tone === "alert" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
      )}>
        <Icon className="h-6 w-6" />
      </span>
      <span className="flex-1 text-lg font-semibold">{label}</span>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </button>
  );
}

function SecondaryRow({ icon: Icon, label, hint, onClick }: { icon: React.ElementType; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[48px] w-full items-center gap-3 rounded-lg px-2 text-left text-base active:bg-muted">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function StatusText({ status }: { status: SubmissionStatus }) {
  const cls =
    status === "approved" ? "text-primary" :
    status === "rejected" ? "text-destructive" :
    "text-muted-foreground";
  return <span className={cn("shrink-0 text-sm font-medium", cls)}>{STATUS_LABELS[status] ?? status}</span>;
}
