import { supabase } from "@/integrations/supabase/client";
import { fetchFinancialProjectNumbers } from "@/lib/project-reference";
import { canPlanNewJob, type OpenStatus } from "@/lib/project-picker";

export const ECONOMIC_PROJECT_HINT = "Økonomiske prosjekter opprettes i Tripletex og hentes inn her";

export type GateResult = { ok: true } | { ok: false; message: string };

export function gateFromStatus(linked: boolean, status: OpenStatus | "not_linked" | null): GateResult {
  if (!linked) return { ok: true }; // legacy/unlinked parent: unchanged Hub flow
  if (status === "not_linked") return { ok: false, message: "Fikk ikke bekreftet Tripletex-koblingen for prosjektet" };
  if (canPlanNewJob(status as OpenStatus)) return { ok: true };
  if (status === "closed") return { ok: false, message: "Prosjektet er avsluttet i Tripletex – ny jobb kan ikke planlegges" };
  return { ok: false, message: "Fikk ikke bekreftet at prosjektet er åpent i Tripletex – prøv igjen" };
}

/** Linked parents require a fresh Tripletex isClosed === false; read errors fail closed. */
export async function checkParentOpenForNewJob(parentId: string, companyId: string | null): Promise<GateResult> {
  const linked = (await fetchFinancialProjectNumbers([parentId])).has(parentId);
  if (!linked) return gateFromStatus(false, null);
  try {
    const { data, error } = await supabase.functions.invoke("tripletex-import", {
      body: { action: "project_open_status", company_id: companyId, event_id: parentId },
    });
    if (error) return gateFromStatus(true, "unknown");
    return gateFromStatus(true, (data as any)?.status ?? "unknown");
  } catch {
    return gateFromStatus(true, "unknown");
  }
}
