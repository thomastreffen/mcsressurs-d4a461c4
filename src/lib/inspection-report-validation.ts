/**
 * Kvalitetskontroll av AI-analysen FØR gjennomgangssiden vises som «klar».
 *
 * Kontrollene er rene datakontroller på utkastet – de skriver ingenting og
 * endrer ingen verdier. Formålet er at bruker skal se med én gang om
 * nummereringen henger sammen, om originaltekst/hjemmel/krav mangler, og om
 * AI kan ha presentert egen formulering som rapportens ordlyd.
 */
import type { AnalyzedFinding, ReportAnalysis } from "@/lib/inspection-report";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  /** Referanse/nummer på funnet kontrollen gjelder, når den er funn-spesifikk */
  findingKey?: string;
}

const norm = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Trekker ut heltall fra en referanse som «Avvik 3», «2.1», «Nr. 4» */
function refNumber(reference: string | null): number | null {
  const m = (reference ?? "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Finner nummer på funn som rapporten eksplisitt lister, ut fra tekstene
 * analysen selv returnerte (sammendrag, beskrivelse, originaltekster).
 * Brukes til å avdekke hull i nummerserien – aldri til å opprette funn.
 */
function announcedCount(analysis: ReportAnalysis): number | null {
  const text = [analysis.report_summary, analysis.description].filter(Boolean).join(" ");
  const m = text.match(/(\d+)\s*(avvik|funn|merknader?)/i);
  return m ? Number(m[1]) : null;
}

export function validateAnalysis(
  analysis: ReportAnalysis,
  findings: (AnalyzedFinding & { key: string; included: boolean; manual: boolean })[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const active = findings.filter((f) => f.included);

  if (active.length === 0) {
    issues.push({ severity: "error", message: "Ingen funn er tatt med. Legg til funn manuelt hvis rapporten inneholder avvik." });
  }

  // Nummerering: duplikater og hull
  const aiFindings = active.filter((f) => !f.manual);
  const numbers = aiFindings.map((f) => refNumber(f.reference)).filter((n): n is number => n !== null);
  const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (dupes.length > 0) {
    issues.push({
      severity: "error",
      message: `Samme funnnummer er brukt flere ganger (${[...new Set(dupes)].join(", ")}). Kontroller at nummereringen følger rapporten.`,
    });
  }
  if (numbers.length >= 2) {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let n = sorted[0]; n < sorted[sorted.length - 1]; n += 1) {
      if (!sorted.includes(n)) gaps.push(n);
    }
    if (gaps.length > 0) {
      issues.push({
        severity: "error",
        message: `Nummereringen har hull – funn ${gaps.join(", ")} finnes ikke i uttrekket. Kontroller rapporten og legg til funnet manuelt.`,
      });
    }
  }
  const missingRef = aiFindings.filter((f) => !f.reference).length;
  if (missingRef > 0 && numbers.length > 0) {
    issues.push({
      severity: "warning",
      message: `${missingRef} funn mangler nummer/referanse fra rapporten, mens andre funn har det.`,
    });
  }

  const announced = announcedCount(analysis);
  if (announced !== null && announced > aiFindings.length) {
    issues.push({
      severity: "error",
      message: `Rapporten omtaler ${announced} funn, men uttrekket inneholder ${aiFindings.length}. Kontroller originalrapporten før du oppretter saken.`,
    });
  }

  // Per funn: kildedata og fare for AI-formulering i originalteksten
  for (const f of active) {
    const label = f.reference ? `Funn ${f.reference}` : f.title ? `«${f.title}»` : "Funn uten tittel";
    if (!f.title.trim()) {
      issues.push({ severity: "error", findingKey: f.key, message: `${label}: mangler tittel.` });
    }
    if (!f.manual) {
      if (!norm(f.original_text)) {
        issues.push({
          severity: "error",
          findingKey: f.key,
          message: `${label}: originalteksten fra rapporten mangler. Lim inn ordlyden før du oppretter saken.`,
        });
      } else if (norm(f.original_text) === norm(f.title)) {
        issues.push({
          severity: "warning",
          findingKey: f.key,
          message: `${label}: originalteksten er identisk med tittelen – kontroller at det faktisk er rapportens ordlyd.`,
        });
      } else if ((f.original_text ?? "").trim().length < 40) {
        issues.push({
          severity: "warning",
          findingKey: f.key,
          message: `${label}: originalteksten er svært kort. Kontroller at hele ordlyden er med.`,
        });
      }
      if (norm(f.authority_requirement) && norm(f.authority_requirement) === norm(f.ai_suggestions?.proposed_solution)) {
        issues.push({
          severity: "warning",
          findingKey: f.key,
          message: `${label}: rapportens krav er identisk med AI-forslaget til løsning. Kontroller at kravet er rapportens egen formulering.`,
        });
      }
      if (!norm(f.legal_basis)) {
        issues.push({ severity: "warning", findingKey: f.key, message: `${label}: hjemmel/krav er ikke funnet i rapporten.` });
      }
    }
    if (f.deadline && analysis.response_deadline && f.deadline > analysis.response_deadline) {
      issues.push({
        severity: "warning",
        findingKey: f.key,
        message: `${label}: fristen er senere enn sakens svarfrist. Kontroller at fristen tilhører riktig funn.`,
      });
    }
  }

  return issues;
}
