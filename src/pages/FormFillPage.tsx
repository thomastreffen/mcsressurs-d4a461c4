import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Loader2,
  Lock,
  CheckCircle2,
  PenTool,
  Camera,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Check,
  Minus,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { ModernDatePicker, ModernTimePicker } from "@/components/ui/modern-date-time-picker";
import { useAuth } from "@/hooks/useAuth";
import type {
  FormField,
  FormRule,
  FormInstanceStatus,
  ChecklistItemAnswer,
  ChecklistItemStatus,
  RiskGrade,
} from "@/lib/form-types";
import { FORM_STATUS_CONFIG, fieldSupportsComment } from "@/lib/form-types";
import { validateFormAnswers, formRpcErrorMessage, checklistEvidencePath, type EvidenceCounts } from "@/lib/form-validation";
import { FormEvidenceUpload } from "@/components/forms/FormEvidenceUpload";

const STATUS_OPTIONS: { val: ChecklistItemStatus; label: string; icon: React.ElementType; color: string }[] = [
  { val: "ok", label: "OK", icon: Check, color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  { val: "avvik", label: "Avvik", icon: AlertTriangle, color: "bg-destructive/10 text-destructive border-destructive/20" },
  { val: "ikke_relevant", label: "N/A", icon: Minus, color: "bg-muted text-muted-foreground border-border" },
];

const RISK_OPTIONS: { val: RiskGrade; label: string; color: string }[] = [
  { val: "lav", label: "Lav", color: "bg-emerald-500/10 text-emerald-600" },
  { val: "middels", label: "Middels", color: "bg-amber-500/10 text-amber-600" },
  { val: "hoy", label: "Høy", color: "bg-orange-500/10 text-orange-600" },
  { val: "kritisk", label: "Kritisk", color: "bg-destructive/10 text-destructive" },
];

export default function FormFillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [instance, setInstance] = useState<any>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [rules, setRules] = useState<FormRule[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [templateTitle, setTemplateTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const revisionRef = useRef<number>(0);

  const fetchInstance = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("form_instances")
      .select("*")
      .eq("id", id)
      .single();

    if (!data) {
      setLoading(false);
      return;
    }

    setInstance(data);
    revisionRef.current = (data as any).answers_revision ?? 0;
    setAnswers(((data as any).answers as Record<string, any>) || {});

    // Try loading the version used at creation; fallback to latest version of the template
    let ver: any = null;
    const { data: primaryVer } = await supabase
      .from("form_template_versions")
      .select("fields, rules")
      .eq("id", (data as any).version_id)
      .single();
    ver = primaryVer;

    if (!ver) {
      // Fallback: load latest version of the template
      const { data: latestVer } = await supabase
        .from("form_template_versions")
        .select("fields, rules")
        .eq("template_id", (data as any).template_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();
      ver = latestVer;
    }

    if (ver) {
      setFields(((ver as any).fields || []) as FormField[]);
      setRules(((ver as any).rules || []) as FormRule[]);
    } else {
      setFields([]);
      setRules([]);
    }

    const { data: tpl } = await supabase
      .from("form_templates")
      .select("title")
      .eq("id", (data as any).template_id)
      .single();

    if (tpl) setTemplateTitle((tpl as any).title);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchInstance(); }, [fetchInstance]);

  const isLocked = !!instance?.locked_at;
  const status = (instance?.status as FormInstanceStatus) || "not_started";

  type SaveState = "saved" | "pending" | "saving" | "error" | "conflict";
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const pendingAnswers = useRef<Record<string, any> | null>(null);
  const savingPromise = useRef<Promise<boolean> | null>(null);
  const retryCount = useRef(0);
  const conflictRef = useRef(false);
  const [evidence, setEvidence] = useState<EvidenceCounts>({});
  const onEvidenceCount = useCallback((p: string, c: number) => {
    setEvidence((prev) => (prev[p] === c ? prev : { ...prev, [p]: c }));
  }, []);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");

  // Serialized save via server RPC with optimistic revision check: one request at a time,
  // latest answers win, stale writes from another device are rejected instead of overwriting.
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (!id || isLocked) return true;
    if (savingPromise.current) await savingPromise.current;
    const toSave = pendingAnswers.current;
    if (!toSave) return true;
    if (conflictRef.current) return false;
    pendingAnswers.current = null;
    setSaveState("saving");
    const run = (async () => {
      const { data, error } = await supabase.rpc("save_form_answers", {
        _id: id,
        _answers: toSave as any,
        _expected_revision: revisionRef.current,
      });
      if (error) {
        if (!pendingAnswers.current) pendingAnswers.current = toSave;
        const msg = error.message || "";
        if (msg.includes("form_revision_conflict")) {
          conflictRef.current = true;
          setSaveState("conflict");
          toast.error("Kunne ikke lagre", { description: formRpcErrorMessage(error), duration: 10000 });
          return false;
        }
        setSaveState("error");
        if (msg.includes("form_access_denied") || msg.includes("form_locked") || msg.includes("form_invalid")) {
          toast.error("Kunne ikke lagre", { description: formRpcErrorMessage(error) });
          return false;
        }
        const delay = Math.min(30000, 2000 * 2 ** retryCount.current++);
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = setTimeout(() => { void flushSave(); }, delay);
        return false;
      }
      const res = data as { revision: number; status: string };
      revisionRef.current = res.revision;
      setInstance((prev: any) => (prev ? { ...prev, status: res.status, answers_revision: res.revision } : prev));
      retryCount.current = 0;
      if (!pendingAnswers.current) setSaveState("saved");
      return true;
    })();
    savingPromise.current = run;
    const ok = await run;
    savingPromise.current = null;
    if (ok && pendingAnswers.current) return flushSave();
    return ok;
  }, [id, isLocked]);

  const handleAnswerChange = (fieldId: string, value: any) => {
    if (isLocked) return;
    const updated = { ...answers, [fieldId]: value };
    setAnswers(updated);
    pendingAnswers.current = updated;
    if (!conflictRef.current) setSaveState("pending");
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { void flushSave(); }, 1200);
  };

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden" && pendingAnswers.current) void flushSave(); };
    const onUnload = (e: BeforeUnloadEvent) => { if (pendingAnswers.current || savingPromise.current) { e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("beforeunload", onUnload); };
  }, [flushSave]);

  const goBack = async () => {
    clearTimeout(autosaveTimer.current);
    if (pendingAnswers.current || savingPromise.current) {
      const ok = await flushSave();
      if (!ok && !window.confirm("Endringene dine er ikke lagret. Vil du forlate skjemaet likevel?")) return;
    }
    navigate(-1);
  };

  const reloadAfterConflict = async () => {
    conflictRef.current = false;
    pendingAnswers.current = null;
    setSaveState("saved");
    setLoading(true);
    await fetchInstance();
  };

  const toggleComment = (key: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getChecklistAnswers = (fieldId: string): Record<string, ChecklistItemAnswer> => {
    return (answers[fieldId] as Record<string, ChecklistItemAnswer>) || {};
  };

  const updateChecklistItem = (fieldId: string, itemIdx: number, patch: Partial<ChecklistItemAnswer>) => {
    const current = getChecklistAnswers(fieldId);
    const key = String(itemIdx);
    const updated = {
      ...current,
      [key]: { ...(current[key] || {}), ...patch } as ChecklistItemAnswer,
    };
    handleAnswerChange(fieldId, updated);
  };

  // Get field-level comment value (stored as fieldId_comment)
  const getFieldComment = (fieldId: string): string => {
    return (answers[`${fieldId}_comment`] as string) || "";
  };

  const validationIssues = validateFormAnswers(fields, answers, rules, evidence);
  const canComplete = (): boolean => validationIssues.length === 0;
  const describeIssues = (list: { message: string }[]) =>
    list.slice(0, 3).map((i) => i.message).join(" · ") + (list.length > 3 ? ` (+${list.length - 3} til)` : "");

  const handleComplete = async () => {
    if (!id) return;
    if (!canComplete()) {
      toast.error("Kan ikke fullføre", { description: describeIssues(validationIssues) });
      return;
    }
    setSaving(true);
    clearTimeout(autosaveTimer.current);
    try {
      if (!(await flushSave())) {
        toast.error("Kunne ikke lagre svarene", { description: "Skjemaet er ikke ferdigstilt. Sjekk nettverket og prøv igjen." });
        return;
      }
      const { data, error } = await supabase.rpc("complete_form_instance", { _id: id, _expected_revision: revisionRef.current });
      if (error) { toast.error("Kunne ikke ferdigstille", { description: formRpcErrorMessage(error) }); return; }
      const res = data as { ok: boolean; issues: { message: string }[] };
      if (!res.ok) { toast.error("Kan ikke fullføre", { description: describeIssues(res.issues) }); return; }
      toast.success("Skjema ferdigstilt");
      await fetchInstance();
    } finally {
      setSaving(false);
    }
  };

  const handleSign = async () => {
    if (!id || !signerName.trim()) return;
    if (!canComplete()) {
      toast.error("Kan ikke signere", { description: describeIssues(validationIssues) });
      return;
    }
    setSigning(true);
    clearTimeout(autosaveTimer.current);
    try {
      if (!(await flushSave())) {
        toast.error("Kunne ikke lagre svarene før signering", { description: "Skjemaet er ikke signert." });
        return;
      }
      const { data, error } = await supabase.rpc("sign_form_instance", {
        _id: id, _expected_revision: revisionRef.current, _signer_name: signerName,
      });
      if (error) { toast.error("Kunne ikke signere", { description: formRpcErrorMessage(error) }); return; }
      const res = data as { ok: boolean; issues: { message: string }[] };
      if (!res.ok) { toast.error("Kan ikke signere", { description: describeIssues(res.issues) }); return; }
      toast.success("Skjema signert og låst");
      setShowSignDialog(false);
      await fetchInstance();
    } finally {
      setSigning(false);
    }
  };

  const handleUnlock = async () => {
    if (!id) return;
    const { error } = await supabase.rpc("unlock_form_instance", { _id: id, _reason: unlockReason });
    if (error) { toast.error("Kunne ikke låse opp", { description: formRpcErrorMessage(error) }); return; }
    toast.success("Skjema låst opp – må signeres på nytt");
    setUnlockOpen(false);
    setUnlockReason("");
    await fetchInstance();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold">Skjema ikke funnet</p>
          <Button variant="outline" onClick={() => navigate(-1)}>Tilbake</Button>
        </div>
      </div>
    );
  }

  const statusCfg = FORM_STATUS_CONFIG[status];

  /** Inline comment toggle button — only shown if field allows comments */
  const CommentToggle = ({ fieldId, label }: { fieldId: string; label?: string }) => {
    const commentKey = fieldId;
    const hasComment = !!getFieldComment(fieldId);
    const isOpen = expandedComments.has(commentKey) || hasComment;

    if (isLocked && !hasComment) return null;

    return (
      <div className="space-y-1.5">
        {!isOpen && !isLocked && (
          <button
            onClick={() => toggleComment(commentKey)}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3 w-3" />
            {label || "kommentar"}
          </button>
        )}
        {isOpen && (
          <Textarea
            value={getFieldComment(fieldId)}
            onChange={(e) => handleAnswerChange(`${fieldId}_comment`, e.target.value)}
            disabled={isLocked}
            className="rounded-lg text-xs"
            rows={2}
            placeholder={label === "bildetekst" ? "Bildetekst..." : "Intern kommentar..."}
          />
        )}
      </div>
    );
  };

  const renderChecklistField = (field: FormField) => {
    const items = getChecklistAnswers(field.id);
    const allowComment = field.allow_comment !== false;

    return (
      <div className="space-y-1">
        {(field.options || []).map((opt, idx) => {
          const key = String(idx);
          const item = (items[key] || {}) as Partial<ChecklistItemAnswer>;
          const commentKey = `${field.id}_${idx}`;
          const hasComment = !!item.comment?.trim();
          const isCommentOpen = expandedComments.has(commentKey);
          const showComment = !isLocked ? (isCommentOpen || hasComment) : hasComment;

          return (
            <div
              key={idx}
              className="rounded-lg border border-border bg-background p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium flex-1 min-w-0 truncate">{opt}</span>
                <div className="flex gap-1 shrink-0">
                  {STATUS_OPTIONS.map((so) => {
                    const Icon = so.icon;
                    const isActive = item.status === so.val;
                    return (
                      <button
                        key={so.val}
                        disabled={isLocked}
                        onClick={() => updateChecklistItem(field.id, idx, { status: so.val })}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                          isActive ? so.color : "bg-transparent text-muted-foreground border-transparent hover:bg-muted"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {so.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {field.enable_risk_grading && item.status === "avvik" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground shrink-0">Risiko:</span>
                  {RISK_OPTIONS.map((ro) => (
                    <button
                      key={ro.val}
                      disabled={isLocked}
                      onClick={() => updateChecklistItem(field.id, idx, { risk_grade: ro.val })}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        item.risk_grade === ro.val ? ro.color : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {ro.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Actions row */}
              {!isLocked && (
                <div className="flex items-center gap-2">
                  {allowComment && !hasComment && !isCommentOpen && (
                    <button
                      onClick={() => toggleComment(commentKey)}
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      kommentar
                    </button>
                  )}
                  {id && (
                    <FormEvidenceUpload compact instanceId={id} path={checklistEvidencePath(field.id, idx)} locked={isLocked} onCountChange={onEvidenceCount} />
                  )}
                  {field.require_photo_on_deviation && item.status === "avvik" && !(evidence[checklistEvidencePath(field.id, idx)] > 0) && (
                    <span className="text-[10px] text-destructive">Bilde påkrevd</span>
                  )}
                </div>
              )}

              {/* Comment field */}
              {showComment && allowComment && (
                <Textarea
                  value={item.comment || ""}
                  onChange={(e) => updateChecklistItem(field.id, idx, { comment: e.target.value })}
                  disabled={isLocked}
                  className="rounded-lg text-xs"
                  rows={2}
                  placeholder="Legg til kommentar..."
                />
              )}

              {field.enable_risk_grading && item.risk_grade === "kritisk" && !item.comment?.trim() && !isLocked && (
                <p className="text-[10px] text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Kommentar påkrevd ved kritisk risiko
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={goBack} aria-label="Tilbake">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold">{templateTitle}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
              {!isLocked && (
                <span
                  role="status"
                  className={`text-[10px] ${saveState === "error" || saveState === "conflict" ? "text-destructive font-medium" : "text-muted-foreground"}`}
                >
                  {saveState === "saved" && "Lagret"}
                  {saveState === "pending" && "Endringer ikke lagret ennå"}
                  {saveState === "saving" && "Lagrer…"}
                  {saveState === "error" && "Kunne ikke lagre – prøver igjen"}
                  {saveState === "conflict" && (
                    <button type="button" className="underline" onClick={reloadAfterConflict}>Endret et annet sted – last inn på nytt</button>
                  )}
                </span>
              )}
              {isLocked && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Lock className="h-3 w-3" /> Låst
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        {fields.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Ingen felt i dette skjemaet ennå.
            </p>
          </div>
        ) : fields
          .sort((a, b) => a.order - b.order)
          .map((field) => {
            const value = answers[field.id];
            const needsComment = rules.some(
              (r) =>
                r.field_id === field.id &&
                r.action === "require_comment" &&
                r.value === "no" &&
                value === "no"
            );
            const allowComment = field.allow_comment !== false && fieldSupportsComment(field.type);

            if (field.type === "section_header") {
              return (
                <div key={field.id} className="pt-4 pb-1 border-b border-border">
                  <h2 className="text-sm font-bold text-foreground">{field.label}</h2>
                  {field.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                  )}
                </div>
              );
            }

            return (
              <div key={field.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <label className="text-sm font-medium">
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </label>

                {/* Smart/auto fields */}
                {field.type.startsWith("smart_") && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
                    ⚡ {field.type === "smart_project_name" && "Prosjektnavn (auto)"}
                    {field.type === "smart_customer_name" && "Kundenavn (auto)"}
                    {field.type === "smart_project_number" && "Prosjektnummer (auto)"}
                    {field.type === "smart_address" && "Prosjektadresse (auto)"}
                    {field.type === "smart_date" && new Date().toLocaleDateString("nb-NO")}
                  </div>
                )}

                {field.type === "email" && (
                  <Input
                    type="email"
                    value={value || ""}
                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                    disabled={isLocked}
                    className="rounded-xl h-9"
                    placeholder={field.placeholder || "navn@eksempel.no"}
                  />
                )}

                {field.type === "phone" && (
                  <Input
                    type="tel"
                    value={value || ""}
                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                    disabled={isLocked}
                    className="rounded-xl h-9"
                    placeholder={field.placeholder || "+47 000 00 000"}
                  />
                )}

                {field.type === "time" && (
                  <ModernTimePicker
                    value={value || ""}
                    onChange={(v) => handleAnswerChange(field.id, v)}
                    disabled={isLocked}
                  />
                )}

                {field.type === "address" && (
                  <Textarea
                    value={value || ""}
                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                    disabled={isLocked}
                    className="rounded-xl"
                    rows={2}
                    placeholder={field.placeholder || "Gateadresse, postnr., sted"}
                  />
                )}

                {field.type === "dropdown" && (
                  <select
                    value={value || ""}
                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                    disabled={isLocked}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Velg...</option>
                    {(field.options || []).map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}

                {field.type === "radio" && (
                  <div className="space-y-1.5">
                    {(field.options || []).map((opt, i) => (
                      <label key={i} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name={field.id}
                          value={opt}
                          checked={value === opt}
                          onChange={() => handleAnswerChange(field.id, opt)}
                          disabled={isLocked}
                          className="accent-primary"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}

                {field.type === "file_upload" && (
                  id ? <FormEvidenceUpload kind="file" instanceId={id} path={field.id} locked={isLocked} onCountChange={onEvidenceCount} /> : null
                )}

                {field.type === "checkbox_yes_no" && (
                  <div className="flex gap-2">
                    {[
                      { val: "yes", label: "Ja" },
                      { val: "no", label: "Nei" },
                    ].map((opt) => (
                      <Button
                        key={opt.val}
                        variant={value === opt.val ? "default" : "outline"}
                        size="sm"
                        className="rounded-xl flex-1"
                        disabled={isLocked}
                        onClick={() => handleAnswerChange(field.id, opt.val)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                )}

                {field.type === "checkbox_list" && renderChecklistField(field)}

                {field.type === "text" && (
                  <Input
                    value={value || ""}
                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                    disabled={isLocked}
                    className="rounded-xl h-9"
                  />
                )}

                {field.type === "textarea" && (
                  <Textarea
                    value={value || ""}
                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                    disabled={isLocked}
                    className="rounded-xl"
                    rows={3}
                  />
                )}

                {field.type === "number" && (
                  <Input
                    type="number"
                    value={value || ""}
                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                    disabled={isLocked}
                    className="rounded-xl h-9"
                  />
                )}

                {field.type === "date" && (
                  <ModernDatePicker
                    value={value || ""}
                    onChange={(v) => handleAnswerChange(field.id, v)}
                    disabled={isLocked}
                  />
                )}

                {field.type === "signature" && (
                  <div className="rounded-lg border-2 border-dashed border-border bg-muted/10 p-4 text-center">
                    {value ? (
                      <p className="text-xs text-success flex items-center justify-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Signert
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Signatur legges til ved fullføring</p>
                    )}
                  </div>
                )}

                {field.type === "photo_upload" && (
                  id ? <FormEvidenceUpload instanceId={id} path={field.id} locked={isLocked} onCountChange={onEvidenceCount} /> : null
                )}

                {/* Required comment on "Nei" */}
                {needsComment && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-medium text-destructive">
                      Kommentar påkrevd ved "Nei"
                    </label>
                    <Textarea
                      value={getFieldComment(field.id)}
                      onChange={(e) => handleAnswerChange(`${field.id}_comment`, e.target.value)}
                      disabled={isLocked}
                      className="rounded-xl"
                      rows={2}
                      placeholder="Beskriv avvik..."
                    />
                  </div>
                )}

                {/* Optional comment for all field types (hidden when empty) */}
                {allowComment && !needsComment && field.type !== "checkbox_list" && (
                  <CommentToggle
                    fieldId={field.id}
                    label={field.type === "photo_upload" ? "bildetekst" : "kommentar"}
                  />
                )}
              </div>
            );
          })}
      </div>

      {/* Bottom action bar */}
      {!isLocked && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border p-4 flex items-center justify-between z-30">
          <p className="text-xs text-muted-foreground">
            {validationIssues.length > 0 ? `${validationIssues.length} punkt gjenstår` : "Klar til ferdigstilling"}
          </p>
          <div className="flex items-center gap-2">
            {status !== "signed" && status !== "completed" && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={handleComplete}
                disabled={saving}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ferdigstill
              </Button>
            )}
            {(status === "completed" || status === "in_progress") && (
              <Button
                size="sm"
                className="rounded-xl gap-1.5"
                onClick={() => setShowSignDialog(true)}
              >
                <PenTool className="h-3.5 w-3.5" />
                Fullfør og signer
              </Button>
            )}
          </div>
        </div>
      )}

      {isLocked && isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border p-4 flex items-center justify-between z-30">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Lock className="h-3 w-3" /> Skjemaet er låst etter signering
          </p>
          {unlockOpen ? (
            <div className="flex items-center gap-2">
              <Input value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} placeholder="Begrunnelse…" className="h-9 w-44 rounded-xl text-xs" />
              <Button size="sm" className="rounded-xl" disabled={unlockReason.trim().length < 5} onClick={handleUnlock}>Lås opp</Button>
              <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setUnlockOpen(false)}>Avbryt</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setUnlockOpen(true)}>
              Lås opp (admin)
            </Button>
          )}
        </div>
      )}

      {/* Sign dialog */}
      {showSignDialog && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-bold">Signer skjema</h2>
            <p className="text-sm text-muted-foreground">
              Skriv inn ditt fulle navn for å signere og låse skjemaet.
            </p>
            <Input
              placeholder="Ditt navn..."
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="rounded-xl"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowSignDialog(false)}>
                Avbryt
              </Button>
              <Button
                size="sm"
                className="rounded-xl gap-1.5"
                disabled={!signerName.trim() || signing}
                onClick={handleSign}
              >
                {signing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <PenTool className="h-3.5 w-3.5" />
                Signer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
