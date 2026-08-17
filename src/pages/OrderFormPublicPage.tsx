import { useState, useMemo, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Check, AlertCircle, Upload, Info, Loader2, FileText as FileIcon, X } from "lucide-react";
import { ModernDatePicker, ModernTimePicker } from "@/components/ui/modern-date-time-picker";
import type { ConditionalLogic } from "@/types/order-forms";
import { sanitizeStorageFileName } from "@/lib/storage-path";
import { normalizeJsonValue, hasSubmissionValue } from "@/lib/json-value";
import { PricingModelField } from "@/components/orders/fields/PricingModelField";
import { validatePricingModel, hasPricingModelValue } from "@/lib/pricing-model";

export default function OrderFormPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get("embed") === "1";
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionNo, setSubmissionNo] = useState<string | null>(null);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{ fieldKey: string; file: File }[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-resize for iframe embedding – send height on every layout change
  useEffect(() => {
    if (!isEmbed) return;

    let lastHeight = 0;
    const sendHeight = () => {
      const h = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.offsetHeight,
      );
      if (h !== lastHeight) {
        lastHeight = h;
        try {
          window.parent.postMessage(
            JSON.stringify({ type: "mcs-form-resize", height: h }),
            "*"
          );
        } catch (_) {}
      }
    };

    // Observe body size changes
    const ro = new ResizeObserver(sendHeight);
    ro.observe(document.body);

    // Also observe mutations (dynamic fields, validation messages, file uploads)
    const mo = new MutationObserver(sendHeight);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });

    // Periodic fallback for edge-cases (images loading, fonts, etc.)
    const interval = setInterval(sendHeight, 500);

    sendHeight();
    return () => { ro.disconnect(); mo.disconnect(); clearInterval(interval); };
  }, [isEmbed]);

  const { data: template, isLoading, error: loadError } = useQuery({
    queryKey: ["order-form-public", slug],
    enabled: !!slug,
    queryFn: async () => {
      // Find active template by slug (no company filter for public)
      const { data: tmpl, error } = await supabase
        .from("order_form_templates")
        .select("*")
        .eq("slug", slug!)
        .eq("is_active", true)
        .in("audience_type", ["external", "both"])
        .single();
      if (error || !tmpl) throw new Error("Skjema ikke funnet eller ikke tilgjengelig");

      const { data: secs } = await supabase
        .from("order_form_template_sections")
        .select("*")
        .eq("template_id", tmpl.id)
        .eq("is_active", true)
        .order("sort_order");

      const { data: fields } = await supabase
        .from("order_form_template_fields")
        .select("*")
        .eq("template_id", tmpl.id)
        .eq("is_active", true)
        .order("sort_order");

      return {
        ...tmpl,
        sections: (secs || []).map((s: any) => ({
          ...s,
          fields: (fields || []).filter((f: any) => f.section_id === s.id),
        })),
      };
    },
  });

  const isFieldVisible = (field: any): boolean => {
    if (!field.conditional_logic) return true;
    const logic = field.conditional_logic as ConditionalLogic;
    if (!logic.rules || logic.rules.length === 0) return true;
    const results = logic.rules.map((rule) => {
      const val = formData[rule.field_key];
      switch (rule.operator) {
        case "equals": return String(val) === String(rule.value);
        case "not_equals": return String(val) !== String(rule.value);
        case "contains": return String(val || "").includes(String(rule.value));
        case "is_empty": return !val || val === "";
        case "is_not_empty": return !!val && val !== "";
        default: return true;
      }
    });
    const match = logic.logic === "or" ? results.some(Boolean) : results.every(Boolean);
    return logic.action === "show" ? match : logic.action === "hide" ? !match : true;
  };

  const isSectionVisible = (section: any): boolean => {
    if (!section.visibility_rules || !Array.isArray(section.visibility_rules) || section.visibility_rules.length === 0) return true;
    return section.visibility_rules.every((rule: ConditionalLogic) => {
      const results = rule.rules.map((r) => {
        const val = formData[r.field_key];
        switch (r.operator) {
          case "equals": return String(val) === String(r.value);
          case "not_equals": return String(val) !== String(r.value);
          default: return true;
        }
      });
      const match = rule.logic === "or" ? results.some(Boolean) : results.every(Boolean);
      return rule.action === "show" ? match : !match;
    });
  };

  const isFieldRequired = (field: any): boolean => {
    if (field.is_required) return true;
    if (!field.conditional_logic) return false;
    const logic = field.conditional_logic as ConditionalLogic;
    if (logic.action !== "require") return false;
    const results = logic.rules.map((r) => {
      const val = formData[r.field_key];
      switch (r.operator) { case "equals": return String(val) === String(r.value); default: return true; }
    });
    return logic.logic === "or" ? results.some(Boolean) : results.every(Boolean);
  };

  const setValue = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!template) return false;
    template.sections.forEach((section: any) => {
      if (!isSectionVisible(section)) return;
      section.fields.forEach((field: any) => {
        if (!isFieldVisible(field)) return;
        const val = formData[field.field_key];
        if (field.field_type === "pricing_model") {
          const err = validatePricingModel(val, {
            required: isFieldRequired(field),
            label: field.label,
          });
          if (err) newErrors[field.field_key] = err;
          return;
        }
        if (isFieldRequired(field)) {
          if (val == null || val === "" || (Array.isArray(val) && val.length === 0)) {
            newErrors[field.field_key] = `${field.label} er påkrevd`;
          }
        }
      });
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!validate() || !template) return;
    setSubmitting(true);
    try {
      const submissionId = crypto.randomUUID();
      const summary: Record<string, any> = {};
      ["oppdragstittel", "kundenavn", "firmanavn", "bestiller_navn"].forEach((k) => { if (formData[k]) summary[k] = formData[k]; });

      // Resolve notification recipient from form data
      // Priority: bestiller_ fields > epost_kunde/kontakt > fallback
      const findFormVal = (...keys: string[]) => {
        for (const k of keys) {
          if (formData[k]) return String(formData[k]);
          const match = Object.keys(formData).find(fk => fk.startsWith(k));
          if (match && formData[match]) return String(formData[match]);
        }
        return null;
      };
      const hasBestillerFields = !!(formData.bestiller_epost || formData.bestiller_navn);
      const recipientEmail = findFormVal("bestiller_epost", "epost_kunde", "epost", "kontakt_epost");
      const recipientName = findFormVal("bestiller_navn", "kontaktperson", "kontaktperson_kunde");
      const recipientPhone = findFormVal("bestiller_telefon", "telefon_kunde", "telefon", "kontakt_telefon");
      const recipientSource = hasBestillerFields ? "bestiller_fields" : "auto";
      // Generate tracking token client-side to avoid needing anon SELECT after INSERT
      const trackingToken = crypto.randomUUID();

      const { error: subErr } = await supabase.from("order_form_submissions").insert({
        id: submissionId,
        company_id: template.company_id,
        template_id: template.id,
        status: "new",
        source: "external",
        requester_type: "external",
        priority: "normal",
        summary,
        submitter_email: recipientEmail,
        submitter_name: recipientName,
        notification_recipient_email: recipientEmail,
        notification_recipient_name: recipientName,
        notification_recipient_phone: recipientPhone,
        notification_recipient_source: recipientSource,
        public_tracking_token: trackingToken,
      } as any);
      if (subErr) throw subErr;

      // Normalize values to JSON-safe form and insert with explicit error handling.
      // If this fails, we MUST NOT show the user a "submission received" success.
      const valueRows = Object.entries(formData)
        .filter(([, v]) => hasSubmissionValue(v))
        .map(([key, val]) => ({
          submission_id: submissionId,
          field_key: key,
          value: normalizeJsonValue(val),
        }));

      if (valueRows.length > 0) {
        const { error: valuesErr } = await supabase
          .from("order_form_submission_values")
          .insert(valueRows as any);
        if (valuesErr) {
          console.error("[OrderFormPublic] submission_values insert failed", {
            error: valuesErr,
            field_keys: valueRows.map((r) => r.field_key),
            sample: valueRows.slice(0, 3),
          });
          // Log the failure to activity log so admins can see what happened
          await supabase.from("order_form_activity_log").insert({
            submission_id: submissionId,
            event_type: "submit_values_failed",
            payload: {
              error: valuesErr.message,
              attempted_field_count: valueRows.length,
              field_keys: valueRows.map(r => r.field_key),
            },
          });
          throw new Error(`Kunne ikke lagre skjemafelt: ${valuesErr.message}`);
        }
      }

      const failedAttachments: string[] = [];
      for (const att of attachments) {
        const safeName = sanitizeStorageFileName(att.file.name);
        const path = `${template.company_id}/${submissionId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("order-form-attachments")
          .upload(path, att.file, {
            contentType: att.file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) {
          console.error("[OrderFormPublic] upload failed", { path, file: att.file.name, error: upErr });
          failedAttachments.push(`${att.file.name}: ${upErr.message}`);
          continue;
        }
        const { error: attInsErr } = await supabase.from("order_form_submission_attachments").insert({
          submission_id: submissionId, field_key: att.fieldKey,
          file_name: att.file.name, file_path: path,
          mime_type: att.file.type, file_size: att.file.size,
        });
        if (attInsErr) failedAttachments.push(`${att.file.name}: ${attInsErr.message}`);
      }
      if (failedAttachments.length > 0) {
        await supabase.from("order_form_activity_log").insert({
          submission_id: submissionId,
          event_type: "submit_attachments_partial_failure",
          payload: { failures: failedAttachments },
        });
      }

      await supabase.from("order_form_activity_log").insert({
        submission_id: submissionId, event_type: "submitted",
        payload: { source: "external", value_count: valueRows.length, attachment_count: attachments.length - failedAttachments.length },
      });

      // Auto-send notification to postkontor (fire-and-forget)
      supabase.functions.invoke("order-form-notify", {
        body: { submission_id: submissionId, notification_type: "new_order" },
      }).catch((err) => console.error("Auto-notify failed:", err));

      // Auto-send confirmation w/ tracking link to bestiller — edge function resolves email
      // via fallback chain (notification_recipient_email, submitter_email, prefix-matched
      // form fields like bestiller_epost_*). Returns no_bestiller_email if none found.
      supabase.functions.invoke("order-form-notify", {
        body: { submission_id: submissionId, notification_type: "confirmation" },
      }).catch((err) => console.error("Auto-confirm failed:", err));

      setSubmissionNo(null); // submission_no is generated server-side; not available without SELECT
      setTrackingToken(trackingToken);
      setSubmitted(true);
    } catch (err: any) {
      console.error("Submit failed:", err);
      setSubmitError(err?.message || "Noe gikk galt under innsending. Prøv igjen, eller kontakt oss om problemet vedvarer.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !template) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <AlertCircle className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Skjemaet finnes ikke eller er ikke tilgjengelig.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md mx-auto text-center space-y-4 p-6">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Bestilling mottatt!</h2>
          {submissionNo && (
            <p className="text-sm font-medium text-foreground">Bestillingsnummer: {submissionNo}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {template.confirmation_text || "Bestillingen din er registrert og vil bli behandlet. Du vil bli kontaktet ved behov."}
          </p>
          {trackingToken && (
            <div className="pt-2 space-y-2">
              <a
                href={`/bestilling/status/${trackingToken}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors w-full"
              >
                Følg bestillingen
              </a>
              <p className="text-xs text-muted-foreground">
                Du kan følge status og svare på eventuelle spørsmål via denne lenken.
              </p>
            </div>
          )}
          <Button
            variant="outline"
            onClick={() => { setSubmitted(false); setFormData({}); setAttachments([]); setSubmissionNo(null); setTrackingToken(null); }}
          >
            Send ny bestilling
          </Button>
        </div>
      </div>
    );
  }

  const errorCount = Object.keys(errors).length;

  return (
    <div className={isEmbed ? "bg-background" : "min-h-screen bg-background"}>
      <div className={`max-w-3xl mx-auto ${isEmbed ? "p-4 space-y-4" : "p-6 space-y-6"}`}>
        {/* Header */}
        <div className="text-center space-y-2 py-4">
          <h1 className="text-2xl font-bold text-foreground">
            {template.external_title || template.name}
          </h1>
          {template.description && (
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">{template.description}</p>
          )}
        </div>

        {/* Errors */}
        {errorCount > 0 && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">{errorCount} felt mangler utfylling</p>
              <ul className="text-xs text-destructive/80 mt-1 space-y-0.5">
                {Object.values(errors).slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          </div>
        )}

        {/* Sections with layout */}
        {template.sections.map((section: any) => {
          if (!isSectionVisible(section)) return null;
          const visibleFields = section.fields.filter(isFieldVisible);
          if (visibleFields.length === 0) return null;

          const rows: { fields: any[] }[] = [];
          let currentRow: any[] = [];
          let currentWidth = 0;
          for (const field of visibleFields) {
            const w = (field as any).field_width || "full";
            const frac = w === "half" ? 0.5 : w === "third" ? 0.33 : w === "two_thirds" ? 0.66 : 1;
            if (currentWidth + frac > 1.01 && currentRow.length > 0) {
              rows.push({ fields: currentRow });
              currentRow = [];
              currentWidth = 0;
            }
            currentRow.push(field);
            currentWidth += frac;
          }
          if (currentRow.length > 0) rows.push({ fields: currentRow });

          return (
            <Card key={section.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{section.title}</CardTitle>
                {section.description && <p className="text-xs text-muted-foreground">{section.description}</p>}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {rows.map((row, ri) => (
                    <div key={ri} className={row.fields.length > 1 ? "flex gap-3" : ""}>
                      {row.fields.map((field: any) => {
                        const w = (field as any).field_width || "full";
                        const style: React.CSSProperties = row.fields.length > 1
                          ? { width: w === "half" ? "calc(50% - 6px)" : w === "third" ? "calc(33.33% - 8px)" : w === "two_thirds" ? "calc(66.66% - 4px)" : "100%" }
                          : {};
                        const fieldAtts = attachments
                          .map((a, idx) => ({ ...a, index: idx }))
                          .filter((a) => a.fieldKey === field.field_key);
                        return (
                          <div key={field.id} style={style} className={row.fields.length > 1 ? "min-w-0" : ""}>
                            <PublicFieldRenderer
                              field={{ ...field, _attachments: fieldAtts }}
                              value={formData[field.field_key]}
                              onChange={(val) => setValue(field.field_key, val)}
                              error={errors[field.field_key]}
                              required={isFieldRequired(field)}
                              onFileAdd={(file) => setAttachments((prev) => [...prev, { fieldKey: field.field_key, file }])}
                              onFileRemove={(idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Submit */}
        <div className="flex flex-col items-center gap-3 pb-12">
          {submitError && (
            <div className="w-full max-w-md rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Innsendingen ble ikke fullført</p>
                  <p className="text-xs mt-1 opacity-90">{submitError}</p>
                </div>
              </div>
            </div>
          )}
          <Button size="lg" className="min-w-[200px] text-base" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sender...
              </>
            ) : (
              "Send inn bestilling"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Public Field Renderer ──

function PublicFieldRenderer({ field, value, onChange, error, required, onFileAdd, onFileRemove }: {
  field: any; value: any; onChange: (v: any) => void; error?: string; required: boolean; onFileAdd: (f: File) => void; onFileRemove: (index: number) => void;
}) {
  const options: string[] = Array.isArray(field.options)
    ? field.options.map((o: any) => (typeof o === "string" ? o : o.label || o.value))
    : [];

  const renderInput = () => {
    switch (field.field_type) {
      case "short_text": case "email": case "phone": case "org_number": case "address":
        return <Input type={field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : "text"} placeholder={field.placeholder || ""} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
      case "long_text":
        return <Textarea placeholder={field.placeholder || ""} value={value || ""} onChange={(e) => onChange(e.target.value)} className="min-h-[80px]" />;
      case "number":
        return <Input type="number" placeholder={field.placeholder || ""} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
      case "date":
        return <ModernDatePicker value={value || ""} onChange={onChange} />;
      case "time": case "time_window":
        return <ModernTimePicker value={value || ""} onChange={onChange} />;
      case "dropdown":
        return (
          <Select value={value || ""} onValueChange={onChange}>
            <SelectTrigger><SelectValue placeholder={field.placeholder || "Velg..."} /></SelectTrigger>
            <SelectContent>{options.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
          </Select>
        );
      case "radio":
        return (
          <RadioGroup value={value || ""} onValueChange={onChange} className="space-y-2">
            {options.map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`${field.field_key}-${opt}`} />
                <Label htmlFor={`${field.field_key}-${opt}`} className="text-sm font-normal cursor-pointer">{opt}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      case "pricing_model":
        return (
          <PricingModelField
            fieldKey={field.field_key}
            value={value}
            onChange={onChange}
            pricePlaceholder={field.placeholder || undefined}
          />
        );
      case "yes_no":
        return (
          <RadioGroup value={value === true ? "ja" : value === false ? "nei" : ""} onValueChange={(v) => onChange(v === "ja")} className="flex gap-4">
            <div className="flex items-center gap-2"><RadioGroupItem value="ja" id={`${field.field_key}-ja`} /><Label htmlFor={`${field.field_key}-ja`} className="text-sm font-normal cursor-pointer">Ja</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="nei" id={`${field.field_key}-nei`} /><Label htmlFor={`${field.field_key}-nei`} className="text-sm font-normal cursor-pointer">Nei</Label></div>
          </RadioGroup>
        );
      case "checkbox_list": case "multi_select": {
        const selected: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {options.map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <Checkbox checked={selected.includes(opt)} onCheckedChange={(checked) => onChange(checked ? [...selected, opt] : selected.filter((s) => s !== opt))} id={`${field.field_key}-${opt}`} />
                <Label htmlFor={`${field.field_key}-${opt}`} className="text-sm font-normal cursor-pointer">{opt}</Label>
              </div>
            ))}
          </div>
        );
      }
      case "file_upload": case "image_upload": {
        const fieldAttachments = (field as any)._attachments || [];
        return (
          <div className="space-y-2">
            <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/40 transition-colors">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{field.field_type === "image_upload" ? "Last opp bilde" : "Last opp fil"}</span>
              <input type="file" className="hidden" accept={field.field_type === "image_upload" ? "image/*" : undefined} multiple onChange={(e) => { if (e.target.files) { Array.from(e.target.files).forEach((f) => onFileAdd(f)); } }} />
            </label>
            {fieldAttachments.length > 0 && (
              <div className="space-y-1">
                {fieldAttachments.map((att: { file: File; index: number }, i: number) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-sm">
                    <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1 font-medium">{att.file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {att.file.size < 1024 * 1024 ? `${Math.round(att.file.size / 1024)} KB` : `${(att.file.size / 1024 / 1024).toFixed(1)} MB`}
                    </span>
                    <button type="button" onClick={() => onFileRemove(att.index)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
      case "info_box":
        return (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">{field.help_text || field.label}</p>
          </div>
        );
      case "section_header": return null;
      default:
        return <Input placeholder={field.placeholder || ""} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
    }
  };

  if (field.field_type === "info_box" || field.field_type === "section_header") return renderInput();

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {field.label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {field.help_text && field.field_type !== "info_box" && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      {renderInput()}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
