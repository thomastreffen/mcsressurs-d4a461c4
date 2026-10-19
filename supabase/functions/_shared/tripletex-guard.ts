// Company-scoped Tripletex connection guards. Every Tripletex call must go through resolveConnection.
export const TRIPLETEX_BASE: Record<string, string> = { test: "https://api-test.tripletex.tech/v2" };
// Production is intentionally absent until explicitly enabled.

export type Connection = {
  id: string; company_id: string; environment: string; secret_name: string;
  expected_tripletex_company_id: number | null; mode: string; capabilities: string[];
};

export class GuardError extends Error { constructor(public code: string, msg: string) { super(msg); } }

/** Pure guard: verifies that the source company matches the connection and the action is allowed. */
export function assertAllowed(conn: Connection, opts: { sourceCompanyId?: string; write?: boolean; capability?: string }) {
  if (!TRIPLETEX_BASE[conn.environment]) throw new GuardError("env_blocked", "Miljøet er ikke tillatt.");
  if (conn.mode === "off") throw new GuardError("disabled", "Tripletex er slått av for selskapet.");
  if (opts.sourceCompanyId && opts.sourceCompanyId !== conn.company_id) throw new GuardError("company_mismatch", "Data tilhører et annet selskap enn tilkoblingen.");
  if (opts.write && conn.mode !== "write_enabled") throw new GuardError("read_only", "Tilkoblingen er kun lesende.");
  if (opts.capability && !conn.capabilities.includes(opts.capability)) throw new GuardError("capability_missing", "Funksjonen er ikke aktivert.");
}

/** After session creation: logged-in Tripletex company must equal the expected one. */
export function assertTripletexCompany(conn: Connection, actual: number | undefined) {
  if (!conn.expected_tripletex_company_id || String(actual) !== String(conn.expected_tripletex_company_id))
    throw new GuardError("wrong_company", "Nøkkelen gjelder et annet Tripletex-selskap enn forventet.");
}
