// ── Prismodell (fastpris / timebasert) ──
// Sammensatt feltverdi for order_form-feltet "pricing_model".

export type PricingModelType = "fastpris" | "timebasert";

export interface PricingModelValue {
  model: PricingModelType | null;
  fixed_price: number | null;
  note: string | null;
}

export const PRICING_MODEL_LABELS: Record<PricingModelType, string> = {
  fastpris: "Fastpris",
  timebasert: "Timebasert",
};

export const EMPTY_PRICING_MODEL: PricingModelValue = {
  model: null,
  fixed_price: null,
  note: null,
};

/** Tåler både objekt, JSON-streng og gammel ren tekstverdi. */
export function normalizePricingModel(raw: unknown): PricingModelValue {
  if (raw == null) return { ...EMPTY_PRICING_MODEL };

  let value: any = raw;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { ...EMPTY_PRICING_MODEL };
    if (trimmed.startsWith("{")) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        value = { model: trimmed };
      }
    } else {
      value = { model: trimmed };
    }
  }

  if (typeof value !== "object") return { ...EMPTY_PRICING_MODEL };

  const rawModel = String(value.model ?? "").toLowerCase();
  const model: PricingModelType | null =
    rawModel.startsWith("fast") ? "fastpris" : rawModel.startsWith("time") ? "timebasert" : null;

  const rawPrice = value.fixed_price ?? value.price ?? null;
  const parsedPrice =
    rawPrice === null || rawPrice === "" || rawPrice === undefined
      ? null
      : Number(String(rawPrice).replace(/\s/g, "").replace(",", "."));

  return {
    model,
    fixed_price: parsedPrice != null && Number.isFinite(parsedPrice) ? parsedPrice : null,
    note: value.note ? String(value.note) : null,
  };
}

/** Returnerer feilmelding, eller null når verdien er gyldig. */
export function validatePricingModel(
  raw: unknown,
  opts: { required: boolean; label: string },
): string | null {
  const value = normalizePricingModel(raw);
  if (!value.model) {
    return opts.required ? `${opts.label}: velg fastpris eller timebasert` : null;
  }
  if (value.model === "fastpris" && (value.fixed_price == null || value.fixed_price <= 0)) {
    return `${opts.label}: fastpris må fylles ut når fastpris er valgt`;
  }
  return null;
}

/** True når feltet er "utfylt" (brukes for påkrevd-sjekk og lagring). */
export function hasPricingModelValue(raw: unknown): boolean {
  return !!normalizePricingModel(raw).model;
}

export function formatCurrencyNok(amount: number): string {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPricingModel(raw: unknown): string {
  const value = normalizePricingModel(raw);
  if (!value.model) return "–";
  const parts = [PRICING_MODEL_LABELS[value.model]];
  if (value.model === "fastpris" && value.fixed_price != null) {
    parts.push(formatCurrencyNok(value.fixed_price));
  }
  if (value.note) parts.push(value.note);
  return parts.join(" · ");
}
