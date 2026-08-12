import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import {
  ShieldCheck, Users, BookOpen, ClipboardCheck, AlertTriangle, ArrowRight,
  CalendarClock, FileWarning, Network,
} from "lucide-react";
import {
  useComplianceEmployees, useCompetences, useCompetenceTypes, useRegulations,
  useComplianceAudits, useOpenHmsCounts, useOrgRoles,
} from "@/hooks/useCompliance";
import {
  competenceStatus, daysUntil, formatDate, worstStatus,
  type ComplianceTone, TONE_CLASS, TONE_DOT,
} from "@/lib/compliance";
import { cn } from "@/lib/utils";

interface Kpi {
  title: string;
  value: string | number;
  hint: string;
  tone: ComplianceTone;
  href: string;
  icon: React.ElementType;
}

export default function ComplianceOverviewPage() {
  const employees = useComplianceEmployees();
  const types = useCompetenceTypes();
  const competences = useCompetences();
  const regulations = useRegulations();
  const audits = useComplianceAudits();
  const orgRoles = useOrgRoles();
  const hms = useOpenHmsCounts();

  const loading = employees.isLoading || types.isLoading || competences.isLoading;

  const model = useMemo(() => {
    const typeById = new Map((types.data ?? []).map((t) => [t.id, t]));
    const requiredTypes = (types.data ?? []).filter((t) => t.required_for_all);
    const rows = (competences.data ?? []).map((c) => {
      const t = c.competence_type_id ? typeById.get(c.competence_type_id) : undefined;
      return {
        ...c,
        typeName: t?.name ?? c.type_label ?? "Annet",
        status: competenceStatus({
          expires_at: c.expires_at,
          has_document: !!c.document_id,
          requires_document: t?.requires_document ?? true,
        }),
        days: daysUntil(c.expires_at),
      };
    });

    const people = employees.data ?? [];
    const byPerson = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byPerson.get(r.person_id) ?? [];
      list.push(r);
      byPerson.set(r.person_id, list);
    }

    const complete = people.filter((p) => {
      const list = byPerson.get(p.person_id) ?? [];
      const missingRequired = requiredTypes.some(
        (t) => !list.some((r) => r.competence_type_id === t.id && r.status === "valid"),
      );
      if (missingRequired) return false;
      const worst = worstStatus(list.map((r) => r.status));
      return list.length > 0 && (worst === "valid" || worst === null);
    }).length;

    const typeCoverage = (key: string) => {
      const t = (types.data ?? []).find((x) => x.key === key);
      if (!t) return { ok: 0, total: people.length };
      const ok = people.filter((p) =>
        (byPerson.get(p.person_id) ?? []).some((r) => r.competence_type_id === t.id && r.status === "valid"),
      ).length;
      return { ok, total: people.length };
    };

    const within = (min: number, max: number) =>
      rows.filter((r) => r.days !== null && r.days >= min && r.days <= max).length;

    const missingRequiredCount = people.filter((p) =>
      requiredTypes.some(
        (t) => !(byPerson.get(p.person_id) ?? []).some((r) => r.competence_type_id === t.id && r.status === "valid"),
      ),
    ).length;

    const expired = rows.filter((r) => r.status === "expired").length;
    const missingDocs = rows.filter((r) => r.status === "missing_document").length;

    const regsDue = (regulations.data ?? []).filter((r) => {
      const d = daysUntil(r.next_review_at);
      return d !== null && d <= 60;
    });

    const performed = (audits.data ?? []).filter((a) => a.performed_at).sort((a, b) => (a.performed_at! < b.performed_at! ? 1 : -1));
    const planned = (audits.data ?? [])
      .filter((a) => !a.performed_at && a.planned_date)
      .sort((a, b) => (a.planned_date! > b.planned_date! ? 1 : -1));

    return {
      rows,
      people,
      complete,
      missingRequiredCount,
      fse: typeCoverage("fse"),
      firstAid: typeCoverage("forstehjelp"),
      d90: within(31, 90),
      d30: within(0, 30),
      expired,
      missingDocs,
      regsDue,
      lastAudit: performed[0] ?? null,
      nextAudit: planned[0] ?? null,
      activeAudits: (audits.data ?? []).filter((a) => a.status === "in_progress" || a.status === "follow_up"),
      soonest: rows
        .filter((r) => r.status === "expired" || r.status === "expiring_soon")
        .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
        .slice(0, 8),
    };
  }, [types.data, competences.data, employees.data, regulations.data, audits.data]);

  const overall: { tone: ComplianceTone; label: string } = model.expired > 0 || model.missingDocs > 0 || model.missingRequiredCount > 0 || (hms.data?.overdueActions ?? 0) > 0
    ? { tone: "alert", label: "Avvik / mangler" }
    : model.d90 + model.d30 > 0 || model.regsDue.length > 0
      ? { tone: "warn", label: "Krever oppfølging" }
      : { tone: "ok", label: "OK" };

  const kpis: Kpi[] = [
    { title: "Komplett dokumentasjon", value: `${model.complete}/${model.people.length}`, hint: "Ansatte uten mangler", tone: model.complete === model.people.length ? "ok" : "warn", href: "/compliance/kompetanse", icon: Users },
    { title: "FSE-status", value: `${model.fse.ok}/${model.fse.total}`, hint: "Gyldig FSE-opplæring", tone: model.fse.ok === model.fse.total ? "ok" : "alert", href: "/compliance/kompetanse?type=fse", icon: ShieldCheck },
    { title: "Førstehjelp", value: `${model.firstAid.ok}/${model.firstAid.total}`, hint: "Gyldig førstehjelpskurs", tone: model.firstAid.ok === model.firstAid.total ? "ok" : "alert", href: "/compliance/kompetanse?type=forstehjelp", icon: ShieldCheck },
    { title: "Utløper innen 90 dager", value: model.d90, hint: "31–90 dager", tone: model.d90 > 0 ? "warn" : "ok", href: "/compliance/kompetanse?status=expiring_soon", icon: CalendarClock },
    { title: "Utløper innen 30 dager", value: model.d30, hint: "Krever handling nå", tone: model.d30 > 0 ? "alert" : "ok", href: "/compliance/kompetanse?status=expiring_soon", icon: CalendarClock },
    { title: "Utgåtte kurs", value: model.expired, hint: "Ikke gyldig", tone: model.expired > 0 ? "alert" : "ok", href: "/compliance/kompetanse?status=expired", icon: AlertTriangle },
    { title: "Manglende dokumentasjon", value: model.missingDocs, hint: "Kompetanse uten bevis", tone: model.missingDocs > 0 ? "alert" : "ok", href: "/compliance/kompetanse?status=missing_document", icon: FileWarning },
    { title: "Åpne HMS-avvik", value: hms.data?.incidents ?? 0, hint: `${hms.data?.overdueActions ?? 0} forfalte tiltak`, tone: (hms.data?.overdueActions ?? 0) > 0 ? "alert" : (hms.data?.incidents ?? 0) > 0 ? "warn" : "ok", href: "/hms/incidents", icon: AlertTriangle },
    { title: "Regelverk til gjennomgang", value: model.regsDue.length, hint: "Innen 60 dager / forfalt", tone: model.regsDue.length > 0 ? "warn" : "ok", href: "/compliance/regelverk", icon: BookOpen },
    { title: "Aktive tilsyn/revisjoner", value: model.activeAudits.length, hint: "Pågår eller oppfølging", tone: model.activeAudits.length > 0 ? "warn" : "ok", href: "/compliance/internkontroll", icon: ClipboardCheck },
    { title: "Ansvarsroller", value: orgRoles.data?.length ?? 0, hint: "Dokumentert ansvar", tone: (orgRoles.data?.length ?? 0) > 0 ? "ok" : "warn", href: "/compliance/organisasjon", icon: Network },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Elsikkerhet &amp; Compliance</h1>
          <p className="text-sm text-muted-foreground">Operativ status for kompetanse, regelverk, ansvar og internkontroll</p>
        </div>
        <div className="flex items-center gap-3">
          <ComplianceStatusBadge label={overall.label} tone={overall.tone} className="text-sm px-3 py-1" />
          <Button asChild size="sm" variant="outline">
            <Link to="/compliance/kompetanse">Kompetansematrise <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <Link key={k.title} to={k.href} className="group">
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.title}</span>
                    <k.icon className="h-4 w-4 text-muted-foreground/60" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", TONE_DOT[k.tone])} />
                    <span className="text-2xl font-semibold tabular-nums">{k.value}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{k.hint}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Krever handling – kompetanse</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {model.soonest.length === 0 ? (
              <p className="px-6 pb-5 text-sm text-muted-foreground">Ingen utløpte eller snarlig utløpende kompetanser.</p>
            ) : (
              <ul className="divide-y">
                {model.soonest.map((r) => {
                  const person = model.people.find((p) => p.person_id === r.person_id);
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-6 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{person?.full_name ?? "Ukjent"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.typeName}
                          {r.expires_at ? ` · utløper ${formatDate(r.expires_at)}` : ""}
                        </p>
                      </div>
                      <ComplianceStatusBadge
                        label={r.status === "expired" ? `Utløpt ${Math.abs(r.days ?? 0)} d` : `${r.days} d igjen`}
                        tone={r.status === "expired" ? "alert" : "warn"}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Internkontroll</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Siste internrevisjon</span>
                <span className="font-medium">{model.lastAudit ? formatDate(model.lastAudit.performed_at) : "Ikke registrert"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Neste planlagte</span>
                <span className="font-medium">{model.nextAudit ? formatDate(model.nextAudit.planned_date) : "Ikke planlagt"}</span>
              </div>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link to="/compliance/internkontroll">Åpne internkontroll</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Regelverk som krever gjennomgang</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {model.regsDue.length === 0 ? (
                <p className="px-6 pb-5 text-sm text-muted-foreground">Alt regelverk er innenfor gjennomgangsfrist.</p>
              ) : (
                <ul className="divide-y">
                  {model.regsDue.slice(0, 6).map((r) => {
                    const d = daysUntil(r.next_review_at)!;
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-3 px-6 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.short_name || r.name}</p>
                          <p className="text-xs text-muted-foreground">Frist {formatDate(r.next_review_at)}</p>
                        </div>
                        <ComplianceStatusBadge label={d < 0 ? `Forfalt ${Math.abs(d)} d` : `${d} d igjen`} tone={d < 0 ? "alert" : "warn"} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <p className={cn("rounded-lg border p-3 text-xs", TONE_CLASS.neutral)}>
        Statusene beregnes fortløpende fra registrerte datoer og dokumenter. Terskler for varsling: 90, 60 og 30 dager før utløp, samt utløpt.
      </p>
    </div>
  );
}
