import { useEffect, useState } from "react";
import { invokeWithSession } from "@/lib/invoke-session";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { searchHubPlanningProjects } from "@/lib/resource-plan-projects";
import {
  mergeProjectResults, tripletexSearchBy, rowLabel, rowStatusLabel, groupProjectResults, canPlanNewJob,
  type PickerRow, type HubLinkedProject, type TripletexProjectHit,
} from "@/lib/project-picker";

const REASON: Record<string, string> = {
  no_customer: "Prosjektet har ingen kunde i Tripletex.",
  no_match: "Ingen Hub-kunde har samme organisasjonsnummer. Velg kunde manuelt.",
  ambiguous: "Flere Hub-kunder har samme organisasjonsnummer. Velg riktig kunde manuelt.",
  customer_linked_elsewhere: "Kunden er allerede koblet til en annen Tripletex-kunde.",
  customer_company: "Kunden tilhører et annet selskap.",
};

type Preview = {
  customer_decision: "linked" | "suggested" | "blocked";
  customer_reason: string | null;
  hub_customer: { id: string; name: string; org_number: string | null } | null;
  project: { customer?: { name?: string; organizationNumber?: string } | null; isClosed?: boolean | null };
  linked_event_id: string | null;
};

interface Props {
  companyId: string | null;
  canUseTripletex: boolean;
  onSelected: (p: { eventId: string; label: string; customer: string | null }) => void;
}

/**
 * Financial-project picker for the resource-plan EventDrawer.
 * Hub: all eligible same-company parents (caller RLS). Tripletex TEST: additive on-demand
 * search + canonical F4 import (tripletex-import) incl. customer confirmation.
 */
export function UnifiedProjectPicker({ companyId, canUseTripletex, onSelected }: Props) {
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [rows, setRows] = useState<PickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [ttError, setTtError] = useState<string | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);
  const [active, setActive] = useState<Extract<PickerRow, { source: "tripletex" }> | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [custQ, setCustQ] = useState("");
  const [custHits, setCustHits] = useState<{ id: string; name: string; org_number: string | null }[]>([]);
  const [manualCust, setManualCust] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const tt = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await invokeWithSession("tripletex-import", { body: { action, company_id: companyId, ...extra } });
    if (error) throw new Error((data as any)?.error ?? error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  useEffect(() => {
    setRows([]); setActive(null); setPv(null); setManualCust(null);
    if (!companyId) { setLoading(false); return; }
    const term = q.trim();
    let alive = true;
    const h = setTimeout(async () => {
      setLoading(true); setTtError(null); setHubError(null);
      const hubP = searchHubPlanningProjects(companyId, term).catch((e) => {
        if (alive) setHubError(e.message);
        return [];
      });
      const ttP = canUseTripletex && term.length >= 1
        ? tt("search", { query: term, by: tripletexSearchBy(term), include_closed: showClosed }).catch((e) => { if (alive) setTtError(e.message); return { results: [] }; })
        : Promise.resolve({ results: [] });
      const [hubR, ttR] = await Promise.all([hubP, ttP]);
      if (!alive) return;
      setRows(mergeProjectResults(hubR as HubLinkedProject[], (ttR.results ?? []) as TripletexProjectHit[]));
      setLoading(false);
    }, 300);
    return () => { alive = false; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, showClosed, companyId, canUseTripletex]);

  useEffect(() => {
    if (custQ.trim().length < 2 || !active) { setCustHits([]); return; }
    const h = setTimeout(async () => {
      try { setCustHits((await tt("search_hub_customers", { query: custQ, tripletex_project_id: active.tripletexId })).results ?? []); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custQ, active]);

  const pickTripletex = async (r: Extract<PickerRow, { source: "tripletex" }>) => {
    if (!canPlanNewJob(r.status)) return;
    setActive(r); setPv(null); setManualCust(null); setCustQ("");
    try {
      const p = await tt("preview", { tripletex_project_id: r.tripletexId });
      if (p.linked_event_id) { onSelected({ eventId: p.linked_event_id, label: rowLabel(r), customer: r.customer }); setActive(null); return; }
      if (p.project?.isClosed !== false) { toast.error(p.project?.isClosed ? "Avsluttet i Tripletex – kan ikke brukes til ny jobb" : "Fikk ikke bekreftet at prosjektet er åpent"); setActive(null); return; }
      setPv(p);
    } catch (e: any) { toast.error(e.message); setActive(null); }
  };

  const chosenCustomer = pv?.customer_decision === "linked" ? pv.hub_customer : manualCust ?? (pv?.customer_decision === "suggested" ? pv.hub_customer : null);

  const runImport = async () => {
    if (!active || !pv) return;
    setBusy(true);
    try {
      const r = await tt("import", {
        tripletex_project_id: active.tripletexId,
        confirm_customer_id: pv.customer_decision === "linked" ? null : chosenCustomer?.id ?? null,
      });
      if ((r.result === "imported" || r.result === "already_linked") && r.event_id) {
        toast.success(r.result === "imported" ? "Prosjektet er hentet inn fra Tripletex TEST" : "Prosjektet var allerede hentet inn");
        onSelected({ eventId: r.event_id, label: rowLabel(active), customer: active.customer });
        setActive(null); setPv(null);
      } else if (r.result === "needs_customer_confirmation") toast.error(REASON[r.reason] ?? "Kunden må bekreftes.");
      else if (r.result === "in_progress") toast.info("Importen pågår allerede. Prøv igjen om litt.");
      else toast.error("Kunne ikke hente inn prosjektet.");
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };

  if (active) {
    return (
      <div className="rounded-lg border border-border p-3 space-y-3" data-testid="tripletex-import-inline">
        <div>
          <p className="text-sm font-medium">{rowLabel(active)}</p>
          <p className="text-xs text-muted-foreground">{active.customer || "Ingen kunde"} · Hentes inn fra Tripletex TEST</p>
        </div>
        {!pv ? <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-2 text-xs">
            {pv.customer_decision === "linked" && <p className="text-muted-foreground">Kunden er koblet til Hub-kunden {pv.hub_customer?.name}.</p>}
            {pv.customer_decision === "suggested" && !manualCust && <p>Forslag: Hub-kunden <b>{pv.hub_customer?.name}</b> har samme organisasjonsnummer. Bekreft for å koble.</p>}
            {pv.customer_decision === "blocked" && !manualCust && <p className="text-muted-foreground">{REASON[pv.customer_reason ?? ""] ?? "Velg kunde manuelt."}</p>}
            {manualCust && <p>Valgt kunde: <b>{manualCust.name}</b></p>}
            {pv.customer_decision !== "linked" && (
              <div className="space-y-1">
                <Input value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder="Velg annen Hub-kunde…" className="h-8 text-xs" />
                {custHits.map((c) => (
                  <Button key={c.id} type="button" variant="ghost" onClick={() => { setManualCust(c); setCustHits([]); setCustQ(""); }}
                    className="w-full justify-start h-auto whitespace-normal text-left rounded px-2 py-1">{c.name}{c.org_number ? ` · ${c.org_number}` : ""}</Button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => { setActive(null); setPv(null); }}>Avbryt</Button>
          <Button type="button" size="sm" disabled={!pv || busy || !chosenCustomer} onClick={runImport}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            {pv?.customer_decision === "linked" ? "Hent inn og velg" : "Bekreft kunde, hent inn og velg"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk prosjektnr., navn, kunde eller org.nr." className="pl-9" />
      </div>
      {canUseTripletex && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showClosed} onCheckedChange={setShowClosed} /> Vis avsluttede
        </label>
      )}
      {loading && <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
      {ttError && <p className="text-[11px] text-destructive">Tripletex TEST: {ttError}</p>}
      {hubError && <p className="text-[11px] text-destructive">{hubError}</p>}
      {rows.length > 0 && (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border p-1">
          {groupProjectResults(rows, q).map((group) => (
            <section key={group.id} aria-label={group.label} className="mb-2 last:mb-0">
              <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground">{group.label}</h3>
              {group.rows.map((r) => {
            const blocked = r.source === "tripletex" ? !canPlanNewJob(r.status) : r.linked && r.status === "closed";
            return (
              <Button key={r.key} type="button" variant="ghost" disabled={blocked}
                onClick={() => r.source === "hub" ? onSelected({ eventId: r.eventId, label: rowLabel(r), customer: r.customer }) : pickTripletex(r)}
                className={cn("w-full h-auto block whitespace-normal text-left rounded-md px-3 py-2 text-sm transition-colors", blocked && "opacity-60 cursor-not-allowed")}>
                <div className="flex flex-col items-start gap-1">
                  <p className="font-medium break-words max-w-full">{rowLabel(r)}</p>
                  <p className="text-xs text-muted-foreground break-words max-w-full">{r.customer || "Ingen kunde"}</p>
                  <Badge variant={r.source === "hub" && r.linked ? "secondary" : "outline"} className="text-[10px] max-w-full whitespace-normal text-left">
                    {rowStatusLabel(r)}
                  </Badge>
                </div>
              </Button>
            );
              })}
            </section>
          ))}
        </div>
      )}
      {!loading && q.trim() && rows.length === 0 && <p className="text-xs text-muted-foreground px-1">Ingen prosjekter funnet.</p>}
    </div>
  );
}
