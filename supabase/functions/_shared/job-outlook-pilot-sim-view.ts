// Pure presentation of a pilot simulation day. Never authorizes anything; the write gates
// (flags, scope, allow-list, pilot target, job status) stay in job-outlook-app-days.ts.
export interface SimDay {
  in_pilot: boolean; gate: string | null; decision: string; reason: string | null;
  job_status?: string | null; what_if_active?: string | null;
}
export interface SimGlobal { enabled: boolean; dry_run: boolean; scope_verified: boolean; mailbox_allowed: boolean }
export type SimOutcome = { tone: "create" | "update" | "none" | "blocked" | "outside"; label: string };

const BLOCKING_STATUS: Record<string, string> = { cancelled: "kansellert", archived: "arkivert" };

export function simOutcome(d: SimDay): SimOutcome {
  if (!d.in_pilot) return { tone: "outside", label: d.gate === "pilot_target_expired" ? "Pilotdagen er utløpt – ikke berørt" : "Ikke valgt pilotdag – ikke berørt" };
  const st = d.job_status ? BLOCKING_STATUS[d.job_status] : undefined;
  if (st) {
    const hyp = d.what_if_active === "create" ? "ville blitt opprettet" : d.what_if_active === "update" ? "ville blitt oppdatert" : d.what_if_active === "adopt" ? "ville eksisterende avtale blitt tatt i bruk" : "ingen endring";
    return { tone: "blocked", label: `Sperret: jobbstatus er «${st}». Hvis jobben var aktiv: ${hyp}.` };
  }
  if (d.decision === "create") return { tone: "create", label: "Ville opprettet kalenderavtale" };
  if (d.decision === "update") return { tone: "update", label: "Ville oppdatert kalenderavtale" };
  if (d.decision === "adopt") return { tone: "update", label: "Ville tatt i bruk eksisterende avtale" };
  if (d.decision === "delete") return { tone: "update", label: "Ville slettet appens egen avtale" };
  if (d.reason === "unresolved_conflict") return { tone: "blocked", label: "Sperret: uløst konflikt i Outlook" };
  if (d.reason === "mailbox_identity_requires_reconciliation") return { tone: "blocked", label: "Sperret: kalenderidentiteten må avklares" };
  return { tone: "none", label: "Ingen endring – allerede i samsvar" };
}

export function globalGateNotes(g: SimGlobal): string[] {
  const n: string[] = [];
  if (!g.enabled) n.push("Sentral synk er AV");
  if (g.dry_run) n.push("testmodus (dry-run) er PÅ");
  if (!g.scope_verified) n.push("tilgangsomfang er ikke registrert som verifisert");
  if (!g.mailbox_allowed) n.push("postboksen er ikke på tillatt-listen");
  return n;
}
