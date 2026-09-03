// Felles konstanter og hjelpefunksjoner for stoffkartotek / kjemikalier.

export const CHEMICAL_CATEGORIES = [
  "Epoxy/herdeplast",
  "Herder",
  "Resin",
  "Støpemasse",
  "Lim",
  "Spray",
  "Rensemiddel",
  "Fugemasse",
  "Maling/lakk",
  "Olje/fett",
  "Gass",
  "Annet",
] as const;

export const CHEMICAL_STATUS_LABELS: Record<string, string> = {
  active: "Aktiv",
  under_review: "Under vurdering",
  expired: "Utgått",
};

export const CHEMICAL_STATUS_STYLES: Record<string, string> = {
  active: "border-emerald-300 bg-emerald-50 text-emerald-800",
  under_review: "border-amber-300 bg-amber-50 text-amber-800",
  expired: "border-muted bg-muted text-muted-foreground",
};

/** GHS-piktogrammer med norske navn. */
export const GHS_PICTOGRAMS = [
  { code: "GHS01", label: "Eksplosjonsfarlig" },
  { code: "GHS02", label: "Brannfarlig" },
  { code: "GHS03", label: "Oksiderende" },
  { code: "GHS04", label: "Gass under trykk" },
  { code: "GHS05", label: "Etsende" },
  { code: "GHS06", label: "Giftig" },
  { code: "GHS07", label: "Helsefare / irriterende" },
  { code: "GHS08", label: "Kronisk helsefare" },
  { code: "GHS09", label: "Miljøfare" },
] as const;

export const CHEMICAL_ISSUE_TYPES = [
  "Hudkontakt",
  "Utslett / allergisk reaksjon",
  "Søl",
  "Feil hansker / verneutstyr",
  "Manglende sikkerhetsdatablad",
  "Manglende opplæring",
  "Feil lagring",
  "Feil avfallshåndtering",
  "Innånding / dårlig ventilasjon",
  "Annet",
] as const;

/** Antall måneder før et SDS regnes som gammelt. */
export const SDS_STALE_MONTHS = 36;

export function sdsAgeMonths(revisionDate: string | null | undefined): number | null {
  if (!revisionDate) return null;
  const d = new Date(revisionDate);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

export type SdsState = "missing" | "stale" | "undated" | "ok";

export function sdsState(chem: { sds_path?: string | null; sds_revision_date?: string | null }): SdsState {
  if (!chem.sds_path) return "missing";
  if (!chem.sds_revision_date) return "undated";
  const months = sdsAgeMonths(chem.sds_revision_date);
  return months !== null && months > SDS_STALE_MONTHS ? "stale" : "ok";
}

export const SDS_STATE_LABELS: Record<SdsState, string> = {
  missing: "SDS mangler",
  stale: "SDS er gammelt",
  undated: "SDS uten revisjonsdato",
  ok: "SDS på plass",
};

/**
 * Nøkkelord som gjør at et oppdrag regnes som kjemikalie-/epoxyrelevant.
 * Brukes i Ressursplan for å synliggjøre manglende bekreftelser.
 */
export const CHEMICAL_RISK_KEYWORDS = [
  "epoxy", "epoksy", "herdeplast", "herder", "resin", "støpemasse", "stopemasse",
  "skjøtestøp", "skjotestop", "skjøtestop", "strømskinne", "stromskinne", "skinne",
  "kjemikal", "lim", "fugemasse", "isolasjonsmasse",
];

/** Sjekker om en tekst (tittel, beskrivelse, HMS-områder) indikerer kjemikalierisiko. */
export function matchesChemicalRisk(...texts: (string | null | undefined)[]): string[] {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  return CHEMICAL_RISK_KEYWORDS.filter((k) => haystack.includes(k));
}
