/**
 * Systemstøttet internrevisjon (Internkontroll).
 *
 * Samme prinsipp som i tilsynsmodulen:
 *  A. SYSTEMFAKTA  – beregnet fra faktiske MCS-data (aldri fra AI)
 *  B. KONTROLLPUNKT – brukeren må selv ta stilling til forhold systemet ikke kan fastslå
 *  C. AI            – kan foreslå kontrollpunkter og tekst, men aldri fullføre en revisjon
 *
 * Ren logikk – ingen spørringer, ingen UI.
 */
import type { ComplianceTone } from "@/lib/compliance";

/* ------------------------------------------------------------------ */
/* Systemfakta                                                         */
/* ------------------------------------------------------------------ */

export type SystemFactArea =
  | "organisation" | "employees" | "competence" | "regulations"
  | "deviations" | "actions" | "internal_control" | "documents";

export interface AuditSystemFact {
  id: string;
  area: SystemFactArea;
  /** Faktasetning, alltid beregnet fra data */
  message: string;
  tone: ComplianceTone;
  /** Sted i MCS hvor forholdet faktisk rettes */
  route: string;
  actionLabel: string;
  /** Forhold som bør håndteres før revisjonen fullføres */
  attention: boolean;
}

export const SYSTEM_FACT_AREAS: { area: SystemFactArea; label: string }[] = [
  { area: "organisation", label: "Organisasjon og ansvar" },
  { area: "employees", label: "Ansatte og ansettelsesforhold" },
  { area: "competence", label: "Kompetansekrav og kompetansestatus" },
  { area: "regulations", label: "Regelverksregister" },
  { area: "deviations", label: "Åpne avvik" },
  { area: "actions", label: "Åpne tiltak" },
  { area: "internal_control", label: "Tidligere internrevisjoner" },
  { area: "documents", label: "Dokumenter og rutiner" },
];

export interface AuditReviewSources {
  orgRoles: {
    id: string; title: string; role_type: string; person_id: string | null;
    deputy_person_id: string | null; valid_from: string | null; valid_to: string | null;
  }[];
  employees: { person_id: string; full_name: string; department_id: string | null; relationship_type: string | null }[];
  /** Rader fra kravmotoren */
  requirementRows: { person_id: string; competence_type_id: string; required: boolean; status: string }[];
  competenceTypes: { id: string; key: string; name: string }[];
  regulations: { id: string; name: string; short_name: string | null; next_review_at: string | null; status: string }[];
  /** Alle registrerte internrevisjoner (inkludert denne) */
  audits: { id: string; title: string; performed_at: string | null; status: string }[];
  openHms: { incidents: number; openActions: number; overdueActions: number };
  /** Antall dokumenter/rutiner knyttet til internkontroll (0 = ingen) */
  procedureDocuments?: number;
  /** Revisjonen som vurderes – utelates fra «tidligere revisjoner» */
  currentAuditId?: string | null;
}

function roleIsActive(r: { valid_from: string | null; valid_to: string | null }): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (r.valid_from && r.valid_from > today) return false;
  if (r.valid_to && r.valid_to < today) return false;
  return true;
}

const GAP_STATUSES = ["missing", "missing_document", "expired"];

/**
 * Beregner hva systemet faktisk vet – brukes som grunnlag i gjennomgangen.
 * Alt her kommer fra registrene og kravmotoren.
 */
export function auditSystemReview(s: AuditReviewSources): AuditSystemFact[] {
  const facts: AuditSystemFact[] = [];

  /* Organisasjon og faglig ansvarlig */
  const activeRoles = s.orgRoles.filter(roleIsActive);
  const staffedRoles = activeRoles.filter((r) => r.person_id);
  const professional = activeRoles.filter((r) => /faglig/i.test(`${r.title} ${r.role_type}`));
  const professionalStaffed = professional.filter((r) => r.person_id);

  facts.push({
    id: "org-roles",
    area: "organisation",
    message: activeRoles.length
      ? `${activeRoles.length} aktive ansvarsroller er registrert, ${staffedRoles.length} har person tilordnet.`
      : "Ingen aktive ansvarsroller er registrert i Organisasjon og ansvar.",
    tone: activeRoles.length && staffedRoles.length === activeRoles.length ? "ok" : activeRoles.length ? "warn" : "alert",
    route: "/compliance/organisasjon",
    actionLabel: "Åpne Organisasjon og ansvar",
    attention: !activeRoles.length || staffedRoles.length !== activeRoles.length,
  });

  facts.push({
    id: "org-professional",
    area: "organisation",
    message: professionalStaffed.length
      ? `Faglig ansvarlig er registrert (${professionalStaffed.length} ${professionalStaffed.length === 1 ? "rolle" : "roller"}).`
      : "Faglig ansvarlig er ikke registrert.",
    tone: professionalStaffed.length ? "ok" : "alert",
    route: "/compliance/organisasjon",
    actionLabel: professionalStaffed.length ? "Kontroller faglig ansvar" : "Registrer faglig ansvarlig",
    attention: professionalStaffed.length === 0,
  });

  /* Ansatte */
  facts.push({
    id: "employees",
    area: "employees",
    message: s.employees.length
      ? `${s.employees.length} aktive ansatte inngår i HMS-registeret.`
      : "Ingen aktive ansatte er registrert i HMS → Ansatte.",
    tone: s.employees.length ? "ok" : "alert",
    route: "/hms/people",
    actionLabel: "Åpne HMS → Ansatte",
    attention: s.employees.length === 0,
  });

  /* Kompetansekrav og status */
  const required = s.requirementRows.filter((r) => r.required);
  if (!required.length) {
    facts.push({
      id: "requirements-none",
      area: "competence",
      message: "Ingen kompetansekrav er registrert – kompetansestatus kan ikke vurderes av systemet.",
      tone: "alert",
      route: "/compliance/kompetansekrav",
      actionLabel: "Registrer kompetansekrav",
      attention: true,
    });
  } else {
    const byType = new Map<string, { total: number; gaps: number; warn: number }>();
    for (const r of required) {
      const e = byType.get(r.competence_type_id) ?? { total: 0, gaps: 0, warn: 0 };
      e.total += 1;
      if (GAP_STATUSES.includes(r.status)) e.gaps += 1;
      else if (r.status === "expiring_soon") e.warn += 1;
      byType.set(r.competence_type_id, e);
    }
    for (const [typeId, agg] of byType) {
      const type = s.competenceTypes.find((c) => c.id === typeId);
      const name = type?.name ?? "Kompetansekrav";
      const query = type?.key ? `?type=${encodeURIComponent(type.key)}` : "";
      facts.push({
        id: `competence-${typeId}`,
        area: "competence",
        message: agg.gaps
          ? `${agg.gaps} ${agg.gaps === 1 ? "ansatt" : "ansatte"} oppfyller ikke ${name}-kravet (${agg.total} omfattes).`
          : agg.warn
            ? `${agg.warn} ${agg.warn === 1 ? "ansatt" : "ansatte"} har ${name} som utløper snart (${agg.total} omfattes).`
            : `Alle ${agg.total} ansatte som omfattes av ${name}-kravet har gyldig dokumentasjon.`,
        tone: agg.gaps ? "alert" : agg.warn ? "warn" : "ok",
        route: `/compliance/kompetanse${query}${agg.gaps ? `${query ? "&" : "?"}status=missing_document` : ""}`,
        actionLabel: "Åpne kompetansematrisen",
        attention: agg.gaps > 0,
      });
    }
  }

  /* Regelverk */
  const today = new Date().toISOString().slice(0, 10);
  const overdueReview = s.regulations.filter((r) => r.next_review_at && r.next_review_at < today);
  facts.push({
    id: "regulations",
    area: "regulations",
    message: s.regulations.length
      ? overdueReview.length
        ? `${s.regulations.length} regelverk er registrert, ${overdueReview.length} har passert frist for gjennomgang.`
        : `${s.regulations.length} regelverk er registrert og innenfor gjennomgangsfrist.`
      : "Ingen regelverk er registrert i regelverksregisteret.",
    tone: !s.regulations.length ? "alert" : overdueReview.length ? "warn" : "ok",
    route: "/compliance/regelverk",
    actionLabel: "Åpne regelverksregisteret",
    attention: !s.regulations.length || overdueReview.length > 0,
  });

  /* Avvik */
  facts.push({
    id: "incidents",
    area: "deviations",
    message: s.openHms.incidents
      ? `${s.openHms.incidents} åpne HMS-avvik er registrert.`
      : "Ingen åpne HMS-avvik er registrert.",
    tone: s.openHms.incidents ? "warn" : "ok",
    route: "/hms/incidents",
    actionLabel: "Åpne avvik",
    attention: s.openHms.incidents > 0,
  });

  /* Tiltak */
  facts.push({
    id: "actions",
    area: "actions",
    message: s.openHms.openActions
      ? `${s.openHms.openActions} åpne tiltak finnes${s.openHms.overdueActions ? `, ${s.openHms.overdueActions} med passert frist` : ""}.`
      : "Ingen åpne tiltak finnes.",
    tone: s.openHms.overdueActions ? "alert" : s.openHms.openActions ? "warn" : "ok",
    route: "/hms",
    actionLabel: "Åpne tiltak",
    attention: s.openHms.openActions > 0,
  });

  /* Tidligere internrevisjoner */
  const previous = s.audits
    .filter((a) => a.id !== s.currentAuditId && a.performed_at)
    .sort((a, b) => (a.performed_at! < b.performed_at! ? 1 : -1));
  facts.push({
    id: "previous-audits",
    area: "internal_control",
    message: previous.length
      ? `Forrige gjennomførte internrevisjon: ${previous[0].title} (${previous[0].performed_at}).`
      : "Ingen gjennomført internrevisjon er registrert.",
    tone: previous.length ? "ok" : "alert",
    route: "/compliance/internkontroll",
    actionLabel: "Åpne internkontroll",
    attention: previous.length === 0,
  });

  /* Dokumenter / rutiner */
  if (typeof s.procedureDocuments === "number") {
    facts.push({
      id: "documents",
      area: "documents",
      message: s.procedureDocuments
        ? `${s.procedureDocuments} dokumenter er koblet til internkontroll og kompetanse.`
        : "Ingen dokumenter eller rutiner er koblet til internkontrollen.",
      tone: s.procedureDocuments ? "ok" : "warn",
      route: "/compliance",
      actionLabel: "Åpne Elsikkerhet",
      attention: s.procedureDocuments === 0,
    });
  }

  return facts;
}

/* ------------------------------------------------------------------ */
/* Manuelle kontrollpunkter                                            */
/* ------------------------------------------------------------------ */

export type CheckpointAnswer = "fulfilled" | "not_fulfilled" | "not_relevant" | "needs_action" | null;

export const CHECKPOINT_ANSWERS: { value: Exclude<CheckpointAnswer, null>; label: string; tone: ComplianceTone }[] = [
  { value: "fulfilled", label: "Oppfylt", tone: "ok" },
  { value: "not_fulfilled", label: "Ikke oppfylt", tone: "alert" },
  { value: "not_relevant", label: "Ikke relevant", tone: "neutral" },
  { value: "needs_action", label: "Krever tiltak", tone: "warn" },
];

export function checkpointAnswerMeta(v: CheckpointAnswer) {
  return CHECKPOINT_ANSWERS.find((a) => a.value === v) ?? { value: "", label: "Ikke besvart", tone: "neutral" as ComplianceTone };
}

export interface AuditCheckpoint {
  id: string;
  question: string;
  /** Fritt tema/område kontrollpunktet hører til */
  area: string | null;
  answer: CheckpointAnswer;
  comment: string | null;
  /** Koblet dokumentasjon (documents.id) */
  document_id: string | null;
  document_name: string | null;
  /** Tiltak opprettet fra kontrollpunktet (hms_action_items.id) */
  action_ids: string[];
  /** Forslag fra AI – merkes tydelig i UI til brukeren har svart */
  ai_suggested: boolean;
  answered_at: string | null;
  answered_by: string | null;
}

export function newCheckpoint(question: string, opts: { area?: string | null; ai?: boolean } = {}): AuditCheckpoint {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? `cp-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    question,
    area: opts.area ?? null,
    answer: null,
    comment: null,
    document_id: null,
    document_name: null,
    action_ids: [],
    ai_suggested: !!opts.ai,
    answered_at: null,
    answered_by: null,
  };
}

export function parseCheckpoints(raw: unknown): AuditCheckpoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object" && typeof (r as any).question === "string")
    .map((r: any) => ({
      id: String(r.id ?? newCheckpoint("x").id),
      question: r.question,
      area: r.area ?? null,
      answer: (r.answer ?? null) as CheckpointAnswer,
      comment: r.comment ?? null,
      document_id: r.document_id ?? null,
      document_name: r.document_name ?? null,
      action_ids: Array.isArray(r.action_ids) ? r.action_ids : [],
      ai_suggested: !!r.ai_suggested,
      answered_at: r.answered_at ?? null,
      answered_by: r.answered_by ?? null,
    }));
}

/** Standard kontrollpunkter for internkontroll etter FEL/FSE-praksis */
export const BASE_CHECKPOINT_TEMPLATES: { question: string; area: string }[] = [
  { question: "Er ansvar og myndighet for elektrofaglig arbeid kjent og etterlevd i praksis?", area: "Organisasjon og ansvar" },
  { question: "Blir kompetansekrav fulgt opp ved nyansettelser og endring av stilling?", area: "Kompetanse" },
  { question: "Gjennomføres årlig FSE-opplæring med praktisk førstehjelp?", area: "FSE" },
  { question: "Er rutiner for sluttkontroll og samsvarserklæring kjent og i bruk?", area: "Dokumentasjon av utført arbeid" },
  { question: "Fungerer avviksrapportering i praksis, og lukkes avvik innen frist?", area: "Avvikshåndtering" },
  { question: "Er risikovurderinger oppdatert for de aktuelle arbeidsoppgavene?", area: "Risikovurdering" },
  { question: "Er verktøy, måleutstyr og verneutstyr kontrollert og i orden?", area: "Utstyr" },
];

const AREA_KEYWORD_TEMPLATES: { match: RegExp; question: string; area: string }[] = [
  { match: /fse|sikkerhet ved arbeid/i, question: "Kan gjennomført FSE-opplæring dokumenteres for alle som utfører arbeid på eller nær anlegg?", area: "FSE" },
  { match: /kompetanse|fagbrev|kvalifikasjon/i, question: "Er kompetansebevis kontrollert mot faktiske arbeidsoppgaver den enkelte utfører?", area: "Kompetanse" },
  { match: /faglig ansvar|fek|virksomhetsregist/i, question: "Utøver faglig ansvarlig sin funksjon i praksis, med tilstrekkelig tid og myndighet?", area: "Organisasjon og ansvar" },
  { match: /internkontroll|styringssystem|revisjon/i, question: "Er internkontrollsystemet kjent for de ansatte og tilgjengelig i det daglige?", area: "Internkontroll" },
  { match: /dokumentasjon|sluttkontroll|samsvar/i, question: "Er dokumentasjon av utført arbeid komplett for de kontrollerte oppdragene?", area: "Dokumentasjon av utført arbeid" },
  { match: /instruert|opplæring|rutine/i, question: "Er ansatte instruert i gjeldende rutiner, og er instruksjonen dokumentert?", area: "Opplæring" },
];

/**
 * Foreslår kontrollpunkter ut fra revisjonens bakgrunn, områder og systemfakta.
 * Forslagene er alltid merket som AI-forslag og må besvares av bruker.
 */
export function suggestCheckpoints(input: {
  background?: string | null;
  areas?: string[];
  facts?: AuditSystemFact[];
  existing?: AuditCheckpoint[];
}): AuditCheckpoint[] {
  const text = [input.background ?? "", ...(input.areas ?? [])].join(" ");
  const have = new Set((input.existing ?? []).map((c) => c.question.trim().toLowerCase()));
  const out: AuditCheckpoint[] = [];

  const push = (question: string, area: string) => {
    const k = question.trim().toLowerCase();
    if (have.has(k)) return;
    have.add(k);
    out.push(newCheckpoint(question, { area, ai: true }));
  };

  for (const t of AREA_KEYWORD_TEMPLATES) if (t.match.test(text)) push(t.question, t.area);

  for (const f of input.facts ?? []) {
    if (!f.attention) continue;
    if (f.area === "competence") push("Er det avklart hvorfor kompetansekravet ikke er dokumentert oppfylt, og er det satt en plan?", "Kompetanse");
    if (f.area === "organisation") push("Er ansvarsforhold gjennomgått og bekreftet med den enkelte rolleinnehaver?", "Organisasjon og ansvar");
    if (f.area === "deviations") push("Er åpne avvik gjennomgått, og er årsak vurdert på systemnivå?", "Avvikshåndtering");
    if (f.area === "actions") push("Er åpne tiltak fortsatt relevante, med riktig ansvarlig og realistisk frist?", "Tiltak");
    if (f.area === "regulations") push("Er endringer i regelverk vurdert for konsekvens i egne rutiner?", "Regelverk");
  }

  for (const t of BASE_CHECKPOINT_TEMPLATES) push(t.question, t.area);

  return out;
}

/* ------------------------------------------------------------------ */
/* Pre-flight før fullføring                                           */
/* ------------------------------------------------------------------ */

export interface AuditPreflightInput {
  performed_at: string | null;
  responsible_person_id: string | null;
  participants: string[];
  areas: string[];
  findings: string | null;
  deviations: string | null;
  improvements: string | null;
  conclusion: string | null;
}

export interface AuditPreflightResult {
  ready: boolean;
  missing: string[];
  notes: string[];
}

export function auditPreflight(
  audit: AuditPreflightInput,
  checkpoints: AuditCheckpoint[],
  actions: { id: string; title: string; status: string }[],
  facts: AuditSystemFact[] = [],
): AuditPreflightResult {
  const missing: string[] = [];
  const notes: string[] = [];

  if (!audit.performed_at) missing.push("Gjennomført dato mangler");
  if (!audit.responsible_person_id) missing.push("Ansvarlig for revisjonen er ikke registrert");
  if (!audit.participants.length) missing.push("Deltakere er ikke registrert");
  if (!audit.areas.length) notes.push("Områder gjennomgått er ikke angitt");
  if (!audit.findings?.trim()) notes.push("Bakgrunn/omfang er ikke beskrevet");

  if (!checkpoints.length) missing.push("Ingen kontrollpunkter er registrert");
  const unanswered = checkpoints.filter((c) => !c.answer);
  for (const c of unanswered.slice(0, 5)) missing.push(`Kontrollpunkt ikke behandlet: «${c.question}»`);
  if (unanswered.length > 5) missing.push(`${unanswered.length - 5} flere kontrollpunkter er ikke behandlet`);

  const needsFollowUp = checkpoints.filter((c) => c.answer === "not_fulfilled" || c.answer === "needs_action");
  for (const c of needsFollowUp) {
    const handled = c.action_ids.length > 0 || (c.comment ?? "").trim().length > 0;
    if (!handled) missing.push(`«${c.question}» er ikke oppfylt uten at tiltak eller vurdering er registrert`);
  }
  if (needsFollowUp.length && !audit.deviations?.trim() && !audit.improvements?.trim()) {
    missing.push("Identifiserte avvik/forbedringspunkter er ikke oppsummert");
  }

  const withoutDoc = needsFollowUp.filter((c) => !c.document_id && !c.action_ids.length);
  if (withoutDoc.length) notes.push(`${withoutDoc.length} kontrollpunkt(er) mangler koblet dokumentasjon`);

  if (!audit.conclusion?.trim()) missing.push("Konklusjon mangler");

  const openActions = actions.filter((a) => ["open", "in_progress"].includes(a.status));
  if (openActions.length) notes.push(`${openActions.length} tiltak fra gjennomgangen er fortsatt åpne – revisjonen kan fullføres, men tiltakene følges opp videre`);

  for (const f of facts.filter((f) => f.attention && f.tone === "alert")) notes.push(`Systemet viser fortsatt: ${f.message}`);

  return { ready: missing.length === 0, missing, notes };
}

/* ------------------------------------------------------------------ */
/* Automatisk revisjonsreferat                                         */
/* ------------------------------------------------------------------ */

export interface AuditReportInput {
  title: string;
  performed_at: string | null;
  planned_date: string | null;
  responsibleName: string | null;
  participants: string[];
  areas: string[];
  findings: string | null;
  deviations: string | null;
  improvements: string | null;
  conclusion: string | null;
  facts: AuditSystemFact[];
  checkpoints: AuditCheckpoint[];
  actions: { title: string; status: string; due_date: string | null; assigneeName?: string | null }[];
  sourceLabel?: string | null;
}

/** Bygger et strukturert referat kun fra faktiske data i gjennomgangen */
export function buildAuditReport(i: AuditReportInput): string {
  const L: string[] = [];
  L.push(`# Revisjonsreferat – ${i.title}`, "");
  L.push(`**Gjennomført:** ${i.performed_at ?? "ikke registrert"}`);
  if (i.planned_date) L.push(`**Planlagt:** ${i.planned_date}`);
  L.push(`**Ansvarlig:** ${i.responsibleName ?? "ikke registrert"}`);
  L.push(`**Deltakere:** ${i.participants.length ? i.participants.join(", ") : "ikke registrert"}`);
  if (i.sourceLabel) L.push(`**Bakgrunn i tilsyn:** ${i.sourceLabel}`);
  L.push("", "## Bakgrunn og omfang", i.findings?.trim() || "Ikke beskrevet.");
  L.push("", "## Områder gjennomgått", i.areas.length ? i.areas.map((a) => `- ${a}`).join("\n") : "Ikke angitt.");

  L.push("", "## Systemfakta fra MCS");
  L.push(i.facts.length ? i.facts.map((f) => `- ${f.message}`).join("\n") : "Ingen systemfakta registrert.");

  L.push("", "## Kontrollpunkter og vurderinger");
  if (!i.checkpoints.length) L.push("Ingen kontrollpunkter registrert.");
  for (const c of i.checkpoints) {
    L.push(`### ${c.question}`);
    L.push(`- Vurdering: ${checkpointAnswerMeta(c.answer).label}`);
    if (c.area) L.push(`- Område: ${c.area}`);
    if (c.comment?.trim()) L.push(`- Kommentar: ${c.comment.trim()}`);
    if (c.document_name) L.push(`- Dokumentasjon: ${c.document_name}`);
    if (c.action_ids.length) L.push(`- Tiltak opprettet: ${c.action_ids.length}`);
    L.push("");
  }

  L.push("## Avvik", i.deviations?.trim() || "Ingen avvik registrert.");
  L.push("", "## Forbedringspunkter", i.improvements?.trim() || "Ingen forbedringspunkter registrert.");

  L.push("", "## Tiltak, ansvar og frister");
  L.push(
    i.actions.length
      ? i.actions
          .map((a) => `- ${a.title} · status: ${a.status} · frist: ${a.due_date ?? "ikke satt"}${a.assigneeName ? ` · ansvarlig: ${a.assigneeName}` : ""}`)
          .join("\n")
      : "Ingen tiltak opprettet i gjennomgangen.",
  );

  L.push("", "## Konklusjon", i.conclusion?.trim() || "Ikke registrert.");
  L.push("", `_Referatet er generert av MCS Kontrollsenter fra registrerte data ${new Date().toISOString().slice(0, 10)}._`);
  return L.join("\n");
}
