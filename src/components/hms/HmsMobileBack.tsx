import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * Konsekvent mobil tilbakehandling for HMS-undersider (<768px).
 * Alltid pil + tekst, minst 44 px trykkflate, og en stabil foreldredestinasjon
 * (aldri history.back(), slik at dyplenker/refresh har en forutsigbar vei tilbake).
 * Skjult på desktop der sidene har egne headere.
 */
export function HmsMobileBack({ to = "/hms", label = "Til HMS" }: { to?: string; label?: string }) {
  return (
    <div className="md:hidden -mx-1 mb-2">
      <Link
        to={to}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary active:bg-muted"
      >
        <ArrowLeft className="h-5 w-5" />
        {label}
      </Link>
    </div>
  );
}
