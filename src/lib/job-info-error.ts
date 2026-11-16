/** Never turn a transport/authentication/database failure into a missing job. */
export async function jobInfoFailure(error: unknown): Promise<{ message: string; login: boolean }> {
  const e = error as { context?: Response; message?: string } | null;
  const status = e?.context?.status;
  if (status === 401 || (!status && /innlogging|logg inn/i.test(e?.message ?? ""))) {
    return { message: "Innloggingen er utløpt. Logg inn på nytt for å åpne jobbinfo.", login: true };
  }
  if (status === 403 || status === 404) {
    let code: string | undefined;
    try { code = (await e?.context?.clone().json())?.code; } catch { /* gateway response may not be JSON */ }
    if (code === "job_unavailable") return { message: "Jobben er ikke tilgjengelig for denne kontoen. Kontakt planlegger hvis dette er feil.", login: false };
    if (status === 403) return { message: "Tilgang til jobbinfo ble avvist. Kontakt planlegger hvis dette er feil.", login: false };
  }
  return { message: "Jobbinformasjonen kunne ikke hentes. Prøv igjen. Dette betyr ikke at jobben er fjernet.", login: false };
}