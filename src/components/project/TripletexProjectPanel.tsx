import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Status = {
  entity_type: string | null;
  connection: { id: string; mode: string; tripletex_company_id: number | null } | null;
  project_link: { status: string; tripletex_id: number | null; tripletex_number: string | null; tripletex_name: string | null; last_verified_at: string | null } | null;
  customer: { name: string; org_number: string | null } | null;
  customer_link: { tripletex_id: number; tripletex_name: string | null } | null;
  last_operation: { operation: string; status: string; error_code: string | null; updated_at: string } | null;
};
type TtCustomer = { id: number; name: string; organizationNumber?: string; customerNumber?: number };
type TtProject = { id: number; number: string; name: string; customer?: { id: number; name?: string } | null; linked_to?: string | null };

const ERR: Record<string, string> = {
  number_exists: "Prosjektnummeret finnes allerede i Tripletex. Koble til det eksisterende i stedet.",
  timeout: "Tripletex svarte ikke i tide. Prøv igjen – det blir ikke opprettet dobbelt.",
  tripletex_rejected: "Tripletex avviste opprettelsen. Prøv igjen eller koble til eksisterende.",
  verify_failed: "Prosjektet kunne ikke verifiseres etter opprettelse.",
};

async function call(action: string, event_id: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("tripletex-project", { body: { action, event_id, ...extra } });
  if (error) {
    let msg = "Noe gikk galt mot Tripletex.";
    try { const b = await (error as any).context?.json(); if (b?.error) msg = b.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data;
}

export function TripletexProjectPanel({ eventId }: { eventId: string }) {
  const [st, setSt] = useState<Status | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pmOk, setPmOk] = useState(false);
  const [custQuery, setCustQuery] = useState("");
  const [custResults, setCustResults] = useState<TtCustomer[]>([]);
  const [projQuery, setProjQuery] = useState("");
  const [projResults, setProjResults] = useState<TtProject[] | null>(null);
  const [mode, setMode] = useState<"none" | "create" | "link">("none");

  const load = useCallback(async () => { try { setSt(await call("status", eventId)); } catch { setSt(null); } }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Feil"); }
    setBusy(null);
  };

  if (!st || st.entity_type !== "financial_project") return null;
  const linked = st.project_link?.status === "active";

  const openCreate = () => run("preview", async () => { setMode("create"); setPreview(await call("preview", eventId)); });
  const openLink = () => run("search", async () => {
    setMode("link"); const r = await call("search_projects", eventId, projQuery ? { query: projQuery } : {}); setProjResults(r.results);
  });
  const linkCustomer = (id: number) => run(`cust${id}`, async () => {
    await call("link_customer", eventId, { tripletex_customer_id: id }); toast.success("Kunden er koblet."); await load(); setPreview(await call("preview", eventId)); setCustResults([]);
  });
  const create = () => run("create", async () => {
    const r = await call("create", eventId, { confirm_pm_fallback: pmOk });
    if (r.result === "created" || r.result === "adopted" || r.result === "already_linked") { toast.success(`Koblet til Tripletex TEST (ID ${r.tripletex_id})`); setMode("none"); }
    else if (r.result === "in_progress") toast.info("Opprettelse pågår allerede.");
    else toast.error(ERR[r.result === "number_exists" ? "number_exists" : r.error_code] ?? "Opprettelsen feilet.");
    await load();
  });
  const linkProject = (id: number) => run(`p${id}`, async () => {
    const r = await call("link_project", eventId, { tripletex_project_id: id }); toast.success(`Koblet til Tripletex TEST-prosjekt ${r.number}`); setMode("none"); await load();
  });

  const customerLinked = preview?.customer_link ?? st.customer_link;
  const numberTaken = (preview?.existing_projects ?? []).length > 0;

  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Tripletex</CardTitle>
        <div className="flex gap-1.5">
          <Badge variant="outline">TEST</Badge>
          {linked ? <Badge>Koblet</Badge> : st.project_link?.status === "failed" ? <Badge variant="destructive">Feilet</Badge> : <Badge variant="secondary">Ikke koblet</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!st.connection && <p className="text-muted-foreground">Selskapet har ingen Tripletex TEST-tilkobling.</p>}
        {linked && (
          <p className="text-foreground">Koblet til Tripletex TEST · prosjekt <span className="font-mono">{st.project_link!.tripletex_number}</span> · intern ID <span className="font-mono">{st.project_link!.tripletex_id}</span>
            {st.project_link!.last_verified_at && <span className="text-muted-foreground"> · verifisert {format(new Date(st.project_link!.last_verified_at), "dd.MM.yyyy HH:mm")}</span>}</p>
        )}
        {linked && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(`/projects/new?parent=${eventId}`)}>Opprett jobb / serviceoppdrag under prosjektet</Button>
            <span className="text-xs text-muted-foreground">Jobber blir kun i Hub – ingen nye Tripletex-prosjekter.</span>
          </div>
        )}
        {st.last_operation && (
          <p className="text-muted-foreground">Siste handling: {st.last_operation.operation} – {st.last_operation.status === "succeeded" ? "fullført" : st.last_operation.status === "failed" ? `feilet${st.last_operation.error_code && ERR[st.last_operation.error_code] ? ` (${ERR[st.last_operation.error_code]})` : ""}` : st.last_operation.status}</p>
        )}
        {st.connection && !linked && (
          st.connection.mode !== "write_enabled"
            ? <p className="text-muted-foreground">Tilkoblingen er ikke åpnet for skriving.</p>
            : <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Ikke koblet – prosjektet er kun i Hub og synkes ikke med Tripletex.</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={openLink} disabled={!!busy}>{busy === "search" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Koble til eksisterende i Tripletex TEST</Button>
                  <Button size="sm" variant="ghost" onClick={openCreate} disabled={!!busy}>{busy === "preview" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Reserve: opprett i Tripletex TEST</Button>
                </div>
              </div>
        )}

        {mode === "create" && preview && !linked && (
          <div className="rounded-md border border-border p-3 space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Hub-selskap</dt><dd>{preview.company}</dd>
              <dt className="text-muted-foreground">Tilkobling</dt><dd>TEST · Tripletex-selskap {preview.connection.tripletex_company_id}</dd>
              <dt className="text-muted-foreground">Prosjektnummer</dt><dd>{preview.number ?? <span className="text-destructive">Mangler</span>}</dd>
              <dt className="text-muted-foreground">Navn</dt><dd>{preview.name}</dd>
              <dt className="text-muted-foreground">Startdato</dt><dd>{preview.start_date ?? "–"}</dd>
              <dt className="text-muted-foreground">Faktureringsmodell</dt><dd>{preview.billing_model ?? "Ikke satt"}</dd>
              <dt className="text-muted-foreground">Kunde</dt><dd>{preview.customer?.name ?? "Mangler"}{preview.customer?.org_number ? ` (${preview.customer.org_number})` : ""}{customerLinked ? ` · koblet (ID ${customerLinked.tripletex_id})` : <span className="text-destructive"> · ikke koblet</span>}</dd>
            </dl>

            {!customerLinked && preview.customer && (
              <div className="space-y-2">
                {preview.customer_suggestions.length === 1 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Forslag fra org.nr.: <b>{preview.customer_suggestions[0].name}</b> (ID {preview.customer_suggestions[0].id})</span>
                    <Button size="sm" onClick={() => linkCustomer(preview.customer_suggestions[0].id)} disabled={!!busy}>Bekreft kundekobling</Button>
                  </div>
                ) : <p className="text-muted-foreground">{preview.customer_suggestions.length === 0 ? "Ingen kunde med samme org.nr. i Tripletex." : "Flere kunder har samme org.nr. – velg manuelt."} Søk på org.nr., kundenummer eller navn:</p>}
                <div className="flex gap-2">
                  <Input value={custQuery} onChange={e => setCustQuery(e.target.value)} placeholder="Søk kunde i Tripletex TEST" className="h-8" />
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("cs", async () => setCustResults((await call("search_customers", eventId, { query: custQuery })).results))}>Søk</Button>
                </div>
                {custResults.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 border-t border-border pt-1">
                    <span>{c.name} · org.nr. {c.organizationNumber || "–"} · nr {c.customerNumber ?? "–"} · ID {c.id}</span>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => linkCustomer(c.id)}>Velg</Button>
                  </div>
                ))}
              </div>
            )}

            {numberTaken && (
              <p className="text-destructive">Nummeret {preview.number} finnes allerede i Tripletex TEST. Bruk «Koble til eksisterende».</p>
            )}
            {preview.pm_fallback ? (
              <label className="flex items-start gap-2">
                <Checkbox checked={pmOk} onCheckedChange={v => setPmOk(v === true)} />
                <span>Ingen ansattkobling ennå. Bruk testbrukeren bak API-nøkkelen ({preview.pm_fallback.name}) som prosjektleder – kun i TEST.</span>
              </label>
            ) : <p className="text-destructive">Fant ingen prosjektleder i Tripletex.</p>}
            <Button size="sm" onClick={create} disabled={!!busy || !customerLinked || !preview.number || numberTaken || !pmOk}>
              {busy === "create" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Opprett i Tripletex TEST
            </Button>
          </div>
        )}

        {mode === "link" && !linked && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex gap-2">
              <Input value={projQuery} onChange={e => setProjQuery(e.target.value)} placeholder="Prosjektnummer eller navn" className="h-8" />
              <Button size="sm" variant="outline" disabled={!!busy} onClick={openLink}>Søk</Button>
            </div>
            {projResults?.length === 0 && <p className="text-muted-foreground">Ingen treff i Tripletex TEST.</p>}
            {projResults?.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 border-t border-border pt-1">
                <span><span className="font-mono">{p.number}</span> {p.name} · {p.customer?.name ?? "uten kunde"} · ID {p.id}</span>
                {p.linked_to && p.linked_to !== eventId
                  ? <Badge variant="secondary">Koblet til annet prosjekt</Badge>
                  : <Button size="sm" variant="outline" disabled={!!busy} onClick={() => linkProject(p.id)}>Koble</Button>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
