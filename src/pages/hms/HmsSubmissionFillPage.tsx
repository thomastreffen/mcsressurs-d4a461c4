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

  const [sectionIdx, setSectionIdx] = useState(0);
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
  const currentSection = sections[sectionIdx];
  const isLast = sectionIdx === sections.length - 1;
  const isFirst = sectionIdx === 0;
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

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="px-4 py-3 max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <Button asChild variant="ghost" size="sm" className="h-8 px-2">
              <Link to="/hms/mobile"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{snapshot.kind === "sja" ? "SJA" : "Sjekkliste"}</div>
              <div className="text-sm font-semibold truncate">{submission.title || snapshot.name}</div>
            </div>
            {readOnly && <Badge variant="outline" className="text-[10px]">Lest-modus</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Progress value={sectionProgress} className="h-1.5 flex-1" />
            <div className="text-[11px] text-muted-foreground tabular-nums">{sectionProgress}%</div>
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
            <span>Seksjon {sectionIdx + 1} av {sections.length}</span>
            <span className="font-medium">{currentSection.title}</span>
          </div>
        </div>
      </header>

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-3">
        {currentSection.description && (
          <p className="text-xs text-muted-foreground">{currentSection.description}</p>
        )}

        {currentSection.items.map((item) => (
          <Card key={item.id} className="border-border/60">
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <Label className="text-sm font-medium leading-tight">
                  {item.label}
                  {item.is_required && <span className="text-destructive ml-1">*</span>}
                </Label>
              </div>
              {item.help_text && <p className="text-[11px] text-muted-foreground">{item.help_text}</p>}

              <ItemInput
                item={item}
                value={answers[item.id]}
                onChange={(v) => setAnswers((a) => ({ ...a, [item.id]: v }))}
                disabled={!!readOnly}
              />

              {/* Photos */}
              <div className="flex flex-wrap gap-2 mt-2">
                {(photos[item.id] ?? []).map((path, idx) => (
                  <div key={path} className="relative h-16 w-16 rounded-md border border-border/60 overflow-hidden bg-muted/40 grid place-items-center">
                    <Camera className="h-4 w-4 text-muted-foreground" />
                    {!readOnly && (
                      <button
                        onClick={() => removePhoto(item.id, idx)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground grid place-items-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <label className="h-16 w-16 rounded-md border border-dashed border-border/60 grid place-items-center text-muted-foreground hover:border-primary/40 cursor-pointer">
                    <Camera className="h-4 w-4" />
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
            </CardContent>
          </Card>
        ))}

        {isLast && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Users className="h-4 w-4" /> Deltakere ({(participants ?? []).length})
              </div>
              <div className="space-y-1.5">
                {(participants ?? []).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-xs p-2 rounded-md bg-background border border-border/60">
                    <div>
                      <div className="font-medium">{p.display_name}</div>
                      {p.role && <div className="text-[10px] text-muted-foreground">{p.role}</div>}
                    </div>
                    {p.signed_at ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        Signert
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Mangler signatur</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border/60 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isFirst}
            onClick={() => setSectionIdx((i) => Math.max(0, i - 1))}
            className="flex-1"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Tilbake
          </Button>
          {!isLast ? (
            <Button size="sm" onClick={() => setSectionIdx((i) => Math.min(sections.length - 1, i + 1))} className="flex-1">
              Neste <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : readOnly ? (
            <Button size="sm" disabled className="flex-1">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Innsendt
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setSignOpen(true)}
              disabled={requiredMissing.length > 0}
              className="flex-1"
            >
              <ShieldCheck className="h-4 w-4 mr-1" /> Signer & send inn
            </Button>
          )}
        </div>
        {requiredMissing.length > 0 && (
          <div className="max-w-2xl mx-auto mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-600">
            <AlertCircle className="h-3 w-3" /> {requiredMissing.length} påkrevd(e) felt mangler
          </div>
        )}
      </div>

      {/* Sign dialog */}
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Signer og send inn</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{CONFIRMATION_TEXT}</p>
            <div className="rounded-md bg-muted/40 p-3 space-y-1 text-xs">
              <div><span className="text-muted-foreground">Signert av:</span> <strong>{user?.name || user?.email}</strong></div>
              <div><span className="text-muted-foreground">Bruker-ID:</span> <code className="text-[10px]">{user?.id}</code></div>
              <div><span className="text-muted-foreground">Tidspunkt:</span> {new Date().toLocaleString("nb-NO")}</div>
              <div><span className="text-muted-foreground">Mal-versjon:</span> v{snapshot.template_version}</div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="use-drawn" checked={useDrawn} onCheckedChange={(c) => setUseDrawn(!!c)} />
              <Label htmlFor="use-drawn" className="text-xs cursor-pointer">Legg til tegnet signatur</Label>
            </div>
            {useDrawn && (
              <SignatureCanvas value={drawn} onChange={setDrawn} label="Tegn signatur" />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(false)}>Avbryt</Button>
            <Button onClick={handleSign}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Bekreft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemInput({ item, value, onChange, disabled }: { item: any; value: any; onChange: (v: any) => void; disabled: boolean }) {
  const t = item.item_type;
  if (t === "yes_no_na" || t === "yes_no") {
    return (
      <RadioGroup
        disabled={disabled}
        value={value ?? ""}
        onValueChange={onChange}
        className="grid grid-cols-3 gap-2"
      >
        {[
          { v: "yes", l: "Ja" },
          { v: "no", l: "Nei" },
          { v: "na", l: "N/A" },
        ].map((o) => (
          <Label
            key={o.v}
            className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 text-sm cursor-pointer min-h-[44px] ${
              value === o.v ? "border-primary bg-primary/5 text-primary font-medium" : "border-border/60"
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
    return <Input disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (t === "long_text" || t === "mitigation") {
    return <Textarea disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} />;
  }
  if (t === "due_date") {
    return <Input type="date" disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (t === "risk") {
    return (
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`h-11 rounded-md border text-sm font-medium ${
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
    return <div className="text-[11px] text-muted-foreground italic">Bruk kamera-knapp under for å legge til.</div>;
  }
  return <Input disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}
