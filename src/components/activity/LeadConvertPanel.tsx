import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRightLeft, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { conversionError, type OfferConversionPreview } from "@/lib/offer-conversion";

interface LeadConvertPanelProps {
  lead: { id: string; company_name: string; notes: string | null; company_id: string | null; estimated_value: number };
  participants: { user_id: string; role: string }[];
  offers: { id: string; offer_number: string; status: string }[];
  onConverted: (projectId: string) => void;
  onCancel: () => void;
  logActivity: (data: any) => Promise<void>;
}

/** Accepted offer -> link existing or create Hub project. Server-side, one-shot, explicit confirmation. No technicians, calendar or e-mail. */
export function LeadConvertPanel({ lead, offers, onConverted, onCancel }: LeadConvertPanelProps) {
  const navigate = useNavigate();
  const accepted = offers.find((o) => o.status === "accepted" || o.status === "signed");
  const [preview, setPreview] = useState<OfferConversionPreview | null>(null);
  const [mode, setMode] = useState<"link" | "create">("link");
  const [title, setTitle] = useState("");
  const [q, setQ] = useState("");
  const [projects, setProjects] = useState<{ id: string; title: string; project_number: string | null }[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestId = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    if (!accepted) return;
    supabase.rpc("offer_conversion_preview", { _offer_id: accepted.id }).then(({ data, error }) => {
      if (error) { toast.error("Ingen tilgang til å konvertere dette tilbudet"); return; }
      const p = data as unknown as OfferConversionPreview; setPreview(p); setTitle(p.title ?? "");
      if (!p.tripletex_integrated) setMode("link");
    });
  }, [accepted?.id]);

  useEffect(() => {
    if (!lead.company_id || mode !== "link") return;
    const t = setTimeout(async () => {
      let query = supabase.from("events").select("id, title, project_number").eq("company_id", lead.company_id!).eq("entity_type", "financial_project").is("deleted_at", null).is("offer_id", null).order("created_at", { ascending: false }).limit(15);
      if (q.trim()) query = query.or(`title.ilike.%${q.trim().replace(/[%,()]/g, "")}%,project_number.ilike.%${q.trim().replace(/[%,()]/g, "")}%`);
      const { data } = await query; setProjects((data as any) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode, lead.company_id]);

  const confirm = async () => {
    if (!accepted) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("convert_offer_to_project", { _offer_id: accepted.id, _mode: mode, _project_id: projectId as any, _title: title, _request_id: requestId });
    setBusy(false);
    if (error) { toast.error(conversionError(error.message)); return; }
    const r = data as { status: string; project_id: string };
    toast.success(r.status === "already_linked" ? "Tilbudet var allerede koblet til et prosjekt" : r.status === "linked" ? "Tilbud koblet til prosjekt" : "Prosjekt opprettet");
    onConverted(r.project_id); navigate(`/projects/${r.project_id}`);
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="py-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" />Akseptert tilbud → prosjekt</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Lukk" onClick={onCancel}><X className="h-4 w-4" /></Button>
        </div>
        {!accepted && <p className="text-sm text-muted-foreground">Prosjekt kan først opprettes eller kobles når et tilbud er akseptert. Henvendelsen er markert som vunnet; ingen prosjekt opprettes automatisk.</p>}
        {accepted && !preview && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {preview && (
          <>
            {preview.existing_project_id ? (
              <div className="space-y-2"><p className="text-sm">Tilbudet er allerede koblet til et prosjekt.</p><Button className="rounded-xl" onClick={() => navigate(`/projects/${preview.existing_project_id}`)}>Åpne prosjekt</Button></div>
            ) : !preview.convertible ? (
              <p className="text-sm text-muted-foreground">Tilbudet mangler kobling til kundekort og kan ikke konverteres. Koble kunden på tilbudet først.</p>
            ) : (
              <>
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm space-y-1" aria-label="Forhåndsvisning">
                  <p><span className="text-muted-foreground">Kunde:</span> {preview.customer_name}{preview.account_name ? ` – ${preview.account_name}` : ""}</p>
                  {preview.contact_name && <p><span className="text-muted-foreground">Kontakt:</span> {preview.contact_name}</p>}
                  <p><span className="text-muted-foreground">Tilbud:</span> {preview.offer_number ?? "–"} · {Number(preview.total_ex_vat ?? 0).toLocaleString("nb-NO")} kr eks. mva · akseptert {preview.accepted_at ? new Date(preview.accepted_at).toLocaleDateString("nb-NO") : ""}{preview.accepted_name ? ` av ${preview.accepted_name}` : ""}</p>
                  <p className="text-xs text-muted-foreground">Akseptert versjon {preview.has_snapshot ? "er låst som snapshot" : "har ikke lagret snapshot"}. Ingen montører, kalender eller e-post opprettes.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={mode === "link" ? "default" : "outline"} className="rounded-xl min-h-11 sm:min-h-9" onClick={() => { setMode("link"); setConfirmed(false); }}>Koble til eksisterende prosjekt</Button>
                  <Button size="sm" variant={mode === "create" ? "default" : "outline"} className="rounded-xl min-h-11 sm:min-h-9" disabled={preview.tripletex_integrated} onClick={() => { setMode("create"); setConfirmed(false); }}>Opprett nytt prosjekt</Button>
                </div>
                {preview.tripletex_integrated && <p className="text-xs text-muted-foreground">Selskapet bruker Tripletex: nye økonomiske prosjekter opprettes i Tripletex og importeres; her kan du bare koble til eksisterende.</p>}
                {mode === "link" ? (
                  <div className="space-y-2">
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk prosjektnavn eller nummer" aria-label="Søk prosjekt" />
                    <div className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                      {projects.length === 0 && <p className="p-3 text-sm text-muted-foreground">Ingen ledige prosjekter funnet.</p>}
                      {projects.map((p) => (
                        <button key={p.id} type="button" onClick={() => { setProjectId(p.id); setConfirmed(false); }} className={`w-full text-left p-3 text-sm min-h-11 ${projectId === p.id ? "bg-muted" : "hover:bg-muted/50"}`}>
                          {p.project_number ? `${p.project_number} · ` : ""}{p.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1"><Label htmlFor="conv-title">Prosjektnavn</Label><Input id="conv-title" value={title} onChange={(e) => { setTitle(e.target.value); setConfirmed(false); }} /></div>
                )}
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />Kunde, tilbud og prosjekt er kontrollert</label>
                <Button className="w-full rounded-xl min-h-11" disabled={busy || !confirmed || (mode === "link" ? !projectId : !title.trim())} onClick={confirm}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Bekreft
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
