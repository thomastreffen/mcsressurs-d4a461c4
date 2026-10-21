import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Plus, FileText, Sparkles, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { seedMcsStandardTemplates } from "@/lib/hms/seedTemplates";

interface Template {
  id: string;
  kind: string;
  category: string;
  name: string;
  description: string | null;
  is_active: boolean;
  hms_areas: string[];
  suggested_work_types: string[];
  updated_at: string;
}

export default function HmsTemplatesPage() {
  const { activeCompanyId } = useCompanyContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [kind, setKind] = useState<"all" | "sja" | "checklist">("all");
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["hms-templates", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("hms_templates")
        .select("id, kind, category, name, description, is_active, hms_areas, suggested_work_types, updated_at")
        .eq("company_id", activeCompanyId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const filtered = useMemo(() => {
    return data.filter((t) => {
      if (kind !== "all" && t.kind !== kind) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, kind, search]);

  const createBlank = useMutation({
    mutationFn: async (newKind: "sja" | "checklist") => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("hms_templates")
        .insert({
          company_id: activeCompanyId,
          kind: newKind,
          name: newKind === "sja" ? "Ny SJA" : "Ny sjekkliste",
          category: "generell",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => navigate(`/hms/templates/${id}`),
    onError: (e: any) => toast.error(e.message),
  });

  const seedMcs = useMutation({
    mutationFn: () => seedMcsStandardTemplates(activeCompanyId!),
    onSuccess: (n) => {
      toast.success(`${n} MCS-standardmaler importert`);
      qc.invalidateQueries({ queryKey: ["hms-templates"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <HmsMobileBack />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ClipboardList className="h-3.5 w-3.5" /> HMS &amp; HR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">SJA &amp; sjekklister</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Maler tilpasset MCS Service: datacenter, næringsbygg, tavlemontasje, strømskinner og serviceoppdrag.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedMcs.mutate()}
            disabled={seedMcs.isPending || !activeCompanyId}
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            Importer MCS-standardmaler
          </Button>
          <Button size="sm" onClick={() => createBlank.mutate("sja")} disabled={createBlank.isPending}>
            <Plus className="h-4 w-4 mr-1.5" /> Ny SJA
          </Button>
          <Button size="sm" variant="secondary" onClick={() => createBlank.mutate("checklist")}>
            <Plus className="h-4 w-4 mr-1.5" /> Ny sjekkliste
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={kind} onValueChange={(v) => setKind(v as any)}>
          <TabsList>
            <TabsTrigger value="all">Alle</TabsTrigger>
            <TabsTrigger value="sja">SJA</TabsTrigger>
            <TabsTrigger value="checklist">Sjekklister</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk navn..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-3">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <div className="font-medium text-foreground">Ingen maler enda</div>
            <p className="max-w-sm mx-auto">
              Importer MCS-standardmaler for å komme raskt i gang, eller lag dine egne fra bunnen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((t) => (
            <Link key={t.id} to={`/hms/templates/${t.id}`}>
              <Card className="border-border/60 hover:border-primary/40 transition-colors h-full">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm">{t.name}</div>
                    <Badge variant={t.kind === "sja" ? "default" : "secondary"} className="text-[10px] uppercase">
                      {t.kind}
                    </Badge>
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {t.suggested_work_types?.slice(0, 4).map((w) => (
                      <Badge key={w} variant="outline" className="text-[10px]">{w}</Badge>
                    ))}
                    {t.hms_areas?.slice(0, 3).map((a) => (
                      <Badge key={a} variant="outline" className="text-[10px] bg-muted/40">{a}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
