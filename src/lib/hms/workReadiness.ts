// "Klar for arbeid" – risikotagger og kravmotor.
// Sammenstiller eksisterende data (stoffkartotek/SDS, HMS-håndbok-bekreftelser,
// kompetanse/FSE) til en samlet status per montør på et planlagt oppdrag.
// Dette er et hjelpemiddel og varsel – ikke en hard blokkering.

export type RiskTagKey =
  | "epoxy"
  | "herdeplast"
  | "kjemikalier"
  | "stromskinner"
  | "skjotestop"
  | "tavle"
  | "fse"
  | "naer_spenning"
  | "under_spenning"
  | "hoyden"
  | "datacenter"
  | "nattarbeid"
  | "alenearbeid";

export interface RiskTagDef {
  key: RiskTagKey;
  label: string;
  group: "Kjemikalier" | "Elsikkerhet" | "Arbeidsforhold";
  /** Ord som gjenkjenner taggen i fritekst (tittel/beskrivelse). */
  keywords: string[];
}

export const RISK_TAGS: RiskTagDef[] = [
  { key: "epoxy", label: "Epoxy", group: "Kjemikalier", keywords: ["epoxy", "epoksy"] },
  { key: "herdeplast", label: "Herdeplast", group: "Kjemikalier", keywords: ["herdeplast", "herder", "resin", "støpemasse", "stopemasse"] },
  { key: "kjemikalier", label: "Kjemikalier", group: "Kjemikalier", keywords: ["kjemikal", "lim", "fugemasse", "rensemiddel"] },
  { key: "skjotestop", label: "Skjøtestøp", group: "Kjemikalier", keywords: ["skjøtestøp", "skjotestop", "skjøtestop"] },
  { key: "stromskinner", label: "Strømskinner", group: "Elsikkerhet", keywords: ["strømskinne", "stromskinne", "skinne"] },
  { key: "tavle", label: "Tavle", group: "Elsikkerhet", keywords: ["tavle", "fordeling"] },
  { key: "fse", label: "FSE", group: "Elsikkerhet", keywords: ["fse"] },
  { key: "naer_spenning", label: "Arbeid nær spenning", group: "Elsikkerhet", keywords: ["nær spenning", "naer spenning"] },
  { key: "under_spenning", label: "Arbeid under spenning", group: "Elsikkerhet", keywords: ["under spenning", "aus"] },
  { key: "hoyden", label: "Arbeid i høyden", group: "Arbeidsforhold", keywords: ["høyden", "hoyden", "lift", "stillas", "fallsikring"] },
  { key: "datacenter", label: "Datacenter", group: "Arbeidsforhold", keywords: ["datacenter", "datasenter"] },
  { key: "nattarbeid", label: "Nattarbeid", group: "Arbeidsforhold", keywords: ["nattarbeid", "natteskift"] },
  { key: "alenearbeid", label: "Alenearbeid", group: "Arbeidsforhold", keywords: ["alenearbeid", "alene"] },
];

export const RISK_TAG_LABEL: Record<string, string> = Object.fromEntries(
  RISK_TAGS.map((t) => [t.key, t.label])
);

/** Foreslår risikotagger ut fra fritekst (tittel, beskrivelse, HMS-områder). */
export function suggestRiskTags(...texts: (string | null | undefined)[]): RiskTagKey[] {
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  return RISK_TAGS.filter((t) => t.keywords.some((k) => hay.includes(k))).map((t) => t.key);
}

/* ───────────────────────── Kravmotor ───────────────────────── */

export type RequirementKind = "chemical" | "handbook" | "competence" | "manual";
export type Severity = "critical" | "warning";

export interface ReadinessRequirement {
  key: string;
  label: string;
  kind: RequirementKind;
  severity: Severity;
  /** Kort tekst i statusmerket når kravet mangler. */
  missingLabel: string;
  /** Nøkkelord for å finne relevante kapitler/kompetanser/kjemikalier. */
  keywords?: string[];
  hint?: string;
  fromTags: RiskTagKey[];
}

const CHEM_TAGS: RiskTagKey[] = ["epoxy", "herdeplast", "kjemikalier", "skjotestop"];
const EL_TAGS: RiskTagKey[] = ["fse", "naer_spenning", "under_spenning", "tavle", "stromskinner"];

/** Bygger kravlisten for et oppdrag ut fra risikotagger. */
export function requirementsForTags(tags: string[]): ReadinessRequirement[] {
  const has = (keys: RiskTagKey[]) => keys.filter((k) => tags.includes(k));
  const out: ReadinessRequirement[] = [];

  const chem = has(CHEM_TAGS);
  if (chem.length > 0) {
    out.push({
      key: "chemical_ack",
      label: "Bekreftet kjemikalie og sikkerhetsdatablad (SDS)",
      kind: "chemical",
      severity: "critical",
      missingLabel: "Mangler SDS",
      keywords: chem.flatMap((t) => RISK_TAGS.find((r) => r.key === t)!.keywords),
      hint: "Ansatt må ha lest og bekreftet SDS for produktene som brukes.",
      fromTags: chem,
    });
    out.push({
      key: "hb_epoxy",
      label: "HMS-kapittel: epoxy / herdeplast",
      kind: "handbook",
      severity: "critical",
      missingLabel: "Mangler epoxy-rutine",
      keywords: ["epoxy", "epoksy", "herdeplast"],
      fromTags: chem,
    });
    out.push({
      key: "hb_chemicals",
      label: "HMS-kapittel: stoffkartotek / kjemikalier",
      kind: "handbook",
      severity: "warning",
      missingLabel: "Mangler kjemikalierutine",
      keywords: ["stoffkartotek", "kjemikal"],
      fromTags: chem,
    });
    out.push({
      key: "hb_ppe",
      label: "HMS-kapittel: personlig verneutstyr",
      kind: "handbook",
      severity: "warning",
      missingLabel: "Mangler PVU-rutine",
      keywords: ["verneutstyr", "pvu"],
      fromTags: chem,
    });
    out.push({
      key: "ppe_special",
      label: "Særskilt PVU: kjemikaliehansker og øyevern",
      kind: "manual",
      severity: "warning",
      missingLabel: "Mangler PVU",
      hint: "Kontroller at kjemikaliehansker, øyevern og ventilasjon er på plass.",
      fromTags: chem,
    });
    out.push({
      key: "sja_chemical",
      label: "SJA / risikovurdering før oppstart",
      kind: "manual",
      severity: "critical",
      missingLabel: "Mangler SJA",
      hint: "SJA kreves før arbeid med epoxy/herdeplast starter.",
      fromTags: chem,
    });
  }

  const el = has(EL_TAGS);
  if (el.length > 0) {
    out.push({
      key: "fse_competence",
      label: "Gyldig FSE-opplæring",
      kind: "competence",
      severity: "critical",
      missingLabel: "Mangler FSE",
      keywords: ["fse", "elsikkerhet", "instruert"],
      hint: "Årlig FSE-opplæring må være registrert og gyldig.",
      fromTags: el,
    });
    out.push({
      key: "hb_fse",
      label: "HMS-kapittel: FSE og elsikkerhet",
      kind: "handbook",
      severity: "warning",
      missingLabel: "Mangler FSE-rutine",
      keywords: ["fse", "elsikkerhet", "spenning"],
      fromTags: el,
    });
    out.push({
      key: "sja_el",
      label: "Risikovurdering / SJA for elarbeid",
      kind: "manual",
      severity: tags.includes("under_spenning") ? "critical" : "warning",
      missingLabel: "Mangler SJA",
      fromTags: el,
    });
  }

  if (tags.includes("hoyden")) {
    out.push({
      key: "height_competence",
      label: "Opplæring: fallsikring / lift / stillas",
      kind: "competence",
      severity: "warning",
      missingLabel: "Mangler opplæring",
      keywords: ["fall", "lift", "stillas", "høyde", "hoyde"],
      fromTags: ["hoyden"],
    });
    out.push({
      key: "ppe_height",
      label: "Korrekt PVU / fallsikring",
      kind: "manual",
      severity: "warning",
      missingLabel: "Mangler PVU",
      fromTags: ["hoyden"],
    });
    out.push({
      key: "sja_height",
      label: "SJA for arbeid i høyden",
      kind: "manual",
      severity: "warning",
      missingLabel: "Mangler SJA",
      fromTags: ["hoyden"],
    });
  }

  const solo = has(["nattarbeid", "alenearbeid"]);
  if (solo.length > 0) {
    out.push({
      key: "hb_solo",
      label: "HMS-kapittel: nattarbeid / alenearbeid",
      kind: "handbook",
      severity: "warning",
      missingLabel: "Mangler rutine",
      keywords: ["natt", "alene"],
      fromTags: solo,
    });
    out.push({
      key: "sja_solo",
      label: "SJA / ekstra vurdering ved natt- og alenearbeid",
      kind: "manual",
      severity: "warning",
      missingLabel: "Mangler SJA",
      hint: "Vurder varslingsrutine, tilgjengelighet og alenearbeidets risiko.",
      fromTags: solo,
    });
  }

  if (tags.includes("datacenter")) {
    out.push({
      key: "hb_datacenter",
      label: "HMS-kapittel: adgang og arbeid i datasenter",
      kind: "handbook",
      severity: "warning",
      missingLabel: "Mangler rutine",
      keywords: ["datasenter", "datacenter", "adgang"],
      fromTags: ["datacenter"],
    });
  }

  return out;
}

/* ───────────────────────── Evaluering ───────────────────────── */

export type ReqState = "ok" | "missing" | "unknown" | "overridden";

export interface ChemicalLite {
  id: string;
  product_name: string;
  category: string | null;
  usage_area: string | null;
  hms_areas?: string[];
  status: string;
  requires_acknowledgement: boolean;
  requires_sja?: boolean;
  requires_special_ppe?: boolean;
  sds_path: string | null;
  sds_revision_date: string | null;
  sds_version?: string | null;
  ppe_requirements?: string | null;
}

export interface HandbookAckLite {
  section_ids: string[] | null;
  section_titles: string[] | null;
  acknowledged_at: string | null;
  sent_at: string | null;
}

export interface SectionLite {
  id: string;
  heading: string;
  handbook_title?: string | null;
  handbook_id?: string | null;
  version_id?: string | null;
}

export interface CompetenceLite {
  label: string;
  expires_at: string | null;
  verified_at?: string | null;
}

export interface OverrideLite {
  requirement_key: string;
  comment: string | null;
  created_at: string;
  created_by_name?: string | null;
}

export interface RequirementResult {
  requirement: ReadinessRequirement;
  state: ReqState;
  /** Kort forklaring til planlegger. */
  detail: string;
  lastConfirmedAt?: string | null;
  chemicals?: { chemical: ChemicalLite; acknowledged_at: string | null; needsNewAck: boolean }[];
  sections?: { section: SectionLite; acknowledged_at: string | null }[];
  override?: OverrideLite | null;
}

export interface ReadinessInput {
  tags: string[];
  chemicals: ChemicalLite[];
  chemicalAcks: Map<string, { acknowledged_at: string | null; sds_revision_date: string | null }>;
  sections: SectionLite[];
  handbookAcks: HandbookAckLite[];
  competences: CompetenceLite[];
  overrides: OverrideLite[];
}

export type ReadinessLevel = "ready" | "warning" | "critical" | "unknown" | "not_relevant";

export interface ReadinessResult {
  level: ReadinessLevel;
  label: string;
  requirements: RequirementResult[];
  missingCritical: RequirementResult[];
  missingWarning: RequirementResult[];
}

function textMatch(hay: string, keywords: string[]) {
  const h = hay.toLowerCase();
  return keywords.some((k) => h.includes(k.toLowerCase()));
}

function isExpired(d: string | null) {
  if (!d) return false;
  return new Date(d).getTime() < Date.now();
}

export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const requirements = requirementsForTags(input.tags);
  if (requirements.length === 0) {
    return { level: "not_relevant", label: "Ikke relevant", requirements: [], missingCritical: [], missingWarning: [] };
  }

  const overrideByKey = new Map(input.overrides.map((o) => [o.requirement_key, o]));
  const results: RequirementResult[] = requirements.map((req) => {
    const override = overrideByKey.get(req.key) ?? null;
    let state: ReqState = "unknown";
    let detail = "";
    let lastConfirmedAt: string | null = null;
    let chemicals: RequirementResult["chemicals"];
    let sections: RequirementResult["sections"];

    if (req.kind === "chemical") {
      const relevant = input.chemicals.filter(
        (c) =>
          c.status === "active" &&
          c.requires_acknowledgement &&
          textMatch(
            [c.product_name, c.category, c.usage_area, (c.hms_areas ?? []).join(" ")].filter(Boolean).join(" "),
            req.keywords ?? []
          )
      );
      chemicals = relevant.map((c) => {
        const ack = input.chemicalAcks.get(c.id);
        const needsNewAck =
          !!ack?.acknowledged_at && !!c.sds_revision_date && (ack.sds_revision_date ?? "") < c.sds_revision_date;
        return { chemical: c, acknowledged_at: ack?.acknowledged_at ?? null, needsNewAck };
      });
      if (relevant.length === 0) {
        state = "unknown";
        detail = "Ingen aktive kjemikalier i stoffkartoteket matcher risikotaggene.";
      } else {
        const missing = chemicals.filter((c) => !c.acknowledged_at || c.needsNewAck);
        state = missing.length === 0 ? "ok" : "missing";
        lastConfirmedAt =
          chemicals.map((c) => c.acknowledged_at).filter(Boolean).sort().slice(-1)[0] ?? null;
        detail =
          missing.length === 0
            ? `Bekreftet for ${chemicals.length} produkt${chemicals.length === 1 ? "" : "er"}.`
            : `Mangler bekreftelse: ${missing.map((m) => m.chemical.product_name).join(", ")}`;
      }
    } else if (req.kind === "handbook") {
      const relevant = input.sections.filter((s) => textMatch(s.heading, req.keywords ?? []));
      const ackedIds = new Set<string>();
      const ackedTitles: string[] = [];
      let latest: string | null = null;
      for (const a of input.handbookAcks) {
        if (!a.acknowledged_at) continue;
        if (!latest || a.acknowledged_at > latest) latest = a.acknowledged_at;
        if (a.section_ids && a.section_ids.length > 0) a.section_ids.forEach((id) => ackedIds.add(id));
        else ackedTitles.push("__ALL__");
        (a.section_titles ?? []).forEach((t) => ackedTitles.push(t.toLowerCase()));
      }
      const wholeBook = ackedTitles.includes("__ALL__");
      sections = relevant.map((s) => ({
        section: s,
        acknowledged_at: wholeBook || ackedIds.has(s.id) || ackedTitles.includes(s.heading.toLowerCase()) ? latest : null,
      }));
      if (relevant.length === 0) {
        state = "unknown";
        detail = "Fant ingen HMS-kapittel som dekker dette kravet.";
      } else {
        const missing = sections.filter((s) => !s.acknowledged_at);
        state = missing.length === 0 ? "ok" : "missing";
        lastConfirmedAt = latest;
        detail =
          missing.length === 0
            ? `Bekreftet: ${relevant.map((s) => s.heading).join(", ")}`
            : `Mangler bekreftelse: ${missing.map((s) => s.section.heading).join(", ")}`;
      }
    } else if (req.kind === "competence") {
      const relevant = input.competences.filter((c) => textMatch(c.label ?? "", req.keywords ?? []));
      const valid = relevant.filter((c) => !isExpired(c.expires_at));
      if (relevant.length === 0) {
        state = "missing";
        detail = "Ingen registrert opplæring som dekker kravet.";
      } else if (valid.length === 0) {
        state = "missing";
        detail = `Utløpt: ${relevant.map((c) => `${c.label} (${c.expires_at?.slice(0, 10)})`).join(", ")}`;
      } else {
        state = "ok";
        detail = valid
          .map((c) => `${c.label}${c.expires_at ? ` – gyldig til ${c.expires_at.slice(0, 10)}` : ""}`)
          .join(", ");
        lastConfirmedAt = valid.map((c) => c.expires_at).filter(Boolean).sort()[0] ?? null;
      }
    } else {
      state = "missing";
      detail = req.hint ?? "Kontrolleres av planlegger før oppstart.";
    }

    if (state !== "ok" && override) {
      return { requirement: req, state: "overridden", detail, lastConfirmedAt, chemicals, sections, override };
    }
    return { requirement: req, state, detail, lastConfirmedAt, chemicals, sections, override };
  });

  const missingCritical = results.filter((r) => r.state === "missing" && r.requirement.severity === "critical");
  const missingWarning = results.filter((r) => r.state === "missing" && r.requirement.severity === "warning");
  const unknown = results.filter((r) => r.state === "unknown");

  let level: ReadinessLevel;
  let label: string;
  if (missingCritical.length > 0) {
    level = "critical";
    label = missingCritical[0].requirement.missingLabel;
  } else if (missingWarning.length > 0) {
    level = "warning";
    label = missingWarning[0].requirement.missingLabel;
  } else if (unknown.length > 0) {
    level = "unknown";
    label = "Uavklart";
  } else {
    level = "ready";
    label = "Klar";
  }

  return { level, label, requirements: results, missingCritical, missingWarning };
}

export const READINESS_STYLES: Record<ReadinessLevel, string> = {
  ready: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warning: "border-amber-300 bg-amber-50 text-amber-800",
  critical: "border-red-300 bg-red-50 text-red-800",
  unknown: "border-slate-300 bg-slate-50 text-slate-700",
  not_relevant: "border-muted bg-muted text-muted-foreground",
};

export const REQ_STATE_LABEL: Record<ReqState, string> = {
  ok: "Oppfylt",
  missing: "Mangler",
  unknown: "Uavklart",
  overridden: "Vurdert og akseptert",
};
