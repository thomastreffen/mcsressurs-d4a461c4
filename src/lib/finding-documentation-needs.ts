import type { FindingEvidence } from "@/hooks/useInspections";

const STOPWORDS = new Set([
  "og", "eller", "for", "med", "til", "som", "det", "den", "der", "har", "hva", "skal", "være", "vise",
  "dokumentasjon", "dokumenter", "dokument", "oversikt", "kopi", "av", "på", "i", "en", "et", "the", "må",
]);

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9æøå\s-]/g, " ").split(/[\s-]+/)
    .filter(token => token.length >= 4 && !STOPWORDS.has(token));
}

export function documentationNeedScore(need: string, candidate: string): number {
  const candidateTokens = new Set(tokens(candidate));
  return tokens(need).filter(token => candidateTokens.has(token)).length;
}

export function isOrganizationDocumentationNeed(need: string): boolean {
  return /organisasjons(?:kart|oversikt|plan)|ansvars(?:matrise|oversikt|fordeling)|organisasjon\s*(?:og|&|med)\s*ansvar/i.test(need);
}

/** Live register validation, never historical labels/counts or finding treatment fields. */
export function evidenceForDocumentationNeed(
  need: string,
  evidence: FindingEvidence[],
  companyId: string | null,
  organizationFor: (companyId: string | null) => number | null,
): FindingEvidence[] {
  return evidence.filter(item => {
    if (item.source_kind === "organization_overview") {
      if (!isOrganizationDocumentationNeed(need) || !companyId || item.ref_id !== companyId) return false;
      const count = organizationFor(companyId);
      return count !== null && count > 0;
    }
    return documentationNeedScore(need, `${item.label ?? ""} ${item.note ?? ""}`) > 0;
  });
}