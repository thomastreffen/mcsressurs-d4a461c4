/** TPX-000: skille økonomisk prosjekt fra operative jobber. */
export type EntityType = "financial_project" | "job" | "service" | "internal" | "unclassified";

export const ENTITY_LABELS: Record<EntityType, string> = {
  financial_project: "Prosjekt",
  job: "Jobb",
  service: "Serviceoppdrag",
  internal: "Intern aktivitet",
  unclassified: "Ikke avklart",
};

/** Kun økonomiske prosjekter kan kobles til Tripletex. */
export function canLinkTripletex(t: EntityType): boolean {
  return t === "financial_project";
}

export interface ClassifyInput {
  project_type: string | null;
  project_number: string | null;
  external_tripletex_id: string | null;
  has_tripletex_mapping: boolean;
  parent_is_financial: boolean;
  has_children: boolean;
}

export function suggestClassification(e: ClassifyInput): { type: EntityType; status: "auto" | "needs_review" } {
  if (e.project_number || e.external_tripletex_id || e.has_tripletex_mapping) return { type: "financial_project", status: "auto" };
  if (e.has_children) return { type: "financial_project", status: "needs_review" };
  if (e.parent_is_financial) return { type: "job", status: "auto" };
  if (e.project_type === "service") return { type: "service", status: "auto" };
  return { type: "unclassified", status: "needs_review" };
}
