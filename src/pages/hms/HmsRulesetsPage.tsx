import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, History, Save, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { logHmsAudit } from "@/lib/hms/audit";
import { Skeleton } from "@/components/ui/skeleton";

interface Rules {
  max_hours_per_day?: number;
  warn_hours_per_day?: number;
  max_hours_per_week?: number;
  warn_hours_per_week?: number;
  max_overtime_7d?: number;
  warn_overtime_7d?: number;
  max_overtime_4w?: number;
  warn_overtime_4w?: number;
  max_overtime_52w?: number;
  warn_overtime_52w?: number;
  min_rest_hours?: number;
  avg_window_weeks?: number;
  warn_threshold_pct?: number;
  critical_threshold_pct?: number;
  overtime_requires_approval?: boolean;
  rest_check_active?: boolean;
  standard_week_hours?: number;
}

interface Ruleset {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  rules: Rules;
  version: number;
  active_from: string | null;
  active_to: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT: Rules = {
  max_hours_per_day: 13,
  warn_hours_per_day: 10,
  max_hours_per_week: 48,
  warn_hours_per_week: 40,
  max_overtime_7d: 13,
  warn_overtime_7d: 10,
  max_overtime_4w: 30,
  warn_overtime_4w: 25,
  max_overtime_52w: 240,
  warn_overtime_52w: 200,
  min_rest_hours: 11,
  avg_window_weeks: 8,
  warn_threshold_pct: 80,
  critical_threshold_pct: 100,
  overtime_requires_approval: true,
  rest_check_active: true,
  standard_week_hours: 37.5,
};

export default function HmsRulesetsPage() {
  const { activeCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Ruleset | null>(null);
  const [draft, setDraft] = useState<Rules>(DEFAULT);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(true);

  const { data: rulesets = [], isLoading } = useQuery({
    queryKey: ["hms-rulesets", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("worktime_rulesets")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("is_default", { ascending: false })
        .order("version", { ascending: false });
      return (data ?? []) as Ruleset[];
    },
  });

  function startEdit(r: Ruleset) {
    setEditing(r);
    setDraft({ ...DEFAULT, ...(r.rules || {}) });
    setName(r.name);
    setDescription(r.description || "");
    setIsDefault(r.is_default);
  }

  function startNew() {
    setEditing(null);
    setDraft(DEFAULT);
    setName("MCS standard – AML");
    setDescription("");
    setIsDefault(rulesets.length === 0);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      // Versjonering: ny rad, bumper version på navnet
      const baseVersion = editing
        ? Math.max(...rulesets.filter(r => r.name === editing.name).map(r => r.version)) + 1
        : 1;

      const payload = {
        company_id: activeCompanyId,
        name,
        description: description || null,
        is_default: isDefault,
        rules: draft,
        version: baseVersion,
        active_from: new Date().toISOString().slice(0, 10),
      };

      if (isDefault) {
        await (supabase as any)
          .from("worktime_rulesets")
          .update({ is_default: false })
          .eq("company_id", activeCompanyId)
          .eq("is_default", true);
      }

      const { data: ins, error } = await (supabase as any)
        .from("worktime_rulesets")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      // Audit log
      await logHmsAudit({
        company_id: activeCompanyId,
        entity_type: "worktime_ruleset",
        entity_id: ins.id,
        action: editing ? "ruleset_revision" : "ruleset_create",
        payload: { name, version: baseVersion, rules: draft },
      });
    },
    onSuccess: () => {
      toast({ title: "Regelsett lagret" });
      qc.invalidateQueries({ queryKey: ["hms-rulesets"] });
      setEditing(null);
      setName("");
    },
    onError: (e: any) => toast({ title: "Feil", description: String(e.message || e), variant: "destructive" }),
  });

  const groups: Record<string, Ruleset[]> = {};
  for (const r of rulesets) (groups[r.name] ||= []).push(r);
  Object.values(groups).forEach((g) => g.sort((a, b) => b.version - a.version));

  const editingMode = editing !== null || name.length > 0;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <HmsMobileBack />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ShieldCheck className="h-3.5 w-3.5" /> HMS &amp; HR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">AML-regelsett</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Aktive grenser for arbeidstid, hviletid og overtid. Endringer lagres som ny versjon —
            historikk beholdes.
          </p>
        </div>
        <Button onClick={startNew}><Plus className="h-4 w-4 mr-1" />Nytt regelsett</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-3">
          {Object.entries(groups).map(([gname, gs]) => {
            const active = gs[0];
            return (
              <Card key={gname} className="border-border/60">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {gname}
                        {active.is_default && <Badge variant="default" className="text-[10px]">Aktiv</Badge>}
                        <Badge variant="outline" className="text-[10px]">v{active.version}</Badge>
                      </CardTitle>
                      {active.description && (
                        <p className="text-xs text-muted-foreground mt-1">{active.description}</p>
                      )}
                      {active.active_from && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Aktiv fra {active.active_from}
                        </p>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => startEdit(active)}>
                      <Settings2 className="h-3.5 w-3.5 mr-1" />Rediger
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <Stat label="Maks/24t" value={`${active.rules.max_hours_per_day ?? "–"}t`} />
                    <Stat label="Maks/uke" value={`${active.rules.max_hours_per_week ?? "–"}t`} />
                    <Stat label={`Snitt ${active.rules.avg_window_weeks ?? 8}u`} value={`${active.rules.max_hours_per_week ?? "–"}t`} />
                    <Stat label="Hvile" value={`${active.rules.min_rest_hours ?? 11}t`} />
                    <Stat label="OT 7d" value={`${active.rules.max_overtime_7d ?? "–"}t`} />
                    <Stat label="OT 4u" value={`${active.rules.max_overtime_4w ?? "–"}t`} />
                    <Stat label="OT 52u" value={`${active.rules.max_overtime_52w ?? "–"}t`} />
                    <Stat label="Warn / Crit" value={`${active.rules.warn_threshold_pct ?? 80}% / ${active.rules.critical_threshold_pct ?? 100}%`} />
                  </div>
                  {gs.length > 1 && (
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer text-muted-foreground inline-flex items-center gap-1">
                        <History className="h-3 w-3" />Tidligere versjoner ({gs.length - 1})
                      </summary>
                      <div className="mt-2 space-y-1">
                        {gs.slice(1).map((h) => (
                          <div key={h.id} className="flex justify-between border-b last:border-0 py-1">
                            <span>v{h.version}</span>
                            <span className="text-muted-foreground">{new Date(h.created_at).toLocaleDateString("nb-NO")}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editingMode && (
        <Card className="border-primary/40 sticky bottom-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{editing ? `Ny revisjon: ${editing.name}` : "Nytt regelsett"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><Label>Navn</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!!editing} /></div>
              <div><Label>Beskrivelse</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <NumField label="Maks t/24t" v={draft.max_hours_per_day} on={(v) => setDraft({ ...draft, max_hours_per_day: v })} />
              <NumField label="Warn t/dag" v={draft.warn_hours_per_day} on={(v) => setDraft({ ...draft, warn_hours_per_day: v })} />
              <NumField label="Maks t/uke" v={draft.max_hours_per_week} on={(v) => setDraft({ ...draft, max_hours_per_week: v })} />
              <NumField label="Warn t/uke" v={draft.warn_hours_per_week} on={(v) => setDraft({ ...draft, warn_hours_per_week: v })} />
              <NumField label="Snittvindu (u)" v={draft.avg_window_weeks} on={(v) => setDraft({ ...draft, avg_window_weeks: v })} />
              <NumField label="Min hvile (t)" v={draft.min_rest_hours} on={(v) => setDraft({ ...draft, min_rest_hours: v })} />
              <NumField label="Maks OT 7d" v={draft.max_overtime_7d} on={(v) => setDraft({ ...draft, max_overtime_7d: v })} />
              <NumField label="Maks OT 4u" v={draft.max_overtime_4w} on={(v) => setDraft({ ...draft, max_overtime_4w: v })} />
              <NumField label="Maks OT 52u" v={draft.max_overtime_52w} on={(v) => setDraft({ ...draft, max_overtime_52w: v })} />
              <NumField label="Warn-terskel %" v={draft.warn_threshold_pct} on={(v) => setDraft({ ...draft, warn_threshold_pct: v })} />
              <NumField label="Kritisk-terskel %" v={draft.critical_threshold_pct} on={(v) => setDraft({ ...draft, critical_threshold_pct: v })} />
              <NumField label="Normaluke (t)" v={draft.standard_week_hours} on={(v) => setDraft({ ...draft, standard_week_hours: v })} />
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!draft.overtime_requires_approval} onCheckedChange={(c) => setDraft({ ...draft, overtime_requires_approval: c })} />
                Overtid krever godkjenning
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!draft.rest_check_active} onCheckedChange={(c) => setDraft({ ...draft, rest_check_active: c })} />
                Hviletidskontroll aktiv
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                Sett som aktivt
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => { setEditing(null); setName(""); }}>Avbryt</Button>
              <Button onClick={() => saveMut.mutate()} disabled={!name || saveMut.isPending}>
                <Save className="h-4 w-4 mr-1" />
                {saveMut.isPending ? "Lagrer…" : editing ? "Lagre ny revisjon" : "Lagre"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function NumField({ label, v, on }: { label: string; v: number | undefined; on: (n: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" step="0.5" value={v ?? ""} onChange={(e) => on(parseFloat(e.target.value || "0"))} className="h-9" />
    </div>
  );
}
