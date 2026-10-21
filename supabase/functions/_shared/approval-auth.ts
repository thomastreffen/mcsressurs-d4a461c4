interface ClaimsClient {
  auth: {
    getClaims(token: string): Promise<{
      data: { claims: { sub?: string } } | null;
      error: unknown;
    }>;
  };
}

/** Verify signing-key JWTs; never trust decoded payloads or an anonymous key. */
export async function getApprovalCallerId(header: string | null, client: ClaimsClient): Promise<string | null> {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const { data, error } = await client.auth.getClaims(token);
    const sub = data?.claims.sub;
    return !error && typeof sub === "string" && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}