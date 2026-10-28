import { findingDisplayStatus, OPEN_ACTION_STATUSES, inspectionStatusMeta } from "@/lib/inspections";
import type { DocumentationStatus, FindingDisplayInput, FindingDisplayStatus } from "@/lib/inspections";
import type { ComplianceTone } from "@/lib/compliance";

export interface SummaryFinding extends FindingDisplayInput {
  id: string;
  inspection_id: string;
  deleted_at?: string | null;
}
export interface SummaryAction {
  id: string;
  status: string;
  compliance_inspection_id: string | null;
  compliance_finding_id: string | null;
  completed_at?: string | null;
  deleted_at?: string | null;
}
export interface SummaryEvidence {
  id: string;
  inspection_id: string;
  finding_id: string | null;
}
export interface InspectionSummary {
  findings: number;
  counts: Record<FindingDisplayStatus, number>;
  internallyFinished: number;
  openActions: number;
  evidenceCount: number;
  documentedFindings: number;
  documentationLabel: string;
  status: string;
  label: string;
  tone: ComplianceTone;
  active: boolean;
  deadlineRelevant: boolean;
}

/** Read-only projection: finding treatment, linked evidence and live documentation
 * remain separate. This is not send authorization and never closes a case. */
export function summarizeInspection(
  inspection: { id: string; status: string; closed_at?: string | null },
  findings: SummaryFinding[],
  actions: SummaryAction[],
  evidence: SummaryEvidence[],
  documentationByFinding: Record<string, DocumentationStatus> = {},
): InspectionSummary {
  const relevant = findings.filter(f => f.inspection_id === inspection.id && !f.deleted_at);
  const ids = new Set(relevant.map(f => f.id));
  const counts: InspectionSummary["counts"] = { open: 0, in_progress: 0, ready: 0, submitted: 0, closed: 0 };
  for (const f of relevant) counts[findingDisplayStatus(f, documentationByFinding[f.id]).status]++;
  // A finding link takes priority: stale links to deleted/other-case findings
  // must not be counted merely because the case link remains.
  const openActions = new Set(actions.filter(a => !a.deleted_at && !a.completed_at &&
    OPEN_ACTION_STATUSES.includes(a.status) &&
    (a.compliance_finding_id ? ids.has(a.compliance_finding_id) : a.compliance_inspection_id === inspection.id)
  ).map(a => a.id)).size;
  const linked = [...new Map(evidence.filter(e => e.inspection_id === inspection.id &&
    (!e.finding_id || ids.has(e.finding_id))).map(e => [e.id, e])).values()];
  const documentedFindings = new Set(linked.flatMap(e => e.finding_id ? [e.finding_id] : [])).size;
  const internallyFinished = counts.ready + counts.submitted + counts.closed;
  let display: { status: string; label: string; tone: ComplianceTone };
  if (inspection.status === "closed") display = { status: "closed", label: "Lukket", tone: "neutral" };
  else if (!relevant.length) {
    const meta = inspectionStatusMeta(inspection.status);
    display = { status: inspection.status, label: meta.label, tone: meta.tone };
  } else if (counts.open + counts.in_progress > 0 || openActions > 0) {
    const untouched = counts.open === relevant.length && openActions === 0;
    display = untouched ? { status: "open", label: "Åpen", tone: "neutral" } : { status: "in_progress", label: "Under arbeid", tone: "warn" };
  } else if (counts.submitted + counts.closed === relevant.length) {
    // Closed findings alone never fabricate formal closure of the case.
    display = { status: "submitted", label: "Oversendt", tone: "ok" };
  } else display = { status: "ready", label: "Klar for oversendelse", tone: "ok" };
  const active = !["submitted", "closed"].includes(display.status);
  return {
    ...display, active, deadlineRelevant: active, findings: relevant.length, counts,
    internallyFinished, openActions, evidenceCount: linked.length, documentedFindings,
    documentationLabel: linked.length ? `${linked.length} bevis koblet · dokumentasjon på ${documentedFindings}/${relevant.length} funn` : "Ingen bevis koblet",
  };
}