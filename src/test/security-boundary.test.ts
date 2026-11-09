// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isExactServiceBearer, requireGlobalAccessManager, validBasicGraphNotification } from "../../supabase/functions/_shared/security-boundary";

describe("protocol-specific security boundaries", () => {
  it("requires exact service credential, never anon, substring or missing secret", () => {
    expect(isExactServiceBearer("Bearer isolated-service", "isolated-service")).toBe(true);
    for (const header of [null, "Bearer anon", "Basic isolated-service", "Bearer prefix-isolated-service", "Bearer isolated-service extra"]) {
      expect(isExactServiceBearer(header, "isolated-service")).toBe(false);
    }
    expect(isExactServiceBearer("Bearer undefined", undefined)).toBe(false);
  });
  it("basic Graph notification requires matching subscription and mandatory stored state", () => {
    const n = { subscriptionId: "subscription-a", clientState: "isolated-random-state", resource: "users/mailbox-id/messages/message-id" };
    const s = { subscription_id: "subscription-a", client_state: n.clientState, company_id: "service", status: "active", resource: "users/mailbox@example.test/mailFolders('Inbox')/messages", expiration_at: "2030-01-02T00:00:00Z" };
    const now = Date.parse("2030-01-01T00:00:00Z");
    expect(validBasicGraphNotification(n, s, now)).toBe(true);
    expect(validBasicGraphNotification({ ...n, clientState: undefined }, s, now)).toBe(false);
    expect(validBasicGraphNotification({ ...n, clientState: "wrong" }, s, now)).toBe(false);
    expect(validBasicGraphNotification({ ...n, subscriptionId: "other" }, s, now)).toBe(false);
    expect(validBasicGraphNotification(n, { ...s, company_id: null }, now)).toBe(false);
    expect(validBasicGraphNotification(n, { ...s, status: "disabled" }, now)).toBe(false);
    expect(validBasicGraphNotification(n, { ...s, expiration_at: "invalid" }, now)).toBe(false);
    expect(validBasicGraphNotification(n, s, Date.parse("2030-01-03"))).toBe(false);
    expect(validBasicGraphNotification({ ...n, resource: "users/x/messages/y?injected=1" }, s, now)).toBe(false);
  });
  it("provisioning privilege comes only from authoritative global-superadmin RPC", async () => {
    const calls: unknown[] = [];
    const client = { rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      return { data: args._auth_user_id === "thomas" || args._auth_user_id === "simen-approved", error: null };
    } };
    expect(await requireGlobalAccessManager(client, "thomas")).toBe(true);
    expect(await requireGlobalAccessManager(client, "simen-approved")).toBe(true);
    for (const user of ["simen-legacy", "john", "mats", "sindre", "rune", "hans-jakob", "lars", "stian"]) {
      expect(await requireGlobalAccessManager(client, user)).toBe(false);
    }
    expect(calls[0]).toEqual(["is_global_superadmin", { _auth_user_id: "thomas" }]);
    expect(await requireGlobalAccessManager({ rpc: async () => ({ data: true, error: "failed" }) }, "thomas")).toBe(false);
  });
});