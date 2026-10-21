import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Plus, ArrowLeft, CheckCircle2, ListPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LocalExportMenu } from "@/components/LocalExportMenu";
import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import {
  REVIEW_ANSWER_LABEL, REVIEW_CHECKPOINTS, reviewCanSign, type ControlAnswers, type ReviewAnswer,
} from "@/lib/hms/internalControl";
import { format } from "date-fns";
import { HmsControlHistory } from "@/components/hms/HmsControlHistory";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const sb = supabase as any;

async function buildSnapshot(cid: string) {
  const { data, error } = await supabase.rpc("hms_control_snapshot", { _company_id: cid });
  if (error) throw error;
  return data;
}

const STATUS_LABEL: Record<string, string> = { draft: "Utkast", in_progress: "Pågår", completed: "Fullført" };

/** Årlig HMS-/internkontrollgjennomgang — kun leder/admin (hms.manage). */
export default function HmsInternalReviewPage() {
  const { id } = useParams<{ id: string }>();
  return id ? <ReviewDetail id={id} /> : <ReviewList />;
}

function ReviewList() {
  const { activeCompanyId: cid } = useCompanyContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: reviews, isLoading } = useQuery({
    queryKey: ["hms-internal-reviews", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("hms_internal_reviews")
        .select("*")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!cid || !user) throw new Error("Mangler kontekst");
      const snapshot = await buildSnapshot(cid);
      const year = new Date().getFullYear();
      const { data, error } = await sb.from("hms_internal_reviews").insert({
        company_id: cid,
        title: `Årlig HMS-/internkontrollgjennomgang ${year}`,
        period_year: year,
        status: "in_progress",
        auto_snapshot: snapshot,
        created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (newId) => {
      navigate(`/hms/internkontroll/${newId}`);
      toast({ title: "Gjennomgang opprettet", description: "Systemfakta er hentet inn automatisk." });
      qc.invalidateQueries({ queryKey: ["hms-internal-reviews"] });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <HmsMobileBack />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ClipboardCheck className="h-3.5 w-3.5" /> HMS &amp; HR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Internkontrollgjennomgang</h1>
          <p className="text-sm text-muted-foreground">Årlig gjennomgang med systemfakta, tiltak og signering.</p>
        </div>
        <Button size="sm" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
          <Plus className="h-4 w-4 mr-1.5" /> Ny gjennomgang
        </Button>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Laster…</p>
      ) : (reviews ?? []).length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Ingen gjennomganger ennå. Opprett den første — systemet henter inn status automatisk.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {(reviews ?? []).map((r) => (
            <Link key={r.id} to={`/hms/internkontroll/${r.id}`} className="block rounded-lg border border-border/60 bg-card p-4 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Versjon {r.version} · Opprettet {format(new Date(r.created_at), "dd.MM.yyyy")}
                    {r.signed_at && ` · Signert ${format(new Date(r.signed_at), "dd.MM.yyyy")}`}
                  </div>
                </div>
                <Badge variant="outline" className={r.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewDetail({ id }: { id: string }) {
  const { activeCompanyId: cid } = useCompanyContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const { data: review, isLoading, error: reviewError } = useQuery({
    queryKey: ["hms-internal-review", id, cid],
    enabled: !!id && !!cid,
    queryFn: async () => {
      const { data, error } = await sb.from("hms_internal_reviews").select("*").eq("id", id).eq("company_id", cid).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const answers = (review?.answers ?? {}) as ControlAnswers;
  const snapshot = (review?.auto_snapshot ?? {}) as Record<string, unknown>;
  const locked = review?.status === "completed";

  const saveMut = useMutation({
    mutationFn: async (next: typeof answers) => {
      if (!cid || !review || locked) throw new Error("Gjennomgangen kan ikke endres");
      const { error } = await sb.from("hms_internal_reviews").update({
        answers: next, updated_at: new Date().toISOString(),
      }).eq("id", id).eq("company_id", cid).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hms-internal-review", id] }),
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  const setAnswer = (key: string, answer: ReviewAnswer) => {
    if (locked) return;
    saveMut.mutate({ ...answers, [key]: { ...answers[key], answer, comment: commentDrafts[key] ?? answers[key]?.comment } });
  };

  const actionMut = useMutation({
    mutationFn: async (cp: { key: string; label: string }) => {
      if (!cid || !user || locked) throw new Error("Mangler kontekst eller gjennomgangen er signert");
      const { data, error } = await sb.from("hms_action_items").insert({
        company_id: cid,
        title: `Internkontroll: ${cp.label}`,
        description: commentDrafts[cp.key] || answers[cp.key]?.comment || null,
        status: "open",
        priority: "normal",
        source_type: "internal_review",
        internal_review_id: id,
        created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      const { error: saveError } = await sb.from("hms_internal_reviews").update({
        answers: { ...answers, [cp.key]: { ...answers[cp.key], answer: "no", comment: commentDrafts[cp.key] ?? answers[cp.key]?.comment, action_item_id: data.id } },
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("company_id", cid).select("id").single();
      if (saveError) throw saveError;
    },
    onSuccess: () => {
      toast({ title: "Tiltak opprettet", description: "Lagt til i HMS-handlingsplanen." });
      qc.invalidateQueries({ queryKey: ["hms-internal-review", id] });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  const completeMut = useMutation({
    mutationFn: async () => {
      if (!user || !cid || !reviewCanSign(snapshot, answers) || saveMut.isPending) throw new Error("Alle punkter og ukjente fakta må avklares før signering");
      const { error } = await sb.from("hms_internal_reviews").update({
        status: "completed",
        signed_by: user.id,
        signed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("company_id", cid).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Gjennomgang signert og fullført" });
      qc.invalidateQueries({ queryKey: ["hms-internal-review", id] });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  const revisionMut = useMutation({
    mutationFn: async () => {
      if (!cid || !user || !locked) throw new Error("Velg en signert gjennomgang");
      const existing = await sb.from("hms_internal_reviews").select("id").eq("company_id", cid).eq("previous_review_id", id).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return existing.data.id;
      const { data, error } = await sb.from("hms_internal_reviews").insert({
        company_id: cid, title: review.title, period_year: review.period_year,
        status: "in_progress", previous_review_id: id, created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: newId => navigate(`/hms/internkontroll/${newId}`),
    onError: (e: Error) => toast({ title: "Feil", description: e.message, variant: "destructive" }),
  });
  const refreshMut = useMutation({
    mutationFn: async () => {
      if (!cid || locked) throw new Error("Signert gjennomgang er låst");
      const fresh = await buildSnapshot(cid);
      const { error } = await sb.from("hms_internal_reviews").update({ auto_snapshot: fresh }).eq("id", id).eq("company_id", cid).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hms-internal-review", id] }),
    onError: (e: Error) => toast({ title: "Feil", description: e.message, variant: "destructive" }),
  });
  if (isLoading) return <div className="p-6 text-center text-sm text-muted-foreground">Laster…</div>;
  if (reviewError || !review) return <div className="p-6"><HmsMobileBack to="/hms/internkontroll" label="Til gjennomganger" /><p role="alert">Gjennomgangen finnes ikke i valgt selskap eller kunne ikke hentes.</p></div>;

  const answered = REVIEW_CHECKPOINTS.filter((c) => answers[c.key]?.answer).length;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
      <HmsMobileBack to="/hms/internkontroll" label="Til gjennomganger" />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 hidden sm:inline-flex"><Link to="/hms/internkontroll"><ArrowLeft className="h-4 w-4 mr-1" /> Alle gjennomganger</Link></Button>
          <h1 className="text-xl font-semibold tracking-tight mt-1">{review.title}</h1>
          <p className="text-sm text-muted-foreground">
            Versjon {review.version} · {answered} av {REVIEW_CHECKPOINTS.length} punkter besvart
            {review.signed_at && ` · Signert ${format(new Date(review.signed_at), "dd.MM.yyyy HH:mm")}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <LocalExportMenu
            title={review.title} module="hms" version={`Versjon ${review.version} · ${review.signed_at ? `Signert ${review.signed_at} av ${review.signed_by}` : "Utkast"}`}
            rows={REVIEW_CHECKPOINTS.map((c) => ({
              Kontrollpunkt: c.label,
              Svar: answers[c.key]?.answer ? REVIEW_ANSWER_LABEL[answers[c.key]?.answer ?? "na"] : "Ikke besvart",
              Kommentar: answers[c.key]?.comment ?? "",
              "Systemfakta": c.snapshotKey ? (typeof snapshot[c.snapshotKey] === "number" ? String(snapshot[c.snapshotKey]) : "Kunne ikke kontrolleres") : "",
              "Feil godkjent": answers[c.key]?.error_approved ? "Ja" : "Nei",
              "Tiltak opprettet": answers[c.key]?.action_item_id ? "Ja" : "Nei",
            }))}
          />
          {locked && <Button variant="outline" disabled={revisionMut.isPending} onClick={() => revisionMut.mutate()}>Ny revisjon</Button>}
          {!locked && <Button variant="outline" disabled={refreshMut.isPending || saveMut.isPending} onClick={() => refreshMut.mutate()}>Oppdater systemfakta</Button>}
          {!locked && (
            <Button size="sm" disabled={!reviewCanSign(snapshot, answers) || completeMut.isPending || saveMut.isPending || actionMut.isPending} onClick={() => completeMut.mutate()}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Signer og fullfør
            </Button>
          )}
        </div>
      </div>

      {review.previous_review_id && <Link className="text-sm text-primary underline" to={`/hms/internkontroll/${review.previous_review_id}`}>Åpne forrige signerte versjon</Link>}
      {REVIEW_CHECKPOINTS.some(cp => cp.snapshotKey && typeof snapshot[cp.snapshotKey] !== "number") && <p role="alert" className="text-sm border border-destructive/40 p-3 text-destructive">Ett eller flere kontrollpunkter kunne ikke kontrolleres. Oppdater systemfakta eller kommenter og godkjenn hvert ukjent punkt før signering.</p>}
      {REVIEW_CHECKPOINTS.map((cp, i) => {
        const a = answers[cp.key];
        const snapVal = cp.snapshotKey ? snapshot[cp.snapshotKey] : undefined;
        const unknown = !!cp.snapshotKey && typeof snapVal !== "number";
        return (
          <Card key={cp.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground font-normal">{i + 1}.</span> {cp.label}
                {cp.snapshotKey && (
                  <Badge variant="outline" className={cn("text-[10px]", Number(snapVal) > 0 && "bg-amber-50 text-amber-700 border-amber-200")}>
                    Systemet viser: {unknown ? "Kunne ikke kontrolleres" : String(snapVal)}
                  </Badge>
                )}
                {a?.action_item_id && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Tiltak opprettet</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(["yes", "no", "na"] as ReviewAnswer[]).map((v) => (
                  <Button
                    key={v} size="sm" disabled={locked || saveMut.isPending}
                    variant={a?.answer === v ? "default" : "outline"}
                    className={cn("min-h-11", a?.answer === v && v === "no" && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                    onClick={() => setAnswer(cp.key, v)}
                  >
                    {REVIEW_ANSWER_LABEL[v]}
                  </Button>
                ))}
                {!locked && a?.answer === "no" && !a.action_item_id && (
                  <Button size="sm" variant="outline" className="min-h-11" disabled={actionMut.isPending} onClick={() => actionMut.mutate(cp)}>
                    <ListPlus className="h-4 w-4 mr-1" /> Opprett tiltak
                  </Button>
                )}
              </div>
              {unknown && !locked && <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={a?.error_approved === true} disabled={saveMut.isPending} onCheckedChange={value => saveMut.mutate({ ...answers, [cp.key]: { ...a, error_approved: value === true } })} />Jeg godkjenner manuell kontroll dokumentert i kommentaren</label>}
              {!locked && (
                <Textarea
                  rows={2}
                  placeholder={unknown ? "Dokumenter manuell kontroll og begrunnelse…" : "Kommentar (valgfritt)…"}
                  defaultValue={a?.comment ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value;
                    setCommentDrafts((d) => ({ ...d, [cp.key]: v }));
                    if (a?.answer) saveMut.mutate({ ...answers, [cp.key]: { ...a, comment: v } });
                  }}
                />
              )}
              {locked && a?.comment && <p className="text-xs text-muted-foreground">{a.comment}</p>}
            </CardContent>
          </Card>
        );
      })}
      <HmsControlHistory entity="hms_internal_reviews" id={id} />
    </div>
  );
}
