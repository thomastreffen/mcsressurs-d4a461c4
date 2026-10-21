import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Plus, Pencil, ListPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { useAssignableUsers } from "@/hooks/useCompanyUsers";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LocalExportMenu } from "@/components/LocalExportMenu";
import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import {
  RISK_LEVEL_LABEL, RISK_LEVEL_STYLE, RISK_STATUS_LABEL, riskLevel, riskWorkflow, type RiskLevel,
} from "@/lib/hms/internalControl";
import { Link } from "react-router-dom";
import { HmsControlHistory } from "@/components/hms/HmsControlHistory";
import { format } from "date-fns";

interface RiskForm {
  id?: string;
  area: string;
  hazard: string;
  event_description: string;
  probability: number;
  consequence: number;
  existing_measures: string;
  new_measures: string;
  responsible_user_id: string;
  next_review_date: string;
  status: string;
  rest_sannsynlighet: string;
  rest_konsekvens: string;
  residual_comment: string;
  assess: boolean;
}

const EMPTY: RiskForm = {
  area: "", hazard: "", event_description: "", probability: 2, consequence: 3,
  existing_measures: "", new_measures: "", responsible_user_id: "", next_review_date: "", status: "active", rest_sannsynlighet: "", rest_konsekvens: "", residual_comment: "", assess: false,
};

/** Virksomhetsrisikoregister — overordnet, tilbakevendende risiko (ikke SJA). */
export default function HmsRiskRegisterPage() {
  const { activeCompanyId: cid } = useCompanyContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: users } = useAssignableUsers();
  const [form, setForm] = useState<RiskForm | null>(null);

  const { data: risks, isLoading } = useQuery({
    queryKey: ["hms-risk-register", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hms_risk_register")
        .select("*")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: linkedActions, error: actionsError } = useQuery({
    queryKey: ["hms-risk-actions", cid], enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase.from("hms_action_items").select("id, title, description, status, risk_register_id, assignee_user_id")
        .eq("company_id", cid ?? "").not("risk_register_id", "is", null).is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nameOf = (id: string | null) => users?.find((u) => u.id === id)?.name ?? null;

  const levelCounts = useMemo(() => {
    const c: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const r of risks ?? []) if (r.status === "active") c[riskLevel(r.score)] += 1;
    return c;
  }, [risks]);

  const saveMut = useMutation({
    mutationFn: async (f: RiskForm) => {
      if (!cid || !user) throw new Error("Mangler kontekst");
      const row = {
        company_id: cid,
        area: f.area.trim(),
        hazard: f.hazard.trim(),
        event_description: f.event_description || null,
        probability: f.probability,
        consequence: f.consequence,
        existing_measures: f.existing_measures || null,
        new_measures: f.new_measures || null,
        responsible_user_id: f.responsible_user_id || null,
        next_review_date: f.next_review_date || null,
        ...(f.assess ? {
          status: f.status, rest_sannsynlighet: Number(f.rest_sannsynlighet), rest_konsekvens: Number(f.rest_konsekvens),
          residual_comment: f.residual_comment, residual_reviewed_at: new Date().toISOString(), residual_review_required: false,
        } : {}),
        updated_at: new Date().toISOString(),
      };
      const sb = supabase as any;
      const { error } = f.id
        ? await sb.from("hms_risk_register").update(row).eq("id", f.id).eq("company_id", cid).select("id").single()
        : await sb.from("hms_risk_register").insert({ ...row, created_by: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Lagret" });
      setForm(null);
      qc.invalidateQueries({ queryKey: ["hms-risk-register"] });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  const actionMut = useMutation({
    mutationFn: async (r: any) => {
      if (!cid || !user) throw new Error("Mangler kontekst");
      const title = `Tiltak: ${r.hazard}`;
      const description = r.new_measures || `Korrigerende tiltak for risiko «${r.area}»: ${r.hazard}`;
      if (linkedActions?.some(a => a.risk_register_id === r.id && a.title === title && a.description === description)) return;
      const { error } = await (supabase as any).from("hms_action_items").insert({
        company_id: cid,
        title: `Tiltak: ${r.hazard}`,
        description: r.new_measures || `Korrigerende tiltak for risiko «${r.area}»: ${r.hazard}`,
        assignee_user_id: r.responsible_user_id,
        status: "open",
        priority: riskLevel(r.score) === "critical" || riskLevel(r.score) === "high" ? "high" : "normal",
        source_type: "risk_register",
        risk_register_id: r.id,
        created_by: user.id, client_request_id: crypto.randomUUID(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Tiltak tilgjengelig", description: "Se HMS-handlingsplanen." });
      qc.invalidateQueries({ queryKey: ["hms-risk-actions"] });
      qc.invalidateQueries({ queryKey: ["hms-risk-register"] });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <HmsMobileBack />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ShieldAlert className="h-3.5 w-3.5" /> HMS &amp; HR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Risikoregister</h1>
          <p className="text-sm text-muted-foreground">Virksomhetens overordnede og tilbakevendende risiko — separat fra SJA.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <LocalExportMenu
            title="Risikoregister" module="hms" disabled={isLoading}
            rows={(risks ?? []).map((r) => ({
              Område: r.area, Fare: r.hazard, Hendelse: r.event_description ?? "",
              Sannsynlighet: r.probability, Konsekvens: r.consequence, Score: r.score,
              Nivå: RISK_LEVEL_LABEL[riskLevel(r.score)],
              "Rest-sannsynlighet": r.rest_sannsynlighet ?? "Ikke vurdert", "Rest-konsekvens": r.rest_konsekvens ?? "Ikke vurdert",
              "Rest-score": r.rest_score ?? "Ikke vurdert", "Rest-vurdering": r.residual_comment ?? "",
              "Eksisterende tiltak": r.existing_measures ?? "", "Nye tiltak": r.new_measures ?? "",
              Ansvarlig: nameOf(r.responsible_user_id) ?? "",
              "Neste vurdering": r.next_review_date ?? "", Status: RISK_STATUS_LABEL[r.status] ?? r.status,
            }))}
          />
          <Button size="sm" onClick={() => setForm({ ...EMPTY })}><Plus className="h-4 w-4 mr-1.5" /> Ny risiko</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(["critical", "high", "medium", "low"] as RiskLevel[]).map((l) => (
          <Badge key={l} variant="outline" className={RISK_LEVEL_STYLE[l]}>{levelCounts[l]} {RISK_LEVEL_LABEL[l].toLowerCase()}</Badge>
        ))}
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Laster…</p>
      ) : (risks ?? []).length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Ingen risikoer registrert. Start med f.eks. strømgjennomgang, lysbue, epoxy/herdeplast eller arbeid i høyden.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {(risks ?? []).map((r) => {
            const lvl = riskLevel(r.score);
            const actions = (linkedActions ?? []).filter(a => a.risk_register_id === r.id);
            return (
              <Card key={r.id}>
                <CardContent className="p-4 flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.area}</span>
                      <Badge variant="outline" className={RISK_LEVEL_STYLE[lvl]}>{RISK_LEVEL_LABEL[lvl]} ({r.score})</Badge>
                      <Badge variant="outline" className="text-[10px]">{riskWorkflow(r, actions)}</Badge>
                    </div>
                    <div className="mt-1 text-sm">{r.hazard}{r.event_description ? ` — ${r.event_description}` : ""}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Sannsynlighet {r.probability} · Konsekvens {r.consequence}
                      {nameOf(r.responsible_user_id) && ` · Ansvarlig: ${nameOf(r.responsible_user_id)}`}
                      {r.next_review_date && ` · Neste vurdering: ${format(new Date(r.next_review_date), "dd.MM.yyyy")}`}
                    </div>
                    {r.existing_measures && <p className="mt-1 text-xs text-muted-foreground">Eksisterende tiltak: {r.existing_measures}</p>}
                    <p className="mt-2 text-sm">Opprinnelig score {r.score} → tiltak → Rest-risiko: {r.rest_score ?? "Ikke vurdert"}</p>
                    {r.residual_comment && <p className="text-sm text-muted-foreground">{r.residual_comment}</p>}
                    {actionsError && <p role="alert" className="text-destructive">Koblede tiltak kunne ikke kontrolleres.</p>}
                    {actions.map(a => <p key={a.id} className="mt-2 text-sm"><Link className="text-primary underline" to="/hms/handlingsplan">{a.title}</Link> · {a.status === "done" ? "Ferdig" : "Åpent"} · {nameOf(a.assignee_user_id) ?? "Ikke tildelt"}</p>)}
                    {r.new_measures && <p className="mt-1 text-xs">Nødvendige nye tiltak: {r.new_measures}</p>}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Button size="sm" variant="outline" disabled={actionMut.isPending || !!actionsError || actions.some(a => a.title === `Tiltak: ${r.hazard}` && a.description === (r.new_measures || `Korrigerende tiltak for risiko «${r.area}»: ${r.hazard}`))} onClick={() => actionMut.mutate(r)}>
                      <ListPlus className="h-4 w-4 mr-1" /> Opprett tiltak
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Rediger risiko" onClick={() => setForm({
                      id: r.id, area: r.area, hazard: r.hazard, event_description: r.event_description ?? "",
                      probability: r.probability, consequence: r.consequence,
                      existing_measures: r.existing_measures ?? "", new_measures: r.new_measures ?? "",
                      responsible_user_id: r.responsible_user_id ?? "", next_review_date: r.next_review_date ?? "",
                      status: r.status, rest_sannsynlighet: String(r.rest_sannsynlighet ?? ""), rest_konsekvens: String(r.rest_konsekvens ?? ""),
                      residual_comment: r.residual_comment ?? "", assess: false,
                    })}><Pencil className="h-4 w-4" /></Button>
                  </div>
                  <HmsControlHistory entity="hms_risk_register" id={r.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
          <SheetHeader><SheetTitle>{form?.id ? "Rediger risiko" : "Ny risiko"}</SheetTitle></SheetHeader>
          {form && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Område / arbeidstype</Label>
                  <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="F.eks. Epoxy/herdeplast" />
                </div>
                <div className="space-y-1.5">
                  <Label>Fare</Label>
                  <Input value={form.hazard} onChange={(e) => setForm({ ...form, hazard: e.target.value })} placeholder="F.eks. Hudkontakt med herder" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Mulig hendelse</Label>
                <Input value={form.event_description} onChange={(e) => setForm({ ...form, event_description: e.target.value })} placeholder="F.eks. Eksem / allergi" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sannsynlighet (1–5)</Label>
                  <Select disabled={!!form.id} value={String(form.probability)} onValueChange={(v) => setForm({ ...form, probability: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Konsekvens (1–5)</Label>
                  <Select disabled={!!form.id} value={String(form.consequence)} onValueChange={(v) => setForm({ ...form, consequence: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-lg border p-3 text-sm flex items-center gap-2">
                Risikonivå: <Badge variant="outline" className={RISK_LEVEL_STYLE[riskLevel(form.probability * form.consequence)]}>
                  {RISK_LEVEL_LABEL[riskLevel(form.probability * form.consequence)]} ({form.probability * form.consequence})
                </Badge>
              </div>
              <div className="space-y-1.5">
                <Label>Eksisterende tiltak</Label>
                <Textarea rows={2} value={form.existing_measures} onChange={(e) => setForm({ ...form, existing_measures: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nødvendige nye tiltak</Label>
                <Textarea rows={2} value={form.new_measures} onChange={(e) => setForm({ ...form, new_measures: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Ansvarlig</Label>
                  <Select value={form.responsible_user_id} onValueChange={(v) => setForm({ ...form, responsible_user_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Velg person" /></SelectTrigger>
                    <SelectContent>{(users ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Neste vurdering</Label>
                  <Input type="date" value={form.next_review_date} onChange={(e) => setForm({ ...form, next_review_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Status etter rest-risikovurdering</Label>
                  <Select disabled={!form.assess} value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(RISK_STATUS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {form.id && <div className="space-y-3 border-t pt-4">
                <Button variant="outline" onClick={() => setForm({ ...form, assess: !form.assess })}>Vurder rest-risiko</Button>
                {form.assess && <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Rest-sannsynlighet</Label><Select value={form.rest_sannsynlighet} onValueChange={v => setForm({ ...form, rest_sannsynlighet: v })}><SelectTrigger><SelectValue placeholder="1–5" /></SelectTrigger><SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Rest-konsekvens</Label><Select value={form.rest_konsekvens} onValueChange={v => setForm({ ...form, rest_konsekvens: v })}><SelectTrigger><SelectValue placeholder="1–5" /></SelectTrigger><SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                  <Label>Begrunnelse / vurdering av åpne tiltak</Label><Textarea value={form.residual_comment} onChange={e => setForm({ ...form, residual_comment: e.target.value })} />
                  <p className="text-sm">Rest-score: {Number(form.rest_sannsynlighet) * Number(form.rest_konsekvens) || "Ikke vurdert"}</p>
                </>}
              </div>}
              <div className="sticky bottom-0 -mx-6 border-t bg-background px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex gap-2">
                <Button className="flex-1 min-h-11" disabled={!form.area.trim() || !form.hazard.trim() || saveMut.isPending || (form.assess && (!form.rest_sannsynlighet || !form.rest_konsekvens || !form.residual_comment.trim()))} onClick={() => saveMut.mutate(form)}>Lagre</Button>
                <Button variant="outline" className="min-h-11" onClick={() => setForm(null)}>Avbryt</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
