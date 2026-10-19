import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type Conn = {
  id: string; company_id: string; environment: string; secret_name: string; expected_tripletex_company_id: number | null;
  mode: string; capabilities: string[]; last_health_status: string | null; last_health_at: string | null;
};
type Company = { id: string; name: string };

const STATUS: Record<string, { text: string; variant: "default" | "secondary" | "destructive" }> = {
  ok: { text: "Tilkoblet", variant: "default" },
  not_configured: { text: "Ikke konfigurert", variant: "secondary" },
  disabled: { text: "Avslått", variant: "secondary" },
  auth_failed: { text: "Feil: innlogging", variant: "destructive" },
  wrong_company: { text: "Feil: feil selskap", variant: "destructive" },
  api_error: { text: "Feil: Tripletex", variant: "destructive" },
  network_error: { text: "Feil: nettverk", variant: "destructive" },
};
const MODES = { off: "Av", read_only: "Kun lesing", write_enabled: "Lesing og skriving" } as const;

export default function TripletexTestHealthPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [conns, setConns] = useState<Conn[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const load = async () => {
    const [{ data: c }, { data: t }] = await Promise.all([
      supabase.from("internal_companies").select("id,name").eq("is_active", true).order("name"),
      supabase.from("tripletex_connections").select("*"),
    ]);
    setCompanies(c ?? []); setConns((t ?? []) as Conn[]);
  };
  useEffect(() => { load(); }, []);

  const test = async (id: string) => {
    setBusy(id);
    const { data, error } = await supabase.functions.invoke("tripletex-test-health", { body: { connection_id: id } });
    setBusy(null);
    setMsg(m => ({ ...m, [id]: error || !data ? "Kunne ikke kjøre sjekken." : `${data.message}${data.company_name ? ` · ${data.company_name} (${data.company_id})` : ""}` }));
    load();
  };
  const setMode = async (c: Conn, mode: string) => {
    if (mode !== "off" && !c.expected_tripletex_company_id) return toast.error("Forventet Tripletex-selskap må være satt først.");
    const { error } = await supabase.from("tripletex_connections").update({ mode, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) toast.error("Kunne ikke endre modus."); else load();
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrasjoner – Tripletex</h1>
        <p className="text-sm text-muted-foreground mt-1">Hvert selskap har sin egen Tripletex-tilkobling. Data fra ett selskap kan aldri sendes til et annet selskaps Tripletex.</p>
      </div>
      {companies.map(co => {
        const list = conns.filter(c => c.company_id === co.id);
        return (
          <Card key={co.id}>
            <CardHeader><CardTitle className="text-base">{co.name}</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              {list.length === 0 && <p className="text-muted-foreground">Ingen Tripletex-tilkobling ennå.</p>}
              {list.map(c => {
                const s = c.last_health_status ? STATUS[c.last_health_status] ?? STATUS.api_error : null;
                return (
                  <div key={c.id} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{c.environment === "test" ? "Testmiljø" : "Produksjon"}</Badge>
                      {s ? <Badge variant={s.variant}>{s.text}</Badge> : <Badge variant="secondary">Ikke sjekket</Badge>}
                      <span className="text-muted-foreground">Tripletex-selskap: {c.expected_tripletex_company_id ?? "ikke satt"}</span>
                    </div>
                    {c.last_health_at && <p className="text-muted-foreground">Siste sjekk: {format(new Date(c.last_health_at), "dd.MM.yyyy HH:mm")}</p>}
                    {msg[c.id] && <p className="text-foreground">{msg[c.id]}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={c.mode} onValueChange={v => setMode(c, v)}>
                        <SelectTrigger className="w-[200px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(MODES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" onClick={() => test(c.id)} disabled={busy === c.id} className="gap-1.5">
                        {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Test tilkobling
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
