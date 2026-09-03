import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

/**
 * Felles ansattgrunnlag for HMS/HR.
 *
 * Personmodell:
 * - Ansatt i aktivt firma: employment_profiles for valgt company_id,
 *   include_in_hms_people = true, ikke arkivert, people.is_active != false.
 * - Delt ressurs: samme person har også aktiv ansettelse i et annet selskap.
 * - Brukerkonto: user_accounts (kun tilgang – ikke ansettelse).
 * - Planleggbar ressurs: is_plannable_resource (ressursplan – ikke ansettelse).
 * - Kontaktperson / ekstern mottaker: aldri del av dette grunnlaget.
 *
 * Alle HMS-tellinger, utsendinger og bekreftelser skal bruke denne kilden,
 * slik at ansattliste, bekreftelser og mottakervalg alltid viser samme tall.
 */
export interface HmsEmployeeBasisRow {
  person_id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  relationship_type: string | null;
  is_plannable_resource: boolean;
  department_id: string | null;
  archived: boolean;
  /** Navn på andre selskaper personen har aktiv ansettelse i */
  other_company_names: string[];
  /** True når personen også er ansatt i et annet selskap */
  is_shared_resource: boolean;
}

export const EMPLOYEE_BASIS_LABEL =
  "Grunnlag: aktive ansatte i valgt firma (merket for HMS-oversikt)";

export async function fetchHmsEmployeeBasis(
  companyId: string,
  opts?: { includeArchived?: boolean },
): Promise<HmsEmployeeBasisRow[]> {
  const { data, error } = await sb
    .from("employment_profiles")
    .select(
      "person_id, department_id, archived_at, relationship_type, is_plannable_resource, people(full_name, email, phone, is_active)",
    )
    .eq("company_id", companyId)
    .eq("include_in_hms_people", true);
  if (error) throw error;

  const rows = ((data ?? []) as any[]).filter((r) => {
    if (!r.person_id) return false;
    if (r.people?.is_active === false) return false;
    if (!opts?.includeArchived && r.archived_at) return false;
    return true;
  });

  const personIds = [...new Set(rows.map((r) => r.person_id))] as string[];
  if (personIds.length === 0) return [];

  const [{ data: accounts }, { data: otherProfiles }, { data: companies }] = await Promise.all([
    sb.from("user_accounts").select("person_id, auth_user_id").eq("company_id", companyId).in("person_id", personIds),
    sb
      .from("employment_profiles")
      .select("person_id, company_id, archived_at")
      .in("person_id", personIds)
      .neq("company_id", companyId),
    sb.from("internal_companies").select("id, name"),
  ]);

  const userByPerson = new Map<string, string>((accounts ?? []).map((a: any) => [a.person_id, a.auth_user_id]));
  const companyName = new Map<string, string>((companies ?? []).map((c: any) => [c.id, c.name]));
  const otherByPerson = new Map<string, string[]>();
  for (const p of (otherProfiles ?? []) as any[]) {
    if (p.archived_at) continue;
    const list = otherByPerson.get(p.person_id) ?? [];
    const name = companyName.get(p.company_id) ?? "Annet selskap";
    if (!list.includes(name)) list.push(name);
    otherByPerson.set(p.person_id, list);
  }

  const seen = new Set<string>();
  const out: HmsEmployeeBasisRow[] = [];
  for (const r of rows) {
    if (seen.has(r.person_id)) continue;
    seen.add(r.person_id);
    const others = otherByPerson.get(r.person_id) ?? [];
    out.push({
      person_id: r.person_id,
      user_id: userByPerson.get(r.person_id) ?? null,
      full_name: r.people?.full_name ?? "Ukjent",
      email: r.people?.email ?? null,
      phone: r.people?.phone ?? null,
      relationship_type: r.relationship_type ?? null,
      is_plannable_resource: !!r.is_plannable_resource,
      department_id: r.department_id ?? null,
      archived: !!r.archived_at,
      other_company_names: others,
      is_shared_resource: others.length > 0,
    });
  }
  return out.sort((a, b) => a.full_name.localeCompare(b.full_name, "nb"));
}

export function sharedResourceLabel(row: { other_company_names: string[] }) {
  if (row.other_company_names.length === 0) return null;
  return `Delt ressurs fra ${row.other_company_names.join(", ")}`;
}
