import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONDITION_LABEL, KIND_LABEL, docErrorMessage, docRpc, type DocKind } from "@/lib/doc-requirements";

interface Category { id: string; name: string; description: string | null; is_active: boolean; sort_order: number }
interface Rule {
  id: string; category_id: string; kind: DocKind; label: string; template_id: string | null;
  condition: string; is_active: boolean; approved_at: string | null; rule_version: number | null; sort_order: number;
}
interface Template { id: string; title: string; company_id: string | null; active_version_id: string | null }

const NO_TEMPLATE = "__none__";

export default function DocRequirementsSettingsPage() {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const { companies, activeCompanyId } = useCompanyContext();
  const [companyId, setCompanyId] = useState<string | null>(activeCompanyId);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settings, setSettings] = useState<{ enforcement_enabled: boolean; rules_version: number } | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [approverCount, setApproverCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");

  useEffect(() => { if (!companyId && activeCompanyId) setCompanyId(activeCompanyId); }, [activeCompanyId, companyId]);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true); setError(null);
    const [cats, rls, tpls, st, mng, appr, approvers] = await Promise.all([
      supabase.from("doc_job_categories").select("*").eq("company_id", companyId).order("sort_order"),
      supabase.from("doc_requirement_rules").select("*").eq("company_id", companyId).order("sort_order"),
      supabase.from("form_templates").select("id,title,company_id,active_version_id").is("deleted_at", null).eq("is_active", true),
      supabase.from("doc_company_settings").select("enforcement_enabled,rules_version").eq("company_id", companyId).maybeSingle(),
      docRpc("doc_can_manage", { _company: companyId }),
      user ? docRpc("is_doc_exception_approver", { _uid: user.id, _company: companyId }) : Promise.resolve({ data: false, error: null }),
      supabase.from("doc_exception_approvers").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("revoked_at", null),
    ]);
    const firstErr = cats.error || rls.error || tpls.error || st.error || mng.error;
    if (firstErr) { setError(firstErr.message); setLoading(false); return; }
    setCategories((cats.data as Category[]) || []);
    setRules((rls.data as Rule[]) || []);
    setTemplates(((tpls.data as Template[]) || []).filter((t) => !t.company_id || t.company_id === companyId));
    setSettings((st.data as any) ?? null);
    setCanManage(!!mng.data);
    setCanApprove(!!appr.data || isSuperAdmin);
    setApproverCount(approvers.count ?? 0);
    setLoading(false);
  }, [companyId, user, isSuperAdmin]);

  useEffect(() => { void load(); }, [load]);

  const tplReady = (id: string | null) => !!templates.find((t) => t.id === id && t.active_version_id);

  const updateRule = async (id: string, patch: Partial<Rule>) => {
    const { error: e } = await supabase.from("doc_requirement_rules").update(patch as any).eq("id", id);
    if (e) toast.error("Kunne ikke lagre", { description: docErrorMessage(e) });
    await load();
  };
  const addRule = async (categoryId: string, kind: DocKind) => {
    const { error: e } = await supabase.from("doc_requirement_rules").insert({
      company_id: companyId!, category_id: categoryId, kind, label: kind === "additional" ? "Nytt tilleggskrav" : KIND_LABEL[kind],
    } as any);
    if (e) toast.error("Kunne ikke legge til", { description: docErrorMessage(e) });
    await load();
  };
  const approve = async (id: string) => {
    const { error: e } = await docRpc("approve_doc_rule", { _rule_id: id });
    if (e) toast.error("Kunne ikke godkjenne", { description: docErrorMessage(e) });
    else toast.success("Krav godkjent");
    await load();
  };
  const addCategory = async () => {
    const { error: e } = await supabase.from("doc_job_categories").insert({ company_id: companyId!, name: newCat.trim(), sort_order: categories.length + 1 } as any);
    if (e) { toast.error("Kunne ikke legge til", { description: docErrorMessage(e) }); return; }
    setNewCat(""); await load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Tilbake"><ArrowLeft className="h-4 w-4" /></Button>
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Dokumentasjonskrav</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={companyId ?? ""} onValueChange={setCompanyId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Velg selskap" /></SelectTrigger>
          <SelectContent>{companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Badge variant="outline">Sperre: {settings?.enforcement_enabled ? "aktivert" : "ikke aktivert"}</Badge>
        <Badge variant="outline">Regelversjon {settings?.rules_version ?? 0}</Badge>
        <Badge variant="outline">Unntaksgodkjennere: {approverCount}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Hver jobbtype må ha en godkjent risikovurdering og en godkjent avslutningsdokumentasjon. Krav uten publisert skjemamal står som
        «Krav må konfigureres». Endring av et godkjent krav fjerner godkjenningen; jobber som allerede har fått krav beholder sin versjon.
        Unntaksgodkjennere tildeles av superadmin.
      </p>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" /> Kunne ikke hente krav: {error}
          <Button size="sm" variant="outline" onClick={load}>Prøv igjen</Button>
        </div>
      )}
      {loading && <p className="text-sm text-muted-foreground">Laster…</p>}
      {!loading && !error && categories.length === 0 && (
        <p className="text-sm text-muted-foreground">Ingen jobbtyper satt opp for dette selskapet. Jobber her viser «Selskapet har ikke satt opp dokumentasjonskrav».</p>
      )}

      {categories.map((cat) => {
        const catRules = rules.filter((r) => r.category_id === cat.id);
        const okRisk = catRules.some((r) => r.kind === "risk_assessment" && r.approved_at && r.is_active);
        const okClose = catRules.some((r) => r.kind === "closing_documentation" && r.approved_at && r.is_active);
        return (
          <Card key={cat.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {cat.name}
                {okRisk && okClose
                  ? <Badge className="bg-success/10 text-success">Klar</Badge>
                  : <Badge variant="outline" className="border-warning/40 text-warning">Krav må konfigureres</Badge>}
              </CardTitle>
              {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
            </CardHeader>
            <CardContent className="space-y-2">
              {catRules.map((r) => (
                <div key={r.id} className="grid gap-2 rounded-lg border border-border p-2 md:grid-cols-[130px_1fr_200px_150px_auto] md:items-center">
                  <Badge variant="secondary" className="w-fit text-[10px]">{KIND_LABEL[r.kind]}</Badge>
                  <Input defaultValue={r.label} disabled={!canManage} className="h-8 text-xs"
                    onBlur={(e) => e.target.value.trim() !== r.label && updateRule(r.id, { label: e.target.value.trim() })} />
                  <Select value={r.template_id ?? NO_TEMPLATE} disabled={!canManage}
                    onValueChange={(v) => updateRule(r.id, { template_id: v === NO_TEMPLATE ? null : v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEMPLATE}>Ingen mal valgt</SelectItem>
                      {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}{t.active_version_id ? "" : " (ikke publisert)"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={r.condition} disabled={!canManage || r.kind !== "additional"} onValueChange={(v) => updateRule(r.id, { condition: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(CONDITION_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    {r.approved_at
                      ? <Badge className="bg-success/10 text-success text-[10px]">Godkjent v{r.rule_version}</Badge>
                      : !tplReady(r.template_id)
                        ? <Badge variant="outline" className="text-[10px]">Mangler mal</Badge>
                        : canApprove
                          ? <Button size="sm" className="h-7" onClick={() => approve(r.id)}>Godkjenn</Button>
                          : <Badge variant="outline" className="text-[10px]">Utkast</Badge>}
                  </div>
                </div>
              ))}
              {canManage && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {(["risk_assessment", "closing_documentation", "additional"] as DocKind[]).map((k) => (
                    <Button key={k} size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => addRule(cat.id, k)}>
                      <Plus className="h-3 w-3" /> {KIND_LABEL[k]}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {canManage && companyId && (
        <div className="flex gap-2">
          <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Ny jobbtype…" className="max-w-xs" />
          <Button disabled={newCat.trim().length < 2} onClick={addCategory}><Plus className="mr-1 h-4 w-4" /> Legg til jobbtype</Button>
        </div>
      )}
    </div>
  );
}
