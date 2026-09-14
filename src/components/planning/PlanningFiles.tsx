import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Trash2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { usePlanningMutations, planningFileUrl, type PlanningFile } from "@/hooks/usePlanning";
import { DEFAULT_FILE_CATEGORIES } from "@/lib/planning";

const NEW_CATEGORY = "__new__";

export function PlanningFiles({ projectId, files }: { projectId: string; files: PlanningFile[] }) {
  const { uploadFile, deleteFile } = usePlanningMutations(projectId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState(DEFAULT_FILE_CATEGORIES[0]);
  const [newCategory, setNewCategory] = useState("");

  const categories = useMemo(() => {
    const used = files.map((f) => f.category);
    return [...new Set([...DEFAULT_FILE_CATEGORIES, ...used])];
  }, [files]);

  const grouped = useMemo(() => {
    const map: Record<string, PlanningFile[]> = {};
    for (const f of files) (map[f.category] ??= []).push(f);
    return map;
  }, [files]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setPending(f);
    setDisplayName(f.name.replace(/\.[^.]+$/, ""));
  };

  const upload = async () => {
    if (!pending) return;
    const cat = category === NEW_CATEGORY ? newCategory.trim() : category;
    if (!cat) {
      toast.error("Skriv inn et kategorinavn");
      return;
    }
    try {
      await uploadFile.mutateAsync({ file: pending, category: cat, displayName: displayName.trim() });
      toast.success("Filen er lastet opp");
      setPending(null);
      setNewCategory("");
      setCategory(cat);
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke laste opp filen");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Filer</h2>
          <p className="text-sm text-muted-foreground">
            Velg kategori og gi filen et visningsnavn – originalfilnavnet beholdes.
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4" /> Last opp fil
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>

      {files.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Ingen filer ennå.</Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{cat}</h3>
                <Badge variant="secondary">{list.length}</Badge>
              </div>
              {list.map((f) => (
                <Card key={f.id} className="flex items-center gap-3 p-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={planningFileUrl(f.storage_path)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium hover:underline"
                    >
                      {f.display_name}
                    </a>
                    <p className="truncate text-xs text-muted-foreground">
                      {f.original_file_name} · {f.uploaded_by_name ?? "Ukjent"} ·{" "}
                      {format(new Date(f.created_at), "d. MMM yyyy HH:mm", { locale: nb })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { if (confirm("Slette filen?")) deleteFile.mutate(f); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Last opp fil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Originalfil: {pending?.name}</p>
            <div className="space-y-1.5">
              <Label>Visningsnavn</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="F.eks. Tavlerom før ombygging"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  <SelectItem value={NEW_CATEGORY}>Ny kategori …</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {category === NEW_CATEGORY && (
              <div className="space-y-1.5">
                <Label>Navn på ny kategori</Label>
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="F.eks. Bilder av site"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>Avbryt</Button>
            <Button onClick={upload} disabled={uploadFile.isPending}>
              {uploadFile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Last opp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
