import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Row = { technician_id: string; name: string; email: string | null; state: "not_linked" | "ready" | "participant" | "error" | "wrong_company" | "identity_unresolved"; employee_link: { tripletex_id: number; number: string | null } | null; last_error: string | null };
type Status = { relevant: boolean; is_self?: boolean; financial_project?: { project_number: string | null }; project_link?: { tripletex_id: number; number: string | null } | null; participants_known?: boolean; project_closed?: boolean | null; technicians?: Row[] };
type TtEmp = { id: number; firstName?: string; lastName?: string; employeeNumber?: string | null; email?: string | null; linked_to?: string | null; linked_to_self?: boolean };

const LABEL: Record<Row["state"], string> = { not_linked: "Ikke koblet ansatt", ready: "Klar for Tripletex", participant: "Deltaker", error: "Feil", wrong_company: "Annet selskap", identity_unresolved: "Ansattidentitet mangler" };
const ERR: Record<string, string> = { timeout: "Tripletex svarte ikke i tide – prøv igjen, det blir ikke dobbel deltaker.", tripletex_rejected: "Tripletex avviste deltakeren.", verify_failed: "Deltakeren kunne ikke bekreftes etter lagring." };

async function call(action: string, event_id: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("tripletex-participants", { body: { action, event_id, ...extra } });
  if (error) {
    let msg = "Noe gikk galt mot Tripletex.";
    try { const b = await (error as any).context?.json(); if (b?.error) msg = b.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data;
}

export function TripletexParticipantsPanel({ eventId }: { eventId: string }) {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TtEmp[] | null>(null);

  const load = useCallback(async () => { try { setSt(await call("status", eventId)); } catch { setSt(null); } }, [eventId]);
  useEffect(() => { load(); }, [load]);
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Feil"); } setBusy(null); };

  if (!st?.relevant || !st.technicians?.length) return null;
  const pnum = st.project_link?.number ?? st.financial_project?.project_number ?? "";

  const describe = (r: Row) => {
    if (r.state === "identity_unresolved") return `${r.name}: Ansattidentitet må kobles i Hub før Tripletex kan brukes.`;
    if (r.state === "not_linked") return `${r.name} er ikke koblet til en Tripletex-ansatt.`;
    if (r.state === "wrong_company") return `${r.name} er ikke ansatt i samme selskap som Tripletex-tilkoblingen.`;
    if (r.state === "participant") return `${r.name} er deltaker på prosjekt ${pnum} (ansatt ${r.employee_link?.tripletex_id}).`;
    if (r.state === "error") return `${r.name}: ${ERR[r.last_error ?? ""] ?? "siste forsøk feilet"} Prøv igjen.`;
    return `${r.name} er koblet til Tripletex-ansatt ${r.employee_link?.tripletex_id}, men er ikke deltaker på prosjekt ${pnum}.`;
  };
  const search = (r: Row, query: string) => run(`s${r.technician_id}`, async () => { setOpenFor(r.technician_id); const x = await call("search_employees", eventId, { technician_id: r.technician_id, query }); setResults(x.results); });
  const link = (r: Row, id: number) => run(`l${id}`, async () => { await call("link_employee", eventId, { technician_id: r.technician_id, tripletex_employee_id: id }); toast.success(`${r.name} er koblet til Tripletex-ansatt ${id}.`); setOpenFor(null); setResults(null); await load(); });
  const add = (r: Row) => run(`a${r.technician_id}`, async () => {
    const x = await call("add_participant", eventId, { technician_id: r.technician_id });
    if (x.result === "added") toast.success(`${r.name} er lagt til som deltaker på prosjekt ${pnum}.`);
    else if (x.result === "already_participant") toast.info(`${r.name} er allerede deltaker.`);
    else if (x.result === "in_progress") toast.info("Pågår allerede.");
    else toast.error(ERR[x.error_code] ?? "Feilet.");
    await load();
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">Tripletex – deltakere <Badge variant="outline">TEST</Badge></CardTitle>
        <p className="text-xs text-muted-foreground">{st.is_self ? "Montører på dette prosjektet" : `Jobben hører til prosjekt ${pnum}`}. Gjør prosjektet tilgjengelig for timeføring i Tripletex.</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!st.project_link && <p className="text-muted-foreground">Prosjektet må kobles til Tripletex TEST før montører kan legges til.</p>}
        {st.project_link && st.project_closed === true && <p className="font-medium">Prosjekt avsluttet i Tripletex – montører kan ikke legges til.</p>}
        {st.project_link && st.project_closed === null && st.participants_known && <p className="text-destructive">Fikk ikke bekreftet at prosjektet er åpent i Tripletex.</p>}
        {st.project_link && st.participants_known === false && <p className="text-destructive">Fikk ikke lest deltakere fra Tripletex nå.</p>}
        {st.technicians.map((r) => (
          <div key={r.technician_id} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{r.name}</span>
              <Badge variant={r.state === "participant" ? "default" : r.state === "error" ? "destructive" : "secondary"}>{LABEL[r.state]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{describe(r)}</p>
            {r.state === "not_linked" && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { setQ(r.email ?? r.name); search(r, r.email ?? r.name); }}>
                {busy === `s${r.technician_id}` && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Koble ansatt
              </Button>
            )}
            {(r.state === "ready" || r.state === "error") && st.project_link && st.project_closed === false && (
              <Button size="sm" disabled={!!busy} onClick={() => add(r)}>
                {busy === `a${r.technician_id}` && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Legg montør til i Tripletex TEST
              </Button>
            )}
            {openFor === r.technician_id && (
              <div className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="E-post, ansattnummer eller navn" />
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => search(r, q)}>Søk</Button>
                </div>
                {results?.length === 0 && <p className="text-xs text-muted-foreground">Ingen treff. Velg aldri på navn alene – søk gjerne på e-post eller ansattnummer.</p>}
                {results?.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
                    <span>{[e.firstName, e.lastName].filter(Boolean).join(" ")} · ID {e.id}{e.employeeNumber ? ` · nr. ${e.employeeNumber}` : ""}{e.email ? ` · ${e.email}` : ""}</span>
                    {e.linked_to && !e.linked_to_self
                      ? <Badge variant="secondary">Koblet til annen</Badge>
                      : <Button size="sm" variant="outline" disabled={!!busy} onClick={() => link(r, e.id)}>Velg</Button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
