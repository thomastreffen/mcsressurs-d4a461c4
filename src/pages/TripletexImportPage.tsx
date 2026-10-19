import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

type TtProject = {
  id: number; number: string; name: string; isClosed?: boolean; startDate?: string | null;
  customer?: { id: number; name?: string; customerNumber?: number; organizationNumber?: string } | null;
  projectManager?: { firstName?: string; lastName?: string } | null; linked_event_id?: string | null;
};
type Preview = { project: TtProject; title: string; linked_event_id: string | null; customer_decision: "linked" | "suggested" | "blocked"; customer_reason: string | null; hub_customer: { id: string; name: string; org_number: string | null } | null };
type HubCust = { id: string; name: string; org_number: string | null };

const REASON: Record<string, string> = {
  no_customer: "Prosjektet har ingen kunde i Tripletex.",
  no_match: "Ingen Hub-kunde har samme organisasjonsnummer. Velg kunde manuelt.",
  ambiguous: "Flere Hub-kunder har samme organisasjonsnummer. Velg riktig kunde manuelt.",
  customer_linked_elsewhere: "Valgt Hub-kunde er allerede koblet til en annen Tripletex-kunde.",
  customer_company: "Valgt kunde tilhører et annet selskap.",
};

export default function TripletexImportPage() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const [by, setBy] = useState<"name" | "number" | "customer">("name");
  const [q, setQ] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [results, setResults] = useState<TtProject[] | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [custQ, setCustQ] = useState("");
  const [custRes, setCustRes] = useState<HubCust[]>([]);
  const [manualCust, setManualCust] = useState<HubCust | null>(null);
  const [confirmCust, setConfirmCust] = useState(false);
  const [confirmClosed, setConfirmClosed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (!isSuperAdmin) return <div className="p-8 text-muted-foreground">Kun tilgjengelig for superadmin.</div>;

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("tripletex-import", { body: { action, company_id: activeCompanyId, ...extra } });
    if (error) {
      let msg = "Noe gikk galt mot Tripletex.";
      try { const b = await (error as any).context?.json(); if (b?.error) msg = b.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    return data;
  };
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Feil"); } setBusy(null); };

  const search = () => run("search", async () => { setPv(null); setResults((await call("search", { query: q, by, include_closed: includeClosed })).results); });
  const open = (p: TtProject) => run(`p${p.id}`, async () => {
    if (p.linked_event_id) { navigate(`/projects/${p.linked_event_id}`); return; }
    setManualCust(null); setConfirmCust(false); setConfirmClosed(false); setCustRes([]);
    setPv(await call("preview", { tripletex_project_id: p.id }));
  });
  const chosenCustomer = pv?.customer_decision === "linked" ? pv.hub_customer : manualCust ?? (pv?.customer_decision === "suggested" ? pv.hub_customer : null);
  const needsConfirm = pv?.customer_decision !== "linked";
  const canImport = !!pv && !!chosenCustomer && (!needsConfirm || confirmCust) && (!pv.project.isClosed || confirmClosed);
  const doImport = () => run("import", async () => {
    const r = await call("import", { tripletex_project_id: pv!.project.id, confirm_closed: confirmClosed, confirm_customer_id: needsConfirm ? chosenCustomer!.id : null });
    if (r.result === "imported" || r.result === "already_linked") {
      toast.success(r.result === "imported" ? "Prosjektet er hentet inn i Hub." : "Prosjektet var allerede koblet – åpner det.");
      navigate(`/projects/${r.event_id}`);
    } else if (r.result === "needs_customer_confirmation") toast.error(REASON[r.reason] ?? "Kunden må bekreftes.");
    else if (r.result === "needs_closed_confirmation") toast.error("Bekreft at du vil hente et avsluttet prosjekt.");
    else if (r.result === "in_progress") toast.info("Importen pågår allerede.");
    else toast.error("Importen feilet.");
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-xl h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">Hent prosjekt fra Tripletex <Badge variant="outline">TEST</Badge></h1>
          <p className="text-sm text-muted-foreground">Økonomiske prosjekter opprettes i Tripletex og hentes inn her. Jobber og arbeidspakker lages deretter i Hub.</p>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["name", "number", "customer"] as const).map((k) => (
              <Button key={k} size="sm" variant={by === k ? "default" : "outline"} onClick={() => setBy(k)}>{k === "name" ? "Navn" : k === "number" ? "Prosjektnummer" : "Kunde / org.nr."}</Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Søk i Tripletex TEST (tomt = vis åpne prosjekter)" />
            <Button onClick={search} disabled={!!busy}>{busy === "search" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Søk</Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><Checkbox checked={includeClosed} onCheckedChange={(v) => setIncludeClosed(v === true)} />Vis også avsluttede prosjekter</label>
          {results?.length === 0 && <p className="text-sm text-muted-foreground">Ingen treff.</p>}
          <div className="space-y-2">
            {results?.map((p) => (
              <div key={p.id} className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="space-y-0.5">
                  <div className="font-medium"><span className="font-mono">{p.number}</span> · {p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ID {p.id} · {p.customer?.name ?? "uten kunde"}{p.customer?.organizationNumber ? ` (${p.customer.organizationNumber})` : ""}
                    {p.projectManager ? ` · PL ${[p.projectManager.firstName, p.projectManager.lastName].filter(Boolean).join(" ")}` : ""}{p.startDate ? ` · start ${p.startDate}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.isClosed && <Badge variant="secondary">Avsluttet i Tripletex</Badge>}
                  {p.linked_event_id ? <Button size="sm" variant="outline" onClick={() => open(p)}>Allerede koblet – åpne</Button>
                    : <Button size="sm" onClick={() => open(p)} disabled={!!busy}>{busy === `p${p.id}` && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Velg</Button>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {pv && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">Kontroller før import</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Tripletex-prosjekt <span className="font-mono">{pv.project.number}</span> (ID {pv.project.id}) blir økonomisk prosjekt i Hub med tittel «{pv.title}».</p>
            {pv.project.isClosed && (
              <label className="flex items-start gap-2 rounded-md border p-2"><Checkbox checked={confirmClosed} onCheckedChange={(v) => setConfirmClosed(v === true)} />
                <span><b>Avsluttet i Tripletex.</b> Hent likevel som historisk referanse. Montører kan ikke legges til.</span></label>
            )}
            <div className="space-y-2">
              <p className="font-medium">Kunde: {pv.project.customer?.name ?? "–"} {pv.project.customer?.organizationNumber && <span className="text-muted-foreground">· org.nr. {pv.project.customer.organizationNumber}</span>}</p>
              {pv.customer_decision === "linked" && <p className="text-muted-foreground">Allerede koblet til Hub-kunden {pv.hub_customer?.name}.</p>}
              {pv.customer_decision === "suggested" && !manualCust && <p>Forslag: Hub-kunden <b>{pv.hub_customer?.name}</b> har samme organisasjonsnummer.</p>}
              {pv.customer_decision === "blocked" && !manualCust && <p className="text-muted-foreground">{REASON[pv.customer_reason ?? ""] ?? "Velg kunde manuelt."}</p>}
              {manualCust && <p>Valgt manuelt: <b>{manualCust.name}</b>{manualCust.org_number ? ` (${manualCust.org_number})` : ""}</p>}
              {needsConfirm && (
                <>
                  <div className="flex gap-2">
                    <Input value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder="Velg en annen Hub-kunde (søk på navn)" />
                    <Button size="sm" variant="outline" onClick={() => run("cust", async () => setCustRes((await call("search_hub_customers", { query: custQ, tripletex_project_id: pv.project.id })).results))}>Søk</Button>
                  </div>
                  {custRes.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded border p-2 text-xs">
                      <span>{c.name}{c.org_number ? ` · ${c.org_number}` : ""}</span>
                      <Button size="sm" variant="outline" onClick={() => { setManualCust(c); setConfirmCust(false); setCustRes([]); }}>Velg</Button>
                    </div>
                  ))}
                  {chosenCustomer && (
                    <label className="flex items-start gap-2"><Checkbox checked={confirmCust} onCheckedChange={(v) => setConfirmCust(v === true)} />
                      <span>Jeg bekrefter at Hub-kunden «{chosenCustomer.name}» er samme kunde som Tripletex-kunden «{pv.project.customer?.name}».</span></label>
                  )}
                </>
              )}
            </div>
            <Button onClick={doImport} disabled={!canImport || !!busy}>{busy === "import" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Hent inn i Hub</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
