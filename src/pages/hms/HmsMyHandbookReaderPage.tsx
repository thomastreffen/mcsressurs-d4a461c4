import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CheckCircle2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { renderHandbookBody } from "@/lib/hms/handbookText";

const sb = supabase as any;
const CONFIRMATION_TEXT = "Jeg har lest og forstått.";

export default function HmsMyHandbookReaderPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { activeCompanyId: cid } = useCompanyContext();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-handbook", id, cid, user?.id],
    enabled: !!id && !!cid,
    queryFn: async () => {
      const { data: hb } = await sb
        .from("hms_handbooks")
        .select("id, title, description, current_version_id, company_id")
        .eq("id", id).eq("company_id", cid).is("deleted_at", null).maybeSingle();
      if (!hb?.current_version_id) return { handbook: hb, version: null, sections: [], acks: [] };
      const [{ data: ver }, { data: secs }, { data: acks }] = await Promise.all([
        sb.from("hms_handbook_versions").select("id, version_number, requires_acknowledgement, published_at").eq("id", hb.current_version_id).maybeSingle(),
        sb.from("hms_handbook_sections").select("id, heading, body, ordering, is_mandatory").eq("version_id", hb.current_version_id).order("ordering"),
        user?.id
          ? sb.from("hms_handbook_acknowledgements").select("id, section_id, acknowledged_at").eq("version_id", hb.current_version_id).eq("user_id", user.id)
          : Promise.resolve({ data: [] }),
      ]);
      return { handbook: hb, version: ver, sections: secs ?? [], acks: acks ?? [] };
    },
  });

  const sections = useMemo(() => data?.sections ?? [], [data]);
  useEffect(() => {
    if (sections.length && !openId) setOpenId(sections[0].id);
  }, [sections, openId]);

  const ackFor = (sectionId: string | null) =>
    (data?.acks ?? []).find((a: any) => (a.section_id ?? null) === sectionId);

  const ackMut = useMutation({
    mutationFn: async (sectionId: string | null) => {
      if (!data?.handbook || !data?.version || !user?.id) throw new Error("Mangler kontekst");
      const { error } = await sb.from("hms_handbook_acknowledgements").insert({
        handbook_id: data.handbook.id,
        version_id: data.version.id,
        company_id: data.handbook.company_id,
        user_id: user.id,
        section_id: sectionId,
        method: "system",
        confirmation_text: CONFIRMATION_TEXT,
        user_agent: navigator.userAgent.slice(0, 250),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Bekreftelse registrert" });
      qc.invalidateQueries({ queryKey: ["my-handbook", id] });
      qc.invalidateQueries({ queryKey: ["my-handbooks"] });
    },
    onError: (e: any) => toast({ title: "Kunne ikke bekrefte", description: String(e.message || e), variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="mx-auto max-w-2xl p-4 space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40" /></div>;
  }

  if (!data?.handbook || !data.version) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-2 text-sm text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <div className="font-medium text-foreground">Håndboken er ikke tilgjengelig enda</div>
            <Link to="/hms/handbok" className="text-primary text-xs underline">Tilbake</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const wholeAck = ackFor(null);
  const mandatory = sections.filter((s: any) => s.is_mandatory);
  const allMandatoryAcked = mandatory.length > 0 && mandatory.every((s: any) => ackFor(s.id));
  const done = !!wholeAck || allMandatoryAcked;

  return (
    <div className="min-h-screen bg-muted/20 pb-28">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-3">
        <div className="mx-auto max-w-2xl space-y-1">
          <Link to="/hms/handbok" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Min HMS-håndbok
          </Link>
          <h1 className="text-lg font-semibold leading-tight">{data.handbook.title}</h1>
          <p className="text-xs text-muted-foreground">
            Utgave {data.version.version_number}
            {data.version.published_at && ` · ${format(new Date(data.version.published_at), "d. MMM yyyy", { locale: nb })}`}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4 space-y-3">
        {sections.map((s: any) => {
          const open = openId === s.id;
          const ack = ackFor(s.id);
          return (
            <Card key={s.id} className="overflow-hidden">
              <button type="button" onClick={() => setOpenId(open ? null : s.id)} className="w-full text-left px-4 py-3 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-medium text-sm">{s.heading}</div>
                  <div className="flex items-center gap-1.5">
                    {s.is_mandatory && <Badge variant="outline" className="text-[10px]">Obligatorisk</Badge>}
                    {ack && <Badge className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> Bekreftet</Badge>}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{open ? "Skjul" : "Les"}</span>
              </button>
              {open && (
                <CardContent className="pt-0 pb-4 space-y-3">
                  <div className="text-sm leading-relaxed space-y-2">{renderHandbookBody(s.body)}</div>
                  {!ack && !wholeAck && (
                    <Button size="sm" variant="outline" className="w-full" onClick={() => ackMut.mutate(s.id)} disabled={ackMut.isPending}>
                      Jeg har lest og forstått dette kapittelet
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-background px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {done ? (
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-600 py-2">
              <CheckCircle2 className="h-4 w-4" /> Bekreftelse registrert
            </div>
          ) : (
            <Button className="w-full h-12 text-base" onClick={() => ackMut.mutate(null)} disabled={ackMut.isPending}>
              {ackMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Jeg har lest og forstått
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
