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

/** Staged provisioning authorization; production wiring follows the Simen lockout approval. */
export async function requireGlobalAccessManager(client: BoundaryRpcClient, callerId: string): Promise<boolean> {
  const { data, error } = await client.rpc("is_global_superadmin", { _auth_user_id: callerId });
  return !error && data === true;
}