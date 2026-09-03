import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldQuestion } from "lucide-react";

const sb = supabase as any;

interface Finding {
  person_id: string;
  full_name: string;
  email: string | null;
  detail: string;
  suggestion: string;
}

interface AuditReport {
  companyName: string;
  domainMismatch: Finding[];
  sharedResources: Finding[];
  noAccount: Finding[];
  plannableNotEmployee: Finding[];
  crossMemberships: Finding[];
  employeeBasisCount: number;
}

/** Domenet som forventes for e-post i et selskap, utledet av flertallet blant ansatte. */
function dominantDomain(emails: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const e of emails) {
    const d = e?.split("@")[1]?.toLowerCase();
    if (!d) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [d, n] of counts) if (n > bestN) { best = d; bestN = n; }
  return best;
}

export default function HmsPersonScopeAuditPage() {
  const { activeCompanyId, activeCompany } = useCompanyContext();

  const { data, isLoading, error } = useQuery<AuditReport>({
    queryKey: ["hms-person-scope-audit", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const [{ data: profiles }, { data: companies }, { data: accounts }, { data: memberships }] = await Promise.all([
        sb
          .from("employment_profiles")
          .select(
            "person_id, company_id, archived_at, relationship_type, is_plannable_resource, include_in_hms_people, people(full_name, email, is_active)",
          ),
        sb.from("internal_companies").select("id, name"),
        sb.from("user_accounts").select("person_id, company_id, auth_user_id, is_active"),
        sb.from("user_memberships").select("user_id, company_id, is_active"),
      ]);

      const compName = new Map<string, string>((companies ?? []).map((c: any) => [c.id, c.name]));
      const all = (profiles ?? []) as any[];
      const mine = all.filter((p) => p.company_id === activeCompanyId);
      const basis = mine.filter(
        (p) => p.include_in_hms_people && !p.archived_at && p.people?.is_active !== false,
      );
      const domain = dominantDomain(basis.map((p) => p.people?.email ?? null));

      const label = (p: any): Finding => ({
        person_id: p.person_id,
        full_name: p.people?.full_name ?? "Ukjent",
        email: p.people?.email ?? null,
        detail: "",
        suggestion: "",
      });

      const domainMismatch: Finding[] = [];
      for (const p of basis) {
        const d = p.people?.email?.split("@")[1]?.toLowerCase();
        if (domain && d && d !== domain) {
          domainMismatch.push({
            ...label(p),
            detail: `E-postdomene @${d} avviker fra firmaets vanlige domene @${domain}`,
            suggestion: "Kontroller om personen skal flyttes til riktig company_id, merkes som delt ressurs, eller beholdes som ekstern mottaker.",
          });
        }
      }

      const activeByPerson = new Map<string, string[]>();
      for (const p of all) {
        if (p.archived_at) continue;
        const list = activeByPerson.get(p.person_id) ?? [];
        list.push(p.company_id);
        activeByPerson.set(p.person_id, list);
      }

      const sharedResources: Finding[] = [];
      for (const p of basis) {
        const others = (activeByPerson.get(p.person_id) ?? []).filter((c) => c !== activeCompanyId);
        if (others.length > 0) {
          sharedResources.push({
            ...label(p),
            detail: `Har også aktiv ansettelse i ${others.map((c) => compName.get(c) ?? c).join(", ")}`,
            suggestion: "Bekreft at dette er en delt ressurs. Hvis ikke: deaktiver ansettelsen i det selskapet personen ikke tilhører.",
          });
        }
      }

      const accountPersons = new Set(
        (accounts ?? []).filter((a: any) => a.company_id === activeCompanyId && a.is_active !== false).map((a: any) => a.person_id),
      );
      const noAccount: Finding[] = basis
        .filter((p) => !accountPersons.has(p.person_id))
        .map((p) => ({
          ...label(p),
          detail: "Aktiv ansatt uten brukerkonto i valgt firma",
          suggestion: "Bekreft at personen bare skal motta HMS via e-post/SMS-lenke, eller opprett brukerkonto.",
        }));

      const plannableNotEmployee: Finding[] = mine
        .filter((p) => p.is_plannable_resource && (!p.include_in_hms_people || p.archived_at || p.people?.is_active === false))
        .map((p) => ({
          ...label(p),
          detail: "Planleggbar ressurs, men ikke aktiv i HMS-ansattgrunnlaget",
          suggestion: "Avklar om personen er ansatt (sett HMS-tilhørighet) eller kun planleggbar/innleid ressurs.",
        }));

      const userToPersons = new Map<string, string>();
      for (const a of (accounts ?? []) as any[]) if (a.auth_user_id) userToPersons.set(a.auth_user_id, a.person_id);
      const membershipsByUser = new Map<string, string[]>();
      for (const m of (memberships ?? []) as any[]) {
        if (m.is_active === false) continue;
        const list = membershipsByUser.get(m.user_id) ?? [];
        list.push(m.company_id);
        membershipsByUser.set(m.user_id, list);
      }
      const crossMemberships: Finding[] = [];
      for (const [uid, comps] of membershipsByUser) {
        if (comps.length < 2 || !comps.includes(activeCompanyId!)) continue;
        const pid = userToPersons.get(uid);
        const prof = pid ? mine.find((p) => p.person_id === pid) : null;
        crossMemberships.push({
          person_id: pid ?? uid,
          full_name: prof?.people?.full_name ?? "Brukerkonto",
          email: prof?.people?.email ?? null,
          detail: `Tilgang i ${comps.map((c) => compName.get(c) ?? c).join(", ")}`,
          suggestion: "Behold kun der tilgangen er tilsiktet. Fjern feil membership. Tilgang er ikke det samme som ansettelse.",
        });
      }

      return {
        companyName: activeCompany?.name ?? "valgt firma",
        domainMismatch,
        sharedResources,
        noAccount,
        plannableNotEmployee,
        crossMemberships,
        employeeBasisCount: basis.length,
      };
    },
  });

  const sections = useMemo(() => {
    if (!data) return [];
    return [
      { title: "E-postdomene avviker fra firmaet", rows: data.domainMismatch },
      { title: "Delte ressurser (aktiv ansettelse i flere selskaper)", rows: data.sharedResources },
      { title: "Aktive ansatte uten brukerkonto", rows: data.noAccount },
      { title: "Planleggbare uten aktiv HMS-ansettelse", rows: data.plannableNotEmployee },
      { title: "Brukertilgang på tvers av selskaper", rows: data.crossMemberships },
    ];
  }, [data]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <ShieldQuestion className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Kontroll av ansattgrunnlag</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Read-only kontroll av person- og selskapskoblinger for {data?.companyName ?? "valgt firma"}. Ingenting endres eller
        slettes automatisk – hver linje viser forslag til retting.
        {data && ` HMS-grunnlaget teller ${data.employeeBasisCount} aktive ansatte.`}
      </p>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <p className="text-sm text-destructive">Kunne ikke laste kontrollen.</p>
      ) : (
        sections.map((s) => (
          <Card key={s.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {s.title}
                <Badge variant={s.rows.length > 0 ? "secondary" : "outline"}>{s.rows.length}</Badge>
              </CardTitle>
              {s.rows.length === 0 && <CardDescription>Ingen funn.</CardDescription>}
            </CardHeader>
            {s.rows.length > 0 && (
              <CardContent className="divide-y pt-0">
                {s.rows.map((r) => (
                  <div key={`${s.title}-${r.person_id}`} className="py-2.5 text-sm">
                    <div className="font-medium">{r.full_name}</div>
                    <div className="text-xs text-muted-foreground">{r.email ?? "Ingen e-post"} · {r.detail}</div>
                    <div className="text-xs mt-1">Forslag: {r.suggestion}</div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
