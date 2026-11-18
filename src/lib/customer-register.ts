export type RegisterAccount = { id: string; name: string; org_number: string | null; city: string | null; archived_at: string | null };
export type RegisterContact = { id: string; name: string; email: string | null; phone: string | null; role: string | null; customer_account_id: string | null; owner_user_id: string | null; is_active: boolean; verified_at: string | null };
export type RegisterData = { can_edit: boolean; accounts: RegisterAccount[]; contacts: RegisterContact[]; history: { id: string; kind: string; actor_name: string; created_at: string; after_state: { name?: string } | null }[] };
export type SaveResult = { status: "saved"; id: string } | { status: "needs_confirmation"; duplicates?: string[]; other_customers?: number } | { status: "duplicate_same_customer" };

export const HISTORY_LABELS: Record<string, string> = {
  account_created: "Avdeling opprettet", account_updated: "Avdeling endret", account_archived: "Avdeling arkivert", account_restored: "Avdeling gjenopprettet",
  contact_created: "Kontakt opprettet", contact_updated: "Kontakt endret", contact_deactivated: "Kontakt markert som sluttet",
};

export function filterContacts(contacts: RegisterContact[], account: string, showInactive: boolean) {
  return contacts.filter((c) => (showInactive || c.is_active) && (account === "all" || (account === "none" ? !c.customer_account_id : c.customer_account_id === account)));
}

/** Only active contacts with an email can be chosen as email recipients. */
export function selectableRecipients(contacts: RegisterContact[]) {
  return contacts.filter((c) => c.is_active && !!c.email);
}

export function normalizeOrg(v: string) { return v.replace(/\s/g, ""); }
export function validOrgOrEmpty(v: string) { const s = normalizeOrg(v); return s === "" || /^[0-9]{9}$/.test(s); }
