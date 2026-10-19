import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";

type Check = {
  status: string; message: string | null; http_status: number | null; request_id: string | null;
  company_id: number | null; company_name: string | null; checked_at: string; latency_ms: number | null;
};

const LABEL: Record<string, { text: string; variant: "default" | "secondary" | "destructive" }> = {
  ok: { text: "Tilkoblet testmiljø", variant: "default" },
  not_configured: { text: "Ikke konfigurert", variant: "secondary" },
  auth_failed: { text: "Feil: autentisering", variant: "destructive" },
  wrong_company: { text: "Feil: feil selskap", variant: "destructive" },
  api_error: { text: "Feil: Tripletex", variant: "destructive" },
  network_error: { text: "Feil: nettverk", variant: "destructive" },
};

export default function TripletexTestHealthPage() {
  const [last, setLast] = useState<Check | null>(null);
  const [projects, setProjects] = useState<{ id: number; number: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("tripletex_health_checks").select("*").order("checked_at", { ascending: false }).limit(1)
      .then(({ data }) => data?.[0] && setLast(data[0] as Check));
  }, []);

  const run = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("tripletex-test-health", { body: {} });
    setBusy(false);
    if (error || !data) {
      setLast({ status: "api_error", message: "Kunne ikke kjøre sjekken.", http_status: null, request_id: null, company_id: null, company_name: null, checked_at: new Date().toISOString(), latency_ms: null });
      return;
    }
    setLast(data); setProjects(data.projects ?? []);
  };

  const l = last ? LABEL[last.status] ?? LABEL.api_error : null;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tripletex – testtilkobling</h1>
        <p className="text-sm text-muted-foreground mt-1">Kun lesing mot Tripletex testmiljø. Ingenting endres i Tripletex. Krever secret <span className="font-mono">TRIPLETEX_TEST_API_TOKEN</span> (API-nøkkel fra testmiljøet).</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Status</CardTitle>
          {l ? <Badge variant={l.variant}>{l.text}</Badge> : <Badge variant="secondary">Ikke sjekket</Badge>}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {last && (
            <div className="space-y-1">
              <p className="text-foreground">{last.message}</p>
              {last.company_id && <p className="text-muted-foreground">Selskap: {last.company_name ?? "–"} (ID {last.company_id})</p>}
              <p className="text-muted-foreground">
                Siste sjekk: {format(new Date(last.checked_at), "dd.MM.yyyy HH:mm:ss")}
                {last.http_status ? ` · HTTP ${last.http_status}` : ""}{last.latency_ms ? ` · ${last.latency_ms} ms` : ""}
              </p>
              {last.request_id && <p className="font-mono text-xs text-muted-foreground">Request-ID: {last.request_id}</p>}
            </div>
          )}
          <Button onClick={run} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Test tilkobling
          </Button>
        </CardContent>
      </Card>
      {projects.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Testprosjekter (de første {projects.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {projects.map(p => <li key={p.id}><span className="font-mono text-muted-foreground">{p.number}</span> {p.name}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
