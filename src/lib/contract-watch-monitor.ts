export { healthState, type MonitorHealth } from "../../supabase/functions/_shared/contract-watch-monitor";
export const MONITOR_HEALTH_LABEL = {
  off: "Automatisk overvåking er av", blocked: "Overvåking er sperret", unverified: "Ingen vellykket synk er bekreftet",
  error: "Synk feilet", stale: "Synk er forsinket eller tapt", ok: "Synk er oppdatert",
} as const;