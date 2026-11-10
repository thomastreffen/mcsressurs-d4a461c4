import type { FormField, ChecklistItemAnswer } from "@/lib/form-types";

export interface FormValidationIssue {
  fieldId: string;
  itemIndex?: number;
  message: string;
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/**
 * Shared completion validator. An unanswered checklist item is NEVER treated as OK.
 * Signature fields are validated by the signing step, not here.
 */
export function validateFormAnswers(fields: FormField[], answers: Record<string, any>): FormValidationIssue[] {
  const issues: FormValidationIssue[] = [];
  for (const field of fields) {
    if (field.type === "section_header" || field.type === "signature" || field.type.startsWith("smart_")) continue;

    if (field.type === "checkbox_list") {
      const items = (answers[field.id] || {}) as Record<string, Partial<ChecklistItemAnswer>>;
      (field.options || []).forEach((opt, idx) => {
        const item = items[String(idx)];
        if (!item || !item.status) {
          issues.push({ fieldId: field.id, itemIndex: idx, message: `«${opt}» er ikke besvart` });
          return;
        }
        if (item.status === "avvik" && field.require_photo_on_deviation && (!item.photo_count || item.photo_count < 1)) {
          issues.push({ fieldId: field.id, itemIndex: idx, message: `«${opt}»: avvik krever bilde` });
        }
        if (field.enable_risk_grading && item.status === "avvik" && !item.risk_grade) {
          issues.push({ fieldId: field.id, itemIndex: idx, message: `«${opt}»: velg risikograd` });
        }
        if (item.risk_grade === "kritisk" && !item.comment?.trim()) {
          issues.push({ fieldId: field.id, itemIndex: idx, message: `«${opt}»: kritisk avvik krever kommentar` });
        }
      });
      continue;
    }

    if (field.required && isEmpty(answers[field.id])) {
      issues.push({ fieldId: field.id, message: `«${field.label}» må fylles ut` });
    }
  }
  return issues;
}
