import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Save, CheckCircle2, AlertCircle, Camera, X, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SignatureCanvas } from "@/components/project/SignatureCanvas";
import { upsertAnswer, signSubmission, submitForReview, type TemplateSnapshot } from "@/lib/hms/submissions";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";

const CONFIRMATION_TEXT = "Jeg bekrefter at opplysningene er gjennomgått og at nødvendige risikoreduserende tiltak er vurdert.";

export default function HmsSubmissionFillPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [stepIdx, setStepIdx] = useState(0);
  const [mediaOpen, setMediaOpen] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [signOpen, setSignOpen] = useState(false);
  const [drawn, setDrawn] = useState<string>("");
  const [useDrawn, setUseDrawn] = useState(false);

  const { data: submission, isLoading } = useQuery({
    queryKey: ["hms-fill", id],
    enabled: !!id,
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("hms_submissions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: existingAnswers } = useQuery({
    queryKey: ["hms-fill-answers", id],
    enabled: !!id,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("hms_submission_answers")
        .select("item_id, item_key, value, photos")
        .eq("submission_id", id);
      return data ?? [];
    },
  });

  const { data: participants } = useQuery({
    queryKey: ["hms-fill-participants", id],
    enabled: !!id,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("hms_submission_participants")
        .select("id, user_id, display_name, role, signed_at")
        .eq("submission_id", id);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (existingAnswers) {
      const a: Record<string, any> = {};
      const p: Record<string, string[]> = {};
      for (const row of existingAnswers as any[]) {
        if (row.item_id) {
          a[row.item_id] = row.value;
          if (row.photos) p[row.item_id] = row.photos;
        }
      }
      setAnswers(a);
      setPhotos(p);
    }
  }, [existingAnswers]);

  const snapshot = submission?.template_snapshot as TemplateSnapshot | undefined;
  const sections = snapshot?.sections ?? [];
  // Ett punkt per steg; seksjonstittel vises som kontekst (f.eks. Farer / Tiltak i SJA).
  const steps = useMemo(
    () => sections.flatMap((sec) => sec.items.map((item) => ({ item, sectionTitle: sections.length > 1 ? sec.title : "" }))),
    [sections],
  );
  const readOnly = submission?.status && submission.status !== "draft";

  const debouncedAnswers = useDebounce(answers, 800);
  useEffect(() => {
    // auto-save changed answers
    if (!id || readOnly) return;
    const itemsById = new Map<string, any>();
    for (const sec of sections) for (const item of sec.items) itemsById.set(item.id, item);
    const tasks = Object.entries(debouncedAnswers).map(async ([itemId, value]) => {
      const item = itemsById.get(itemId);
      if (!item) return;
      try {
        await upsertAnswer({
          submissionId: id,
          itemId,
          itemKey: item.label?.slice(0, 60) ?? itemId,
          value,
          photos: photos[itemId] ?? null,
        });
      } catch (e) { /* swallow */ }
    });
    Promise.all(tasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedAnswers]);

  const requiredMissing = useMemo(() => {
    const missing: { sectionIdx: number; itemId: string; label: string }[] = [];
    sections.forEach((sec, i) => {
      sec.items.forEach((item) => {
        if (!item.is_required) return;
        const v = answers[item.id];
        if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
          missing.push({ sectionIdx: i, itemId: item.id, label: item.label });
        }
      });
    });
    return missing;
  }, [answers, sections]);

  const sectionProgress = useMemo(() => {
    if (!sections.length) return 0;
    const total = sections.reduce((acc, s) => acc + s.items.filter((i) => i.is_required).length, 0);
    if (!total) return 100;
    const filled = sections.reduce(
      (acc, s) =>
        acc +
        s.items.filter((i) => i.is_required && answers[i.id] !== undefined && answers[i.id] !== null && answers[i.id] !== "").length,
      0
    );
    return Math.round((filled / total) * 100);
  }, [answers, sections]);

  if (isLoading || !submission) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Laster…</div>;
  }

  if (!snapshot || sections.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground space-y-3">
        Mal-snapshot mangler.
        <div><Button asChild variant="outline" size="sm"><Link to="/hms/mobile">Tilbake</Link></Button></div>
      </div>
    );
  }

  async function handlePhotoUpload(itemId: string, file: File) {
    if (!id || !user) return;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `submissions/${id}/${itemId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("hms-attachments").upload(path, file, { upsert: false });
    if (error) {
      toast({ title: "Opplasting feilet", description: error.message, variant: "destructive" });
      return;
    }
    setPhotos((p) => ({ ...p, [itemId]: [...(p[itemId] ?? []), path] }));
    // Persist immediately
    const itemsById = new Map<string, any>();
    for (const sec of sections) for (const item of sec.items) itemsById.set(item.id, item);
    const item = itemsById.get(itemId);
    await upsertAnswer({
      submissionId: id,
      itemId,
      itemKey: item?.label?.slice(0, 60) ?? itemId,
      value: answers[itemId] ?? null,
      photos: [...(photos[itemId] ?? []), path],
    });
  }

  function removePhoto(itemId: string, idx: number) {
    setPhotos((p) => ({ ...p, [itemId]: (p[itemId] ?? []).filter((_, i) => i !== idx) }));
  }

  async function handleSign() {
    if (!id || !user) return;
    if (requiredMissing.length > 0) {
      toast({ title: "Mangler påkrevde felt", description: `${requiredMissing.length} punkt(er) gjenstår.`, variant: "destructive" });
      return;
    }
    try {
      const myParticipant = (participants as any[] | undefined)?.find((p) => p.user_id === user.id);
      await signSubmission({
        submissionId: id,
        userId: user.id,
        userName: user.name || user.email,
        templateVersion: submission.template_version ?? snapshot!.template_version ?? 1,
        participantId: myParticipant?.id ?? null,
        signatureType: useDrawn && drawn ? "drawn_signature" : "internal_confirm",
        signatureData: useDrawn ? drawn : null,
      });
      await submitForReview(id);
      toast({ title: "Innsendt", description: "SJA/sjekkliste er signert og sendt inn." });
      qc.invalidateQueries({ queryKey: ["hms-fill"] });
      qc.invalidateQueries({ queryKey: ["hms-mobile-mine"] });
      navigate("/hms/mobile");
    } catch (e: any) {
      toast({ title: "Signering feilet", description: e?.message ?? "Ukjent feil", variant: "destructive" });
    }
  }

  const missingIds = new Set(requiredMissing.map((m) => m.itemId));
  const isSummary = stepIdx >= steps.length;
  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const item = step?.item;
  const answeredCount = steps.filter((s) => isAnswered(answers[s.item.id])).length;
  const showMedia = !!item && (mediaOpen[item.id] || answers[item.id] === "no" || (photos[item.id] ?? []).length > 0 || item.item_type === "attachment" || item.item_type === "signature");
  const goTo = (i: number) => { setStepIdx(Math.max(0, Math.min(steps.length, i))); window.scrollTo({ top: 0 }); };

  return (
    <div className="min-h-dvh bg-background pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 py-2">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Lukk">
              <Link to="/hms/mobile"><X className="h-5 w-5" /></Link>
            </Button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">{submission.title || snapshot.name}</div>
              <div className="text-sm text-muted-foreground tabular-nums">
                {isSummary ? "Klar til å fullføre" : `${stepIdx + 1} av ${steps.length}`}
                {readOnly ? " · Innsendt" : ""}
              </div>
            </div>
          </div>
          <Progress value={steps.length ? (answeredCount / steps.length) * 100 : 0} className="mt-2 h-1.5" />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6">
        {!isSummary && item ? (
          <div className="space-y-5">
            {step.sectionTitle && (
              <div className="text-sm font-medium uppercase tracking-wide text-primary">{step.sectionTitle}</div>
            )}
            <h2 className="text-xl font-semibold leading-snug">
              {item.label}
              {item.is_required && <span className="ml-1 text-destructive">*</span>}
            </h2>
            {item.help_text && <p className="text-base text-muted-foreground">{item.help_text}</p>}

            <ItemInput
              item={item}
              value={answers[item.id]}
              onChange={(v) => setAnswers((a) => ({ ...a, [item.id]: v }))}
              disabled={!!readOnly}
            />

            {answers[item.id] === "no" && (
              <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-base">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                Dokumenter gjerne med bilde. Ved fare: stopp arbeidet og meld avvik.
              </p>
            )}

            {showMedia ? (
              <div className="flex flex-wrap gap-3">
                {(photos[item.id] ?? []).map((path, idx) => (
                  <div key={path} className="relative grid h-20 w-20 place-items-center rounded-xl border bg-muted/40">
                    <Camera className="h-5 w-5 text-muted-foreground" />
                    {!readOnly && (
                      <button
                        type="button"
                        aria-label="Fjern bilde"
                        onClick={() => removePhoto(item.id, idx)}
                        className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <label className="flex h-20 min-w-[5rem] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-base text-muted-foreground">
                    <Camera className="h-5 w-5" /> Ta bilde
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePhotoUpload(item.id, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            ) : !readOnly && (
              <button
                type="button"
                onClick={() => setMediaOpen((m) => ({ ...m, [item.id]: true }))}
                className="flex min-h-[44px] items-center gap-2 text-base text-muted-foreground"
              >
                <Camera className="h-5 w-5" /> Legg til bilde
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold">{readOnly ? "Innsendt" : "Fullfør"}</h2>
            {requiredMissing.length > 0 ? (
              <div className="space-y-2">
                <p className="text-base text-muted-foreground">Disse punktene må besvares først:</p>
                {requiredMissing.map((m) => (
                  <button
                    key={m.itemId}
                    type="button"
                    onClick={() => goTo(steps.findIndex((s) => s.item.id === m.itemId))}
                    className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-left text-base"
                  >
                    <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                    <span className="flex-1">{m.label}</span>
                    <ArrowRight className="h-5 w-5" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-primary" /> Alle påkrevde punkter er besvart.
              </p>
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-base font-medium">
                <Users className="h-5 w-5" /> Deltakere ({(participants ?? []).length})
              </div>
              {(participants ?? []).map((p: any) => (
                <div key={p.id} className="flex min-h-[52px] items-center justify-between rounded-xl border p-3">
                  <div>
                    <div className="text-base font-medium">{p.display_name}</div>
                    {p.role && <div className="text-sm text-muted-foreground">{p.role}</div>}
                  </div>
                  <span className={`text-sm font-medium ${p.signed_at ? "text-primary" : "text-muted-foreground"}`}>
                    {p.signed_at ? "Signert" : "Ikke signert"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Button
            variant="outline"
            disabled={stepIdx === 0}
            onClick={() => goTo(stepIdx - 1)}
            className="h-14 w-24 shrink-0 text-base"
          >
            <ArrowLeft className="mr-1 h-5 w-5" /> Tilbake
          </Button>
          {!isSummary ? (
            <Button onClick={() => goTo(stepIdx + 1)} className="h-14 flex-1 text-lg">
              {stepIdx === steps.length - 1 ? "Gå til fullfør" : "Neste"} <ArrowRight className="ml-1 h-5 w-5" />
            </Button>
          ) : readOnly ? (
            <Button disabled className="h-14 flex-1 text-lg"><CheckCircle2 className="mr-1 h-5 w-5" /> Innsendt</Button>
          ) : (
            <Button onClick={() => setSignOpen(true)} disabled={requiredMissing.length > 0} className="h-14 flex-1 text-lg">
              <ShieldCheck className="mr-1 h-5 w-5" /> Fullfør
            </Button>
          )}
        </div>
      </div>

      {/* Sign dialog (kort bekreftelse) */}
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Signer og send inn</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-base">
            <p className="text-muted-foreground">{CONFIRMATION_TEXT}</p>
            <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
              <div><span className="text-muted-foreground">Signert av:</span> <strong>{user?.name || user?.email}</strong></div>
              <div><span className="text-muted-foreground">Tidspunkt:</span> {new Date().toLocaleString("nb-NO")}</div>
              <div><span className="text-muted-foreground">Mal-versjon:</span> v{snapshot.template_version}</div>
            </div>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
              <Checkbox id="use-drawn" checked={useDrawn} onCheckedChange={(c) => setUseDrawn(!!c)} className="h-5 w-5" />
              <span className="text-base">Legg til tegnet signatur</span>
            </label>
            {useDrawn && <SignatureCanvas value={drawn} onChange={setDrawn} label="Tegn signatur" />}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-12" onClick={() => setSignOpen(false)}>Avbryt</Button>
            <Button className="h-12" onClick={handleSign}><CheckCircle2 className="mr-1 h-5 w-5" /> Bekreft og send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function isAnswered(v: any) {
  return !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));
}

function ItemInput({ item, value, onChange, disabled }: { item: any; value: any; onChange: (v: any) => void; disabled: boolean }) {
  const t = item.item_type;
  if (t === "yes_no_na" || t === "yes_no") {
    return (
      <RadioGroup
        disabled={disabled}
        value={value ?? ""}
        onValueChange={onChange}
        className="grid gap-3"
      >
        {[
          { v: "yes", l: "Ja" },
          { v: "no", l: "Nei" },
          ...(t === "yes_no_na" ? [{ v: "na", l: "Ikke relevant" }] : []),
        ].map((o) => (
          <Label
            key={o.v}
            className={`flex min-h-[64px] cursor-pointer items-center justify-center rounded-2xl border-2 px-4 text-lg font-semibold ${
              value === o.v
                ? o.v === "no" ? "border-destructive bg-destructive/10 text-destructive" : "border-primary bg-primary/10 text-primary"
                : "border-border"
            }`}
          >
            <RadioGroupItem value={o.v} className="sr-only" />
            {o.l}
          </Label>
        ))}
      </RadioGroup>
    );
  }
  if (t === "text" || t === "responsible") {
    return <Input className="h-14 text-base" disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (t === "long_text" || t === "mitigation") {
    return <Textarea disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={5} className="text-base" />;
  }
  if (t === "due_date") {
    return <Input type="date" className="h-14 text-base" disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (t === "risk") {
    return (
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`h-16 rounded-xl border-2 text-lg font-semibold ${
              value === n
                ? n >= 4 ? "border-destructive bg-destructive/10 text-destructive" : n >= 3 ? "border-amber-500 bg-amber-50 text-amber-700" : "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-border/60 text-muted-foreground"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }
  if (t === "attachment" || t === "signature") {
    return <div className="text-base text-muted-foreground">Bruk «Ta bilde» under.</div>;
  }
  return <Input className="h-14 text-base" disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}
