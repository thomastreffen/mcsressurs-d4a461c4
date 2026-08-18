/**
 * Organisasjon og ansvar – systemfakta, gap-kontroll og rolleforslag.
 * All logikk her er deterministisk (systemfakta), ikke AI.
 */
import type { OrgRole } from "@/hooks/useCompliance";

export interface OrgPerson {
  person_id: string;
  full_name: string;
  email: string | null;
  department_name: string | null;
  job_role_name: string | null;
  relationship_type: string | null;
  is_active: boolean;
}

/** Sentrale roller som virksomheten normalt må ha dokumentert */
export interface KeyRoleSpec {
  key: string;
  label: string;
  role_type: string;
  /** Nøkkelord som identifiserer rollen i tittel */
  match: string[];
  /** Stillinger/systemroller som gjør personen aktuell */
  suggestFrom: string[];
  required: boolean;
  basis: string;
}

export const KEY_ROLES: KeyRoleSpec[] = [
  {
    key: "daglig_leder",
    label: "Daglig leder",
    role_type: "leadership",
    match: ["daglig leder", "administrerende", "general manager"],
    suggestFrom: ["daglig leder", "administrerende", "leder"],
    required: true,
    basis: "Internkontrollforskriften § 4 – ledelsens ansvar for HMS-arbeidet",
  },
  {
    key: "hms_ansvarlig",
    label: "HMS-ansvarlig",
    role_type: "hms",
    match: ["hms"],
    suggestFrom: ["hms", "kvalitet"],
    required: true,
    basis: "Internkontrollforskriften § 5 – dokumentert ansvar og oppgaver",
  },
  {
    key: "faglig_ansvarlig_elektro",
    label: "Faglig ansvarlig elektro",
    role_type: "elektrofaglig",
    match: ["faglig ansvarlig", "elektrofaglig"],
    suggestFrom: ["faglig ansvarlig", "elektrofaglig", "installatør"],
    required: true,
    basis: "FEK § 7/§ 11 – krav om faglig ansvarlig for elektroarbeid",
  },
  {
    key: "ks_ansvarlig",
    label: "KS-ansvarlig",
    role_type: "ks",
    match: ["ks", "kvalitet"],
    suggestFrom: ["kvalitet", "ks"],
    required: false,
    basis: "Internkontroll – ansvar for kvalitetssystem og dokumentstyring",
  },
  {
    key: "verneombud",
    label: "Verneombud",
    role_type: "verneombud",
    match: ["verneombud"],
    suggestFrom: ["verneombud"],
    required: false,
    basis: "Arbeidsmiljøloven kap. 6 – verneombud",
  },
];

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

export function matchesKeyRole(role: OrgRole, spec: KeyRoleSpec): boolean {
  const t = norm(role.title);
  return role.role_type === spec.role_type || spec.match.some((m) => t.includes(m));
}

export type GapSeverity = "alert" | "warn";

export interface OrgGap {
  id: string;
  severity: GapSeverity;
  title: string;
  detail: string;
  roleId?: string;
  /** Forslag til ny rolle som kan opprettes */
  suggestKey?: string;
}

/** Kontrollerer organisasjonsbildet mot systemfakta. Ingen AI. */
export function computeOrgGaps(roles: OrgRole[], people: OrgPerson[]): OrgGap[] {
  const gaps: OrgGap[] = [];
  const activeIds = new Set(people.filter((p) => p.is_active).map((p) => p.person_id));
  const byId = new Map(people.map((p) => [p.person_id, p]));
  const today = new Date().toISOString().slice(0, 10);

  const isCurrent = (r: OrgRole) => !r.valid_to || r.valid_to >= today;

  for (const spec of KEY_ROLES) {
    const hits = roles.filter((r) => matchesKeyRole(r, spec) && isCurrent(r));
    const filled = hits.filter((r) => r.person_id && activeIds.has(r.person_id));
    if (hits.length === 0) {
      if (spec.required)
        gaps.push({
          id: `missing-${spec.key}`,
          severity: "alert",
          title: `${spec.label} mangler`,
          detail: spec.basis,
          suggestKey: spec.key,
        });
    } else if (filled.length === 0) {
      gaps.push({
        id: `unassigned-${spec.key}`,
        severity: spec.required ? "alert" : "warn",
        title: `${spec.label} er ikke tildelt en aktiv ansatt`,
        detail: spec.basis,
        roleId: hits[0].id,
        suggestKey: spec.key,
      });
    }
  }

  for (const r of roles) {
    if (!r.person_id) {
      gaps.push({
        id: `noperson-${r.id}`,
        severity: "warn",
        title: `${r.title}: ingen ansvarlig person`,
        detail: "Rollen er registrert, men ikke tildelt en person.",
        roleId: r.id,
      });
    } else if (!activeIds.has(r.person_id)) {
      const p = byId.get(r.person_id);
      gaps.push({
        id: `inactive-${r.id}`,
        severity: "alert",
        title: `${r.title}: ansvarlig person er ikke lenger aktiv ansatt`,
        detail: p ? `${p.full_name} er registrert som inaktiv/arkivert.` : "Personen finnes ikke i aktivt ansattregister.",
        roleId: r.id,
      });
    }
    if (!r.responsibilities?.trim()) {
      gaps.push({
        id: `noresp-${r.id}`,
        severity: "warn",
        title: `${r.title}: mangler beskrivelse av ansvar`,
        detail: "Ansvar må være dokumentert for å kunne vises ved tilsyn.",
        roleId: r.id,
      });
    }
    if (!r.authority?.trim()) {
      gaps.push({
        id: `noauth-${r.id}`,
        severity: "warn",
        title: `${r.title}: mangler myndighet/fullmakter`,
        detail: "Myndighet bør beskrives, f.eks. beslutning om stans av arbeid, innkjøp eller frigivelse.",
        roleId: r.id,
      });
    }
    if (r.valid_to && r.valid_to < today) {
      gaps.push({
        id: `expired-${r.id}`,
        severity: "warn",
        title: `${r.title}: gyldighet utløpt ${r.valid_to}`,
        detail: "Forleng gyldigheten eller tildel rollen på nytt.",
        roleId: r.id,
      });
    }
  }

  return gaps;
}

export interface RoleSuggestion {
  spec: KeyRoleSpec;
  person: OrgPerson | null;
  reason: string;
}

/**
 * Foreslår organisasjonsroller basert på eksisterende stilling/ansettelsesdata.
 * Forslagene er ikke operative før bruker bekrefter og lagrer.
 */
export function suggestOrgRoles(roles: OrgRole[], people: OrgPerson[]): RoleSuggestion[] {
  const out: RoleSuggestion[] = [];
  const active = people.filter((p) => p.is_active);

  for (const spec of KEY_ROLES) {
    const exists = roles.some((r) => matchesKeyRole(r, spec) && r.person_id);
    if (exists) continue;
    const person =
      active.find((p) => spec.suggestFrom.some((k) => norm(p.job_role_name).includes(k))) ?? null;
    if (!person && !spec.required) continue;
    out.push({
      spec,
      person,
      reason: person
        ? `${person.full_name} har stilling «${person.job_role_name}» i ansattregisteret`
        : "Ingen ansatt med relevant stilling funnet – velg person manuelt",
    });
  }
  return out;
}

export function orgDocumentVersion(roles: OrgRole[]): string {
  const stamps = roles
    .map((r: any) => r.updated_at ?? r.created_at)
    .filter(Boolean)
    .sort();
  const last = stamps[stamps.length - 1];
  const d = last ? new Date(last) : new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${roles.length}`;
}

/** Hierarkisk struktur for organisasjonskart */
export interface OrgNode {
  role: OrgRole;
  children: OrgNode[];
}

const HIERARCHY_TYPES = ["leadership", "elektrofaglig", "other"];

export function buildOrgTree(roles: OrgRole[]): { tree: OrgNode[]; functions: OrgRole[] } {
  const hierarchical = roles.filter((r) => HIERARCHY_TYPES.includes(r.role_type));
  const functions = roles.filter((r) => !HIERARCHY_TYPES.includes(r.role_type));

  const nodes = new Map<string, OrgNode>();
  hierarchical.forEach((r) => nodes.set(r.id, { role: r, children: [] }));
  const roots: OrgNode[] = [];
  for (const n of nodes.values()) {
    const parentId = (n.role as any).reports_to_id as string | null;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  }
  const sortRec = (list: OrgNode[]) => {
    list.sort((a, b) => a.role.sort_order - b.role.sort_order || a.role.title.localeCompare(b.role.title, "nb"));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return { tree: roots, functions: functions.sort((a, b) => a.sort_order - b.sort_order) };
}
