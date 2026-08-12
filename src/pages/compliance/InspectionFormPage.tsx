import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { useComplianceEmployees } from "@/hooks/useCompliance";
import { useInspection, useInspectionMutations, type Inspection } from "@/hooks/useInspections";
import { INSPECTION_STATUSES, INSPECTION_TYPES } from "@/lib/inspections";

const EMPTY: Partial<Inspection> = {
  title: "", inspection_type: "dle", authority_name: "", contact_name: "", contact_email: "",
  contact_phone: "", case_number: "", inspection_date: null, response_deadline: null,
  responsible_person_id: null, description: "", status: "planned",
};

export default function InspectionFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editing = !!id && id !== "ny";
  const existing = useInspection(editing ? id : undefined);
  const employees = useComplianceEmployees();
  const { save } = useInspectionMutations();
  const [form, setForm] = useState<Partial<Inspection>>({ ...EMPTY });

  useEffect(() => {
    if (editing && existing.data) setForm(existing.data);
  }, [editing, existing.data]);

  const set = (patch: Partial<Inspection>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    save.mutate(
      {
        ...form,
        id: editing ? id : undefined,
        inspection_date: form.inspection_date || null,
        response_deadline: form.response_deadline || null,
      } as Partial<Inspection>,
      { onSuccess: (data: any) => navigate(`/compliance/tilsyn/${data?.id ?? id}`) },
    );
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate("/compliance/tilsyn")}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Tilbake
        </Button>
      </div>
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{editing ? "Rediger tilsynssak" : "Nytt tilsyn"}</h1>
        <p className="text-sm text-muted-foreground">Registrer saken først – funn, tiltak og dokumentasjon legges inn i saken etterpå.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Om saken</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Tittel *</Label>
            <Input value={form.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="f.eks. DLE-tilsyn hovedkontor 2026" />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={form.inspection_type ?? "dle"} onValueChange={(v) => set({ inspection_type: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{INSPECTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={form.status ?? "planned"} onValueChange={(v) => set({ status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{INSPECTION_STATUSES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tilsynsmyndighet / revisor</Label>
            <Input value={form.authority_name ?? ""} onChange={(e) => set({ authority_name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Saksnummer</Label>
            <Input value={form.case_number ?? ""} onChange={(e) => set({ case_number: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Dato for tilsyn</Label>
            <Input type="date" value={form.inspection_date ?? ""} onChange={(e) => set({ inspection_date: e.target.value || null })} />
          </div>
          <div>
            <Label className="text-xs">Svarfrist</Label>
            <Input type="date" value={form.response_deadline ?? ""} onChange={(e) => set({ response_deadline: e.target.value || null })} />
          </div>
          <div>
            <Label className="text-xs">Ansvarlig internt</Label>
            <Select value={form.responsible_person_id ?? "none"} onValueChange={(v) => set({ responsible_person_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ikke satt</SelectItem>
                {(employees.data ?? []).map((e) => <SelectItem key={e.person_id} value={e.person_id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Beskrivelse / omfang</Label>
            <Textarea rows={3} value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Kontaktperson hos myndighet/revisor</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Navn</Label>
            <Input value={form.contact_name ?? ""} onChange={(e) => set({ contact_name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">E-post</Label>
            <Input type="email" value={form.contact_email ?? ""} onChange={(e) => set({ contact_email: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Telefon</Label>
            <Input value={form.contact_phone ?? ""} onChange={(e) => set({ contact_phone: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate("/compliance/tilsyn")}>Avbryt</Button>
        <Button disabled={!form.title?.trim() || save.isPending} onClick={submit}>
          <Save className="mr-1.5 h-3.5 w-3.5" /> {editing ? "Lagre endringer" : "Opprett sak"}
        </Button>
      </div>
    </div>
  );
}
