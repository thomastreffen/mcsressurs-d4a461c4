import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CONDITION_LABEL, KIND_LABEL, STATE_LABEL, STEP_STATUS_LABEL, docErrorMessage, docRpc,
  type DocProgress, type DocStep,
} from "@/lib/doc-requirements";

interface Category { id: string; name: string }
interface Exception { id: string; job_requirement_id: string; kind: string; reason: string; status: string; requested_by: string; substitute_template_id: string | null }
interface Template { id: string; title: string }

/** Leader view on a job: job type, conditions, snapshot, step status and exception requests. Never blocks the job. */
export function JobDocRequirementsPanel({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [progress, setProgress] = useState<DocProgress | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isApprover, setIsApprover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestFor, setRequestFor] = useState<DocStep | null>(null);
  const [reqKind, setReqKind] = useState<"not_relevant" | "substitute">("substitute");
  const [reqTemplate, setReqTemplate] = useState<string>("");
  const [reqReason, setReqReason] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await docRpc("get_job_doc_progress", { _job_id: projectId });
    if (e) { setError(docErrorMessage(e)); return; }
    setProgress(data as DocProgress);
    const { data: ev } = await supabase.from("events").select("company_id").eq("id", projectId).maybeSingle();
    const cid = (ev as any)?.company_id ?? null;
    setCompanyId(cid);
    if (!cid) return;
    const [cats, exc, tpls, mng, appr] = await Promise.all([
      supabase.from("doc_job_categories").select("id,name").eq("company_id", cid).eq("is_active", true).order("sort_order"),
      supabase.from("doc_requirement_exceptions").select("id,job_requirement_id,kind,reason,status,requested_by,substitute_template_id").eq("job_id", projectId).order("requested_at", { ascending: false }),
      supabase.from("form_templates").select("id,title").is("deleted_at", null).eq("is_active", true).not("active_version_id", "is", null),
      docRpc("doc_can_manage", { _company: cid }),
      user ? docRpc("is_doc_exception_approver", { _uid: user.id, _company: cid }) : Promise.resolve({ data: false, error: null }),
    ]);
    setCategories((cats.data as Category[]) || []);
    setExceptions((exc.data as Exception[]) || []);
    setTemplates((tpls.data as Template[]) || []);
    setCanManage(!!mng.data);
    setIsApprover(!!appr.data);
  }, [projectId, user]);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const { error: e } = await docRpc(fn, args);
    setBusy(false);
    if (e) { toast.error("Kunne ikke lagre", { description: docErrorMessage(e) }); return false; }
    toast.success(ok);
    await load();
    return true;
  };

  if (error) {
    return (
      <Card><CardContent className="flex items-center gap-2 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 text-destructive" /> Kunne ikke hente dokumentasjonskrav: {error}
        <Button size="sm" variant="outline" onClick={load}>Prøv igjen</Button>
      </CardContent></Card>
    );
  }
  if (!progress) return null;
  if (progress.state === "company_not_configured" && !canManage) return null;

  const leader = canManage || isApprover;
  const conds = progress.conditions || [];
  const setCategory = (catId: string | null, c = conds) =>
    run("set_job_doc_category", { _job_id: projectId, _category_id: catId, _conditions: c }, "Jobbtype lagret");

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Dokumentasjonskrav</h3>
          </div>
          <Badge variant="outline" className="text-[10px]">
            Sperre: {progress.enforcement_enabled ? "aktivert" : "ikke aktivert"}
          </Badge>
        </div>

        {progress.state !== "active" && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>{STATE_LABEL[progress.state]}</span>
          </div>
        )}

        {leader && progress.state !== "active" && (
          <div className="space-y-2">
            <Select value={progress.category_id ?? ""} onValueChange={(v) => setCategory(v)} disabled={busy}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Velg jobbtype" /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            {progress.category_id && (
              <div className="flex flex-wrap gap-3">
                {(["installation_change", "deviation_found"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={conds.includes(k)}
                      disabled={busy}
                      onCheckedChange={(v) => setCategory(progress.category_id, v ? [...conds, k] : conds.filter((x) => x !== k))}
                    />
                    {CONDITION_LABEL[k]}
                  </label>
                ))}
              </div>
            )}
            {progress.state === "not_snapshotted" && (
              <Button size="sm" disabled={busy} onClick={() => run("snapshot_job_doc_requirements", { _job_id: projectId }, "Krav lagt på jobben")}>
                {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Legg krav på jobben
              </Button>
            )}
          </div>
        )}

        {progress.state === "active" && (
          <>
            <p className="text-xs text-muted-foreground">
              {progress.category_name} · {progress.done}/{progress.total} levert · Godkjenning: ikke tilgjengelig ennå · Klar for faktura: nei
            </p>
            <ul className="space-y-1.5">
              {progress.steps.map((s) => (
                <li key={s.requirement_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-xs">
                  <Badge variant="secondary" className="text-[10px]">{KIND_LABEL[s.kind]}</Badge>
                  <span className="flex-1 font-medium">{s.label}{s.requirement_status === "substituted" ? " (erstattet)" : ""}</span>
                  <span className={s.status === "needs_review" ? "text-destructive" : "text-muted-foreground"}>{STEP_STATUS_LABEL[s.status]}</span>
                  {s.instance_id && <Button size="sm" variant="ghost" className="h-7" onClick={() => navigate(`/forms/${s.instance_id}`)}>Åpne</Button>}
                  {s.requirement_status === "required" && !s.exception_requested && s.status !== "delivered" && (
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setRequestFor(s); setReqKind(s.kind === "additional" ? "not_relevant" : "substitute"); }}>
                      Be om unntak
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {requestFor && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium">Unntak for «{requestFor.label}»</p>
            {requestFor.kind === "additional" ? (
              <Select value={reqKind} onValueChange={(v) => setReqKind(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_relevant">Ikke relevant</SelectItem>
                  <SelectItem value="substitute">Erstatt med likeverdig dokument</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className="text-[11px] text-muted-foreground">Grunnkrav kan bare erstattes med likeverdig dokument.</p>
            )}
            {reqKind === "substitute" && (
              <Select value={reqTemplate} onValueChange={setReqTemplate}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Velg likeverdig skjema" /></SelectTrigger>
                <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Textarea value={reqReason} onChange={(e) => setReqReason(e.target.value)} rows={2} className="text-xs" placeholder="Saklig begrunnelse…" />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || reqReason.trim().length < 10 || (reqKind === "substitute" && !reqTemplate)}
                onClick={async () => {
                  const ok = await run("request_doc_exception", {
                    _requirement_id: requestFor.requirement_id, _kind: reqKind, _reason: reqReason,
                    _substitute_template_id: reqKind === "substitute" ? reqTemplate : null,
                  }, "Forespørsel sendt til godkjenner");
                  if (ok) { setRequestFor(null); setReqReason(""); setReqTemplate(""); }
                }}>Send forespørsel</Button>
              <Button size="sm" variant="ghost" onClick={() => setRequestFor(null)}>Avbryt</Button>
            </div>
          </div>
        )}

        {exceptions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Unntak</p>
            {exceptions.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-xs">
                <Badge variant="outline" className="text-[10px]">{x.kind === "substitute" ? "Erstatning" : "Ikke relevant"}</Badge>
                <span className="flex-1">{x.reason}</span>
                <span className="text-muted-foreground">{x.status === "requested" ? "Venter" : x.status === "approved" ? "Godkjent" : "Avvist"}</span>
                {x.status === "requested" && isApprover && x.requested_by !== user?.id && (
                  <>
                    <Button size="sm" className="h-7" disabled={busy} onClick={() => run("decide_doc_exception", { _exception_id: x.id, _approve: true, _note: null }, "Unntak godkjent")}>Godkjenn</Button>
                    <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => run("decide_doc_exception", { _exception_id: x.id, _approve: false, _note: null }, "Unntak avvist")}>Avvis</Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {companyId === null && <p className="text-xs text-muted-foreground">Jobben mangler selskap.</p>}
      </CardContent>
    </Card>
  );
}
