/**
 * Operativ behandling av funn i Tilsyn & revisjon.
 *
 * Tre lag holdes strengt atskilt:
 *  A. MYNDIGHETENS DATA  – ordrett fra rapporten (aldri omskrevet)
 *  B. SYSTEMFAKTA        – beregnet fra faktiske MCS-data (aldri fra AI)
 *  C. AI-/INTERN VURDERING – forslag som må godkjennes av et menneske
 *
 * Filen inneholder kun ren logikk (ingen spørringer, ingen UI).
 */
import type { ComplianceTone } from "@/lib/compliance";
import type { DocumentationStatus } from "@/lib/inspections";

/* ------------------------------------------------------------------ */
/* Prioritet på intern behandling                                      */
/* ------------------------------------------------------------------ */

export type FindingPriority = "critical" | "high" | "normal" | "low";

export const FINDING_PRIORITIES: { value: FindingPriority; label: string; tone: ComplianceTone }[] = [
  { value: "critical", label: "Kritisk", tone: "alert" },
  { value: "high", label: "Høy", tone: "warn" },
  { value: "normal", label: "Normal", tone: "neutral" },
  { value: "low", label: "Lav", tone: "neutral" },
];

export function findingPriorityMeta(v: string) {
  return FINDING_PRIORITIES.find((p) => p.value === v) ?? { value: v, label: v, tone: "neutral" as ComplianceTone };
}

/** Interne kategorier vi har sett i praksis – fritekst er fortsatt tillatt */
export const INTERNAL_CATEGORY_SUGGESTIONS = [
  "Kompetanse og opplæring",
  "Virksomhetsregistrering / faglig ansvar",
  "Organisering og ansvar",
  "Internkontroll og styringssystem",
  "Dokumentasjon av utført arbeid",
  "Utstyr og verneutstyr",
  "Sluttkontroll og samsvarserklæring",
  "Annet",
];

/* ------------------------------------------------------------------ */
/* Nøkkelord for systemkontroll                                        */
/* ------------------------------------------------------------------ */

const ORG_KEYWORDS = [
  "faglig ansvarlig", "faglig ansvar", "stedfortreder", "organisering",
  "ansvarsfordeling", "myndighet", "organisasjonskart",
];

const REGISTRY_KEYWORDS = [
  "elvirksomhetsregister", "elvirksomhetsregisteret", "registrering av virksomheten",
  "registrert virksomhet", "fek",
];

const QUALIFICATION_KEYWORDS = [
  "kvalifikasjon", "kvalifikasjoner", "kvalifikasjonskrav", "fagbrev",
  "fagkompetanse", "kompetansekrav", "faglige kvalifikasjoner",
];

const INTERNAL_CONTROL_KEYWORDS = ["internkontroll", "styringssystem", "risikovurdering", "revisjon"];

function mentions(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

function hit(text: string, needle?: string | null): boolean {
  const n = (needle ?? "").trim().toLowerCase();
  if (n.length < 3) return false;
  return text.includes(n);
}

/* ------------------------------------------------------------------ */
/* Systemkontroll – KUN faktiske data                                  */
/* ------------------------------------------------------------------ */

export interface CoverageLike {
  total: number;
  ok: number;
  warn: number;
  gaps: number;
  gapNames: string[];
  warnNames: string[];
}

export interface SystemCheckSources {
  competenceTypes: { id: string; key: string; name: string }[];
  orgRoles: {
    id: string; title: string; role_type: string; person_id: string | null;
    deputy_person_id: string | null; valid_from: string | null; valid_to: string | null;
  }[];
  regulations: { id: string; name: string; short_name: string | null }[];
  audits: { id: string; title: string; performed_at: string | null; status: string }[];
  /** Antall personer per kravstatus for en kompetansetype (kravmotoren) */
  coverageFor: (competenceTypeId: string | null) => CoverageLike | null;
  /** Alle rader fra kravmotoren – brukes til kvalifikasjonsvurdering */
  requirementRows: { person_id: string; status: string; required: boolean }[];
  personName: (personId: string | null) => string | null;
}

/**
 * Et konkret gap systemet kan bekrefte fra egne data, med henvisning til
 * stedet i MCS hvor forholdet faktisk rettes. Tilsynsmodulen skal aldri
 * lage en egen løsning for dette.
 */
export interface SystemGap {
  id: string;
  kind: "competence" | "requirement" | "org_role" | "internal_control" | "regulation" | "documentation";
  message: string;
  actionLabel: string;
  route: string;
  /** Blokkerer «Klar for oversendelse» fordi forholdet fortsatt ikke er rettet */
  blocking: boolean;
}

export interface SystemCheckResult {
  competence: { typeId: string; typeKey: string; name: string; coverage: CoverageLike | null }[];
  orgRoles: { id: string; title: string; personName: string | null; deputyName: string | null; valid_from: string | null; valid_to: string | null }[];
  /** Mangel systemet faktisk kan bekrefte (ingen aktiv rolle registrert) */
  orgRoleGap: string | null;
  regulations: { id: string; label: string }[];
  audits: { id: string; title: string; performed_at: string | null }[];
  /** Foreslått intern kategori som følger direkte av regelverksområdet */
  categoryHint: string | null;
  /** Kvalifikasjonsvurdering – aldri en konklusjon om enkeltpersoner */
  qualificationNote: string | null;
  facts: string[];
  /** Handlingsorienterte gap med lenke til riktig sted i systemet */
  gaps: SystemGap[];
}


function roleIsActive(r: { valid_from: string | null; valid_to: string | null }): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (r.valid_from && r.valid_from > today) return false;
  if (r.valid_to && r.valid_to < today) return false;
  return true;
}

/**
 * Beregner hva systemet allerede vet om et funn. Alle tall kommer fra
 * kravmotoren og registrene – ingenting her er AI-generert.
 */
export function systemCheckForFinding(rawText: string, s: SystemCheckSources): SystemCheckResult {
  const text = (rawText ?? "").toLowerCase();
  const facts: string[] = [];
  const gaps: SystemGap[] = [];

  /* Kompetanse */
  const competence = s.competenceTypes
    .filter((c) => hit(text, c.name) || hit(text, c.key))
    .map((c) => ({ typeId: c.id, typeKey: c.key, name: c.name, coverage: s.coverageFor(c.id) }));

  for (const c of competence) {
    const cov = c.coverage;
    if (!cov || cov.total === 0) {
      facts.push(`Ingen aktive ansatte er omfattet av et registrert krav om ${c.name}.`);
      gaps.push({
        id: `req-${c.typeId}`,
        kind: "requirement",
        message: `Ingen aktive ansatte er omfattet av et registrert krav om ${c.name}.`,
        actionLabel: "Registrer kompetansekrav",
        route: "/compliance/kompetansekrav",
        blocking: false,
      });
      continue;
    }
    const parts = [`${cov.total} aktive ansatte omfattes av kravet om ${c.name}`, `${cov.ok} har gyldig dokumentasjon`];
    if (cov.warn) parts.push(`${cov.warn} utløper snart`);
    if (cov.gaps) parts.push(`${cov.gaps} mangler gyldig dokumentasjon`);
    facts.push(`${parts.join(", ")}.`);
    if (cov.gaps > 0) {
      gaps.push({
        id: `comp-${c.typeId}`,
        kind: "competence",
        message: `${cov.gaps} ${cov.gaps === 1 ? "ansatt" : "ansatte"} mangler gyldig dokumentert ${c.name}.`,
        actionLabel: "Registrer kompetanse på ansatt",
        route: `/compliance/kompetanse?type=${encodeURIComponent(c.typeKey)}&status=missing_document`,
        blocking: true,
      });
    } else if (cov.warn > 0) {
      gaps.push({
        id: `comp-warn-${c.typeId}`,
        kind: "competence",
        message: `${cov.warn} ${cov.warn === 1 ? "ansatt" : "ansatte"} har ${c.name} som utløper snart.`,
        actionLabel: "Åpne kompetansematrisen",
        route: `/compliance/kompetanse?type=${encodeURIComponent(c.typeKey)}`,
        blocking: false,
      });
    }
  }

  /* Organisasjon og ansvar */
  const matchedRoles = s.orgRoles.filter((r) => hit(text, r.title) || (mentions(text, ORG_KEYWORDS) && /faglig/i.test(r.title + r.role_type)));
  const activeRoles = matchedRoles.filter(roleIsActive);
  const orgRoles = activeRoles.map((r) => ({
    id: r.id,
    title: r.title,
    personName: s.personName(r.person_id),
    deputyName: s.personName(r.deputy_person_id),
    valid_from: r.valid_from,
    valid_to: r.valid_to,
  }));

  let orgRoleGap: string | null = null;
  if (mentions(text, ORG_KEYWORDS) && activeRoles.length === 0) {
    orgRoleGap = "Ingen aktiv faglig ansvarlig elektro er registrert i Organisasjon og ansvar.";
    facts.push(orgRoleGap);
    gaps.push({
      id: "org-role-missing",
      kind: "org_role",
      message: orgRoleGap,
      actionLabel: "Registrer faglig ansvarlig",
      route: "/compliance/organisasjon",
      blocking: true,
    });
  }
  for (const r of orgRoles) {
    facts.push(
      r.personName
        ? `${r.title} er registrert: ${r.personName}${r.valid_from ? ` (gyldig fra ${r.valid_from})` : ""}${r.valid_to ? ` til ${r.valid_to}` : ""}.`
        : `${r.title} finnes som rolle, men ingen person er tilordnet.`,
    );
    if (!r.personName) {
      gaps.push({
        id: `org-role-${r.id}`,
        kind: "org_role",
        message: `${r.title} finnes som rolle, men ingen person er tilordnet.`,
        actionLabel: "Tilordne person til rollen",
        route: "/compliance/organisasjon",
        blocking: true,
      });
    }
  }

  /* Regelverk */
  const regulations = s.regulations
    .filter((r) => hit(text, r.short_name) || hit(text, r.name))
    .map((r) => ({ id: r.id, label: r.short_name ? `${r.short_name} – ${r.name}` : r.name }));

  if (regulations.length === 0 && /(§|forskrift|nek\s?400|\bfel\b|\bfek\b|\bfse\b)/.test(text)) {
    const msg = "Funnet viser til regelverk som ikke er gjenkjent i regelverksregisteret.";
    facts.push(msg);
    gaps.push({
      id: "regulation-missing",
      kind: "regulation",
      message: msg,
      actionLabel: "Åpne regelverksregisteret",
      route: "/compliance/regelverk",
      blocking: false,
    });
  }

  /* Internkontroll */
  const audits = mentions(text, INTERNAL_CONTROL_KEYWORDS)
    ? s.audits.filter((a) => a.performed_at).slice(0, 3).map((a) => ({ id: a.id, title: a.title, performed_at: a.performed_at }))
    : s.audits.filter((a) => hit(text, a.title)).map((a) => ({ id: a.id, title: a.title, performed_at: a.performed_at }));
  if (mentions(text, INTERNAL_CONTROL_KEYWORDS) && audits.length === 0) {
    const msg = "Det er ikke registrert gjennomført internkontroll som kan dokumentere dette punktet.";
    facts.push(msg);
    gaps.push({
      id: "internal-control-missing",
      kind: "internal_control",
      message: msg,
      actionLabel: "Registrer internkontroll",
      route: "/compliance/internkontroll",
      blocking: true,
    });
  }

  /* Virksomhetsregistrering */
  const categoryHint = mentions(text, REGISTRY_KEYWORDS)
    ? "Virksomhetsregistrering / faglig ansvar"
    : mentions(text, QUALIFICATION_KEYWORDS)
      ? "Kompetanse og opplæring"
      : mentions(text, INTERNAL_CONTROL_KEYWORDS)
        ? "Internkontroll og styringssystem"
        : null;

  /* Kvalifikasjoner – ingen konklusjon om enkeltpersoner */
  let qualificationNote: string | null = null;
  if (mentions(text, QUALIFICATION_KEYWORDS)) {
    const required = s.requirementRows.filter((r) => r.required);
    const unverified = new Set(
      required.filter((r) => ["missing", "missing_document", "expired"].includes(r.status)).map((r) => r.person_id),
    );
    qualificationNote = unverified.size
      ? `Systemet mangler tilstrekkelig dokumentasjon til å verifisere kvalifikasjonene for ${unverified.size} ${unverified.size === 1 ? "person" : "personer"}.`
      : required.length
        ? "Følgende dokumenterte kompetanser er relevante for vurderingen – alle registrerte kompetansekrav er dokumentert oppfylt."
        : "Det er ikke registrert kompetansekrav som kan brukes til å vurdere kvalifikasjonene.";
    facts.push(qualificationNote);
    if (unverified.size) {
      gaps.push({
        id: "qualification-unverified",
        kind: "competence",
        message: qualificationNote,
        actionLabel: "Åpne kompetansematrisen",
        route: "/compliance/kompetanse?status=missing_document",
        blocking: false,
      });
    }
  }

  return { competence, orgRoles, orgRoleGap, regulations, audits, categoryHint, qualificationNote, facts, gaps };
}


/* ------------------------------------------------------------------ */
/* Pre-flight før funn kan merkes «Klar for oversendelse»              */
/* ------------------------------------------------------------------ */

export interface PreflightFinding {
  internal_assessment: string | null;
  response_text: string | null;
  response_approved_at: string | null;
  responsible_person_id: string | null;
  responsible_role_id: string | null;
  internal_deadline: string | null;
  status: string;
}

export interface PreflightAction {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
}

export interface PreflightResult {
  ready: boolean;
  missing: string[];
  notes: string[];
}

/**
 * Kontroll før et funn kan settes til «Klar for oversendelse».
 * Ikke alle punkter er relevante for alle saker – derfor blir ikke-relevante
 * punkter meldt som merknader og blokkerer ikke.
 */
export function findingPreflight(
  finding: PreflightFinding,
  actions: PreflightAction[],
  docStatus: DocumentationStatus,
  evidenceCount: number,
): PreflightResult {
  const missing: string[] = [];
  const notes: string[] = [];

  if (!finding.internal_assessment?.trim()) missing.push("Intern vurdering mangler");
  if (!finding.responsible_person_id && !finding.responsible_role_id) missing.push("Ansvarlig er ikke satt");

  const openActions = actions.filter((a) => ["open", "in_progress"].includes(a.status));
  for (const a of openActions) missing.push(`Tiltak «${a.title}» er ikke ferdigstilt`);
  if (!actions.length) notes.push("Ingen tiltak er registrert – vurder om funnet krever tiltak");

  if (evidenceCount === 0) missing.push("Dokumentasjon/bevis mangler");
  else if (docStatus === "gaps") missing.push("Dokumentasjonen har mangler ifølge kravmotoren");
  else if (docStatus === "incomplete") notes.push("Dokumentasjonen er registrert som ufullstendig");

  if (!finding.response_text?.trim()) missing.push("Svartekst til myndigheten mangler");
  else if (!finding.response_approved_at) missing.push("Svartekst er ikke godkjent");

  if (finding.internal_deadline) {
    const days = Math.ceil((new Date(finding.internal_deadline).getTime() - Date.now()) / 86400000);
    if (days < 0 && finding.status !== "approved") notes.push(`Intern frist er passert med ${Math.abs(days)} dager`);
  }

  return { ready: missing.length === 0, missing, notes };
}

/* ------------------------------------------------------------------ */
/* AI-forslag – aldri operative data før godkjenning                   */
/* ------------------------------------------------------------------ */

export type AiSuggestionField =
  | "internal_category"
  | "priority"
  | "internal_assessment"
  | "proposed_solution"
  | "needed_documentation";

export interface FindingAiSuggestions {
  internal_category?: string | null;
  priority?: FindingPriority | null;
  internal_assessment?: string | null;
  proposed_solution?: string | null;
  needed_documentation?: string[] | null;
  /** Systemområder AI mener er relevante – brukes bare til å peke bruker videre */
  related_systems?: string[] | null;
}

export type AiSuggestionState = Partial<Record<AiSuggestionField, "accepted" | "rejected" | "edited">>;

export const AI_SUGGESTION_LABELS: Record<AiSuggestionField, string> = {
  internal_category: "Intern kategori",
  priority: "Prioritet",
  internal_assessment: "Kort intern vurdering",
  proposed_solution: "Foreslått løsning/tiltak",
  needed_documentation: "Dokumentasjon som må fremskaffes",
};
