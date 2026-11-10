import { supabase } from "@/integrations/supabase/client";

export type DocKind = "risk_assessment" | "closing_documentation" | "additional";
export type DocState =
  | "active"
  | "not_snapshotted"
  | "needs_clarification"
  | "requirements_must_be_configured"
  | "company_not_configured";
export type StepStatus = "missing" | "in_progress" | "needs_review" | "delivered" | "waived";

export interface DocStep {
  requirement_id: string;
  kind: DocKind;
  label: string;
  template_id: string | null;
  instance_id: string | null;
  instance_status: string | null;
  status: StepStatus;
  requirement_status: "required" | "waived" | "substituted";
  exception_requested: boolean;
  rules_version: number;
}

export interface DocProgress {
  job_id: string;
  state: DocState;
  category_id: string | null;
  category_name: string | null;
  conditions: string[];
  enforcement_enabled: boolean;
  work_status: string | null;
  steps: DocStep[];
  done: number;
  total: number;
  documentation_status: "pending" | "delivered" | null;
  approval_status: "not_available";
  invoice_ready: false;
}

export const KIND_LABEL: Record<DocKind, string> = {
  risk_assessment: "Risikovurdering",
  closing_documentation: "Avslutningsdokumentasjon",
  additional: "Tillegg",
};

export const CONDITION_LABEL: Record<string, string> = {
  always: "Alltid",
  installation_change: "Ved endring i anlegg",
  deviation_found: "Ved funnet avvik",
};

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  missing: "Ikke startet",
  in_progress: "Påbegynt",
  needs_review: "Må kontrolleres",
  delivered: "Levert",
  waived: "Unntatt",
};

export const STATE_LABEL: Record<Exclude<DocState, "active">, string> = {
  not_snapshotted: "Krav klare – ikke lagt på jobben ennå",
  needs_clarification: "Dokumentasjonskrav må avklares (jobbtype mangler)",
  requirements_must_be_configured: "Krav må konfigureres for denne jobbtypen",
  company_not_configured: "Selskapet har ikke satt opp dokumentasjonskrav",
};

/** Bound RPC call (an unbound supabase.rpc loses `this`). */
export const docRpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (this: typeof supabase, f: string, a: Record<string, unknown>) => Promise<{ data: any; error: any }>)
    .call(supabase, fn, args);

export function docErrorMessage(err: { message?: string } | null | undefined): string {
  const m = err?.message || "";
  if (m.includes("doc_access_denied")) return "Du har ikke tilgang til dette.";
  if (m.includes("doc_template_not_ready")) return "Skjemamalen er ikke publisert med aktiv versjon.";
  if (m.includes("doc_requirements_must_be_configured")) return "Jobbtypen mangler godkjent risikovurdering og/eller avslutningsdokumentasjon.";
  if (m.includes("doc_category_missing")) return "Velg jobbtype først.";
  if (m.includes("doc_basis_requirement_cannot_be_waived")) return "Grunnkravene kan bare erstattes med likeverdig dokument, ikke fjernes.";
  if (m.includes("doc_invalid_reason")) return "Skriv en saklig begrunnelse (minst 10 tegn).";
  if (m.includes("doc_self_approval_forbidden")) return "Du kan ikke godkjenne din egen forespørsel.";
  if (m.includes("doc_company_mismatch")) return "Valget tilhører et annet selskap.";
  if (m.includes("doc_approval_requires_rpc")) return "Godkjenning må gjøres med Godkjenn-knappen.";
  return m || "Ukjent feil";
}

/** Next action for the technician: first step that is not delivered/waived. */
export function nextStep(p: DocProgress): DocStep | null {
  return p.steps.find((s) => s.status !== "delivered" && s.status !== "waived") ?? null;
}

export function ctaLabel(step: DocStep): string {
  if (step.kind === "risk_assessment") return step.instance_id ? "Fortsett risikovurdering" : "Start risikovurdering";
  if (step.kind === "closing_documentation") return step.instance_id ? "Fortsett sluttkontroll" : "Fullfør sluttkontroll";
  return step.instance_id ? `Fortsett: ${step.label}` : `Start: ${step.label}`;
}
