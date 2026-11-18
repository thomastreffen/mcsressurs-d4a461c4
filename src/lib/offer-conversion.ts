export type OfferConversionPreview = {
  offer_id: string; offer_number: string | null; status: string; accepted_at: string | null; accepted_name: string | null; total_ex_vat: number | null;
  has_snapshot: boolean; title: string | null; customer_name: string | null; account_name: string | null; contact_name: string | null;
  existing_project_id: string | null; tripletex_integrated: boolean; convertible: boolean;
};
const MAP: Record<string, string> = {
  offer_not_accepted: "Tilbudet er ikke akseptert",
  offer_customer_missing: "Tilbudet mangler kobling til kundekort",
  project_not_available: "Prosjektet finnes ikke i dette selskapet",
  project_has_other_offer: "Prosjektet er allerede koblet til et annet tilbud",
  project_customer_mismatch: "Prosjektet tilhører en annen kunde",
  tripletex_company_link_only: "Selskapet bruker Tripletex – koble til eksisterende prosjekt",
  invalid_title: "Prosjektnavn mangler",
  not_available: "Du har ikke tilgang til å konvertere dette tilbudet",
};
export function conversionError(message: string) {
  const key = Object.keys(MAP).find((k) => message.includes(k));
  return key ? MAP[key] : "Kunne ikke fullføre konverteringen";
}
