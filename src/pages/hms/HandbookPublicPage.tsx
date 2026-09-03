import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { renderHandbookBody } from "@/lib/hms/handbookText";

const CONFIRMATION_TEXT = "Jeg har lest og forstått.";

interface PublicSection {
  id: string;
  heading: string;
  body: string | null;
  is_mandatory: boolean;
  acknowledged_at: string | null;
}

interface PublicPayload {
  error?: string;
  recipient?: { id: string; full_name: string | null; channel: string; acknowledged_at: string | null; expires_at: string };
  handbook?: { id: string; title: string; description: string | null };
  version?: { id: string; version_number: number; requires_acknowledgement: boolean; published_at: string | null };
  sections?: PublicSection[];
}

export default function HandbookPublicPage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["handbook-public", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hms_handbook_open_by_token", { p_token: token });
      if (error) throw error;
      return data as PublicPayload;
    },
  });

  const sections = useMemo(() => data?.sections ?? [], [data]);

  useEffect(() => {
    if (sections.length && !openId) setOpenId(sections[0].id);
  }, [sections, openId]);

  const ackMut = useMutation({
    mutationFn: async (sectionId: string | null) => {
      const { data: res, error } = await (supabase as any).rpc("hms_handbook_ack_by_token", {
        p_token: token,
        p_section_id: sectionId,
        p_user_agent: navigator.userAgent.slice(0, 250),
        p_confirmation_text: CONFIRMATION_TEXT,
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
    },
    onSuccess: () => {
      toast({ title: "Takk – bekreftelsen er registrert" });
      qc.invalidateQueries({ queryKey: ["handbook-public", token] });
    },
    onError: (e: any) => toast({ title: "Kunne ikke bekrefte", description: String(e.message || e), variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl p-4 space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-2 text-sm text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <div className="font-medium text-foreground">
              {data?.error === "expired" ? "Lenken er utløpt" : "Lenken er ikke gyldig"}
            </div>
            <p>Ta kontakt med HMS-ansvarlig for å få tilsendt ny lenke.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allAcked = sections.length > 0 && sections.every((s) => !!s.acknowledged_at);
  const wholeAcked = !!data.recipient?.acknowledged_at;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-3">
        <div className="mx-auto max-w-2xl space-y-0.5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> HMS-informasjon
          </div>
          <h1 className="text-lg font-semibold leading-tight">{data.handbook?.title}</h1>
          <p className="text-xs text-muted-foreground">
            Utgave {data.version?.version_number}
            {data.version?.published_at && ` · ${format(new Date(data.version.published_at), "d. MMM yyyy", { locale: nb })}`}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4 space-y-3 pb-32">
        {data.recipient?.full_name && (
          <p className="text-sm text-muted-foreground">Hei {data.recipient.full_name}, les gjennom og bekreft nederst.</p>
        )}

        {sections.map((s) => {
          const open = openId === s.id;
          return (
            <Card key={s.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : s.id)}
                className="w-full text-left px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="font-medium text-sm">{s.heading}</div>
                  <div className="flex items-center gap-1.5">
                    {s.is_mandatory && <Badge variant="outline" className="text-[10px]">Obligatorisk</Badge>}
                    {s.acknowledged_at && (
                      <Badge className="text-[10px] gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Bekreftet
                      </Badge>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{open ? "Skjul" : "Les"}</span>
              </button>
              {open && (
                <CardContent className="pt-0 pb-4 space-y-3">
                  <div className="prose prose-sm max-w-none text-sm leading-relaxed">
                    {renderHandbookBody(s.body)}
                  </div>
                  {!s.acknowledged_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => ackMut.mutate(s.id)}
                      disabled={ackMut.isPending}
                    >
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
          {wholeAcked || allAcked ? (
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 font-medium py-2">
              <CheckCircle2 className="h-4 w-4" /> Bekreftelse registrert – takk!
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
