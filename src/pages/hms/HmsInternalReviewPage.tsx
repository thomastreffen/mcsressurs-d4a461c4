import { useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  REVIEW_ANSWER_LABEL, REVIEW_CHECKPOINTS, type ReviewAnswer,
} from "@/lib/hms/internalControl";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const sb = supabase as any;

async function countOf(q: any): Promise<number> {
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

/** Henter frosne systemfakta for gjennomgangen — mest mulig automatisk. */
async function buildSnapshot(cid: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [
    yearActivitiesOverdue, openActions, overdueActions, openIncidents,
    seriousIncidents, vernerunderDone, missingHandbookAcks, expiredFse,
    expiredFirstAid, sdsMissing, risksNeedingReview,
  ] = await Promise.all([
    countOf(sb.from("hms_year_activities").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "planned").lt("due_date", today).is("deleted_at", null)),
    countOf(sb.from("hms_action_items").select("id", { count: "exact", head: true }).eq("company_id", cid).in("status", ["open", "in_progress", "waiting"]).is("deleted_at", null)),
    countOf(sb.from("hms_action_items").select("id", { count: "exact", head: true }).eq("company_id", cid).in("status", ["open", "in_progress", "waiting"]).lt("due_date", today).is("deleted_at", null)),
    countOf(sb.from("hms_incidents").select("id", { count: "exact", head: true }).eq("company_id", cid).neq("status", "closed").is("deleted_at", null)),
    countOf(sb.from("hms_incidents").select("id", { count: "exact", head: true }).eq("company_id", cid).in("severity", ["high", "critical"]).neq("status", "closed").is("deleted_at", null)),
    countOf(sb.from("hms_year_activities").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("category", "vernerunde").eq("status", "done").gte("completed_at", yearStart).is("deleted_at", null)),
    countOf(sb.from("hms_handbook_recipients").select("id", { count: "exact", head: true }).eq("company_id", cid).is("acknowledged_at", null)),
    countOf(sb.from("compliance_competences").select("id", { count: "exact", head: true }).eq("company_id", cid).ilike("name", "%fse%").lt("valid_until", today)),
    countOf(sb.from("compliance_competences").select("id", { count: "exact", head: true }).eq("company_id", cid).ilike("name", "%førstehjelp%").lt("valid_until", today)),
    countOf(sb.from("hms_chemicals").select("id", { count: "exact", head: true }).eq("company_id", cid).is("sds_file_path", null).is("deleted_at", null)),
    countOf(sb.from("hms_risk_register").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "active").lt("next_review_date", today).is("deleted_at", null)),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    yearActivitiesOverdue, openActions, overdueActions, openIncidents,
    repeatedIncidents: 0, seriousIncidents, vernerunderDone, missingHandbookAcks,
    expiredFse, expiredFirstAid, sdsMissing, risksNeedingReview,
  } as Record<string, number | string>;
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
    onSuccess: () => {
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
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const { data: review, isLoading } = useQuery({
    queryKey: ["hms-internal-review", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("hms_internal_reviews").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const answers = (review?.answers ?? {}) as Record<string, { answer?: ReviewAnswer; comment?: string; action_item_id?: string }>;
  const snapshot = (review?.auto_snapshot ?? {}) as Record<string, number | string>;
  const locked = review?.status === "completed";

  const saveMut = useMutation({
    mutationFn: async (next: typeof answers) => {
      const { error } = await sb.from("hms_internal_reviews").update({
        answers: next, updated_at: new Date().toISOString(),
      }).eq("id", id);
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
      if (!cid || !user) throw new Error("Mangler kontekst");
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
      await sb.from("hms_internal_reviews").update({
        answers: { ...answers, [cp.key]: { ...answers[cp.key], answer: "no", comment: commentDrafts[cp.key] ?? answers[cp.key]?.comment, action_item_id: data.id } },
        updated_at: new Date().toISOString(),
      }).eq("id", id);
    },
    onSuccess: () => {
      toast({ title: "Tiltak opprettet", description: "Lagt til i HMS-handlingsplanen." });
      qc.invalidateQueries({ queryKey: ["hms-internal-review", id] });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  const completeMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Mangler bruker");
      const { error } = await sb.from("hms_internal_reviews").update({
        status: "completed",
        signed_by: user.id,
        signed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Gjennomgang signert og fullført" });
      qc.invalidateQueries({ queryKey: ["hms-internal-review", id] });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  if (isLoading || !review) return <div className="p-6 text-center text-sm text-muted-foreground">Laster…</div>;

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
            title={review.title} module="hms"
            rows={REVIEW_CHECKPOINTS.map((c) => ({
              Kontrollpunkt: c.label,
              Svar: answers[c.key]?.answer ? REVIEW_ANSWER_LABEL[answers[c.key].answer!] : "Ikke besvart",
              Kommentar: answers[c.key]?.comment ?? "",
              "Systemfakta": c.snapshotKey ? String(snapshot[c.snapshotKey] ?? "") : "",
              "Tiltak opprettet": answers[c.key]?.action_item_id ? "Ja" : "Nei",
            }))}
          />
          {!locked && (
            <Button size="sm" disabled={answered < REVIEW_CHECKPOINTS.length || completeMut.isPending} onClick={() => completeMut.mutate()}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Signer og fullfør
            </Button>
          )}
        </div>
      </div>

      {REVIEW_CHECKPOINTS.map((cp, i) => {
        const a = answers[cp.key];
        const snapVal = cp.snapshotKey ? snapshot[cp.snapshotKey] : undefined;
        return (
          <Card key={cp.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground font-normal">{i + 1}.</span> {cp.label}
                {snapVal !== undefined && (
                  <Badge variant="outline" className={cn("text-[10px]", Number(snapVal) > 0 && "bg-amber-50 text-amber-700 border-amber-200")}>
                    Systemet viser: {String(snapVal)}
                  </Badge>
                )}
                {a?.action_item_id && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Tiltak opprettet</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(["yes", "no", "na"] as ReviewAnswer[]).map((v) => (
                  <Button
                    key={v} size="sm" disabled={locked}
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
              {!locked && (
                <Textarea
                  rows={2}
                  placeholder="Kommentar (valgfritt)…"
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
    </div>
  );
}
