import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Check, AlertCircle, Upload, Info, FileText as FileIcon, X } from "lucide-react";
import type { OrderFormField, ConditionalLogic } from "@/types/order-forms";
import { sanitizeStorageFileName } from "@/lib/storage-path";
import { computeQualityScore } from "@/lib/order-quality";
import { QualityIssuesPanel } from "@/components/orders/QualityIssuesPanel";
import { normalizeJsonValue, hasSubmissionValue } from "@/lib/json-value";
import { PricingModelField } from "@/components/orders/fields/PricingModelField";
import { validatePricingModel } from "@/lib/pricing-model";

export default function OrderFormSubmitPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { activeCompanyId } = useCompanyContext();
  const { user } = useAuth();

  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [attachments, setAttachments] = useState<{ fieldKey: string; file: File; category?: string }[]>([]);

  // Load template with sections and fields
  const { data: template, isLoading } = useQuery({
    queryKey: ["order-form-template-full", slug, activeCompanyId],
    enabled: !!slug && !!activeCompanyId,
    queryFn: async () => {
      const { data: tmpl, error } = await supabase
        .from("order_form_templates")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .eq("slug", slug!)
        .eq("is_active", true)
        .single();
      if (error || !tmpl) throw new Error("Mal ikke funnet");

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

  // Evaluate conditional logic
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
    if (!section.visibility_rules || !Array.isArray(section.visibility_rules) || section.visibility_rules.length === 0)
      return true;
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
      switch (r.operator) {
        case "equals": return String(val) === String(r.value);
        default: return true;
      }
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
        const req = isFieldRequired(field);
        const val = formData[field.field_key];
        if (field.field_type === "pricing_model") {
          const err = validatePricingModel(val, { required: req, label: field.label });
          if (err) newErrors[field.field_key] = err;
          return;
        }
        if (req) {
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
    if (!validate() || !template || !activeCompanyId) return;
    setSubmitting(true);

    try {
      const submissionId = crypto.randomUUID();

      // Build summary from key fields
      const summary: Record<string, any> = {};
      const summaryKeys = ["oppdragstittel", "kundenavn", "bestillingstype", "hastegrad", "bestiller_navn"];
      summaryKeys.forEach((k) => { if (formData[k]) summary[k] = formData[k]; });

      // Determine priority from hastegrad
      const hastegradMap: Record<string, string> = {
        "Kritisk stopp": "critical",
        "Høy": "high",
        "Normal": "normal",
        "Lav": "low",
      };
      const priority = hastegradMap[formData.hastegrad] || "normal";

      // Compute quality score with template fields
      const templateFields = template.sections.flatMap((s: any) => (s.fields || []).map((f: any) => ({
        field_key: f.field_key, label: f.label, field_type: f.field_type, is_required: f.is_required,
      })));
      const qualityResult = computeQualityScore(formData, attachments.map(a => ({ category: a.category, file_name: a.file.name })), templateFields);

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

      // Insert submission
      const { error: subErr } = await supabase.from("order_form_submissions").insert({
        id: submissionId,
        company_id: activeCompanyId,
        template_id: template.id,
        status: "new",
        source: "internal",
        requester_type: formData.bestillingstype === "intern" ? "internal" : "external",
        submitted_by: user?.id,
        priority,
        summary,
        quality_score: qualityResult.score,
        quality_issues: qualityResult.issues,
        submitter_email: recipientEmail,
        submitter_name: recipientName,
        notification_recipient_email: recipientEmail,
        notification_recipient_name: recipientName,
        notification_recipient_phone: recipientPhone,
        notification_recipient_source: recipientSource,
      } as any);
      if (subErr) throw subErr;

      // Insert field values — normalize to JSON-safe values per row
      const valueRows = Object.entries(formData)
        .filter(([, v]) => hasSubmissionValue(v))
        .map(([key, val]) => ({
          submission_id: submissionId,
          field_key: key,
          value: normalizeJsonValue(val),
        }));

      if (valueRows.length > 0) {
        const { error: valErr } = await supabase
          .from("order_form_submission_values")
          .insert(valueRows as any);
        if (valErr) {
          console.error("[OrderFormSubmit] submission_values insert failed", {
            error: valErr,
            field_keys: valueRows.map((r) => r.field_key),
            sample: valueRows.slice(0, 3),
          });
          throw new Error(`Kunne ikke lagre skjemafelt: ${valErr.message}`);
        }
      }

      // Upload attachments
      for (const att of attachments) {
        const safeName = sanitizeStorageFileName(att.file.name);
        const path = `${activeCompanyId}/${submissionId}/${Date.now()}_${safeName}`;
        const { error: uploadErr } = await supabase.storage
          .from("order-form-attachments")
          .upload(path, att.file, {
            contentType: att.file.type || "application/octet-stream",
            upsert: false,
          });
        if (uploadErr) {
          console.error("[OrderFormSubmit] upload failed", { path, file: att.file.name, error: uploadErr });
          toast.error(`Kunne ikke laste opp ${att.file.name}: ${uploadErr.message}`);
          continue;
        }
        await supabase.from("order_form_submission_attachments").insert({
          submission_id: submissionId,
          field_key: att.fieldKey,
          category: att.category || null,
          file_name: att.file.name,
          file_path: path,
          mime_type: att.file.type,
          file_size: att.file.size,
          uploaded_by: user?.id,
        });
      }

      // Activity log
      await supabase.from("order_form_activity_log").insert({
        submission_id: submissionId,
        event_type: "submitted",
        payload: { source: "internal", priority },
        created_by: user?.id,
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

      setSubmitted(true);
      toast.success("Bestilling sendt inn");
    } catch (err: any) {
      console.error(err);
      toast.error("Feil ved innsending: " + (err.message || "Ukjent feil"));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <div className="p-6 text-center text-muted-foreground">Laster skjema...</div>;
  if (!template) return <div className="p-6 text-center text-muted-foreground">Skjemamal ikke funnet</div>;

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center space-y-4 mt-20">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold">Bestilling mottatt!</h2>
        <p className="text-sm text-muted-foreground">
          {template.confirmation_text || "Bestillingen din er registrert og vil bli behandlet."}
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={() => navigate("/orders")}>
            Se bestillinger
          </Button>
          <Button onClick={() => { setSubmitted(false); setFormData({}); setAttachments([]); }}>
            Send ny bestilling
          </Button>
        </div>
      </div>
    );
  }

  const errorCount = Object.keys(errors).length;

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/orders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {template.internal_title || template.name}
          </h1>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{template.description}</p>
          )}
        </div>
      </div>

      {/* Error summary */}
      {errorCount > 0 && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">
              {errorCount} felt mangler utfylling
            </p>
            <ul className="text-xs text-destructive/80 mt-1 space-y-0.5">
              {Object.values(errors).slice(0, 5).map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
              {errorCount > 5 && <li>• ...og {errorCount - 5} til</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Sections */}
      {template.sections.map((section: any) => {
        if (!isSectionVisible(section)) return null;
        const visibleFields = section.fields.filter(isFieldVisible);
        if (visibleFields.length === 0) return null;

        // Group fields into rows based on field_width
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
              {section.description && (
                <p className="text-xs text-muted-foreground">{section.description}</p>
              )}
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
                            <FieldRenderer
                              field={{ ...field, _attachments: fieldAtts }}
                              value={formData[field.field_key]}
                              onChange={(val) => setValue(field.field_key, val)}
                              error={errors[field.field_key]}
                              required={isFieldRequired(field)}
                              onFileAdd={(file, category) =>
                                setAttachments((prev) => [...prev, { fieldKey: field.field_key, file, category }])
                              }
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

      {/* Pre-submit quality warnings */}
      {Object.keys(formData).length > 3 && template && (() => {
        const templateFields = template.sections.flatMap((s: any) => (s.fields || []).map((f: any) => ({
          field_key: f.field_key, label: f.label, field_type: f.field_type, is_required: f.is_required,
        })));
        const previewQuality = computeQualityScore(formData, attachments.map(a => ({ category: a.category, file_name: a.file.name })), templateFields);
        if (previewQuality.issues.length > 0) {
          return <QualityIssuesPanel result={previewQuality} />;
        }
        return null;
      })()}

      {/* Submit */}
      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => navigate("/orders")}>
          Avbryt
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Sender..." : "Send bestilling"}
        </Button>
      </div>
    </div>
  );
}

// ── Field Renderer ──

interface FieldRendererProps {
  field: any;
  value: any;
  onChange: (val: any) => void;
  error?: string;
  required: boolean;
  onFileAdd: (file: File, category?: string) => void;
  onFileRemove: (index: number) => void;
}

function FieldRenderer({ field, value, onChange, error, required, onFileAdd, onFileRemove }: FieldRendererProps) {
  const options: string[] = Array.isArray(field.options)
    ? field.options.map((o: any) => (typeof o === "string" ? o : o.label || o.value))
    : [];

  const renderInput = () => {
    switch (field.field_type) {
      case "short_text":
      case "email":
      case "phone":
      case "org_number":
      case "address":
        return (
          <Input
            type={field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : "text"}
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case "long_text":
        return (
          <Textarea
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-[80px]"
          />
        );

      case "number":
        return (
          <Input
            type="number"
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case "date":
        return (
          <Input
            type="date"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case "time":
      case "time_window":
        return (
          <Input
            type="time"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case "dropdown":
        return (
          <Select value={value || ""} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || "Velg..."} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "radio":
        return (
          <RadioGroup value={value || ""} onValueChange={onChange} className="space-y-2">
            {options.map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`${field.field_key}-${opt}`} />
                <Label htmlFor={`${field.field_key}-${opt}`} className="text-sm font-normal cursor-pointer">
                  {opt}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case "yes_no":
        return (
          <RadioGroup value={value === true ? "ja" : value === false ? "nei" : ""} onValueChange={(v) => onChange(v === "ja")} className="flex gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="ja" id={`${field.field_key}-ja`} />
              <Label htmlFor={`${field.field_key}-ja`} className="text-sm font-normal cursor-pointer">Ja</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="nei" id={`${field.field_key}-nei`} />
              <Label htmlFor={`${field.field_key}-nei`} className="text-sm font-normal cursor-pointer">Nei</Label>
            </div>
          </RadioGroup>
        );

      case "checkbox_list":
      case "multi_select":
        const selected: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {options.map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <Checkbox
                  checked={selected.includes(opt)}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...selected, opt]
                      : selected.filter((s) => s !== opt);
                    onChange(next);
                  }}
                  id={`${field.field_key}-${opt}`}
                />
                <Label htmlFor={`${field.field_key}-${opt}`} className="text-sm font-normal cursor-pointer">
                  {opt}
                </Label>
              </div>
            ))}
          </div>
        );

      case "file_upload":
      case "image_upload": {
        const fieldAttachments = (field as any)._attachments || [];
        return (
          <div className="space-y-2">
            <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/40 transition-colors">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {field.field_type === "image_upload" ? "Last opp bilde" : "Last opp fil"}
              </span>
              <input
                type="file"
                className="hidden"
                accept={field.field_type === "image_upload" ? "image/*" : undefined}
                multiple
                onChange={(e) => {
                  const files = e.target.files;
                  if (files) {
                    Array.from(files).forEach((f) => onFileAdd(f));
                  }
                }}
              />
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

      case "section_header":
        return null;

      default:
        return (
          <Input
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  };

  if (field.field_type === "info_box" || field.field_type === "section_header") {
    return renderInput();
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {field.label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {field.help_text && field.field_type !== "info_box" && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}
      {renderInput()}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
