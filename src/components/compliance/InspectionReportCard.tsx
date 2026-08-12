/** Originalrapporten som ble mottatt fra tilsynsmyndighet/revisor. */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function InspectionReportCard({ inspectionId }: { inspectionId: string }) {
  const docs = useQuery({
    queryKey: ["inspection-report-docs", inspectionId],
    enabled: !!inspectionId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("documents")
        .select("id, file_name, public_url, file_path, storage_bucket, created_at")
        .eq("entity_type", "compliance_inspection")
        .eq("entity_id", inspectionId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!docs.data?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Originalrapport</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {docs.data.map((d: any) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="min-w-[160px] flex-1">{d.file_name}</span>
            <Button size="sm" variant="outline" asChild>
              <a
                href={d.public_url ?? supabase.storage.from(d.storage_bucket).getPublicUrl(d.file_path).data.publicUrl}
                target="_blank"
                rel="noreferrer"
              >
                Åpne <ExternalLink className="ml-1.5 h-3 w-3" />
              </a>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
