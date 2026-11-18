import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Search, X } from "lucide-react";

export type LeadCustomerOption = {
  id: string; name: string; org_number: string | null;
  accounts: { id: string; name: string; org_number: string | null }[];
  contacts: { id: string; name: string; email: string | null; phone: string | null; role: string | null }[];
};

export type LeadCustomerValue =
  | { mode: "existing"; customer: LeadCustomerOption; accountId: string | null }
  | { mode: "new"; name: string };

export const NO_ACCOUNT = "__none__";

export function leadCustomerPayload(v: LeadCustomerValue | null) {
  if (!v) return null;
  if (v.mode === "existing") {
    const acc = v.customer.accounts.find((a) => a.id === v.accountId);
    return { company_name: acc ? `${v.customer.name} – ${acc.name}` : v.customer.name, customer_id: v.customer.id, customer_account_id: acc ? acc.id : null };
  }
  const name = v.name.trim();
  return name ? { company_name: name, customer_id: null, customer_account_id: null } : null;
}

interface Props {
  companyId: string | null;
  value: LeadCustomerValue | null;
  onChange: (v: LeadCustomerValue | null) => void;
  onContactPick: (c: LeadCustomerOption["contacts"][number]) => void;
}

export function LeadCustomerPicker({ companyId, value, onChange, onContactPick }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LeadCustomerOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId || value) return;
    const t = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase.rpc("lead_customer_search", { _company_id: companyId, _q: q });
      setResults(((data as unknown) as LeadCustomerOption[]) ?? []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, companyId, value]);

  if (value?.mode === "existing") {
    const c = value.customer;
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex items-start gap-2 min-w-0">
            <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.org_number ? `Org.nr. ${c.org_number}` : "Org.nr. ikke registrert"} · Kundekort i Hub</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" aria-label="Fjern valgt kunde" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>
        </div>
        {c.accounts.length > 0 && (
          <div className="space-y-1.5">
            <Label>Avdeling / lokalkontor</Label>
            <Select value={value.accountId ?? NO_ACCOUNT} onValueChange={(v) => onChange({ ...value, accountId: v === NO_ACCOUNT ? null : v })}>
              <SelectTrigger className="rounded-xl" aria-label="Avdeling"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>Hele kunden (ingen bestemt avdeling)</SelectItem>
                {c.accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {c.contacts.length > 0 && (
          <div className="space-y-1.5">
            <Label>Registrerte kontaktpersoner</Label>
            <div className="flex flex-wrap gap-2">
              {c.contacts.map((k) => (
                <Button key={k.id} type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => onContactPick(k)}>
                  {k.name}{k.role ? ` · ${k.role}` : ""}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (value?.mode === "new") {
    return (
      <div className="space-y-2">
        <Input value={value.name} onChange={(e) => onChange({ mode: "new", name: e.target.value })} placeholder="Navn på virksomheten" className="rounded-xl" aria-label="Ny virksomhet" autoFocus />
        <p className="text-xs text-muted-foreground">Lagres kun som tekst på henvendelsen. Det opprettes ikke noe kundekort.</p>
        <Button type="button" variant="link" size="sm" className="px-0" onClick={() => onChange(null)}>Søk i kunderegisteret i stedet</Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk navn eller org.nr. i kunderegisteret" className="rounded-xl pl-9" aria-label="Søk kunde" />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
        {!companyId && <p className="p-3 text-sm text-muted-foreground">Velg aktivt selskap for å søke i kunderegisteret.</p>}
        {companyId && loading && results.length === 0 && <p className="p-3 text-sm text-muted-foreground">Søker…</p>}
        {companyId && !loading && results.length === 0 && <p className="p-3 text-sm text-muted-foreground">Ingen treff i kunderegisteret.</p>}
        {results.map((c) => (
          <button key={c.id} type="button" className="w-full text-left p-3 hover:bg-muted/50 min-h-11" onClick={() => onChange({ mode: "existing", customer: c, accountId: null })}>
            <span className="block text-sm font-medium">{c.name}</span>
            <span className="block text-xs text-muted-foreground">
              {c.org_number ? `Org.nr. ${c.org_number}` : "Uten org.nr."}
              {c.accounts.length > 0 ? ` · ${c.accounts.length} avdeling${c.accounts.length > 1 ? "er" : ""}` : ""}
            </span>
          </button>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => onChange({ mode: "new", name: q })}>
        Ny virksomhet / ennå ikke i registeret
      </Button>
    </div>
  );
}
