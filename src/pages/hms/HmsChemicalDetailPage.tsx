import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Download, FileWarning, Loader2, Save, Send, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  fetchSdsUrl, useChemical, useChemicalRecipients, useChemicalSections, useDeleteChemical,
  useHandbookSectionOptions, useSaveChemical, useSendChemicalInfo, useSetChemicalSections,
  type ChemicalRow,
} from "@/hooks/useChemicals";
import {
  CHEMICAL_CATEGORIES, CHEMICAL_STATUS_LABELS, GHS_PICTOGRAMS, SDS_STATE_LABELS, sdsState,
} from "@/lib/hms/chemicals";
import { ChemicalDistributeDialog } from "@/components/hms/ChemicalDistributeDialog";

const EMPTY: Partial<ChemicalRow> = {
  product_name: "", status: "active", locations: [], hms_areas: [], pictograms: [],
  h_statements: [], p_statements: [],
};

export default function HmsChemicalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "ny";
  const navigate = useNavigate();
  const { activeCompanyId } = useCompanyContext();

  const { data: chemical, isLoading } = useChemical(isNew ? undefined : id);
  const { data: linked = [] } = useChemicalSections(isNew ? undefined : id);
  const { data: sectionOptions = [] } = useHandbookSectionOptions();
  const { data: recipients = [] } = useChemicalRecipients(isNew ? undefined : id);
  const saveMut = useSaveChemical();
  const setSectionsMut = useSetChemicalSections();
  const deleteMut = useDeleteChemical();
  const sendMut = useSendChemicalInfo();

  const [form, setForm] = useState<Partial<ChemicalRow>>(EMPTY);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => {
    if (chemical) setForm(chemical);
  }, [chemical]);
  useEffect(() => {
    setSectionIds(linked.map((l) => l.section_id));
  }, [linked]);

  const set = <K extends keyof ChemicalRow>(k: K, v: ChemicalRow[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setList = (k: keyof ChemicalRow, text: string) =>
    setForm((f) => ({ ...f, [k]: text.split("\n").map((s) => s.trim()).filter(Boolean) }));

  const sds = sdsState(form as ChemicalRow);

  const save = async () => {
    if (!form.product_name?.trim()) {
      toast({ title: "Produktnavn er påkrevd", variant: "destructive" });
      return;
    }
    try {
      const newId = await saveMut.mutateAsync({ ...form, id: isNew ? undefined : id });
      await setSectionsMut.mutateAsync({ chemicalId: newId, sectionIds });
      toast({ title: "Lagret" });
      if (isNew) navigate(`/hms/kjemikalier/${newId}`, { replace: true });
    } catch (e: any) {
      toast({ title: "Kunne ikke lagre", description: String(e.message || e), variant: "destructive" });
    }
  };

  const uploadSds = async (file: File) => {
    if (isNew) {
      toast({ title: "Lagre produktet først", description: "Sikkerhetsdatablad kan lastes opp etter lagring." });
      return;
    }
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `chemicals/${id}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from("hms-attachments").upload(path, file, { contentType: file.type });
      if (error) throw error;
      await saveMut.mutateAsync({
        id, sds_path: path, sds_filename: file.name, sds_uploaded_at: new Date().toISOString(),
      } as any);
      setForm((f) => ({ ...f, sds_path: path, sds_filename: file.name }));
      await (supabase as any).from("hms_audit_log").insert({
        company_id: activeCompanyId, entity_type: "hms_chemical", entity_id: id,
        action: "chemical.sds_uploaded", payload: { filename: file.name, path },
      });
      toast({ title: "Sikkerhetsdatablad lastet opp" });
    } catch (e: any) {
      toast({ title: "Opplasting feilet", description: String(e.message || e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const openSds = async () => {
    try {
      const res = await fetchSdsUrl({ chemical_id: id });
      window.open(res.url, "_blank", "noopener");
    } catch (e: any) {
      toast({ title: "Kunne ikke åpne SDS", description: String(e.message || e), variant: "destructive" });
    }
  };

  const pending = recipients.filter((r) => !r.acknowledged_at);

  const remind = async () => {
    if (pending.length === 0 || !id) {
      toast({ title: "Ingen å purre" });
      return;
    }
    const unique = new Map<string, typeof pending[number]>();
    for (const r of pending) unique.set(r.person_id ?? r.id, r);
    try {
      await sendMut.mutateAsync({
        chemical_id: id,
        section_ids: sectionIds,
        channels: ["email"],
        kind: "reminder",
        subject: `Påminnelse: ${form.product_name}`,
        message: "Vi mangler din bekreftelse på at du har lest rutine og sikkerhetsdatablad for dette produktet.",
        recipients: [...unique.values()].map((r) => ({
          person_id: r.person_id, user_id: r.user_id, full_name: r.full_name, email: r.email, phone: r.phone,
        })),
      });
      toast({ title: "Påminnelse sendt", description: `${unique.size} mottaker(e).` });
    } catch (e: any) {
      toast({ title: "Purring feilet", description: String(e.message || e), variant: "destructive" });
    }
  };

  const exportCsv = () => {
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Produkt", "Ansatt", "E-post", "HMS-kapitler", "SDS-revisjon", "SDS-versjon", "Kanal", "Sendt", "Åpnet", "Bekreftet", "Metode", "Levering", "Purringer"].join(";"),
      ...recipients.map((r) => [
        q(form.product_name), q(r.full_name), q(r.email), q((r.section_titles ?? []).join(", ")),
        q(r.sds_revision_date), q(r.sds_version), q(r.channel), q(r.sent_at), q(r.first_opened_at),
        q(r.acknowledged_at), q(r.ack_method), q(r.delivery_status), q(r.reminder_count),
      ].join(";")),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kjemikalie-bekreftelser-${(form.product_name ?? "produkt").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
  };

  const groupedSections = useMemo(() => {
    const map = new Map<string, typeof sectionOptions>();
    for (const s of sectionOptions) {
      if (!map.has(s.handbook_title)) map.set(s.handbook_title, []);
      map.get(s.handbook_title)!.push(s);
    }
    return [...map.entries()];
  }, [sectionOptions]);

  if (!isNew && isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Laster…</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link to="/hms/kjemikalier"><ChevronLeft className="h-4 w-4 mr-1" /> Stoffkartotek</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isNew ? "Nytt kjemikalie" : form.product_name}
          </h1>
          {!isNew && (
            <div className="flex flex-wrap gap-1.5">
              {form.is_high_risk && <Badge variant="destructive" className="text-[10px]">Høyrisiko</Badge>}
              {form.requires_sja && <Badge variant="outline" className="text-[10px]">Krever SJA</Badge>}
              {form.requires_training && <Badge variant="outline" className="text-[10px]">Krever opplæring</Badge>}
              {form.requires_special_ppe && <Badge variant="outline" className="text-[10px]">Særskilt PVU</Badge>}
              <Badge variant={sds === "ok" ? "outline" : "destructive"} className="text-[10px]">{SDS_STATE_LABELS[sds]}</Badge>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <Button variant="outline" onClick={() => setSendOpen(true)}>
              <Send className="h-4 w-4 mr-2" /> Send info og be om bekreftelse
            </Button>
          )}
          <Button onClick={save} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Lagre
          </Button>
        </div>
      </div>

      <Tabs defaultValue="product">
        <TabsList>
          <TabsTrigger value="product">Produkt</TabsTrigger>
          <TabsTrigger value="safety">Sikkerhet &amp; SDS</TabsTrigger>
          <TabsTrigger value="routines">HMS-rutiner</TabsTrigger>
          {!isNew && <TabsTrigger value="status">Bekreftelser</TabsTrigger>}
        </TabsList>

        <TabsContent value="product" className="space-y-4 pt-4">
          <Card>
            <CardContent className="p-4 grid gap-4 sm:grid-cols-2">
              <Field label="Produktnavn">
                <Input value={form.product_name ?? ""} onChange={(e) => set("product_name", e.target.value)} />
              </Field>
              <Field label="Leverandør">
                <Input value={form.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)} />
              </Field>
              <Field label="Produsent">
                <Input value={form.manufacturer ?? ""} onChange={(e) => set("manufacturer", e.target.value)} />
              </Field>
              <Field label="Kategori">
                <Select value={form.category ?? ""} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger><SelectValue placeholder="Velg kategori" /></SelectTrigger>
                  <SelectContent>
                    {CHEMICAL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status ?? "active"} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHEMICAL_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Bruksområde" className="sm:col-span-2">
                <Textarea rows={2} value={form.usage_area ?? ""} onChange={(e) => set("usage_area", e.target.value)} />
              </Field>
              <Field label="Prosjekter / områder der produktet brukes (én per linje)" className="sm:col-span-2">
                <Textarea rows={2} value={(form.locations ?? []).join("\n")} onChange={(e) => setList("locations", e.target.value)} />
              </Field>
              <Field label="Interne notater" className="sm:col-span-2">
                <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Krav før bruk</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0 grid gap-2 sm:grid-cols-2">
              <Toggle label="Høyrisiko kjemikalie (epoxy, resin, herder, støpemasse)" checked={!!form.is_high_risk} onChange={(v) => set("is_high_risk", v)} />
              <Toggle label="Krever opplæring før bruk" checked={!!form.requires_training} onChange={(v) => set("requires_training", v)} />
              <Toggle label="Krever lesebekreftelse før bruk" checked={!!form.requires_acknowledgement} onChange={(v) => set("requires_acknowledgement", v)} />
              <Toggle label="Krever SJA før bruk" checked={!!form.requires_sja} onChange={(v) => set("requires_sja", v)} />
              <Toggle label="Krever særskilt personlig verneutstyr" checked={!!form.requires_special_ppe} onChange={(v) => set("requires_special_ppe", v)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Målgruppe i HMS-pakken</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <Toggle
                label="Relevant for alle montører (følger alltid med HMS-håndboken)"
                checked={!!form.relevant_for_all}
                onChange={(v) => set("relevant_for_all", v)}
              />
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">
                  Målgrupper – styrer hvilke utsendinger kjemikaliet følger med i.
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CHEMICAL_AUDIENCE_TAGS.map((t) => {
                    const on = (form.audience_tags ?? []).includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          set(
                            "audience_tags",
                            on
                              ? (form.audience_tags ?? []).filter((x) => x !== t)
                              : [...(form.audience_tags ?? []), t],
                          )
                        }
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                          on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="safety" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Sikkerhetsdatablad (SDS)</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              {sds !== "ok" && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <FileWarning className="h-4 w-4 mt-0.5 text-destructive" />
                  <div>
                    <div className="font-medium">{SDS_STATE_LABELS[sds]}</div>
                    <p className="text-xs text-muted-foreground">
                      {sds === "missing"
                        ? "Last opp sikkerhetsdatablad før produktet tas i bruk."
                        : sds === "stale"
                          ? "Sikkerhetsdatabladet er eldre enn 3 år. Kontroller om leverandøren har ny revisjon."
                          : "Registrer revisjonsdato slik at systemet kan følge opp nye versjoner."}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" asChild disabled={uploading}>
                  <label className="cursor-pointer">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    Last opp SDS
                    <input
                      type="file" className="hidden" accept=".pdf,image/*"
                      onChange={(e) => e.target.files?.[0] && uploadSds(e.target.files[0])}
                    />
                  </label>
                </Button>
                {form.sds_path && (
                  <Button variant="ghost" size="sm" onClick={openSds}>
                    <Download className="h-4 w-4 mr-2" /> {form.sds_filename ?? "Åpne SDS"}
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SDS revisjonsdato">
                  <Input type="date" value={form.sds_revision_date ?? ""} onChange={(e) => set("sds_revision_date", e.target.value)} />
                </Field>
                <Field label="SDS versjon">
                  <Input value={form.sds_version ?? ""} onChange={(e) => set("sds_version", e.target.value)} />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Fare og vern</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <Field label="Farepiktogrammer">
                <div className="flex flex-wrap gap-2">
                  {GHS_PICTOGRAMS.map((p) => {
                    const on = (form.pictograms ?? []).includes(p.code);
                    return (
                      <button
                        key={p.code} type="button"
                        onClick={() => set("pictograms", on
                          ? (form.pictograms ?? []).filter((x) => x !== p.code)
                          : [...(form.pictograms ?? []), p.code])}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-destructive bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-muted"}`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="H-setninger (én per linje)">
                  <Textarea rows={5} value={(form.h_statements ?? []).join("\n")} onChange={(e) => setList("h_statements", e.target.value)} />
                </Field>
                <Field label="P-setninger (én per linje)">
                  <Textarea rows={5} value={(form.p_statements ?? []).join("\n")} onChange={(e) => setList("p_statements", e.target.value)} />
                </Field>
              </div>
              <Field label="Krav til personlig verneutstyr">
                <Textarea rows={2} value={form.ppe_requirements ?? ""} onChange={(e) => set("ppe_requirements", e.target.value)} />
              </Field>
              <Field label="Krav til ventilasjon">
                <Textarea rows={2} value={form.ventilation_requirements ?? ""} onChange={(e) => set("ventilation_requirements", e.target.value)} />
              </Field>
              <Field label="Førstehjelpstiltak">
                <Textarea rows={3} value={form.first_aid ?? ""} onChange={(e) => set("first_aid", e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Lagringskrav">
                  <Textarea rows={2} value={form.storage_requirements ?? ""} onChange={(e) => set("storage_requirements", e.target.value)} />
                </Field>
                <Field label="Avfallshåndtering">
                  <Textarea rows={2} value={form.waste_handling ?? ""} onChange={(e) => set("waste_handling", e.target.value)} />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routines" className="pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">HMS-kapitler som følger produktet</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <p className="text-sm text-muted-foreground">
                Kapitlene sendes sammen med kjemikalieinfo og sikkerhetsdatablad, og ansatte bekrefter begge i én handling.
              </p>
              {groupedSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen publiserte HMS-kapitler funnet.</p>
              ) : (
                groupedSections.map(([book, secs]) => (
                  <div key={book} className="space-y-1.5">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">{book}</div>
                    {secs.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={sectionIds.includes(s.id)}
                          onCheckedChange={() => setSectionIds(
                            sectionIds.includes(s.id) ? sectionIds.filter((x) => x !== s.id) : [...sectionIds, s.id]
                          )}
                        />
                        {s.heading}
                      </label>
                    ))}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {!isNew && (
          <TabsContent value="status" className="pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {recipients.length} utsending(er) · {recipients.filter((r) => r.acknowledged_at).length} bekreftet · {pending.length} mangler
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={remind} disabled={sendMut.isPending || pending.length === 0}>
                  Purr manglende
                </Button>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={recipients.length === 0}>
                  Eksporter CSV
                </Button>
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ansatt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">HMS-kapitler</TableHead>
                      <TableHead className="hidden md:table-cell">SDS-revisjon</TableHead>
                      <TableHead>Sendt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipients.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Ingen utsendinger enda.</TableCell></TableRow>
                    ) : recipients.map((r) => {
                      const outdated = !!r.acknowledged_at && !!form.sds_revision_date && (r.sds_revision_date ?? "") < form.sds_revision_date;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="text-sm font-medium">{r.full_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.email ?? r.phone ?? "—"}</div>
                          </TableCell>
                          <TableCell>
                            {outdated ? (
                              <Badge variant="destructive" className="text-[10px]">Ny SDS – må bekreftes på nytt</Badge>
                            ) : r.acknowledged_at ? (
                              <Badge className="text-[10px]">Bekreftet</Badge>
                            ) : r.first_opened_at ? (
                              <Badge variant="outline" className="text-[10px]">Åpnet</Badge>
                            ) : r.delivery_status === "failed" ? (
                              <Badge variant="destructive" className="text-[10px]">Utsending feilet</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Sendt</Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs max-w-[220px]">
                            <span className="line-clamp-2">{(r.section_titles ?? []).join(", ") || "—"}</span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs">{r.sds_revision_date ?? "—"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {r.sent_at ? format(new Date(r.sent_at), "d. MMM yyyy", { locale: nb }) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {!isNew && (
        <div className="pt-2">
          <Button
            variant="ghost" size="sm" className="text-destructive"
            onClick={async () => {
              if (!confirm("Fjerne kjemikaliet fra stoffkartoteket?")) return;
              await deleteMut.mutateAsync(id!);
              navigate("/hms/kjemikalier");
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Fjern kjemikalie
          </Button>
        </div>
      )}

      {!isNew && chemical && (
        <ChemicalDistributeDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          chemical={{ ...(chemical as ChemicalRow), ...(form as ChemicalRow) }}
          sections={sectionIds.map((sid) => ({
            section_id: sid,
            heading: sectionOptions.find((s) => s.id === sid)?.heading ?? "Kapittel",
          }))}
        />
      )}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} /> {label}
    </label>
  );
}
