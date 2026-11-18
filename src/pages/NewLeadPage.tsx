import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { NEXT_ACTION_TYPES } from "@/lib/lead-status";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { LeadCustomerPicker, leadCustomerPayload, type LeadCustomerValue } from "@/components/leads/LeadCustomerPicker";

const SOURCE_OPTIONS = [
  "Eksisterende kunde",
  "Anbefaling",
  "Messe / event",
  "Anbud",
  "Web / kontaktskjema",
  "Telefon / kald kontakt",
  "E-post",
  "Annet",
];

export default function NewLeadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [saving, setSaving] = useState(false);
  const [companyUsers, setCompanyUsers] = useState<{ id: string; name: string }[]>([]);

  // Kunde / kontakt
  const { activeCompanyId } = useCompanyContext();
  const [customer, setCustomer] = useState<LeadCustomerValue | null>(null);
  const customerPayload = leadCustomerPayload(customer);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Kommersielt
  const [source, setSource] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");

  // Eierskap / oppfølging
  const [ownerId, setOwnerId] = useState<string>(user?.id || "");
  const [nextActionType, setNextActionType] = useState<string>("");
  const [nextActionDate, setNextActionDate] = useState<string>("");
  const [nextActionNote, setNextActionNote] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("technicians").select("user_id, name");
      setCompanyUsers(
        (data || [])
          .filter((t: any) => t.user_id && t.name)
          .map((t: any) => ({ id: t.user_id, name: t.name }))
      );
    })();
  }, []);

  useEffect(() => {
    if (user?.id && !ownerId) setOwnerId(user.id);
  }, [user, ownerId]);

  const handleCreate = async () => {
    if (!customerPayload) {
      toast.error("Velg kunde fra registeret eller oppgi ny virksomhet");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        ...customerPayload,
        company_id: activeCompanyId || null,
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        source: source || null,
        estimated_value: Number(estimatedValue) || 0,
        notes: notes.trim() || null,
        owner_id: ownerId || user?.id,
        assigned_owner_user_id: ownerId || user?.id,
        next_action_type: nextActionType || null,
        next_action_date: nextActionDate || null,
        next_action_note: nextActionNote.trim() || null,
      };

      const { data, error } = await supabase
        .from("leads")
        .insert(payload)
        .select("id")
        .single();

      if (error || !data) {
        toast.error(error?.message?.includes("not_available") ? "Valgt kunde eller avdeling er ikke tilgjengelig i aktivt selskap" : "Kunne ikke opprette henvendelse");
        setSaving(false);
        return;
      }

      await supabase
        .from("lead_participants")
        .insert({ lead_id: data.id, user_id: ownerId || user!.id, role: "owner" });

      await supabase.from("lead_history").insert({
        lead_id: data.id,
        action: "created",
        description: `Lead opprettet: ${customerPayload.company_name}${customerPayload.customer_id ? " (koblet til kundekort)" : ""}`,
        performed_by: user?.id,
      });

      toast.success("Henvendelse opprettet");
      navigate(`/sales/leads/${data.id}`);
    } catch (e) {
      console.error(e);
      toast.error("Noe gikk galt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/sales/leads")}
          className="gap-1.5 rounded-xl"
        >
          <ArrowLeft className="h-4 w-4" /> Tilbake
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ny henvendelse</h1>
        <p className="text-sm text-muted-foreground">
          Registrer en ny kundehenvendelse. Du kan utdype og følge opp etter at den er opprettet.
        </p>
      </div>

      {/* Kunde */}
      <section className="rounded-2xl border border-border/40 bg-card p-6 space-y-4 shadow-sm">
        <h2 className="text-sm font-medium text-foreground">Kunde og kontakt</h2>
        <div className="space-y-1.5">
          <Label>Installatør / kunde *</Label>
          <LeadCustomerPicker
            companyId={activeCompanyId ?? null}
            value={customer}
            onChange={setCustomer}
            onContactPick={(k) => { setContactName(k.name); setPhone(k.phone ?? ""); setEmail(k.email ?? ""); }}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Kontaktperson</Label>
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Ola Nordmann"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+47 999 99 999"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>E-post</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="epost@firma.no"
              className="rounded-xl"
            />
          </div>
        </div>
      </section>

      {/* Kommersielt */}
      <section className="rounded-2xl border border-border/40 bg-card p-6 space-y-4 shadow-sm">
        <h2 className="text-sm font-medium text-foreground">Henvendelsen</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Kilde</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Velg kilde" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Estimert ordreverdi (kr)</Label>
            <Input
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              type="number"
              placeholder="0"
              className="rounded-xl"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Kort beskrivelse / notat</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Hva gjelder henvendelsen? Omfang, frister, spesielle ønsker..."
            rows={4}
            className="rounded-xl resize-none"
          />
        </div>
      </section>

      {/* Eierskap og oppfølging */}
      <section className="rounded-2xl border border-border/40 bg-card p-6 space-y-4 shadow-sm">
        <h2 className="text-sm font-medium text-foreground">Eierskap og oppfølging</h2>
        <div className="space-y-1.5">
          <Label>Ansvarlig</Label>
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Velg ansvarlig" />
            </SelectTrigger>
            <SelectContent>
              {companyUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Neste steg</Label>
            <Select value={nextActionType} onValueChange={setNextActionType}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Velg neste steg" />
              </SelectTrigger>
              <SelectContent>
                {NEXT_ACTION_TYPES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Frist</Label>
            <Input
              type="date"
              value={nextActionDate}
              onChange={(e) => setNextActionDate(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Notat til oppfølging</Label>
          <Input
            value={nextActionNote}
            onChange={(e) => setNextActionNote(e.target.value)}
            placeholder="F.eks. ring etter kl. 14"
            className="rounded-xl"
          />
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          variant="outline"
          onClick={() => navigate("/sales/leads")}
          className="rounded-xl"
        >
          Avbryt
        </Button>
        <Button
          onClick={handleCreate}
          disabled={saving || !customerPayload}
          className="gap-1.5 rounded-xl"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Opprett henvendelse
        </Button>
      </div>
    </div>
  );
}
