import { useState } from "react";

/** Long text fields (description etc.) are clamped; newlines kept via whitespace-pre-wrap. Plain text only (no HTML). */
const LONG_THRESHOLD = 160;

function ClampedValue({ label, value }: { label: string; value: string }) {
  const [open, setOpen] = useState(false);
  const isLong = value.length > LONG_THRESHOLD || value.split("\n").length > 6;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div
        data-testid={`change-value-${label}`}
        className={
          "whitespace-pre-wrap break-words text-sm text-foreground " +
          (isLong && !open ? "line-clamp-6" : isLong ? "max-h-64 overflow-y-auto rounded border border-border/40 p-2" : "")
        }
      >
        {value || "Tomt"}
      </div>
      {isLong && (
        <button
          type="button"
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "Vis mindre" : "Vis hele teksten"}
        </button>
      )}
    </div>
  );
}

export function CriticalChangeRow({ label, oldValue, newValue }: { label: string; oldValue?: string | null; newValue?: string | null }) {
  const oldV = oldValue ?? "";
  const newV = newValue ?? "";
  const isLong = oldV.length > LONG_THRESHOLD || newV.length > LONG_THRESHOLD || /\n/.test(oldV + newV);
  if (!isLong) {
    return (
      <div className="space-y-0.5 text-sm">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground break-words">{oldV || "Tomt"} → {newV || "Tomt"}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">{label} <span className="font-normal text-muted-foreground">(tekst endret)</span></p>
      <ClampedValue label="Ny tekst" value={newV} />
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Vis tidligere tekst</summary>
        <div className="mt-1"><ClampedValue label="Tidligere" value={oldV} /></div>
      </details>
    </div>
  );
}
