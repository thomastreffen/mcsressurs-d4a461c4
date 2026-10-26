import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, MapPin, User, Phone, Mail, Calendar, Tag,
  Paperclip, FileText, ExternalLink, KeyRound, Download,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { buildOperationalJobBrief } from "../../../supabase/functions/_shared/job-brief";

interface OrderBriefingSectionProps {
  /** Event/oppgave id — vi finner koblet bestilling automatisk */
  eventId: string;
  /** Vis som kompakt kort (skjul "Åpne bestilling"-knapp) */
  compact?: boolean;
}

interface BriefingData {
  event: Record<string, unknown>;
  submission: any;
  values: Array<{ field_key: string; value: unknown }>;
  attachments: Array<{
    id: string;
    file_name: string;
    file_path: string;
    mime_type: string | null;
    file_size: number | null;
  }>;
  latestCustomerMessage: { body: string | null; created_at: string } | null;
}

function formatBytes(b?: number | null): string {
  if (!b || b <= 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function OrderBriefingSection({ eventId, compact = false }: OrderBriefingSectionProps) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery<BriefingData | null>({
    queryKey: ["order-briefing", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      // Strategy: order can be linked to event in two ways:
      // 1. events.source_order_form_id  (created from order)
      // 2. order_form_submissions.linked_event_id  (manually linked)
      const { data: ev } = await supabase
        .from("events")
        .select("source_order_form_id, title, job_number, internal_number, location_details, address, postal_code, city, customer, site_contact_name, site_contact_phone, description, access_notes")
        .eq("id", eventId)
        .maybeSingle();

      let submissionId: string | null = (ev as any)?.source_order_form_id || null;

      if (!submissionId) {
        const { data: linked } = await supabase
          .from("order_form_submissions")
          .select("id")
          .eq("linked_event_id", eventId)
          .is("deleted_at", null)
          .order("last_activity_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        submissionId = (linked as any)?.id || null;
      }

      if (!submissionId) return null;

      const subRes: any = await supabase
        .from("order_form_submissions")
        .select(
          "id, submission_no, status, priority, summary, submitter_name, submitter_email, notification_recipient_name, notification_recipient_email, notification_recipient_phone"
        )
        .eq("id", submissionId)
        .maybeSingle();
      const valRes: any = await supabase
        .from("order_form_submission_values")
        .select("field_key, value")
        .eq("submission_id", submissionId);
      const attRes: any = await supabase
        .from("order_form_submission_attachments")
        .select("id, file_name, file_path, mime_type, file_size")
        .eq("submission_id", submissionId)
        .order("uploaded_at", { ascending: true });
      const msgRes: any = await (supabase as any)
        .from("order_form_messages")
        .select("body, created_at, direction")
        .eq("submission_id", submissionId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const submission = subRes.data;
      const values = valRes.data;
      const attachments = attRes.data;
      const msg = msgRes.data;

      return {
        event: (ev ?? {}) as Record<string, unknown>,
        submission,
        values: (values || []) as any,
        attachments: (attachments || []) as any,
        latestCustomerMessage: msg ? { body: (msg as any).body, created_at: (msg as any).created_at } : null,
      };
    },
  });

  // Same operational brief as the technician email (event wins, order fills gaps, no invoice/PO).
  const briefing = useMemo(() => {
    if (!data?.submission) return null;
    return buildOperationalJobBrief({
      event: data.event,
      orderSummary: (data.submission.summary as Record<string, unknown> | null) ?? {},
      orderValues: data.values,
    });
  }, [data]);

  if (isLoading || !data?.submission || !briefing) return null;

  const sub = data.submission as any;

  const handleOpenAttachment = async (path: string) => {
    const { data: signed } = await supabase.storage
      .from("order-form-attachments")
      .createSignedUrl(path, 60 * 10);
    if (signed?.signedUrl) {
      window.open(signed.signedUrl, "_blank");
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          Jobbinfo fra bestilling
          <Badge variant="outline" className="text-[10px] h-4 font-mono">
            {sub.submission_no}
          </Badge>
        </CardTitle>
        {!compact && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate(`/orders/${sub.id}`)}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Åpne bestilling
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {briefing.siteName && <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Oppdragssted" value={briefing.siteName} />}
        {briefing.address && (
          <InfoRow
            icon={<MapPin className="h-3.5 w-3.5" />}
            label="Adresse"
            value={<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(briefing.address)}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{briefing.address}</a>}
          />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {briefing.customer && <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Kunde" value={briefing.customer} />}
          {briefing.contactName && <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Kontaktperson" value={briefing.contactName} />}
          {briefing.contactPhone && (
            <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefon"
              value={<a href={`tel:${briefing.contactPhone.replace(/\s/g, "")}`} className="text-primary hover:underline">{briefing.contactPhone}</a>} />
          )}
          {briefing.contactEmail && (
            <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="E-post"
              value={<a href={`mailto:${briefing.contactEmail}`} className="text-primary hover:underline">{briefing.contactEmail}</a>} />
          )}
        </div>
        {briefing.workDescription && (
          <BriefBlock icon={<FileText className="h-3 w-3" />} label="Arbeidsbeskrivelse" text={briefing.workDescription} />
        )}
        {(briefing.materialResponsibility || briefing.serviceMustProcure || briefing.practicalInfo) && (
          <div className="space-y-2 pt-1 border-t border-border/50">
            {briefing.materialResponsibility && <BriefBlock label="Hvem skaffer materiell?" text={briefing.materialResponsibility} />}
            {briefing.serviceMustProcure && <BriefBlock label="Hva må MCS Service skaffe?" text={briefing.serviceMustProcure} />}
            {briefing.practicalInfo && <BriefBlock icon={<KeyRound className="h-3 w-3" />} label="Praktisk info / adgang" text={briefing.practicalInfo} />}
          </div>
        )}

        {data.attachments.length > 0 && (
          <div className="pt-1 border-t border-border/50">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1.5">
              <Paperclip className="h-3 w-3" /> Vedlegg fra bestillingen ({data.attachments.length})
            </div>
            <div className="space-y-1">
              {data.attachments.map((att) => (
                <button
                  key={att.id}
                  onClick={() => handleOpenAttachment(att.file_path)}
                  className="w-full flex items-center gap-2 rounded-md border bg-background hover:bg-accent/40 px-2.5 py-1.5 text-left text-sm transition"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1 font-medium">{att.file_name}</span>
                  {att.file_size && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatBytes(att.file_size)}
                    </span>
                  )}
                  <Download className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {data.latestCustomerMessage?.body && (
          <div className="pt-1 border-t border-border/50">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Siste melding fra kunde ·{" "}
              {format(new Date(data.latestCustomerMessage.created_at), "d. MMM HH:mm", { locale: nb })}
            </div>
            <div className="text-sm bg-muted/40 rounded-md px-2.5 py-1.5 whitespace-pre-wrap leading-snug line-clamp-4">
              {data.latestCustomerMessage.body}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm break-words">{value}</div>
      </div>
    </div>
  );
}

function BriefBlock({ icon, label, text }: { icon?: React.ReactNode; label: string; text: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="whitespace-pre-wrap text-sm leading-snug mt-0.5">{text}</div>
    </div>
  );
}
