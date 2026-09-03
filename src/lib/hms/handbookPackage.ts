// HMS-pakke: koblede ressurser på kapitler, dekningsområder og kjemikalie-målgrupper.
// Brukes både i admin (utsending/dekning) og på den offentlige /hb/:token-siden.

export type HandbookResourceType =
  | "stoffkartotek"
  | "kjemikalie"
  | "sds"
  | "rutine"
  | "sjekkliste"
  | "sja"
  | "beredskap"
  | "avvik"
  | "kontakt"
  | "vedlegg";

export interface HandbookResourceLink {
  type: HandbookResourceType;
  label: string;
  url?: string | null;
  note?: string | null;
  /** Satt av systemet når ressursen kommer fra et kapittel. */
  section_id?: string | null;
  section_heading?: string | null;
}

export const RESOURCE_TYPE_LABELS: Record<HandbookResourceType, string> = {
  stoffkartotek: "Stoffkartotek",
  kjemikalie: "Kjemikalie",
  sds: "Sikkerhetsdatablad (SDS)",
  rutine: "Rutine",
  sjekkliste: "Sjekkliste",
  sja: "SJA-mal",
  beredskap: "Beredskapsrutine",
  avvik: "Avvik / RUH",
  kontakt: "Kontaktperson / nødinfo",
  vedlegg: "Annet HMS-vedlegg",
};

export const RESOURCE_TYPES = Object.keys(RESOURCE_TYPE_LABELS) as HandbookResourceType[];

/** Målgrupper for kjemikalier i HMS-pakken. */
export const CHEMICAL_AUDIENCE_TAGS = [
  "Alle montører",
  "Epoxy/skjøtestøp",
  "Service",
  "Tavle/strømskinner",
  "Datasenter",
  "Næringsbygg",
] as const;

export type ChemicalInclusionMode = "all_relevant" | "audience" | "specific" | "none";

export const CHEMICAL_MODE_LABELS: Record<ChemicalInclusionMode, string> = {
  all_relevant: "Alle relevante kjemikalier",
  audience: "Bare valgt målgruppe",
  specific: "Bare spesifikke kjemikalier",
  none: "Ingen kjemikalier",
};

/** Arbeidsområder MCS Service skal ha rutiner for (dekningskontroll). */
export const HMS_COVERAGE_AREAS = [
  "Serviceoppdrag",
  "Tavler og strømskinner",
  "Datasenter",
  "Næringsbygg",
  "FSE og elsikkerhet",
  "SJA/risikovurdering",
  "PVU",
  "Stoffkartotek/kjemikalier",
  "Epoxy/herdeplast",
  "Avvik/RUH",
  "Beredskap",
  "Strømulykke",
  "Alvorlig ulykke",
  "Asbest/eldre bygg",
  "EE-avfall",
] as const;

export type HmsCoverageArea = (typeof HMS_COVERAGE_AREAS)[number];

/** Nøkkelord for å foreslå dekningsområde ut fra kapitteltittel. */
const AREA_KEYWORDS: Record<string, string[]> = {
  Serviceoppdrag: ["service", "vedlikehold"],
  "Tavler og strømskinner": ["tavle", "strømskinne", "skinne", "skjøtestøp"],
  Datasenter: ["datasenter", "datacenter"],
  Næringsbygg: ["næringsbygg", "bygg"],
  "FSE og elsikkerhet": ["fse", "elsikkerhet", "spenning"],
  "SJA/risikovurdering": ["sja", "risikovurdering", "risiko"],
  PVU: ["pvu", "verneutstyr"],
  "Stoffkartotek/kjemikalier": ["stoffkartotek", "kjemikal"],
  "Epoxy/herdeplast": ["epoxy", "epoksy", "herdeplast", "støpemasse"],
  "Avvik/RUH": ["avvik", "ruh", "uønsket"],
  Beredskap: ["beredskap", "nød", "brann", "evakuering"],
  Strømulykke: ["strømulykke", "strømgjennomgang", "elulykke"],
  "Alvorlig ulykke": ["alvorlig ulykke", "dødsfall", "personskade"],
  "Asbest/eldre bygg": ["asbest", "eldre bygg", "pcb"],
  "EE-avfall": ["ee-avfall", "avfall", "retur"],
};

export function suggestCoverageAreas(heading: string | null | undefined, body?: string | null): string[] {
  const hay = `${heading ?? ""} ${body ?? ""}`.toLowerCase();
  return Object.entries(AREA_KEYWORDS)
    .filter(([, words]) => words.some((w) => hay.includes(w)))
    .map(([area]) => area);
}

/** Standard-lenker som alltid følger med en full HMS-pakke. */
export function defaultPackageResources(hasChemicals: boolean): HandbookResourceLink[] {
  const base: HandbookResourceLink[] = [
    { type: "avvik", label: "Meld avvik / RUH", note: "Meld inn i MCS Kontrollsenter eller til HMS-ansvarlig." },
    { type: "beredskap", label: "Beredskap og nødprosedyrer", note: "Ring 110/113 ved akutt fare. Varsle deretter driftsleder." },
  ];
  if (hasChemicals) {
    base.unshift({
      type: "stoffkartotek",
      label: "Stoffkartotek",
      note: "Kjemikaliene som er relevante for ditt arbeid ligger nederst med sikkerhetsdatablad.",
    });
  }
  return base;
}

export function dedupeResources(list: HandbookResourceLink[]): HandbookResourceLink[] {
  const seen = new Set<string>();
  const out: HandbookResourceLink[] = [];
  for (const r of list) {
    const key = `${r.type}|${(r.label ?? "").toLowerCase()}|${r.url ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Absolutte http(s)-lenker kan åpnes av mottaker uten innlogging. */
export function isPublicUrl(url: string | null | undefined): boolean {
  return !!url && /^https?:\/\//i.test(url);
}
