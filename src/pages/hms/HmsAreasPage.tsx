import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface AreaRow {
  area_key: string;
  label: string;
  description: string | null;
  category: string;
  legal_reference: string | null;
  sort_order: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  electrical: "Elektrofag",
  safety: "Sikkerhet",
  environment: "Miljø",
  hr: "HR",
  governance: "Styring",
};

const CATEGORY_ORDER = ["electrical", "safety", "environment", "hr", "governance"];

export default function HmsAreasPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["hms-area-catalog"],
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("hms_area_catalog")
        .select("area_key,label,description,category,legal_reference,sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as AreaRow[];
    },
  });

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: data.filter((a) => a.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <HmsMobileBack />
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
          <ShieldCheck className="h-3.5 w-3.5" />
          HMS &amp; HR
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Bransjeområder</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Tagger fra elektrobransjen brukes i håndbøker, SJA-maler, sjekklister og risikopunkter.
          Når du bygger nye maler kan systemet foreslå relevante områder ut fra arbeidstype,
          prosjekttype og byggets alder.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-60" />
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.cat} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABEL[g.cat] ?? g.cat}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {g.items.map((a) => (
                  <Card key={a.area_key} className="border-border/60">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm">{a.label}</CardTitle>
                        <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      </div>
                      <code className="text-[10px] text-muted-foreground font-mono">
                        {a.area_key}
                      </code>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {a.description && (
                        <p className="text-xs text-muted-foreground">{a.description}</p>
                      )}
                      {a.legal_reference && (
                        <Badge variant="outline" className="text-[10px]">
                          {a.legal_reference}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
