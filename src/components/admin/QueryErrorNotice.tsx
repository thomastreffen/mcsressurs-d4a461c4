// Shown when an admin status read fails, so a card never looks empty or falsely "all clear".
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function QueryErrorNotice({ what, error, onRetry, retrying }: { what: string; error: unknown; onRetry: () => void; retrying?: boolean }) {
  const msg = (error as Error)?.message ?? "ukjent feil";
  return <div role="alert" className="space-y-2 text-sm">
    <p className="text-destructive">Kunne ikke hente {what}: {msg}. Ingenting er endret.</p>
    <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>{retrying && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Prøv igjen</Button>
  </div>;
}
