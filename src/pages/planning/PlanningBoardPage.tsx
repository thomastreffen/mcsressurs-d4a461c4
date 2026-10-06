import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Search, Building2, Users, CalendarDays, User } from "lucide-react";
import { usePlanningLookups, usePlanningProjects, type PlanningProject } from "@/hooks/usePlanning";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  PLANNING_STATUS_LABELS,
  PLANNING_STATUS_ORDER,
  formatPeriod,
  isoWeek,
  planningCertainty,
  resourceNeedLabel,
  type PlanningStatus,
} from "@/lib/planning";

const ALL = "__all__";
const sb = supabase as any;

/** Ressursbehov per prosjekt, summert fra arbeidspakkene. */
function useBoardWorkPackageSummary(projectIds: string[]) {
  return useQuery({
    queryKey: ["planning-board-wp", projectIds.join(",")],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data } = await sb
        .from("planning_work_packages")
        .select("planning_project_id, resource_count, estimated_hours, responsible_department_id, assignment_state")
        .in("planning_project_id", projectIds);
      const map: Record<
        string,
        { people: number; hours: number; departmentIds: string[]; unassigned: number; count: number }
      > = {};
      for (const r of (data ?? []) as any[]) {
        const e = (map[r.planning_project_id] ??= { people: 0, hours: 0, departmentIds: [], unassigned: 0, count: 0 });
        e.count += 1;
        e.people += r.resource_count ?? 0;
        e.hours += Number(r.estimated_hours ?? 0);
        if (r.responsible_department_id && !e.departmentIds.includes(r.responsible_department_id))
          e.departmentIds.push(r.responsible_department_id);
        if (r.assignment_state === "not_assigned") e.unassigned += 1;
      }
      return map;
    },
  });
}

function StatusColumn({
  status,
  projects,
  children,
}: {
  status: PlanningStatus;
  projects: PlanningProject[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-[300px] flex-1 flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-foreground">{PLANNING_STATUS_LABELS[status]}</h2>
        <span className="text-xs text-muted-foreground">{projects.length}</span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

export default function PlanningBoardPage() {
  const navigate = useNavigate();
  const { data: projects, isLoading } = usePlanningProjects();
  const { data: lookups } = usePlanningLookups();

  const [search, setSearch] = useState("");
  const [company, setCompany] = useState(ALL);
  const [department, setDepartment] = useState(ALL);
  const [customer, setCustomer] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [owner, setOwner] = useState(ALL);
  const [week, setWeek] = useState("");

  const ids = useMemo(() => (projects ?? []).map((p) => p.id), [projects]);
  const { data: wpSummary } = useBoardWorkPackageSummary(ids);

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null) =>
    (id && list?.find((x) => x.id === id)?.name) || null;
  const ownerName = (id: string | null) =>
    (id && lookups?.users.find((u) => u.user_id === id)?.name) || null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (projects ?? []).filter((p) => {
      if (q && !(p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))) return false;
      if (company !== ALL && p.company_id !== company) return false;
      if (customer !== ALL && p.customer_id !== customer) return false;
      if (status !== ALL && p.status !== status) return false;
      if (owner !== ALL && p.owner_user_id !== owner) return false;
      if (department !== ALL) {
        const inProject = p.department_id === department;
        const inWp = (wpSummary?.[p.id]?.departmentIds ?? []).includes(department);
        if (!inProject && !inWp) return false;
      }
      if (week) {
        const w = Number(week);
        const s = p.expected_start ? isoWeek(new Date(p.expected_start)) : null;
        const e = p.expected_end ? isoWeek(new Date(p.expected_end)) : s;
        if (s === null) return false;
        if (!(w >= s && w <= (e ?? s))) return false;
      }
      return true;
    });
  }, [projects, search, company, customer, status, owner, department, week, wpSummary]);

  const departments = (lookups?.departments ?? []).filter((d) => company === ALL || d.company_id === company);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planlegging</h1>
          <p className="text-sm text-muted-foreground">
            Felles inngang for jobber og prosjekter på vei inn – på tvers av selskaper og avdelinger.
          </p>
        </div>
        <Button onClick={() => navigate("/planlegging/ny")} className="gap-2">
          <Plus className="h-4 w-4" />
          Nytt prosjekt
        </Button>
      </header>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søk prosjekt"
              className="pl-9"
            />
          </div>
          <Select value={company} onValueChange={(v) => { setCompany(v); setDepartment(ALL); }}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Selskap" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle selskaper</SelectItem>
              {(lookups?.companies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Avdeling" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle avdelinger</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={customer} onValueChange={setCustomer}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Kunde" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle kunder</SelectItem>
              {(lookups?.customers ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle statuser</SelectItem>
              {PLANNING_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>{PLANNING_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Prosjektansvarlig" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle ansvarlige</SelectItem>
              {(lookups?.users ?? []).map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>{u.name || "Ukjent"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={week}
            onChange={(e) => setWeek(e.target.value.replace(/\D/g, ""))}
            placeholder="Uke"
            className="w-[90px]"
          />
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Ingen planleggingsprosjekter ennå. Opprett det første – det trengs bare et navn.
          </p>
          <Button className="mt-4 gap-2" onClick={() => navigate("/planlegging/ny")}>
            <Plus className="h-4 w-4" />
            Nytt prosjekt
          </Button>
        </Card>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PLANNING_STATUS_ORDER.map((s) => {
            const list = filtered.filter((p) => p.status === s);
            if (list.length === 0 && (s === "cancelled" || s === "completed")) return null;
            return (
              <StatusColumn key={s} status={s} projects={list}>
                {list.map((p) => {
                  const sum = wpSummary?.[p.id];
                  const cert = planningCertainty(p.status);
                  const need = resourceNeedLabel(sum?.people ?? null, sum?.hours ? Math.round(sum.hours) : null);
                  return (
                    <Card
                      key={p.id}
                      onClick={() => navigate(`/planlegging/${p.id}`)}
                      className="cursor-pointer space-y-3 p-4 transition-all hover:border-border/70 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-tight text-foreground">{p.name}</h3>
                        <Badge variant={cert.tone === "success" ? "default" : "secondary"}>{cert.label}</Badge>
                      </div>
                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          {nameOf(lookups?.customers, p.customer_id) ?? "Kunde ikke satt"}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" />
                          {[nameOf(lookups?.companies, p.company_id), nameOf(lookups?.departments as any, p.department_id)]
                            .filter(Boolean)
                            .join(" · ") || "Selskap ikke satt"}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          {ownerName(p.owner_user_id) ?? "Ansvarlig ikke satt"}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatPeriod(p.expected_start, p.expected_end, p.period_label)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">{PLANNING_STATUS_LABELS[p.status as PlanningStatus] ?? p.status}</Badge>
                        {need && <Badge variant="secondary">{need}</Badge>}
                        {!!sum?.unassigned && (
                          <Badge variant="outline" className="border-warning/40 text-warning">
                            {sum.unassigned} ikke tildelt
                          </Badge>
                        )}
                        {(sum?.departmentIds ?? []).slice(0, 2).map((d) => (
                          <Badge key={d} variant="outline">{nameOf(lookups?.departments as any, d)}</Badge>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </StatusColumn>
            );
          })}
        </div>
      )}

    </div>
  );
}
