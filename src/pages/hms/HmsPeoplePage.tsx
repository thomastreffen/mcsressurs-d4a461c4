import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Users, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { EMPLOYEE_BASIS_LABEL } from "@/lib/hms/employeeBasis";

interface Row {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  company_name: string | null;
  department_name: string | null;
  is_plannable_resource: boolean | null;
  hms_card_number: string | null;
  hms_card_expires_at: string | null;
  archived_at: string | null;
  clearance_status: string | null;
  pob_status: string | null;
  nda_status: string | null;
  other_company_names: string[];
}

type ActiveFilter = "all" | "active" | "archived";
type ScopeFilter = "own" | "shared" | "all";
type SecFilter = "all" | "ok" | "missing" | "check" | "unknown";

function hmsCardStatus(expires: string | null): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (!expires) return { label: "Ikke registrert", tone: "muted" };
  const exp = new Date(expires).getTime();
  if (Number.isNaN(exp)) return { label: "Ikke registrert", tone: "muted" };
  const now = Date.now();
  const days = (exp - now) / (1000 * 60 * 60 * 24);
  if (days < 0) return { label: "Utløpt", tone: "bad" };
  if (days <= 60) return { label: "Utløper snart", tone: "warn" };
  return { label: "OK", tone: "ok" };
}

function securityBucket(r: Row): "ok" | "missing" | "check" | "unknown" {
  if (!r.clearance_status && !r.pob_status && !r.nda_status) return "unknown";
  const cl = r.clearance_status ?? "";
  if (cl === "approved" || cl === "clearance_valid") return "ok";
  if (cl === "expired" || cl === "blocked") return "missing";
  if (
    cl === "pob_required" ||
    cl === "authorization_required" ||
    cl === "needs_check" ||
    r.pob_status === "needs_check" ||
    r.nda_status === "needs_check"
  )
    return "check";
  return "unknown";
}

function SecurityCell({ r }: { r: Row }) {
  const b = securityBucket(r);
  if (b === "ok")
    return (
      <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="h-3 w-3" /> OK
      </Badge>
    );
  if (b === "missing")
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="h-3 w-3" /> Mangler
      </Badge>
    );
  if (b === "check")
    return (
      <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:text-amber-300">
        <ShieldAlert className="h-3 w-3" /> Må sjekkes
      </Badge>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ShieldQuestion className="h-3 w-3" /> Ikke vurdert
    </span>
  );
}

export default function HmsPeoplePage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { isSuperAdmin, isAdmin } = useAuth();
  const { activeCompanyId, allowedCompanyIds } = useCompanyContext();
  const canViewSecurity = isSuperAdmin || isAdmin || hasPermission("security.view") || hasPermission("security.manage");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [secFilter, setSecFilter] = useState<SecFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!activeCompanyId) {
          if (!cancelled) {
            setRows([]);
            setLoading(false);
          }
          return;
        }
        // Enforce company firewall: only employment_profiles for activeCompanyId
        // (and within allowedCompanyIds for safety).
        if (allowedCompanyIds?.length && !allowedCompanyIds.includes(activeCompanyId)) {
          if (!cancelled) {
            setRows([]);
            setLoading(false);
          }
          return;
        }

        const { data: empData, error: eErr } = await (supabase as any)
          .from("employment_profiles")
          .select(
            "person_id, company_id, department_id, is_plannable_resource, hms_card_number, hms_card_expires_at, archived_at, relationship_type, include_in_hms_people"
          )
          .eq("company_id", activeCompanyId)
          .eq("include_in_hms_people", true);
        if (eErr) throw eErr;

        const empByPerson = new Map<string, any>();
        for (const e of (empData as any[]) ?? []) {
          if (e?.person_id) empByPerson.set(e.person_id, e);
        }
        const personIds = Array.from(empByPerson.keys());

        if (personIds.length === 0) {
          if (!cancelled) setRows([]);
          return;
        }

        const [peopleRes, comps, depts, profilesRes, otherEmpRes, allCompsRes] = await Promise.all([
          supabase
            .from("people")
            .select("id, full_name, email, phone, is_active")
            .in("id", personIds)
            .order("full_name", { ascending: true }),
          supabase.from("internal_companies").select("id, name").eq("id", activeCompanyId),
          supabase.from("departments").select("id, name"),
          canViewSecurity
            ? (supabase as any)
                .from("person_security_profiles")
                .select("person_id, clearance_status, pob_status, nda_status")
                .in("person_id", personIds)
            : Promise.resolve({ data: [] }),
          (supabase as any)
            .from("employment_profiles")
            .select("person_id, company_id, archived_at")
            .in("person_id", personIds)
            .neq("company_id", activeCompanyId),
          supabase.from("internal_companies").select("id, name"),
        ]);

        if ((peopleRes as any).error) throw (peopleRes as any).error;

        const compById = new Map<string, string>();
        for (const c of (comps as any).data ?? []) compById.set(c.id, c.name);
        const deptById = new Map<string, string>();
        for (const d of (depts as any).data ?? []) deptById.set(d.id, d.name);
        const allCompById = new Map<string, string>();
        for (const c of (allCompsRes as any).data ?? []) allCompById.set(c.id, c.name);
        const otherCompaniesByPerson = new Map<string, string[]>();
        for (const e of (otherEmpRes as any).data ?? []) {
          if (e.archived_at) continue;
          const list = otherCompaniesByPerson.get(e.person_id) ?? [];
          const name = allCompById.get(e.company_id) ?? "Annet selskap";
          if (!list.includes(name)) list.push(name);
          otherCompaniesByPerson.set(e.person_id, list);
        }
        const profByPerson = new Map<string, any>();
        for (const p of (profilesRes as any).data ?? []) profByPerson.set(p.person_id, p);

        const merged: Row[] = ((peopleRes as any).data ?? []).map((p: any) => {
          const e = empByPerson.get(p.id);
          const prof = profByPerson.get(p.id);
          return {
            id: p.id,
            full_name: p.full_name,
            email: p.email,
            phone: p.phone,
            is_active: p.is_active,
            company_name: e?.company_id ? compById.get(e.company_id) ?? null : null,
            department_name: e?.department_id ? deptById.get(e.department_id) ?? null : null,
            is_plannable_resource: e?.is_plannable_resource ?? null,
            hms_card_number: e?.hms_card_number ?? null,
            hms_card_expires_at: e?.hms_card_expires_at ?? null,
            archived_at: e?.archived_at ?? null,
            clearance_status: prof?.clearance_status ?? null,
            pob_status: prof?.pob_status ?? null,
            nda_status: prof?.nda_status ?? null,
            other_company_names: otherCompaniesByPerson.get(p.id) ?? [],
          };
        });

        if (!cancelled) setRows(merged);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Kunne ikke laste ansatte");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewSecurity, activeCompanyId, allowedCompanyIds]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeFilter === "active" && (r.archived_at || !r.is_active)) return false;
      if (activeFilter === "archived" && !r.archived_at) return false;
      if (scopeFilter === "own" && r.other_company_names.length > 0) return false;
      if (scopeFilter === "shared" && r.other_company_names.length === 0) return false;
      if (secFilter !== "all" && canViewSecurity) {
        const b = securityBucket(r);
        if (secFilter === "ok" && b !== "ok") return false;
        if (secFilter === "missing" && b !== "missing") return false;
        if (secFilter === "check" && b !== "check") return false;
        if (secFilter === "unknown" && b !== "unknown") return false;
      }
      if (!term) return true;
      return (
        r.full_name?.toLowerCase().includes(term) ||
        r.email?.toLowerCase().includes(term) ||
        r.phone?.toLowerCase().includes(term)
      );
    });
  }, [rows, q, activeFilter, secFilter, scopeFilter, canViewSecurity]);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Ansatte</h1>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">{EMPLOYEE_BASIS_LABEL}</span>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} av {rows.length}</span>
        <button
          type="button"
          onClick={() => navigate("/hms/people/kontroll")}
          className="text-xs text-primary underline"
        >
          Kontroller ansattgrunnlag
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søk navn eller e-post..."
            className="pl-8"
          />
        </div>
        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as ActiveFilter)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Aktive</SelectItem>
            <SelectItem value="archived">Arkiverte</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
        <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as ScopeFilter)}>
          <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle jeg har tilgang til</SelectItem>
            <SelectItem value="own">Kun ansatte i valgt firma</SelectItem>
            <SelectItem value="shared">Delte ressurser</SelectItem>
          </SelectContent>
        </Select>
        {canViewSecurity && (
          <Select value={secFilter} onValueChange={(v) => setSecFilter(v as SecFilter)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Sikkerhet" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sikkerhet: Alle</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="missing">Mangler</SelectItem>
              <SelectItem value="check">Må sjekkes</SelectItem>
              <SelectItem value="unknown">Ikke vurdert</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Kunne ikke laste ansatte</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
          Ingen ansatte å vise.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead>Kontakt</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>Avdeling</TableHead>
                <TableHead>Planleggbar</TableHead>
                <TableHead>HMS-kort</TableHead>
                {canViewSecurity && <TableHead>Sikkerhet</TableHead>}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate(`/hms/people/${r.id}`)}
                >
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div>{r.email ?? "-"}</div>
                    {r.phone && <div className="text-xs">{r.phone}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{r.company_name ?? "-"}</div>
                    {r.other_company_names.length > 0 && (
                      <Badge variant="outline" className="mt-1 text-[10px] text-muted-foreground">
                        Delt ressurs · {r.other_company_names.join(", ")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{r.department_name ?? "-"}</TableCell>
                  <TableCell>
                    {r.is_plannable_resource ? (
                      <Badge variant="secondary">Ja</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Nei</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.hms_card_number ? (
                      <div className="space-y-0.5">
                        <div className="font-mono text-xs">{r.hms_card_number}</div>
                        {(() => {
                          const s = hmsCardStatus(r.hms_card_expires_at);
                          const cls =
                            s.tone === "ok"
                              ? "border-emerald-300 text-emerald-700 dark:text-emerald-300"
                              : s.tone === "warn"
                              ? "border-amber-300 text-amber-700 dark:text-amber-300"
                              : s.tone === "bad"
                              ? "border-destructive/40 text-destructive"
                              : "text-muted-foreground";
                          return (
                            <Badge variant="outline" className={`text-[11px] ${cls}`}>
                              {s.label}
                              {r.hms_card_expires_at && s.tone !== "muted" ? ` · ${r.hms_card_expires_at}` : ""}
                            </Badge>
                          );
                        })()}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Ikke registrert</span>
                    )}
                  </TableCell>
                  {canViewSecurity && (
                    <TableCell><SecurityCell r={r} /></TableCell>
                  )}
                  <TableCell>
                    {r.archived_at ? (
                      <Badge variant="outline" className="text-muted-foreground">Arkivert</Badge>
                    ) : r.is_active ? (
                      <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-300">Aktiv</Badge>
                    ) : (
                      <Badge variant="outline">Inaktiv</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
