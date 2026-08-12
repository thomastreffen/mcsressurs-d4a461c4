/**
 * Opplastingsområde på «Nytt tilsyn»: last opp mottatt tilsynsrapport,
 * lagre den i storage og la AI foreslå saksopplysninger og funn.
 * Ingen modaler – alt skjer inline, og resultatet vises på en egen kontrollside.
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { ACCEPTED_REPORT_TYPES, saveReportDraft, type ReportAnalysis } from "@/lib/inspection-report";

const BUCKET = "job-attachments";

/** Leser strukturert feilrespons fra edge-funksjonen, også når HTTP-status er non-2xx. */
async function readFunctionError(error: unknown, data: any): Promise<{ title: string; detail: string }> {
  let payload: any = data && data.ok === false ? data : null;
  const ctx = (error as any)?.context;
  if (!payload && ctx && typeof ctx.json === "function") {
    payload = await ctx.json().catch(() => null);
  }
  const stage: string | undefined = payload?.stage;
  const code: string | undefined = payload?.error_code;
  const title =
    stage === "ai_request" || stage === "ai_response"
      ? payload?.message?.includes("bildeanalysen")
        ? "Kunne ikke lese PDF-en"
        : "Kunne ikke analysere rapporten"
      : stage === "storage_download"
        ? "Fant ikke rapporten"
        : stage === "auth"
          ? "Du må logge inn på nytt"
          : "Kunne ikke analysere rapporten";
  const base =
    payload?.message ??
    (error as any)?.message ??
    "PDF-en ble lastet opp, men dokumentanalysen feilet. Prøv igjen.";
  const ref = [code, payload?.requestId].filter(Boolean).join(" · ");
  return { title, detail: ref ? `${base} (feilkode: ${ref})` : base };
}

export function InspectionReportUpload() {
  const navigate = useNavigate();
  const { activeCompanyId } = useCompanyContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "upload" | "analyze">(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    if (!activeCompanyId) {
      toast.error("Mangler aktivt selskap");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Filen er for stor (maks 15 MB)");
      return;
    }
    try {
      setBusy("upload");
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `tilsyn/${activeCompanyId}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

      setBusy("analyze");
      const { data, error } = await supabase.functions.invoke("inspection-report-analyze", {
        body: { bucket: BUCKET, path, fileName: file.name, mime: file.type || "application/pdf" },
      });
      if (error || !data?.ok) {
        const { title, detail } = await readFunctionError(error, data);
        toast.error(title, { description: detail });
        setBusy(null);
        return;
      }

      saveReportDraft({
        analysis: data.analysis as ReportAnalysis,
        file: {
          bucket: BUCKET,
          path,
          name: file.name,
          size: file.size,
          mime: file.type || "application/octet-stream",
          publicUrl: pub?.publicUrl ?? null,
        },
        createdAt: new Date().toISOString(),
      });
      navigate("/compliance/tilsyn/ny/gjennomgang");
    } catch (e: any) {
      toast.error("Opplastingen feilet", {
        description: e?.message ?? "Prøv igjen, eller velg en annen fil.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Last opp tilsynsrapport</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Last opp rapporten, så forsøker systemet å fylle ut saken og identifisere funn og avvik automatisk.
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f && !busy) handleFile(f);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted"
          }`}
        >
          {busy ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm font-medium">
                {busy === "upload" ? "Laster opp rapporten…" : "Leser rapporten og identifiserer funn…"}
              </p>
              <p className="text-xs text-muted-foreground">Store rapporter kan ta et halvt minutt.</p>
            </>
          ) : (
            <>
              <FileUp className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm">Dra rapporten hit, eller velg fil</p>
              <p className="text-xs text-muted-foreground">PDF, Word, tekst, e-post eller bilde av rapporten</p>
              <Button size="sm" className="mt-2" onClick={() => inputRef.current?.click()}>
                Velg rapport
              </Button>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_REPORT_TYPES}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) handleFile(f);
            }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Rapporten lagres som originaldokument på saken. Ingenting opprettes før du har gått gjennom og godkjent forslaget.
        </p>
      </CardContent>
    </Card>
  );
}
