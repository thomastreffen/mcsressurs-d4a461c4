import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, CheckCircle2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { useAssignableUsers } from "@/hooks/useCompanyUsers";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocalExportMenu } from "@/components/LocalExportMenu";
import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import {
  ACTIVITY_CATEGORY_LABEL, ACTIVITY_FREQUENCIES, ACTIVITY_STATE_LABEL, FREQUENCY_LABEL,
  activityState, activityDestination, type ActivityFrequency, type ActivityState,
} from "@/lib/hms/internalControl";
import { Link } from "react-router-dom";
import { HmsControlHistory } from "@/components/hms/HmsControlHistory";
import { format } from "date-fns";

const STATE_STYLE: Record<ActivityState, string> = {
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-muted text-muted-foreground border-border",
  overdue: "bg-rose-50 text-rose-700 border-rose-200",
  due_soon: "bg-amber-50 text-amber-700 border-amber-200",
  planned: "bg-blue-50 text-blue-700 border-blue-200",
};

type Filter = "all" | "30" | "60" | "90" | "overdue" | "done";

interface ActivityForm {
  id?: string;
  name: string;
  category: string;
  responsible_user_id: string;
  deputy_user_id: string;
  frequency: ActivityFrequency;
  custom_interval_days: string;
  due_date: string;
  comment: string;
}

const EMPTY_FORM: ActivityForm = {
  name: "", category: "annet", responsible_user_id: "", deputy_user_id: "",
  frequency: "annual", custom_interval_days: "", due_date: "", comment: "",
};

/** HMS-årshjul: planlagte og tilbakevendende HMS-aktiviteter (leder/admin). */
export default function HmsYearWheelPage() {
  const { activeCompanyId: cid } = useCompanyContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: users } = useAssignableUsers();
  const [filter, setFilter] = useState<Filter>("all");
  const [form, setForm] = useState<ActivityForm | null>(null);
  const [completing, setCompleting] = useState<any | null>(null);
  const [docText, setDocText] = useState("");
  const [submissionId, setSubmissionId] = useState("");

  const { data: activities, isLoading } = useQuery({
    queryKey: ["hms-year-activities", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hms_year_activities")
        .select("*")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: submissions } = useQuery({
    queryKey: ["hms-year-completed-submissions", cid], enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase.from("hms_submissions").select("id, title, submitted_at")
        .eq("company_id", cid ?? "").in("status", ["submitted", "approved"]).is("deleted_at", null).order("submitted_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nameOf = (id: string | null) => users?.find((u) => u.id === id)?.name ?? null;
  const now = new Date();

  const counts = useMemo(() => {
    const list = activities ?? [];
    const inDays = (n: number) => {
      const lim = now.getTime() + n * 86400000;
      return list.filter((a) => a.status === "planned" && new Date(a.due_date).getTime() >= now.getTime() && new Date(a.due_date).getTime() <= lim).length;
    };
    return {
      overdue: list.filter((a) => activityState(a, now) === "overdue").length,
      d30: inDays(30), d60: inDays(60), d90: inDays(90),
      done: list.filter((a) => a.status === "done").length,
    };
  }, [activities]);

  const filtered = useMemo(() => {
    const list = activities ?? [];
    if (filter === "overdue") return list.filter((a) => activityState(a, now) === "overdue");
    if (filter === "done") return list.filter((a) => a.status === "done");
    if (filter === "30" || filter === "60" || filter === "90") {
      const lim = now.getTime() + Number(filter) * 86400000;
      return list.filter((a) => a.status === "planned" && new Date(a.due_date).getTime() <= lim);
    }
    return list;
  }, [activities, filter]);

  const saveMut = useMutation({
    mutationFn: async (f: ActivityForm) => {
      if (!cid || !user) throw new Error("Mangler kontekst");
      const row = {
        company_id: cid,
        name: f.name.trim(),
        category: f.category,
        responsible_user_id: f.responsible_user_id || null,
        deputy_user_id: f.deputy_user_id || null,
        frequency: f.frequency,
        custom_interval_days: f.frequency === "custom" ? Number(f.custom_interval_days) || null : null,
        due_date: f.due_date,
        comment: f.comment || null,
        updated_at: new Date().toISOString(),
      };
      const sb = supabase as any;
      if (f.id) {
        const { error } = await sb.from("hms_year_activities").update(row).eq("id", f.id).eq("company_id", cid).select("id").single();
        if (error) throw error;
      } else {
        const { error } = await sb.from("hms_year_activities").insert({ ...row, created_by: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Lagret" });
      setForm(null);
      qc.invalidateQueries({ queryKey: ["hms-year-activities"] });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  const completeMut = useMutation({
    mutationFn: async (a: any) => {
      if (!user) throw new Error("Mangler bruker");
      if (!cid) throw new Error("Mangler selskap");
      const { error } = await supabase.rpc("hms_complete_year_activity", {
        _company_id: cid, _activity_id: a.id, _documentation: docText, _submission_id: submissionId || null, _audit_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Gjennomført", description: "Neste forekomst er planlagt automatisk." });
      setCompleting(null);
      setDocText("");
      setSubmissionId("");
      qc.invalidateQueries({ queryKey: ["hms-year-activities"] });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <HmsMobileBack />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <CalendarClock className="h-3.5 w-3.5" /> HMS &amp; HR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">HMS-årshjul</h1>
          <p className="text-sm text-muted-foreground">Planlagte og tilbakevendende HMS-aktiviteter.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <LocalExportMenu
            title="HMS-årshjul" module="hms" disabled={isLoading}
            filters={{ Visning: filter }}
            rows={(filtered ?? []).map((a) => ({
              Aktivitet: a.name, Kategori: ACTIVITY_CATEGORY_LABEL[a.category] ?? a.category,
              Ansvarlig: nameOf(a.responsible_user_id) ?? "", Frekvens: FREQUENCY_LABEL[a.frequency as ActivityFrequency] ?? a.frequency,
              Frist: a.due_date, Status: ACTIVITY_STATE_LABEL[activityState(a, now)],
              "Utført dato": a.completed_at ? new Date(a.completed_at) : null, Dokumentasjon: a.documentation ?? "",
            }))}
          />
          <Button size="sm" onClick={() => setForm({ ...EMPTY_FORM })}><Plus className="h-4 w-4 mr-1.5" /> Ny aktivitet</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className={counts.overdue ? "bg-rose-50 text-rose-700 border-rose-200" : ""}>{counts.overdue} forfalt</Badge>
        <Badge variant="outline">{counts.d30} innen 30 dager</Badge>
        <Badge variant="outline">{counts.d60} innen 60 dager</Badge>
        <Badge variant="outline">{counts.d90} innen 90 dager</Badge>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{counts.done} gjennomført</Badge>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto">
            <TabsTrigger value="all">Alle</TabsTrigger>
            <TabsTrigger value="30">30 dager</TabsTrigger>
            <TabsTrigger value="60">60 dager</TabsTrigger>
            <TabsTrigger value="90">90 dager</TabsTrigger>
            <TabsTrigger value="overdue">Forfalt</TabsTrigger>
            <TabsTrigger value="done">Gjennomført</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Laster…</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Ingen aktiviteter i denne visningen.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const st = activityState(a, now);
            return (
              <Card key={a.id}>
                <CardContent className="p-4 flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <Badge variant="outline" className={STATE_STYLE[st]}>{ACTIVITY_STATE_LABEL[st]}</Badge>
                      <Badge variant="outline" className="text-[10px]">{ACTIVITY_CATEGORY_LABEL[a.category] ?? a.category}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Frist {format(new Date(a.due_date), "dd.MM.yyyy")} · {FREQUENCY_LABEL[a.frequency as ActivityFrequency] ?? a.frequency}
                      {a.frequency === "custom" && a.custom_interval_days ? ` (${a.custom_interval_days} dager)` : ""}
                      {nameOf(a.responsible_user_id) && ` · Ansvarlig: ${nameOf(a.responsible_user_id)}`}
                      {nameOf(a.deputy_user_id) && ` · Stedfortreder: ${nameOf(a.deputy_user_id)}`}
                    </div>
                    {a.comment && <p className="mt-1 text-xs text-muted-foreground">{a.comment}</p>}
                    {activityDestination(a) && <Link className="mt-2 inline-flex min-h-11 items-center text-sm text-primary underline" to={activityDestination(a) ?? "/hms"}>Åpne eller start aktivitet</Link>}
                    {a.documentation && <p className="mt-1 text-xs">Dokumentasjon: {a.documentation}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    {a.status === "planned" && (
                      <Button size="sm" variant="outline" onClick={() => { setCompleting(a); setDocText(""); }}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Gjennomfør
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setForm({
                      id: a.id, name: a.name, category: a.category,
                      responsible_user_id: a.responsible_user_id ?? "", deputy_user_id: a.deputy_user_id ?? "",
                      frequency: a.frequency, custom_interval_days: a.custom_interval_days?.toString() ?? "",
                      due_date: a.due_date, comment: a.comment ?? "",
                    })}><Pencil className="h-4 w-4" /></Button>
                  </div>
                  <HmsControlHistory entity="hms_year_activities" id={a.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Ny / rediger aktivitet */}
      <Sheet open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto sm:side-right">
          <SheetHeader><SheetTitle>{form?.id ? "Rediger aktivitet" : "Ny HMS-aktivitet"}</SheetTitle></SheetHeader>
          {form && (
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label>Navn</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="F.eks. Årlig internrevisjon" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Kategori</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACTIVITY_CATEGORY_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Frekvens</Label>
                  <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as ActivityFrequency })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIVITY_FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQUENCY_LABEL[f]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.frequency === "custom" && (
                  <div className="space-y-1.5">
                    <Label>Intervall (dager)</Label>
                    <Input type="number" min={1} value={form.custom_interval_days} onChange={(e) => setForm({ ...form, custom_interval_days: e.target.value })} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Frist</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Ansvarlig</Label>
                  <Select value={form.responsible_user_id} onValueChange={(v) => setForm({ ...form, responsible_user_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Velg person" /></SelectTrigger>
                    <SelectContent>{(users ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Stedfortreder</Label>
                  <Select value={form.deputy_user_id} onValueChange={(v) => setForm({ ...form, deputy_user_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Valgfritt" /></SelectTrigger>
                    <SelectContent>{(users ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Kommentar</Label>
                <Textarea rows={3} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
              </div>
              <div className="sticky bottom-0 -mx-6 border-t bg-background px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex gap-2">
                <Button className="flex-1 min-h-11" disabled={!form.name.trim() || !form.due_date || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
                  Lagre
                </Button>
                <Button variant="outline" className="min-h-11" onClick={() => setForm(null)}>Avbryt</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Gjennomfør aktivitet */}
      <Sheet open={!!completing} onOpenChange={(o) => !o && setCompleting(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
          <SheetHeader><SheetTitle>Gjennomfør: {completing?.name}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Dokumentasjon / resultat</Label>
              <Textarea rows={4} value={docText} onChange={(e) => setDocText(e.target.value)} placeholder="Kort om hva som ble gjort, funn, referanse til dokument…" />
            </div>
            <div className="space-y-1.5">
              <Label>Koble gjennomført sjekkliste/SJA</Label>
              <Select value={submissionId || "none"} onValueChange={v => setSubmissionId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Ingen kobling</SelectItem>{(submissions ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.title || "Uten tittel"}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Neste forekomst beregnes fra planlagt frist, ikke gjennomføringsdato.</p>
            <div className="sticky bottom-0 -mx-6 border-t bg-background px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex gap-2">
              <Button className="flex-1 min-h-11" disabled={completeMut.isPending || (!docText.trim() && !submissionId)} onClick={() => completeMut.mutate(completing)}>Merk gjennomført</Button>
              <Button variant="outline" className="min-h-11" onClick={() => setCompleting(null)}>Avbryt</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
