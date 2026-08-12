import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Activity, Shield, User, Loader2, ExternalLink, ClipboardCheck, GraduationCap } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { PersonSecurityTab } from "@/components/security/PersonSecurityTab";
import { PersonCompetenceTab } from "@/components/compliance/PersonCompetenceTab";


interface PersonRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}
interface EmploymentRow {
  company_id: string | null;
  department_id: string | null;
  is_plannable_resource: boolean | null;
  hms_card_number: string | null;
  hms_card_expires_at: string | null;
  trade_certificate_type: string | null;
  driver_license_classes: string[] | null;
  notes: string | null;
  archived_at: string | null;
}

export default function HmsPersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { hasPermission } = usePermissions();
  const { isSuperAdmin, isAdmin } = useAuth();
  const { activeCompanyId, allowedCompanyIds } = useCompanyContext();


  const canViewSecurity = isSuperAdmin || isAdmin || hasPermission("security.view") || hasPermission("security.manage");
  const canViewAudit = isSuperAdmin || hasPermission("security.audit.view");
  const canManageHms = isSuperAdmin || isAdmin || hasPermission("hms.manage");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notInActiveCompany, setNotInActiveCompany] = useState(false);
  const [notInHmsScope, setNotInHmsScope] = useState(false);
  const [person, setPerson] = useState<PersonRow | null>(null);
  const [emp, setEmp] = useState<EmploymentRow | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState<string | null>(null);

  const [audit, setAudit] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setNotInActiveCompany(false);
      setNotInHmsScope(false);
      try {
        if (!activeCompanyId) {
          if (!cancelled) {
            setLoading(false);
            setNotInActiveCompany(true);
          }
          return;
        }
        if (allowedCompanyIds?.length && !allowedCompanyIds.includes(activeCompanyId)) {
          if (!cancelled) {
            setLoading(false);
            setNotInActiveCompany(true);
          }
          return;
        }

        // Enforce company firewall: require employment_profile for activeCompanyId.
        const { data: e, error: eErr } = await (supabase as any)
          .from("employment_profiles")
          .select("*")
          .eq("person_id", id)
          .eq("company_id", activeCompanyId)
          .maybeSingle();
        if (eErr) throw eErr;
        if (!e) {
          if (!cancelled) {
            setNotInActiveCompany(true);
            setLoading(false);
          }
          return;
        }
        if (e.include_in_hms_people === false) {
          if (!cancelled) {
            setNotInHmsScope(true);
            setLoading(false);
          }
          return;
        }

        const { data: p, error: pErr } = await supabase
          .from("people")
          .select("id, full_name, email, phone, is_active")
          .eq("id", id)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!p) throw new Error("Fant ikke personen");

        let cName: string | null = null;
        let dName: string | null = null;
        if (e?.company_id) {
          const { data: c } = await supabase
            .from("internal_companies")
            .select("name")
            .eq("id", e.company_id)
            .maybeSingle();
          cName = (c as any)?.name ?? null;
        }
        if (e?.department_id) {
          const { data: d } = await supabase
            .from("departments")
            .select("name")
            .eq("id", e.department_id)
            .maybeSingle();
          dName = (d as any)?.name ?? null;
        }

        if (!cancelled) {
          setPerson(p as PersonRow);
          setEmp((e as EmploymentRow) ?? null);
          setCompanyName(cName);
          setDepartmentName(dName);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Kunne ikke laste personen");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, activeCompanyId, allowedCompanyIds]);

  const loadAudit = async () => {
    if (!id || !canViewAudit) return;
    setAuditLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("security_audit_log")
        .select("*")
        .or(`target_id.eq.${id},metadata->>person_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(100);
      setAudit((data as any[]) ?? []);
    } finally {
      setAuditLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notInActiveCompany || notInHmsScope) {
    const msg = notInHmsScope
      ? "Denne personen har tilgang/tilknytning til aktivt selskap, men er ikke registrert som HMS-personell i dette selskapet."
      : "Denne personen tilhører ikke aktivt selskap.";
    return (
      <div className="p-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={() => navigate("/hms/people")} className="mb-4 gap-1">
          <ArrowLeft className="h-4 w-4" /> Tilbake til ansatte
        </Button>
        <div className="rounded-lg border p-6 text-sm">
          <p className="font-medium">{msg}</p>
          <p className="text-muted-foreground mt-1">
            {notInHmsScope
              ? "Tilknytningen kan endres under Admin → Personer → Organisasjon."
              : "Bytt aktivt selskap i toppmenyen for å se denne ansatte."}
          </p>
        </div>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="p-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={() => navigate("/hms/people")} className="mb-4 gap-1">
          <ArrowLeft className="h-4 w-4" /> Tilbake
        </Button>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Kunne ikke laste personen</p>
          <p className="text-xs text-muted-foreground mt-1">{error ?? "Ukjent feil"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/hms/people")} className="mb-3 gap-1">
          <ArrowLeft className="h-4 w-4" /> Tilbake til ansatte
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{person.full_name}</h1>
          {emp?.archived_at ? (
            <Badge variant="outline" className="text-muted-foreground">Arkivert</Badge>
          ) : person.is_active ? (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-300">Aktiv</Badge>
          ) : (
            <Badge variant="outline">Inaktiv</Badge>
          )}
          {companyName && <span className="text-sm text-muted-foreground">{companyName}{departmentName ? ` · ${departmentName}` : ""}</span>}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview"><User className="h-4 w-4 mr-1.5" />Oversikt</TabsTrigger>
          <TabsTrigger value="hms"><ClipboardCheck className="h-4 w-4 mr-1.5" />HMS / AML</TabsTrigger>
          {canViewSecurity && <TabsTrigger value="security"><Shield className="h-4 w-4 mr-1.5" />Sikkerhet</TabsTrigger>}
          <TabsTrigger value="activity" onClick={loadAudit}><Activity className="h-4 w-4 mr-1.5" />Aktivitet</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="rounded-lg border p-4 sm:p-6 space-y-4 max-w-3xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <Field label="E-post" value={person.email} />
              <Field label="Telefon" value={person.phone} />
              <Field label="Firma" value={companyName} />
              <Field label="Avdeling" value={departmentName} />
              <Field label="Planleggbar ressurs" value={emp?.is_plannable_resource ? "Ja" : "Nei"} />
              <Field label="HMS-kortnummer" value={emp?.hms_card_number} mono />
              <Field label="HMS-kort gyldig til" value={emp?.hms_card_expires_at} />
              <Field label="Fagbrev" value={emp?.trade_certificate_type} />
              <Field
                label="Førerkort"
                value={emp?.driver_license_classes?.length ? emp.driver_license_classes.join(", ") : null}
              />
            </div>
            {emp?.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notater</p>
                  <p className="text-sm whitespace-pre-wrap">{emp.notes}</p>
                  {!canManageHms && (
                    <p className="text-[11px] text-muted-foreground mt-1">Skrivebeskyttet</p>
                  )}
                </div>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="hms" className="mt-4">
          <div className="rounded-lg border p-4 sm:p-6 max-w-3xl space-y-3">
            <p className="text-sm font-medium">HMS / AML</p>
            <p className="text-sm text-muted-foreground">
              Detaljert AML-historikk, regelsjekker og overtidsbalanse vises på personens AML-side.
            </p>
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to={`/hms/aml/${person.id}`}>
                Åpne AML-detaljer <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </TabsContent>

        {canViewSecurity && (
          <TabsContent value="security" className="mt-4">
            <PersonSecurityTab personId={person.id} />
          </TabsContent>
        )}

        <TabsContent value="activity" className="mt-4">
          {!canViewAudit ? (
            <div className="rounded-lg border p-6 max-w-2xl text-sm text-muted-foreground">
              Du har ikke tilgang til å se aktivitetsloggen for denne personen.
            </div>
          ) : auditLoading ? (
            <div className="flex items-center justify-center p-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : audit.length === 0 ? (
            <div className="rounded-lg border p-6 max-w-2xl text-sm text-muted-foreground">
              Ingen registrert aktivitet enda.
            </div>
          ) : (
            <div className="rounded-lg border divide-y max-w-3xl">
              {audit.map((a: any) => (
                <div key={a.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{a.action}</span>
                    <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("nb-NO")}</span>
                  </div>
                  {a.target_type && <p className="text-xs text-muted-foreground mt-0.5">{a.target_type}</p>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm ${mono ? "font-mono" : ""} ${value ? "" : "text-muted-foreground"}`}>
        {value || "-"}
      </p>
    </div>
  );
}
