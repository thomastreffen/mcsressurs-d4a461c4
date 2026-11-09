/** Protocol-specific boundaries; never infer privileges from JWT payloads or role names. */
export function isExactServiceBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  return header === `Bearer ${secret}`;
}

export interface BasicGraphNotification {
  subscriptionId?: unknown;
  clientState?: unknown;
  resource?: unknown;
}

export interface GraphSubscriptionBoundary {
  subscription_id: string;
  client_state: string;
  company_id: string | null;
  status: string;
  resource: string;
  expiration_at: string;
}

/** Basic (non-rich) Graph callbacks authenticate with the stored clientState secret.
 * Rich callbacks need signed validationTokens and are not enabled by these subscriptions. */
export function validBasicGraphNotification(
  notification: BasicGraphNotification,
  subscription: GraphSubscriptionBoundary | null,
  now = Date.now(),
): boolean {
  if (!subscription || subscription.status !== "active" || !subscription.company_id) return false;
  if (typeof notification.clientState !== "string" || !notification.clientState) return false;
  if (notification.subscriptionId !== subscription.subscription_id || notification.clientState !== subscription.client_state) return false;
  const expiry = Date.parse(subscription.expiration_at);
  if (!Number.isFinite(expiry) || expiry <= now) return false;
  if (typeof notification.resource !== "string") return false;
  // Graph callbacks use users/{mailbox-id}/messages/{id}; subscription resources may use
  // mailbox e-mail + mailFolders('Inbox'). Scope by stable subscription/state, never a supplied company.
  return /^users\/[^/?#]+\/messages\/[^/?#]+$/i.test(notification.resource);
}

export interface BoundaryRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/** Global system administration (provisioning, roles, access): only global superadmin. Fails closed. */
export async function requireGlobalAccessManager(client: BoundaryRpcClient, callerId: string): Promise<boolean> {
  const { data, error } = await client.rpc("is_global_superadmin", { _auth_user_id: callerId });
  return !error && data === true;
}

export interface BoundaryQueryClient extends BoundaryRpcClient {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

/** Legacy admin (admin role or v1 admin.manage_users) only counts inside companies with active membership;
 * global superadmin counts everywhere. Mirrors public.legacy_admin_in_company. */
/** Set includeV1ManageUsers=false where the caller previously only accepted the legacy admin role, so no one is widened. */
export async function legacyAdminInCompany(
  client: BoundaryQueryClient, callerId: string, companyId: string | null | undefined,
  { includeV1ManageUsers = true }: { includeV1ManageUsers?: boolean } = {},
): Promise<boolean> {
  if (await requireGlobalAccessManager(client, callerId)) return true;
  if (!companyId) return false;
  const [{ data: roles }, manageRes, { data: member }] = await Promise.all([
    client.from("user_roles").select("role").eq("user_id", callerId),
    includeV1ManageUsers
      ? client.rpc("check_permission", { _user_id: callerId, _perm: "admin.manage_users" })
      : Promise.resolve({ data: false, error: null }),
    client.from("user_memberships").select("id").eq("user_id", callerId).eq("company_id", companyId).eq("is_active", true).limit(1),
  ]);
  const legacy = (roles ?? []).some((r: { role: string }) => r.role === "admin") || manageRes.data === true;
  if (!legacy || !Array.isArray(member) || member.length === 0) return false;
  // Explicit per-company admin exclusion (owner-approved), mirrors public.legacy_admin_excluded.
  const { data: excluded, error: exErr } = await client.rpc("legacy_admin_excluded", { _uid: callerId, _company: companyId });
  return !exErr && excluded !== true;
}