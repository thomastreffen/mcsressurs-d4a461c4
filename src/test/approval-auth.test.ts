import { describe, expect, it, vi } from "vitest";
import { getApprovalCallerId } from "../../supabase/functions/_shared/approval-auth";

describe("Approval caller authentication", () => {
  it("uses verified signing-key claims for caller identity", async () => {
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: "verified-user" } }, error: null });
    expect(await getApprovalCallerId("Bearer signed-token", { auth: { getClaims } })).toBe("verified-user");
    expect(getClaims).toHaveBeenCalledWith("signed-token");
  });
  it.each([null, "", "Bearer ", "Basic token"])("rejects missing bearer %s without verification", async header => {
    const getClaims = vi.fn();
    expect(await getApprovalCallerId(header, { auth: { getClaims } })).toBeNull();
    expect(getClaims).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: new Error("expired") },
    { data: { claims: { sub: "untrusted" } }, error: new Error("invalid signature") },
    { data: { claims: {} }, error: null },
    { data: { claims: { sub: "" } }, error: null },
  ])("rejects invalid or anonymous claims", async result => {
    expect(await getApprovalCallerId("Bearer invalid-token", { auth: { getClaims: vi.fn().mockResolvedValue(result) } })).toBeNull();
  });
  it("fails closed on verification errors", async () => {
    expect(await getApprovalCallerId("Bearer token", { auth: { getClaims: vi.fn().mockRejectedValue(new Error("unavailable")) } })).toBeNull();
  });
});