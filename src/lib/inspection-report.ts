/**
 * Tilsynsrapport-analyse: typer, mellomlagring av utkast og forslag til koblinger.
 *
 * AI-analysen er ALDRI operative data. Den lever som et utkast (sessionStorage)
 * fram til bruker godkjenner og oppretter saken.
 */

export interface AnalyzedFinding {
  reference: string | null;
  finding_type: "deviation" | "remark" | "observation";
  title: string;
  original_text: string | null;
  legal_basis: string | null;
  authority_requirement: string | null;
  deadline: string | null;
  internal_category: string | null;
  match_keywords: string[];
}

export interface ReportAnalysis {
  title: string | null;
  inspection_type: string;
  authority_name: string | null;
  case_number: string | null;
  inspection_date: string | null;
  response_deadline: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  description: string | null;
  report_summary: string | null;
  findings: AnalyzedFinding[];
  analysis_mode?: string;
  source_file_name?: string;
}

export interface ReportDraft {
  analysis: ReportAnalysis;
  file: { bucket: string; path: string; name: string; size: number; mime: string; publicUrl: string | null };
  createdAt: string;
}

const DRAFT_KEY = "mcs.inspection-report-draft";

export function saveReportDraft(draft: ReportDraft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadReportDraft(): ReportDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as ReportDraft) : null;
  } catch {
    return null;
  }
}

export function clearReportDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}

export const NOT_FOUND_LABEL = "Ikke funnet i rapport";

export const ACCEPTED_REPORT_TYPES =
  ".pdf,.doc,.docx,.txt,.rtf,.png,.jpg,.jpeg,.webp,.eml,.msg";

/** Tekst som ble hentet ordrett fra rapporten – brukes til søk etter koblinger */
export function findingSearchText(f: {
  title?: string | null;
  original_text?: string | null;
  legal_basis_text?: string | null;
  legal_basis?: string | null;
  authority_comment?: string | null;
  authority_requirement?: string | null;
  internal_notes?: string | null;
}): string {
  return [
    f.title,
    f.original_text,
    f.legal_basis_text ?? f.legal_basis,
    f.authority_comment ?? f.authority_requirement,
    f.internal_notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export type LinkSuggestionKind =
  | "regulation"
  | "competence_type"
  | "competence_requirement"
  | "org_role"
  | "internal_audit";

export interface LinkSuggestion {
  kind: LinkSuggestionKind;
  id: string;
  label: string;
  reason: string;
}

interface MatchSources {
  regulations: { id: string; name: string; short_name: string | null }[];
  competenceTypes: { id: string; name: string; key: string }[];
  requirements: { id: string; competence_type_id: string; scope_type: string; description: string | null }[];
  orgRoles: { id: string; title: string; responsibilities: string | null }[];
  audits: { id: string; title: string; audit_type: string }[];
}

function hit(text: string, needle?: string | null): boolean {
  const n = (needle ?? "").trim().toLowerCase();
  if (n.length < 3) return false;
  return text.includes(n);
}

/**
 * Forslag til koblinger mot eksisterende registre. Alltid forslag – aldri
 * automatisk godkjent. Rene tekstmatch mot navn/kortnavn i registrene.
 */
export function suggestFindingLinks(text: string, s: MatchSources): LinkSuggestion[] {
  const out: LinkSuggestion[] = [];

  for (const r of s.regulations) {
    if (hit(text, r.short_name) || hit(text, r.name)) {
      out.push({
        kind: "regulation",
        id: r.id,
        label: r.short_name ? `${r.short_name} – ${r.name}` : r.name,
        reason: `Rapportteksten nevner ${r.short_name ?? r.name}`,
      });
    }
  }

  for (const c of s.competenceTypes) {
    if (hit(text, c.name) || hit(text, c.key)) {
      out.push({
        kind: "competence_type",
        id: c.id,
        label: `Kompetanse → ${c.name}`,
        reason: `Rapportteksten nevner ${c.name}`,
      });
      const req = s.requirements.find((r) => r.competence_type_id === c.id && r.scope_type === "company");
      if (req) {
        out.push({
          kind: "competence_requirement",
          id: req.id,
          label: `Kompetansekrav → ${c.name}`,
          reason: "Kravmotoren kan kontrollere hvilke ansatte som har gyldig dokumentasjon",
        });
      }
    }
  }

  for (const r of s.orgRoles) {
    if (hit(text, r.title)) {
      out.push({
        kind: "org_role",
        id: r.id,
        label: `Ansvar → ${r.title}`,
        reason: `Rapportteksten nevner ${r.title}`,
      });
    }
  }

  for (const a of s.audits) {
    if (hit(text, a.title)) {
      out.push({
        kind: "internal_audit",
        id: a.id,
        label: `Internkontroll → ${a.title}`,
        reason: "Kan dokumenteres med gjennomført internkontroll",
      });
    }
  }

  // dedupliser på kind+id
  const seen = new Set<string>();
  return out.filter((x) => {
    const k = `${x.kind}:${x.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
