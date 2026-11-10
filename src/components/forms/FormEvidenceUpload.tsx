import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  instanceId: string;
  /** Path below the instance folder, e.g. `fieldId` or `fieldId/itemIndex`. */
  path: string;
  locked: boolean;
  kind?: "photo" | "file";
  compact?: boolean;
  onCountChange: (path: string, count: number) => void;
}

interface StoredFile { name: string; url: string | null }

const BUCKET = "form-evidence";

/** Uploads evidence to the private bucket; completion is verified server-side against stored files. */
export function FormEvidenceUpload({ instanceId, path, locked, kind = "photo", compact, onCountChange }: Props) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folder = `${instanceId}/${path}`;

  const load = useCallback(async () => {
    const storage = supabase.storage.from(BUCKET);
    const { data, error } = await storage.list(folder, { limit: 50 });
    if (error) { setLoadError(true); return; }
    setLoadError(false);
    const items = (data || []).filter((f) => f.name && !f.name.startsWith("."));
    const withUrls = await Promise.all(items.map(async (f) => {
      const { data: s } = await storage.createSignedUrl(`${folder}/${f.name}`, 600);
      return { name: f.name, url: s?.signedUrl ?? null };
    }));
    setFiles(withUrls);
    onCountChange(path, withUrls.length);
  }, [folder, path, onCountChange]);

  useEffect(() => { void load(); }, [load]);

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const ext = (file.name.split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8);
        const { error } = await supabase.storage.from(BUCKET).upload(`${folder}/${crypto.randomUUID()}.${ext}`, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (error) { toast.error("Kunne ikke laste opp", { description: error.message }); break; }
      }
    } finally {
      await load();
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (name: string) => {
    setBusy(true);
    const { error } = await supabase.storage.from(BUCKET).remove([`${folder}/${name}`]);
    if (error) toast.error("Kunne ikke fjerne filen", { description: error.message });
    await load();
    setBusy(false);
  };

  const Icon = kind === "photo" ? Camera : Paperclip;

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f) => (
            <div key={f.name} className="relative h-14 w-14 overflow-hidden rounded-md border border-border bg-muted">
              {f.url && kind === "photo" ? (
                <img src={f.url} alt="Dokumentasjon" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="flex h-full w-full items-center justify-center">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                </a>
              )}
              {!locked && (
                <button
                  type="button"
                  aria-label="Fjern fil"
                  disabled={busy}
                  onClick={() => remove(f.name)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {loadError && <p className="text-[10px] text-destructive">Kunne ikke hente vedlegg</p>}
      {!locked && (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={kind === "photo" ? "image/*" : undefined}
            capture={kind === "photo" ? "environment" : undefined}
            multiple
            onChange={(e) => upload(e.target.files)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={compact
              ? "inline-flex min-h-[32px] items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              : "inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-muted/10 text-xs text-muted-foreground"}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            {kind === "photo" ? "Bilde" : "Fil"} {files.length > 0 ? `(${files.length})` : ""}
          </button>
        </>
      )}
    </div>
  );
}
