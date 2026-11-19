// Exact service-to-service call into job-outlook-app-sync. Sends the service key explicitly as Bearer + apikey
// (system-caller compares it byte-for-byte) and always returns a safe status/stage instead of a generic error.
export type CentralInvokeResult = { ok: boolean; http_status: number | null; stage: string; data: any };

export function safeCentralError(status: number | null, data: any): string {
  if (status === null) return "invoke_network_error";
  const code = typeof data?.error === "string" ? data.error : typeof data?.status === "string" ? data.status : "non_2xx";
  return `http_${status}_${code}`.replace(/[^a-z0-9_]/gi, "_").slice(0, 60);
}

export async function invokeCentralSync(body: { action: "sync_event"; event_id: string; technician_id?: string },
  env: { url: string; serviceKey: string }, fetcher: typeof fetch = fetch): Promise<CentralInvokeResult> {
  if (!env.url || !env.serviceKey) return { ok: false, http_status: null, stage: "invoke_config_missing", data: null };
  let res: Response;
  try {
    res = await fetcher(`${env.url}/functions/v1/job-outlook-app-sync`, { method: "POST", signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(55000) : undefined,
      headers: { Authorization: `Bearer ${env.serviceKey}`, apikey: env.serviceKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch { return { ok: false, http_status: null, stage: "invoke_network_error", data: null }; }
  const text = await res.text(); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  if (!res.ok) return { ok: false, http_status: res.status, stage: safeCentralError(res.status, data), data };
  return { ok: true, http_status: res.status, stage: "invoked", data };
}

export const centralEnv = () => ({ url: Deno.env.get("SUPABASE_URL") ?? "", serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" });
