import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, CheckCircle2, ChevronRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const sb = supabase as any;

interface Row {
  id: string;
  title: string;
  description: string | null;
  version_id: string | null;
  version_number: number | null;
  requires_ack: boolean;
  chapters: number;
  mandatory: number;
  confirmed: boolean;
}

export default function HmsMyHandbookPage() {
  const { activeCompanyId: cid } = useCompanyContext();
  const { user } = useAuth();

  const { data = [], isLoading } = useQuery<Row[]>({
    queryKey: ["my-handbooks", cid, user?.id],
    enabled: !!cid,
    queryFn: async () => {
      const { data: hbs } = await sb
        .from("hms_handbooks")
        .select("id, title, description, current_version_id")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("title");
      const list = (hbs ?? []).filter((h: any) => h.current_version_id);
      const versionIds = list.map((h: any) => h.current_version_id);
      if (versionIds.length === 0) return [];

      const [{ data: vers }, { data: secs }, { data: acks }] = await Promise.all([
        sb.from("hms_handbook_versions").select("id, version_number, requires_acknowledgement").in("id", versionIds),
        sb.from("hms_handbook_sections").select("id, version_id, is_mandatory").in("version_id", versionIds),
        user?.id
          ? sb.from("hms_handbook_acknowledgements").select("version_id, section_id").in("version_id", versionIds).eq("user_id", user.id)
          : Promise.resolve({ data: [] }),
      ]);

      const vMap = new Map((vers ?? []).map((v: any) => [v.id, v]));
      return list.map((h: any) => {
        const v: any = vMap.get(h.current_version_id);
        const chapters = (secs ?? []).filter((s: any) => s.version_id === h.current_version_id);
        const myAcks = (acks ?? []).filter((a: any) => a.version_id === h.current_version_id);
        const mandatory = chapters.filter((c: any) => c.is_mandatory);
        const wholeAck = myAcks.some((a: any) => !a.section_id);
        const confirmed = wholeAck || (mandatory.length > 0 && mandatory.every((m: any) => myAcks.some((a: any) => a.section_id === m.id)));
        return {
          id: h.id,
          title: h.title,
          description: h.description,
          version_id: h.current_version_id,
          version_number: v?.version_number ?? null,
          requires_ack: !!v?.requires_acknowledgement,
          chapters: chapters.length,
          mandatory: mandatory.length,
          confirmed,
        };
      });
    },
  });

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> HMS
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Min HMS-håndbok</h1>
        <p className="text-sm text-muted-foreground">Les kapitlene og bekreft at du har forstått innholdet.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-2">
            <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <div className="font-medium text-foreground">Ingen håndbøker er publisert enda</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((h) => (
            <Link key={h.id} to={`/hms/handbok/${h.id}`} className="block">
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="py-4 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="font-medium">{h.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.chapters} kapitler{h.mandatory > 0 && ` · ${h.mandatory} obligatoriske`}
                      {h.version_number ? ` · utgave ${h.version_number}` : ""}
                    </div>
                    {h.requires_ack && (
                      h.confirmed ? (
                        <Badge className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> Bekreftet</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">Mangler bekreftelse</Badge>
                      )
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
