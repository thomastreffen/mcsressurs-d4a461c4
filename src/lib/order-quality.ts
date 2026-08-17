// Quality score engine for order form submissions
// Now uses dynamic field analysis instead of hardcoded field keys

export type QualityLevel = "green" | "yellow" | "red";

export interface QualityIssue {
  severity: "warning" | "error";
  message: string;
  field_key?: string;
}

export interface QualityResult {
  score: QualityLevel;
  issues: QualityIssue[];
}

const QUALITY_LABELS: Record<QualityLevel, { label: string; color: string; dotClass: string }> = {
  green: { label: "Komplett", color: "bg-green-100 text-green-800", dotClass: "bg-green-500" },
  yellow: { label: "Trenger oppfølging", color: "bg-amber-100 text-amber-800", dotClass: "bg-amber-500" },
  red: { label: "Mangler å avklare", color: "bg-orange-100 text-orange-800", dotClass: "bg-orange-500" },
};

export { QUALITY_LABELS };

/**
 * Field descriptor from the template, used for dynamic quality assessment
 */
interface FieldDescriptor {
  field_key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  /** Når feltet ble lagt til malen – brukes for å ikke straffe eldre innsendelser */
  created_at?: string | null;
}

/**
 * Compute quality score dynamically based on actual template fields and submitted values.
 *
 * @param values - Record<field_key, value> of submitted answers
 * @param attachments - Array of attachment metadata
 * @param templateFields - Optional array of field descriptors from the template
 * @param submittedAt - When the submission was created; required fields added later are ignored
 */
export function computeQualityScore(
  values: Record<string, any>,
  attachments: { category?: string; file_name?: string }[] = [],
  templateFields?: FieldDescriptor[],
  submittedAt?: string | Date | null
): QualityResult {
  const issues: QualityIssue[] = [];

  const submittedTime = submittedAt ? new Date(submittedAt).getTime() : NaN;
  const existedAtSubmission = (field: FieldDescriptor) => {
    if (!Number.isFinite(submittedTime) || !field.created_at) return true;
    const added = new Date(field.created_at).getTime();
    if (!Number.isFinite(added)) return true;
    // 1 min slingringsmonn for felt opprettet rett før innsending
    return added <= submittedTime + 60_000;
  };

  if (templateFields && templateFields.length > 0) {
    // Dynamic mode: check required fields from the template definition
    for (const field of templateFields) {
      if (!field.is_required) continue;
      if (!existedAtSubmission(field)) continue;
      const val = values[field.field_key];
      if (val == null || val === "" || (Array.isArray(val) && val.length === 0)) {
        issues.push({
          severity: "error",
          message: `${field.label} mangler`,
          field_key: field.field_key,
        });
      }
    }

  } else {
    // Fallback: try to detect common field patterns by key prefix matching
    const fieldKeys = Object.keys(values);
    
    // Check if customer/company info exists (look for common patterns)
    const hasCustomerInfo = fieldKeys.some(k => 
      k.startsWith("firmanavn") || k.startsWith("kundenavn") || k.startsWith("kunde_")
    );
    if (!hasCustomerInfo && fieldKeys.length > 0) {
      // Only flag if the form has some fields but no customer identifier
      const hasAnyFilledField = fieldKeys.some(k => {
        const v = values[k];
        return v != null && v !== "";
      });
      if (!hasAnyFilledField) {
        issues.push({ severity: "warning", message: "Ingen felt er utfylt" });
      }
    }
  }

  // Check if file upload fields have matching attachments
  if (templateFields) {
    const fileFields = templateFields.filter(f => 
      f.field_type === "file_upload" || f.field_type === "image_upload"
    );
    // Only flag required file fields that are missing attachments
    for (const ff of fileFields) {
      if (!ff.is_required) continue;
      if (!existedAtSubmission(ff)) continue;

      const hasAttachment = attachments.some(a => 
        a.file_name || a.category
      );
      if (!hasAttachment) {
        issues.push({
          severity: "warning",
          message: `${ff.label} mangler`,
          field_key: ff.field_key,
        });
      }
    }
  }

  // Compute score
  const errorCount = issues.filter(i => i.severity === "error").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;

  let score: QualityLevel = "green";
  if (errorCount >= 2) score = "red";
  else if (errorCount >= 1) score = "yellow";
  else if (warningCount >= 3) score = "yellow";

  return { score, issues };
}

/** Standard missing info checklist items */
export const MISSING_INFO_OPTIONS = [
  "Mangler tegninger",
  "Mangler bilder",
  "Mangler materialliste",
  "Mangler PO/referanse",
  "Mangler kundeinformasjon",
  "Mangler fakturainformasjon",
  "Mangler beskrivelse av materialansvar",
  "Mangler informasjon om adgang / utkobling / HMS",
] as const;
