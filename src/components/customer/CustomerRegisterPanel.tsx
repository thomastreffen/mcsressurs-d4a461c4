import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Building2, Loader2, Mail, Phone, Plus, History } from "lucide-react";
import { toast } from "sonner";
import { CrmEmailComposer } from "@/components/customer/CrmEmailComposer";
import { filterContacts, HISTORY_LABELS, validOrgOrEmpty, type RegisterAccount, type RegisterContact, type RegisterData, type SaveResult } from "@/lib/customer-register";

const NONE = "__none__";

export function CustomerRegisterPanel({ customerId }: { customerId: string }) {
  const { activeCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const key = ["customer-register", activeCompanyId, customerId];
  const q = useQuery({ queryKey: key, enabled: !!activeCompanyId, queryFn: async () => {
    const { data, error } = await supabase.rpc("customer_register_get", { _company_id: activeCompanyId!, _customer_id: customerId });
    if (error) throw error; return data as unknown as RegisterData;
  } });
  const owners = useQuery({ queryKey: ["crm-owners", activeCompanyId], enabled: !!activeCompanyId, queryFn: async () => {
    const { data } = await supabase.rpc("crm_account_owners", { _company_id: activeCompanyId! }); return data ?? [];
  } });
  const [accFilter, setAccFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editAcc, setEditAcc] = useState<RegisterAccount | "new" | null>(null);
  const [editContact, setEditContact] = useState<RegisterContact | "new" | null>(null);
  const [composing, setComposing] = useState(false);
  const reload = () => qc.invalidateQueries({ queryKey: key });

  if (!activeCompanyId) return <p className="text-sm text-muted-foreground">Velg aktivt selskap.</p>;
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (q.error || !q.data) return <p className="text-sm text-muted-foreground">Du har ikke tilgang til kunderegisteret for dette selskapet.</p>;
  const d = q.data;
  const accName = (id: string | null) => d.accounts.find((a) => a.id === id)?.name;
  const ownerName = (id: string | null) => owners.data?.find((o: any) => o.user_id === id)?.name;
  const contacts = filterContacts(d.contacts, accFilter, showInactive);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Avdelinger / lokalkontor ({d.accounts.filter((a) => !a.archived_at).length})</h3>
          {d.can_edit && <Button size="sm" className="rounded-xl gap-1.5 min-h-11 sm:min-h-9" onClick={() => setEditAcc("new")}><Plus className="h-4 w-4" />Ny avdeling</Button>}
        </div>
        {d.accounts.length === 0 && <p className="text-sm text-muted-foreground">Ingen avdelinger registrert. Opprett kun avdelinger som er verifisert.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {d.accounts.map((a) => (
            <button key={a.id} type="button" disabled={!d.can_edit} onClick={() => setEditAcc(a)} className="text-left rounded-xl border border-border bg-card p-3 min-h-11 disabled:cursor-default">
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium truncate">{a.name}</span>{a.archived_at && <Badge variant="secondary">Arkivert</Badge>}</div>
              <p className="text-xs text-muted-foreground mt-1">{[a.city, a.org_number ? `Org.nr. ${a.org_number}` : "Uten eget org.nr."].filter(Boolean).join(" · ")}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Kontaktpersoner</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={accFilter} onValueChange={setAccFilter}>
              <SelectTrigger className="w-48 rounded-xl" aria-label="Filtrer på avdeling"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle avdelinger</SelectItem>
                <SelectItem value="none">Uten avdeling</SelectItem>
                {d.accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(!!v)} />Vis sluttede</label>
            {d.can_edit && <Button size="sm" variant="outline" className="rounded-xl gap-1.5 min-h-11 sm:min-h-9" onClick={() => setComposing(true)}><Mail className="h-4 w-4" />Send e-post</Button>}
            {d.can_edit && <Button size="sm" className="rounded-xl gap-1.5 min-h-11 sm:min-h-9" onClick={() => setEditContact("new")}><Plus className="h-4 w-4" />Ny kontakt</Button>}
          </div>
        </div>
        {contacts.length === 0 && <p className="text-sm text-muted-foreground">Ingen kontaktpersoner i dette utvalget.</p>}
        <div className="space-y-2">
          {contacts.map((c) => (
            <button key={c.id} type="button" disabled={!d.can_edit} onClick={() => setEditContact(c)} className="w-full text-left rounded-xl border border-border bg-card p-3 min-h-11 disabled:cursor-default">
              <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{c.name}</span>{c.role && <span className="text-xs text-muted-foreground">{c.role}</span>}{!c.is_active && <Badge variant="secondary">Sluttet</Badge>}{accName(c.customer_account_id) && <Badge variant="outline">{accName(c.customer_account_id)}</Badge>}</div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                {ownerName(c.owner_user_id) && <span>Ansvarlig: {ownerName(c.owner_user_id)}</span>}
                <span>{c.verified_at ? `Verifisert ${new Date(c.verified_at).toLocaleDateString("nb-NO")}` : "Ikke verifisert"}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {d.history.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-1.5"><History className="h-4 w-4" />Historikk</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {d.history.slice(0, 15).map((h) => <li key={h.id}>{new Date(h.created_at).toLocaleString("nb-NO")} · {HISTORY_LABELS[h.kind] ?? h.kind}{h.after_state?.name ? `: ${h.after_state.name}` : ""} · {h.actor_name}</li>)}
          </ul>
        </section>
      )}

      {composing && <CrmEmailComposer companyId={activeCompanyId} customerId={customerId} accountId={accFilter !== "all" && accFilter !== "none" ? accFilter : null} contacts={d.contacts} onClose={() => setComposing(false)} />}
      {editAcc && <AccountDrawer companyId={activeCompanyId} customerId={customerId} row={editAcc === "new" ? null : editAcc} onClose={() => setEditAcc(null)} onSaved={reload} />}
      {editContact && <ContactDrawer companyId={activeCompanyId} customerId={customerId} row={editContact === "new" ? null : editContact} accounts={d.accounts.filter((a) => !a.archived_at)} owners={(owners.data ?? []) as any} onClose={() => setEditContact(null)} onSaved={reload} />}
    </div>
  );
}

function AccountDrawer({ companyId, customerId, row, onClose, onSaved }: { companyId: string; customerId: string; row: RegisterAccount | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(row?.name ?? ""); const [city, setCity] = useState(row?.city ?? ""); const [org, setOrg] = useState(row?.org_number ?? "");
  const [archived, setArchived] = useState(!!row?.archived_at); const [dups, setDups] = useState<string[] | null>(null); const [saving, setSaving] = useState(false);
  const requestId = useMemo(() => crypto.randomUUID(), []);
  const save = async (confirm: boolean) => {
    if (!validOrgOrEmpty(org)) { toast.error("Org.nr. må være 9 siffer eller tomt"); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("customer_register_save_account", { _company_id: companyId, _customer_id: customerId, _account_id: row?.id ?? null as any, _name: name, _city: city, _org_number: org, _archived: archived, _confirm_duplicate: confirm, _request_id: requestId });
    setSaving(false);
    if (error) { toast.error("Kunne ikke lagre avdeling"); return; }
    const r = data as unknown as SaveResult;
    if (r.status === "needs_confirmation") { setDups(r.duplicates ?? []); return; }
    toast.success("Avdeling lagret"); onSaved(); onClose();
  };
  return (
    <Sheet open onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <SheetContent mobileWorkspace className="sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>{row ? "Rediger avdeling" : "Ny avdeling"}</SheetTitle><SheetDescription>Opprett kun avdelinger som er verifisert av Rune/Thomas.</SheetDescription></SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-1"><Label htmlFor="acc-name">Navn *</Label><Input id="acc-name" value={name} onChange={(e) => { setName(e.target.value); setDups(null); }} placeholder="F.eks. Bravida Oslo Elektro" /></div>
          <div className="space-y-1"><Label htmlFor="acc-city">Sted / by</Label><Input id="acc-city" value={city} onChange={(e) => setCity(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="acc-org">Eget org.nr. (valgfritt)</Label><Input id="acc-org" value={org} onChange={(e) => setOrg(e.target.value)} inputMode="numeric" placeholder="Tomt hvis avdelingen ikke har eget" /></div>
          {row && <label className="flex items-center gap-2 text-sm"><Checkbox checked={archived} onCheckedChange={(v) => setArchived(!!v)} />Arkivert (vises ikke i nye valg)</label>}
          {dups && <div className="rounded-xl border border-border bg-muted/50 p-3 text-sm space-y-2"><p>Det finnes allerede en avdeling med samme navn hos denne kunden. Er du sikker på at dette er en annen avdeling?</p><Button size="sm" variant="outline" disabled={saving} onClick={() => save(true)}>Ja, lagre likevel</Button></div>}
          <Button className="w-full min-h-11" disabled={saving || !name.trim()} onClick={() => save(false)}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Lagre</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ContactDrawer({ companyId, customerId, row, accounts, owners, onClose, onSaved }: { companyId: string; customerId: string; row: RegisterContact | null; accounts: RegisterAccount[]; owners: { user_id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState({ name: row?.name ?? "", email: row?.email ?? "", phone: row?.phone ?? "", role: row?.role ?? "", customer_account_id: row?.customer_account_id ?? NONE, owner_user_id: row?.owner_user_id ?? NONE, is_active: row?.is_active ?? true, mark_verified: false });
  const [warn, setWarn] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const requestId = useMemo(() => crypto.randomUUID(), []);
  const set = (k: string, v: unknown) => { setS((p) => ({ ...p, [k]: v })); setWarn(null); };
  const save = async (confirm: boolean) => {
    setSaving(true);
    const state = { ...s, customer_account_id: s.customer_account_id === NONE ? null : s.customer_account_id, owner_user_id: s.owner_user_id === NONE ? null : s.owner_user_id };
    const { data, error } = await supabase.rpc("customer_register_save_contact", { _company_id: companyId, _customer_id: customerId, _contact_id: row?.id ?? null as any, _state: state, _confirm_duplicate: confirm, _request_id: requestId });
    setSaving(false);
    if (error) { toast.error(error.message.includes("email") ? "Ugyldig e-postadresse" : "Kunne ikke lagre kontakt"); return; }
    const r = data as unknown as SaveResult;
    if (r.status === "duplicate_same_customer") { toast.error("Denne e-postadressen er allerede registrert på en kontakt hos kunden"); return; }
    if (r.status === "needs_confirmation") { setWarn(`E-postadressen finnes også hos ${r.other_customers} annen kunde. Kontroller at dette er riktig person.`); return; }
    toast.success("Kontakt lagret"); onSaved(); onClose();
  };
  return (
    <Sheet open onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <SheetContent mobileWorkspace className="sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>{row ? "Rediger kontakt" : "Ny kontakt"}</SheetTitle><SheetDescription>Kontakter slettes ikke; marker som sluttet i stedet.</SheetDescription></SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-1"><Label htmlFor="c-name">Navn *</Label><Input id="c-name" value={s.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="c-role">Rolle</Label><Input id="c-role" value={s.role} onChange={(e) => set("role", e.target.value)} placeholder="F.eks. Prosjektleder" /></div>
          <div className="space-y-1"><Label htmlFor="c-email">E-post</Label><Input id="c-email" type="email" value={s.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="c-phone">Telefon</Label><Input id="c-phone" value={s.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="space-y-1"><Label>Avdeling</Label><Select value={s.customer_account_id} onValueChange={(v) => set("customer_account_id", v)}><SelectTrigger aria-label="Avdeling"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Ingen bestemt avdeling</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Intern ansvarlig</Label><Select value={s.owner_user_id} onValueChange={(v) => set("owner_user_id", v)}><SelectTrigger aria-label="Intern ansvarlig"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Ingen</SelectItem>{owners.map((o) => <SelectItem key={o.user_id} value={o.user_id}>{o.name}</SelectItem>)}</SelectContent></Select></div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={s.is_active} onCheckedChange={(v) => set("is_active", !!v)} />Aktiv kontakt (fjern hake hvis personen har sluttet)</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={s.mark_verified} onCheckedChange={(v) => set("mark_verified", !!v)} />Opplysningene er verifisert nå</label>
          {warn && <div className="rounded-xl border border-border bg-muted/50 p-3 text-sm space-y-2"><p>{warn}</p><Button size="sm" variant="outline" disabled={saving} onClick={() => save(true)}>Ja, lagre likevel</Button></div>}
          <Button className="w-full min-h-11" disabled={saving || !s.name.trim()} onClick={() => save(false)}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Lagre</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
