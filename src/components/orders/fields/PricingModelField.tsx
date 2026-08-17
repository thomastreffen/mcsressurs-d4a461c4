import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import {
  normalizePricingModel,
  PRICING_MODEL_LABELS,
  type PricingModelType,
} from "@/lib/pricing-model";

interface PricingModelFieldProps {
  fieldKey: string;
  value: unknown;
  onChange: (value: { model: PricingModelType | null; fixed_price: number | null; note: string | null }) => void;
  disabled?: boolean;
  compact?: boolean;
  pricePlaceholder?: string;
}

/** Sammensatt felt: velg fastpris/timebasert – fastpris krever beløp. */
export function PricingModelField({
  fieldKey,
  value,
  onChange,
  disabled,
  compact,
  pricePlaceholder = "Fastpris eks. mva (kr)",
}: PricingModelFieldProps) {
  const current = normalizePricingModel(value);

  const setModel = (model: PricingModelType) =>
    onChange({
      model,
      fixed_price: model === "fastpris" ? current.fixed_price : null,
      note: current.note,
    });

  const setPrice = (raw: string) => {
    const parsed = raw === "" ? null : Number(raw.replace(/\s/g, "").replace(",", "."));
    onChange({
      model: current.model ?? "fastpris",
      fixed_price: parsed != null && Number.isFinite(parsed) ? parsed : null,
      note: current.note,
    });
  };

  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      <RadioGroup
        value={current.model ?? ""}
        onValueChange={(v) => setModel(v as PricingModelType)}
        disabled={disabled}
        className="flex flex-wrap gap-x-5 gap-y-2"
      >
        {(Object.keys(PRICING_MODEL_LABELS) as PricingModelType[]).map((m) => (
          <div key={m} className="flex items-center gap-2">
            <RadioGroupItem value={m} id={`${fieldKey}-${m}`} disabled={disabled} />
            <Label
              htmlFor={`${fieldKey}-${m}`}
              className={cn("font-normal cursor-pointer", compact ? "text-[11px]" : "text-sm")}
            >
              {PRICING_MODEL_LABELS[m]}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {current.model === "fastpris" && (
        <div className="rounded-md border border-border bg-muted/40 p-2.5 space-y-1">
          <Label
            htmlFor={`${fieldKey}-fixed-price`}
            className={cn("flex items-center gap-1", compact ? "text-[11px]" : "text-xs")}
          >
            Avtalt fastpris <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${fieldKey}-fixed-price`}
            type="number"
            min={0}
            step="1"
            inputMode="decimal"
            disabled={disabled}
            placeholder={pricePlaceholder}
            value={current.fixed_price ?? ""}
            onChange={(e) => setPrice(e.target.value)}
            className={compact ? "h-8 text-xs" : undefined}
          />
          <p className="text-[10px] text-muted-foreground">
            Fastpris må oppgis i kroner eks. mva.
          </p>
        </div>
      )}

      {current.model === "timebasert" && (
        <p className="text-[11px] text-muted-foreground">
          Arbeidet faktureres etter medgått tid og gjeldende timepriser.
        </p>
      )}
    </div>
  );
}

/** Statisk visning brukt i byggeren (canvas / forhåndsvisning). */
export function PricingModelPreview({ compact }: { compact?: boolean }) {
  return (
    <div className="space-y-1.5">
      <RadioGroup disabled className="flex gap-4">
        {(Object.keys(PRICING_MODEL_LABELS) as PricingModelType[]).map((m) => (
          <div key={m} className="flex items-center gap-1.5">
            <RadioGroupItem value={m} disabled className={compact ? "h-3.5 w-3.5" : undefined} />
            <span className={compact ? "text-[11px]" : "text-xs"}>{PRICING_MODEL_LABELS[m]}</span>
          </div>
        ))}
      </RadioGroup>
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-2 py-1.5">
        <span className="text-[10px] text-muted-foreground">
          Fastpris (kr) – vises og er påkrevd kun ved «Fastpris»
        </span>
      </div>
    </div>
  );
}
