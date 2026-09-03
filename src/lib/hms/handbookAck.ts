import type { QueryClient } from "@tanstack/react-query";

/** Alle visninger som må oppdateres når en bekreftelse registreres. */
const ACK_QUERY_KEYS = [
  "hms-handbook",
  "hms-handbook-versions",
  "hms-handbook-my-ack",
  "hms-handbook-ack-overview",
  "handbook-recipients",
  "handbook-distributions",
  "handbook-ack-status",
  "handbook-coverage",
  "my-handbook",
  "my-handbooks",
];

export function invalidateAckQueries(qc: QueryClient) {
  for (const key of ACK_QUERY_KEYS) qc.invalidateQueries({ queryKey: [key] });
}

export const ACK_SCOPE_LABEL = {
  whole_handbook: "Hele håndboken",
  chapter: "Kapittel",
} as const;

export const CONFIRMED_VIA_LABEL = {
  internal: "Bekreftet internt",
  token: "Bekreftet via utsending",
} as const;

export function confirmedViaLabel(via?: string | null) {
  return via === "token" ? CONFIRMED_VIA_LABEL.token : CONFIRMED_VIA_LABEL.internal;
}
