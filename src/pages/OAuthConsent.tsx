import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";

type Result = { data: any; error: { message: string } | null };
const oauth = (supabase.auth as any).oauth as {
  getAuthorizationDetails(id: string): Promise<Result>;
  approveAuthorization(id: string): Promise<Result>;
  denyAuthorization(id: string): Promise<Result>;
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Lenken mangler forespørsel. Start tilkoblingen på nytt.");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        window.location.href = "/login?next=" + encodeURIComponent(window.location.pathname + window.location.search);
        return;
      }
      setEmail(sess.session.user.email ?? null);
      try {
        const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) return setError("Forespørselen er utløpt eller ugyldig. Start tilkoblingen på nytt.");
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) { window.location.href = immediate; return; }
        setDetails(data);
      } catch {
        if (active) setError("Kunne ikke hente forespørselen.");
      }
    })();
    return () => { active = false; };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const { data, error } = approve ? await oauth.approveAuthorization(authorizationId) : await oauth.denyAuthorization(authorizationId);
      const target = data?.redirect_url ?? data?.redirect_to;
      if (error || !target) { setBusy(false); return setError(approve ? "Godkjenning feilet. Prøv igjen." : "Avslag feilet. Prøv igjen."); }
      window.location.href = target;
    } catch {
      setBusy(false);
      setError("Noe gikk galt. Prøv igjen.");
    }
  }

  const client = details?.client?.name ?? details?.client?.client_name ?? "en ekstern app";
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !details ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laster …</div>
          ) : (
            <>
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h1 className="text-lg font-semibold">Koble {client} til MCS Hub</h1></div>
              <p className="text-sm">{client} vil kunne bruke Hubs verktøy som deg{email ? ` (${email})` : ""}.</p>
              <p className="text-xs text-muted-foreground">Dine vanlige rettigheter i Hub gjelder fortsatt. Tilkoblingen gir ingen ekstra tilgang.</p>
              {details?.redirect_uri && <p className="break-all text-xs text-muted-foreground">Sender tilbake til: {details.redirect_uri}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={() => decide(false)}>Avbryt tilkobling</Button>
                <Button disabled={busy} onClick={() => decide(true)}>Godkjenn</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
