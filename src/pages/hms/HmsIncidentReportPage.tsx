import { useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Camera, ChevronLeft, Loader2, X, ShieldAlert, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useChemicals } from "@/hooks/useChemicals";
import { CHEMICAL_ISSUE_TYPES } from "@/lib/hms/chemicals";

import { useToast } from "@/hooks/use-toast";
import { logHmsAudit } from "@/lib/hms/audit";
import { cn } from "@/lib/utils";

type Severity = "low" | "medium" | "high" | "critical";
type IncidentType = "hms" | "near_miss" | "personal_injury" | "material_damage" | "quality" | "environment" | "observation";

const TYPE_LABELS: Record<IncidentType, string> = {
  hms: "HMS-avvik",
  near_miss: "Nestenulykke",
  personal_injury: "Personskade",
  material_damage: "Materiell skade",
  quality: "Kvalitet",
  environment: "Miljø",
  observation: "HMS-observasjon",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  low: "Lav",
  medium: "Middels",
  high: "Høy",
  critical: "Kritisk",
};

const SEVERITY_STYLES: Record<Severity, string> = {
  low: "border-emerald-300 bg-emerald-50 text-emerald-800",
  medium: "border-amber-300 bg-amber-50 text-amber-800",
  high: "border-orange-400 bg-orange-50 text-orange-900",
  critical: "border-rose-500 bg-rose-50 text-rose-900",
};

export default function HmsIncidentReportPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search] = useSearchParams();
  const initialType = (search.get("type") as IncidentType) || "hms";

  const [incidentType, setIncidentType] = useState<IncidentType>(
    Object.keys(TYPE_LABELS).includes(initialType) ? initialType : "hms"
  );
  const [severity, setSeverity] = useState<Severity>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [proposedAction, setProposedAction] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [chemicalId, setChemicalId] = useState<string | null>(null);
  const [chemicalIssueType, setChemicalIssueType] = useState<string | null>(null);
  const { data: chemicals = [] } = useChemicals();

  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);

  // Optional projects for selection
  const { data: projects } = useQuery({
    queryKey: ["hms-incident-projects", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("projects")
        .select("id, project_number, name")
        .eq("company_id", activeCompanyId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(20);
      return (data ?? []) as any[];
    },
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId || !user) throw new Error("Mangler kontekst");
      if (!title.trim()) throw new Error("Tittel er påkrevd");
      const sb = supabase as any;

      // 1. Create incident
      const { data: incident, error } = await sb
        .from("hms_incidents")
        .insert({
          company_id: activeCompanyId,
          incident_type: incidentType,
          severity,
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          proposed_action: proposedAction.trim() || null,
          project_id: projectId,
          chemical_id: chemicalId,
          chemical_issue_type: chemicalId ? chemicalIssueType : null,

          reported_by: user.id,
          occurred_at: new Date().toISOString(),
          status: "open",
        })
        .select("id")
        .single();
      if (error) throw error;

      // 2. Upload files (if any) to hms-attachments/incidents/{id}/...
      const uploaded: { name: string; path: string; size: number; type: string }[] = [];
      for (const f of files) {
        const safeName = f.name.replace(/[^\w.\-]/g, "_");
        const path = `incidents/${incident.id}/${Date.now()}-${safeName}`;
        const { error: upErr } = await sb.storage
          .from("hms-attachments")
          .upload(path, f, { upsert: false, contentType: f.type });
        if (!upErr) {
          uploaded.push({ name: f.name, path, size: f.size, type: f.type });
        }
      }
      if (uploaded.length > 0) {
        await sb.from("hms_incidents").update({ attachments: uploaded }).eq("id", incident.id);
      }

      // 3. Audit
      await logHmsAudit({
        company_id: activeCompanyId,
        action: "incident.reported",
        entity_type: "hms_incident",
        entity_id: incident.id,
        payload: { severity, type: incidentType, attachments: uploaded.length },
      }).catch(() => {});

      return incident.id as string;
    },
    onSuccess: (id) => {
      setSubmitted({ id });
    },
    onError: (e: any) => {
      toast({
        title: "Kunne ikke sende inn",
        description: e?.message ?? "Ukjent feil",
        variant: "destructive",
      });
    },
  });

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...list].slice(0, 8));
    e.target.value = "";
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-background flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 grid place-items-center">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-semibold">Avvik registrert</h1>
            <p className="text-sm text-muted-foreground">
              Takk for at du meldte fra. {severity === "critical" || severity === "high"
                ? "HMS-leder er varslet umiddelbart."
                : "HMS-leder vil følge opp."}
            </p>
            <div className="text-xs font-medium text-emerald-700">Avviket er sendt inn</div>
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => navigate(`/hms/incidents?highlight=${submitted.id}`)}>Se avvik</Button>
              <Button variant="outline" onClick={() => navigate("/hms/mobile")}>Til HMS mobil</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSubmitted(null);
                  setTitle(""); setDescription(""); setLocation("");
                  setProposedAction(""); setFiles([]); setProjectId(null);
                  setIncidentType("hms"); setSeverity("medium");
                }}
              >
                Meld nytt avvik
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isHigh = severity === "high" || severity === "critical";

  return (
    <div
      className="min-h-screen bg-background"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 160px)" }}
    >
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="px-4 py-3 max-w-2xl mx-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Tilbake">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">HMS</div>
            <div className="text-base font-semibold flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              Meld avvik / RUH
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-5">
        {/* Type */}
        <div className="space-y-2">
          <Label className="text-sm">Type</Label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TYPE_LABELS) as IncidentType[]).map((t) => (
              <button
                key={t}
                onClick={() => setIncidentType(t)}
                className={cn(
                  "rounded-lg border-2 px-3 py-3 text-sm font-medium text-left transition active:scale-[0.99]",
                  incidentType === t
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-card text-foreground"
                )}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div className="space-y-2">
          <Label className="text-sm">Alvorlighetsgrad</Label>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(SEVERITY_LABELS) as Severity[]).map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={cn(
                  "rounded-lg border-2 py-3 text-xs font-semibold transition active:scale-[0.99]",
                  severity === s
                    ? SEVERITY_STYLES[s]
                    : "border-border bg-card text-muted-foreground"
                )}
              >
                {SEVERITY_LABELS[s]}
              </button>
            ))}
          </div>
          {isHigh && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>HMS-leder varsles umiddelbart ved innsending.</span>
            </div>
          )}
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title" className="text-sm">Hva skjedde? <span className="text-rose-600">*</span></Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kort overskrift"
            className="h-12 text-base"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="desc" className="text-sm">Beskrivelse</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Beskriv hendelsen i detalj..."
            rows={4}
            className="text-base"
          />
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="loc" className="text-sm">Hvor skjedde det?</Label>
          <Input
            id="loc"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Sted, rom, område..."
            className="h-12 text-base"
          />
        </div>

        {/* Project */}
        {projects && projects.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm">Prosjekt (valgfritt)</Label>
            <select
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value || null)}
              className="w-full h-12 rounded-md border border-input bg-background px-3 text-base"
            >
              <option value="">Ingen prosjektkobling</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.project_number ? `${p.project_number} – ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Kjemikalie */}
        {chemicals.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm">Gjelder et kjemikalie? (valgfritt)</Label>
            <select
              value={chemicalId ?? ""}
              onChange={(e) => setChemicalId(e.target.value || null)}
              className="w-full h-12 rounded-md border border-input bg-background px-3 text-base"
            >
              <option value="">Ingen kjemikaliekobling</option>
              {chemicals.map((c) => (
                <option key={c.id} value={c.id}>{c.product_name}</option>
              ))}
            </select>
            {chemicalId && (
              <>
                <select
                  value={chemicalIssueType ?? ""}
                  onChange={(e) => setChemicalIssueType(e.target.value || null)}
                  className="w-full h-12 rounded-md border border-input bg-background px-3 text-base"
                >
                  <option value="">Hva gjelder det?</option>
                  {CHEMICAL_ISSUE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}

                </select>
                <p className="text-xs text-muted-foreground">
                  Sikkerhetsdatablad og HMS-rutine for produktet vises automatisk i saken.
                </p>
              </>
            )}
          </div>
        )}


        {/* Proposed action */}
        <div className="space-y-2">
          <Label htmlFor="action" className="text-sm">Foreslått tiltak</Label>
          <Textarea
            id="action"
            value={proposedAction}
            onChange={(e) => setProposedAction(e.target.value)}
            placeholder="Hva bør gjøres for å unngå at det skjer igjen?"
            rows={3}
            className="text-base"
          />
        </div>

        {/* Attachments */}
        <div className="space-y-2">
          <Label className="text-sm">Bilder / vedlegg</Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            capture="environment"
            onChange={onPickFiles}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="w-full h-12"
          >
            <Camera className="h-4 w-4 mr-2" /> Ta bilde / velg fil
          </Button>
          {files.length > 0 && (
            <div className="space-y-1 pt-1">
              {files.map((f, i) => (
                <Card key={i} className="bg-muted/30">
                  <CardContent className="p-2 flex items-center gap-2">
                    <div className="text-xs flex-1 truncate">{f.name}</div>
                    <span className="text-[10px] text-muted-foreground">{Math.round(f.size / 1024)} KB</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Reporter info */}
        <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2">
          Rapportert av <span className="font-medium text-foreground">{user?.name || user?.email}</span> ·{" "}
          {new Date().toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" })}
        </div>
      </div>

      {/* Sticky submit – above mobile tab bar (h≈64px), flush bottom on desktop */}
      <div
        className="fixed left-0 right-0 bg-background/95 backdrop-blur border-t border-border/60 px-4 pt-3 z-[60] bottom-[64px] lg:bottom-0"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <div className="max-w-2xl mx-auto space-y-1.5">
          {!title.trim() && (
            <div className="text-[11px] text-amber-700 text-center">
              Fyll inn «Hva skjedde?» for å sende inn
            </div>
          )}
          <Button
            onClick={() => submitMut.mutate()}
            disabled={submitMut.isPending || !title.trim()}
            className="w-full h-12 text-base font-semibold shadow-lg"
            size="lg"
          >
            {submitMut.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sender inn...</>
            ) : (
              <>Send inn avvik/RUH</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
