export function assertNotificationResult(result: { error?: { message?: string } | null; data?: { error?: string; results?: { emailSent?: boolean; autoApproved?: boolean; alreadyRecorded?: boolean }[] } | null }) {
  if (result.error || result.data?.error) throw new Error(result.data?.error || result.error?.message || "Varsling kunne ikke startes");
  const rows = result.data?.results;
  if (!rows?.length || rows.some(r => !r.emailSent && !r.autoApproved)) throw new Error("Jobben er lagret, men e-post er ikke akseptert for alle mottakere. Se Utsending per montør; ikke opprett jobben på nytt.");
}