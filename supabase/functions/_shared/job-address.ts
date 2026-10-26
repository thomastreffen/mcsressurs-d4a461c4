// Operative job address resolution shared by approval emails and calendar sync.
// Priority: event address (+postal/city) -> source order's oppdragssted address -> empty.
// Never falls back to invoice/customer office address.

type Rec = Record<string, unknown> | null | undefined;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

export function titleCaseCity(city: string): string {
  if (!city) return city;
  if (city !== city.toUpperCase()) return city;
  return city.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, p, c) => p + c.toUpperCase());
}

export function formatAddress(street: string, postal: string, city: string): string {
  // postal may contain "1850 MYSEN"
  let code = postal, town = city;
  const m = postal.match(/^(\d{4})\s+(.+)$/);
  if (m) { code = m[1]; town = town || m[2]; }
  const tail = [code, titleCaseCity(town)].filter(Boolean).join(" ");
  if (street && tail && !street.includes(code || "\u0000")) return `${street}, ${tail}`;
  return street || tail;
}

export function addressFromOrderSummary(summary: Rec): string {
  if (!summary) return "";
  const s = summary as Record<string, unknown>;
  const street = str(s.adresse) || str(s.address) || str(s.besoksadresse) || str(s.anleggsadresse);
  const code = str(s.postnummer) || str(s.postcode);
  const city = str(s.poststed) || str(s.city);
  return formatAddress(street, code, city);
}

export function addressFromEvent(event: Rec): string {
  if (!event) return "";
  const e = event as Record<string, unknown>;
  const street = str(e.address);
  if (!street) return "";
  return formatAddress(street, str(e.postal_code), str(e.city));
}

// deno-lint-ignore no-explicit-any
export async function resolveJobAddress(admin: any, event: Rec): Promise<string> {
  const direct = addressFromEvent(event);
  if (direct) return direct;
  const srcId = event && (event as Record<string, unknown>).source_order_form_id;
  if (!srcId) return "";
  const { data } = await admin.from("order_form_submissions").select("summary").eq("id", srcId).maybeSingle();
  return addressFromOrderSummary(data?.summary);
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
