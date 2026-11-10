import type { FormField, FormRule, ChecklistItemAnswer } from "@/lib/form-types";

export interface FormValidationIssue {
  fieldId: string;
  itemIndex?: number;
  message: string;
}

/** Number of files actually stored in the private evidence bucket, keyed by evidence path. */
export type EvidenceCounts = Record<string, number>;

export const checklistEvidencePath = (fieldId: string, idx: number) => `${fieldId}/${idx}`;

const asText = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
};

const VALID_STATUS = new Set(["ok", "avvik", "ikke_relevant"]);
const VALID_RISK = new Set(["lav", "middels", "hoy", "kritisk"]);

/**
 * Client mirror of the server validator `form_validate_answers` (migration 0081).
 * The server result is authoritative; this only gives instant feedback.
 * An unanswered checklist item is NEVER treated as OK. Photo evidence counts come from
 * real stored files, never from client-reported photo_count. Signatures are handled by signing.
 */
export function validateFormAnswers(
  fields: FormField[],
  answers: Record<string, any>,
  rules: FormRule[] = [],
  evidence: EvidenceCounts = {},
): FormValidationIssue[] {
  const issues: FormValidationIssue[] = [];
  for (const field of fields) {
    const t = field.type;
    if (t === "section_header" || t === "signature" || t.startsWith("smart_")) continue;
    const label = field.label || field.id;
    const v = answers[field.id];

    if (t === "checkbox_list") {
      const items = (v && typeof v === "object" ? v : {}) as Record<string, Partial<ChecklistItemAnswer>>;
      (field.options || []).forEach((opt, idx) => {
        const item = items[String(idx)];
        if (!item || !item.status || !VALID_STATUS.has(item.status)) {
          issues.push({ fieldId: field.id, itemIndex: idx, message: `«${opt}» er ikke besvart` });
          return;
        }
        if (item.status !== "avvik") return;
        if (field.require_photo_on_deviation && (evidence[checklistEvidencePath(field.id, idx)] || 0) < 1) {
          issues.push({ fieldId: field.id, itemIndex: idx, message: `«${opt}»: avvik krever bilde` });
        }
        if (field.enable_risk_grading && (!item.risk_grade || !VALID_RISK.has(item.risk_grade))) {
          issues.push({ fieldId: field.id, itemIndex: idx, message: `«${opt}»: velg risikograd` });
        }
        if (item.risk_grade === "kritisk" && !item.comment?.trim()) {
          issues.push({ fieldId: field.id, itemIndex: idx, message: `«${opt}»: kritisk avvik krever kommentar` });
        }
      });
      continue;
    }

    if (t === "photo_upload" || t === "file_upload") {
      if (field.required && (evidence[field.id] || 0) < 1) {
        issues.push({ fieldId: field.id, message: `«${label}» krever opplastet fil` });
      }
      continue;
    }

    const s = asText(v);
    if (s === null) {
      if (field.required) issues.push({ fieldId: field.id, message: `«${label}» må fylles ut` });
      continue;
    }
    const invalid =
      (t === "checkbox_yes_no" && s !== "yes" && s !== "no") ||
      (t === "number" && !/^-?[0-9]+([.,][0-9]+)?$/.test(s)) ||
      (t === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) ||
      (t === "date" && !/^\d{4}-\d{2}-\d{2}/.test(s)) ||
      (t === "time" && !/^\d{2}:\d{2}/.test(s)) ||
      ((t === "dropdown" || t === "radio") && !(field.options || []).includes(s));
    if (invalid) issues.push({ fieldId: field.id, message: `«${label}» har ugyldig verdi` });
  }

  for (const r of rules) {
    if (r.action !== "require_comment") continue;
    if (asText(answers[r.field_id]) === r.value && !asText(answers[`${r.field_id}_comment`])) {
      issues.push({ fieldId: r.field_id, message: "Kommentar påkrevd for valgt svar" });
    }
  }
  return issues;
}

/** Map server RPC error messages to plain Norwegian. */
export function formRpcErrorMessage(err: { message?: string } | null | undefined): string {
  const m = err?.message || "";
  if (m.includes("form_revision_conflict")) return "Skjemaet er endret på en annen enhet. Last inn på nytt før du fortsetter.";
  if (m.includes("form_locked")) return "Skjemaet er signert og låst.";
  if (m.includes("form_access_denied")) return "Du har ikke tilgang til å endre dette skjemaet.";
  if (m.includes("form_invalid_signer")) return "Skriv inn fullt navn for å signere.";
  if (m.includes("form_invalid_reason")) return "Skriv en begrunnelse (minst 5 tegn).";
  if (m.includes("form_version_missing")) return "Skjemamalen mangler versjon. Kontakt administrator.";
  return m || "Ukjent feil";
}
