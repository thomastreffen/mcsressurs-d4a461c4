/** Canonical landing page per system role. Montør = Min dag; everyone else = kontrollsenter. */
export function homePathForRole(role: string | null | undefined): "/my-day" | "/overview" {
  return role === "montør" ? "/my-day" : "/overview";
}
