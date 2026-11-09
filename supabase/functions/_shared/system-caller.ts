import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type BoundaryRpcClient,
  isCronBearer,
  requireGlobalAccessManager,
} from "./security-boundary.ts";

/** System endpoints (scheduled jobs, subscription management): accept the exact service-role
 * bearer, the pg_cron shared secret, or a global superadmin user JWT. Fails closed.
 * Kept separate from security-boundary.ts so that file stays import-free (frontend tests
 * import it under Node, which cannot load https: specifiers). */
export async function isSystemCaller(
  adminClient: BoundaryRpcClient,
  supabaseUrl: string,
  anonKey: string,
  authHeader: string | null,
): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const jwt = authHeader.slice("Bearer ".length).trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && jwt === serviceKey) return true;
  if (await isCronBearer(adminClient, authHeader)) return true;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.getClaims(jwt);
  if (error || !data?.claims?.sub) return false;
  return requireGlobalAccessManager(adminClient, data.claims.sub as string);
}
