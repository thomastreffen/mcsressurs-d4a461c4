import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import {
  CheckCircle2, Clock, FileText, Loader2, AlertCircle,
  Send, Upload, Paperclip, MessageSquare, X, AlertTriangle,
  Sparkles, Shield, Calendar, Timer, Download, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  EXTERNAL_STATUS_CONFIG,
  EXTERNAL_STATUS_STEPS,
  type ExternalStatus,
} from "@/types/order-forms";
import { deriveOrderConversationState } from "@/lib/order-request-state";
import { customerStatusView, customerTimelineLabel, effectiveCustomerStatusEvents, type CustomerStep } from "../../supabase/functions/_shared/order-customer-status";
import { CustomerFieldRequests } from "@/components/orders/CustomerFieldRequests";
import { getSubmissionDisplayTitle, getSubmissionAddressLine } from "@/lib/order-display";
import { getMessageSenderLabel, resolveSenderKind } from "@/lib/order-message-sender";
import { useAuth } from "@/hooks/useAuth";
import { useCustomerConversationReads } from "@/hooks/useCustomerConversationReads";
import { CustomerMessageReadIndicator } from "@/components/orders/conversation/CustomerMessageReadIndicator";
import { sanitizeStorageFileName } from "@/lib/storage-path";
import { ChatMediaGrid } from "@/components/chat/ChatMediaGrid";
import { SelectedFilesPreview } from "@/components/chat/SelectedFilesPreview";
import { AttachmentPreviewDrawer } from "@/components/orders/AttachmentPreviewDrawer";
import { type ChatAttachment, isImageAttachment, attachmentLabel } from "@/components/chat/chat-attachments-util";
import { APP_VERSION } from "@/pwa/buildVersion";

import mascotReceived from "@/assets/mascot/received.png";
import mascotProcessing from "@/assets/mascot/processing.png";
import mascotPlanned from "@/assets/mascot/planned.png";
import mascotInProgress from "@/assets/mascot/in_progress.png";
import mascotCompleted from "@/assets/mascot/completed.png";

/* ── Mascot mapping per external status ── */
const STATUS_MASCOT: Record<ExternalStatus, string> = {
  received: mascotReceived,
  processing: mascotProcessing,
  needs_info: mascotProcessing,
  planned: mascotPlanned,
  in_progress: mascotInProgress,
  completed: mascotCompleted,
  closed: mascotCompleted,
};

/* ── Journey stepper – numbered circles + connecting lines ── */
function JourneyStepper({ status, subLabel }: { status: CustomerStep; subLabel?: string | null }) {
  const cfg = EXTERNAL_STATUS_CONFIG[status] || EXTERNAL_STATUS_CONFIG.received;
  const steps = EXTERNAL_STATUS_STEPS;
  const currentStep = cfg.step;

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-1 sm:gap-2">
        {steps.map((s, idx) => {
          const sCfg = EXTERNAL_STATUS_CONFIG[s];
          const isDone = sCfg.step < currentStep;
          const isCurrent = s === status;
          const nextDone = idx < steps.length - 1 && EXTERNAL_STATUS_CONFIG[steps[idx + 1]].step <= currentStep;
          return (
            <div key={s} className="flex-1 flex flex-col items-center min-w-0">
              <div className="w-full flex items-center">
                <div className={cn("h-[2px] flex-1", idx === 0 ? "opacity-0" : isDone || isCurrent ? "bg-accent" : "bg-border")} />
                <div
                  className={cn(
                    "h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center shrink-0 transition-all",
                    isDone
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : isCurrent
                      ? "bg-accent text-accent-foreground ring-4 ring-accent/20 shadow-md scale-110"
                      : "bg-background border-2 border-border text-muted-foreground/60",
                  )}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : isCurrent ? (
                    <span className="h-2 w-2 rounded-full bg-accent-foreground" />
                  ) : (
                    <span className="text-[11px] font-semibold">{idx + 1}</span>
                  )}
                </div>
                <div className={cn("h-[2px] flex-1", idx === steps.length - 1 ? "opacity-0" : nextDone ? "bg-accent" : "bg-border")} />
              </div>
              <span
                className={cn(
                  "mt-2 text-[9px] sm:text-[10px] leading-tight text-center font-bold tracking-wider uppercase px-0.5",
                  isCurrent ? "text-accent" : isDone ? "text-foreground/80" : "text-muted-foreground/60",
                )}
              >
                {sCfg.label}
              </span>
              {isCurrent && subLabel && (
                <span className="mt-1 text-[9px] sm:text-[10px] leading-tight text-center font-semibold text-warning px-0.5">
                  {subLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Customer timeline ── */
const HIGH_PRIORITY_EVENTS = new Set([
  "missing_info_requested",
  "customer_reply",
  "submitted",
  "converted_to_order",
  "task_rescheduled",
]);

function CustomerTimeline({ token }: { token: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data: events = [] } = useQuery({
    queryKey: ["tracking-timeline", token],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .rpc("get_submission_activity_by_token", { _token: token });
      const all = (data || []) as any[];
      return all.filter((e: any) => [
        "submitted", "status_changed", "missing_info_requested",
        "customer_reply", "converted_to_order", "notification_sent",
        "task_created", "task_rescheduled",
      ].includes(e.event_type));
    },
  });

  const timelineLabels: Record<string, string> = {
    submitted: "Bestilling mottatt",
    missing_info_requested: "Vi ba om mer informasjon",
    customer_reply: "Du sendte svar",
    converted_to_order: "Oppgave opprettet i ressursplan",
    notification_sent: "Oppdatering sendt",
    task_rescheduled: "Oppgaven er flyttet til ny tid",
  };

  const statusChangeLabel = (payload: any): string | null => customerTimelineLabel(payload?.to);

  const allVisible = useMemo(() => {
    return effectiveCustomerStatusEvents(events as any[])
      .filter((e: any) => {
        if (e.event_type === "status_changed") return !!statusChangeLabel(e.payload);
        if (e.event_type === "notification_sent" && e.payload?.type === "new_order") return false;
        return !!timelineLabels[e.event_type];
      })
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [events]);

  if (allVisible.length <= 1) return null;

  const COLLAPSED_COUNT = 5;
  const hasMore = allVisible.length > COLLAPSED_COUNT;
  const shown = expanded ? allVisible : allVisible.slice(0, COLLAPSED_COUNT);

  return (
    <Card className="border-0 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] rounded-3xl">
      <CardContent className="pt-7 pb-6 px-6 sm:px-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </span>
            Hendelseslogg
          </h3>
          <span className="text-[11px] text-muted-foreground font-medium">
            {allVisible.length} hendelser
          </span>
        </div>
        <div
          className={cn(
            "relative pl-5",
            expanded && hasMore && "max-h-[420px] overflow-y-auto pr-2 -mr-2",
          )}
        >
          <div className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-border" />
          <div className="space-y-4">
            {shown.map((e: any, i: number) => {
              const label = e.event_type === "status_changed"
                ? statusChangeLabel(e.payload)
                : timelineLabels[e.event_type];
              const isCustomer = e.event_type === "customer_reply";
              const isInfoRequest = e.event_type === "missing_info_requested";
              const isHighPriority = HIGH_PRIORITY_EVENTS.has(e.event_type);
              const isLatest = i === 0;
              return (
                <div
                  key={e.id}
                  className={cn(
                    "relative",
                    !isHighPriority && !isLatest && "opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "absolute -left-5 top-1 h-3.5 w-3.5 rounded-full border-2 border-background",
                      isInfoRequest
                        ? "bg-amber-500 ring-2 ring-amber-200"
                        : isCustomer
                        ? "bg-primary"
                        : isLatest
                        ? "bg-primary/80 ring-2 ring-primary/20"
                        : isHighPriority
                        ? "bg-primary/60"
                        : "bg-muted-foreground/30",
                    )}
                  />
                  <p className={cn(
                    "text-sm leading-snug",
                    isInfoRequest
                      ? "font-semibold text-amber-900 dark:text-amber-200"
                      : isCustomer || isLatest
                      ? "font-semibold text-foreground"
                      : isHighPriority
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}>
                    {label}
                  </p>
                  {e.payload?.summary && (
                    <p className="text-xs text-muted-foreground mt-0.5">{e.payload.summary}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    {format(new Date(e.created_at), "d. MMM yyyy 'kl.' HH:mm", { locale: nb })}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        {hasMore && (
          <div className="mt-4 pt-3 border-t border-border/60 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-semibold text-primary hover:text-primary hover:bg-primary/5 rounded-full"
            >
              {expanded
                ? "Skjul historikk"
                : `Vis hele historikken (${allVisible.length - COLLAPSED_COUNT} til)`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Other submissions for same submitter email ── */
function OtherSubmissions({ token }: { token: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["tracking-other-submissions", token],
    enabled: !!token,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_other_submissions_by_token", { _token: token });
      return (data || []) as any[];
    },
  });

  const sorted = useMemo(() => {
    const closedSet = new Set(["closed", "rejected"]);
    return [...items].sort((a, b) => {
      const aClosed = closedSet.has(a.status);
      const bClosed = closedSet.has(b.status);
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      return new Date(b.last_activity_at || b.submitted_at).getTime() -
             new Date(a.last_activity_at || a.submitted_at).getTime();
    });
  }, [items]);

  if (sorted.length === 0) {
    return (
      <Card className="border-0 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] rounded-3xl h-full">
        <CardContent className="pt-7 pb-6 px-6 sm:px-8">
          <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <FileText className="h-4 w-4" />
            </span>
            Dine andre bestillinger
          </h3>
          <p className="text-sm text-muted-foreground">
            Du har ingen andre aktive bestillinger registrert på denne e-postadressen.
          </p>
        </CardContent>
      </Card>
    );
  }

  const COLLAPSED = 5;
  const hasMore = sorted.length > COLLAPSED;
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED);

  return (
    <Card className="border-0 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] rounded-3xl h-full">
      <CardContent className="pt-7 pb-6 px-6 sm:px-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <FileText className="h-4 w-4" />
            </span>
            Dine andre bestillinger
          </h3>
          <span className="text-[11px] text-muted-foreground font-medium">
            {sorted.length} totalt
          </span>
        </div>
        <div
          className={cn(
            "space-y-2",
            expanded && hasMore && "max-h-[420px] overflow-y-auto pr-1 -mr-1",
          )}
        >
          {shown.map((s: any) => {
            const isClosed = ["closed", "rejected"].includes(s.status);
            const ext = (s.external_status || "received") as ExternalStatus;
            const cfg = EXTERNAL_STATUS_CONFIG[ext] || EXTERNAL_STATUS_CONFIG.received;
            const title = getSubmissionDisplayTitle(s);
            const address = getSubmissionAddressLine(s);
            const last = s.last_activity_at || s.submitted_at;
            const tok = s.public_tracking_token;
            const meta = [
              s.submission_no,
              s.template_name,
              `sendt ${format(new Date(s.submitted_at), "d. MMM", { locale: nb })}`,
              last && last !== s.submitted_at
                ? `oppdatert ${formatDistanceToNow(new Date(last), { addSuffix: true, locale: nb })}`
                : null,
            ].filter(Boolean).join(" · ");

            const inner = (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                  {address && address !== title && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{address}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/70 mt-1 truncate">{meta}</p>
                </div>
                <Badge
                  className={cn(
                    "text-white border-0 rounded-full text-[10px] px-2.5 py-0.5 shrink-0 shadow-sm",
                    isClosed ? "bg-muted-foreground" : cfg.color,
                  )}
                >
                  {cfg.label}
                </Badge>
              </div>
            );

            if (!tok) {
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.warn("Missing public_tracking_token for submission", s.id);
              }
              return (
                <div
                  key={s.id}
                  className={cn(
                    "block rounded-2xl border border-border/50 bg-muted/10 px-3.5 py-3 cursor-not-allowed",
                    isClosed && "opacity-60",
                  )}
                >
                  {inner}
                </div>
              );
            }

            return (
              <Link
                key={s.id}
                to={`/bestilling/status/${tok}`}
                className={cn(
                  "block rounded-2xl border border-border/50 bg-muted/10 px-3.5 py-3 hover:bg-muted/30 hover:border-border transition-colors cursor-pointer",
                  isClosed && "opacity-60",
                )}
              >
                {inner}
              </Link>
            );
          })}
        </div>
        {hasMore && (
          <div className="mt-4 pt-3 border-t border-border/60 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-semibold text-primary hover:text-primary hover:bg-primary/5 rounded-full"
            >
              {expanded
                ? "Skjul"
                : `Vis flere bestillinger (${sorted.length - COLLAPSED} til)`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Main page ── */
export default function OrderTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isInternalViewer = !!user && user.role !== "customer_user";
  const [replyText, setReplyText] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyFileNames, setReplyFileNames] = useState<Record<number, string>>({});
  const [lightboxAtts, setLightboxAtts] = useState<ChatAttachment[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [token]);

  useEffect(() => {
    console.info("[mcs-build-version]", APP_VERSION, window.location.pathname);
  }, []);

  const { data: submission, isLoading, error } = useQuery({
    queryKey: ["tracking", token],
    enabled: !!token,
    queryFn: async () => {
      const { data: rpcData, error: rpcErr } = await (supabase as any)
        .rpc("get_submission_by_tracking_token", { _token: token! });
      if (rpcErr) throw rpcErr;
      const sub = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!sub) return null;
      const { data: tmpl } = await supabase
        .from("order_form_templates")
        .select("name, external_title")
        .eq("id", sub.template_id)
        .maybeSingle();
      return { ...sub, order_form_templates: tmpl };
    },
  });

  const { data: values = [] } = useQuery({
    queryKey: ["tracking-values", submission?.id],
    enabled: !!token,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .rpc("get_submission_values_by_token", { _token: token! });
      return data || [];
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["tracking-messages", token],
    enabled: !!token,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .rpc("get_submission_messages_by_token", { _token: token! });
      return data || [];
    },
  });

  const { data: linkedEvent } = useQuery({
    queryKey: ["tracking-linked-event", token, (submission as any)?.linked_event_id],
    enabled: !!token && !!(submission as any)?.linked_event_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .rpc("get_linked_event_for_tracking_token", { _token: token! });
      const row = Array.isArray(data) ? data[0] : data;
      return row || null;
    },
  });

  const { data: legacyComments = [] } = useQuery({
    queryKey: ["tracking-comments-legacy", token],
    enabled: !!token,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .rpc("get_submission_comments_by_token", { _token: token! });
      return data || [];
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["tracking-attachments", token],
    enabled: !!token,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .rpc("get_submission_attachments_by_token", { _token: token! });
      return data || [];
    },
  });

  useEffect(() => {
    if (submission?.id) {
      supabase.from("order_form_submissions")
        .update({ customer_last_viewed_at: new Date().toISOString() } as any)
        .eq("id", submission.id)
        .then();
    }
  }, [submission?.id]);

  const conversationState = useMemo(
    () => deriveOrderConversationState(submission?.status, messages as any[], legacyComments as any[], (submission as any)?.external_status_updated_at),
    [submission, messages, legacyComments],
  );

  const allMessages = useMemo(
    () => conversationState.conversation.filter((message) => message.is_visible_to_customer),
    [conversationState.conversation],
  );

  const visibleMessageIdsCustomer = useMemo(
    () => allMessages.map((m: any) => m.id as string),
    [allMessages],
  );
  const { readsByMessage: customerReads } = useCustomerConversationReads({
    trackingToken: token,
    visibleMessageIds: visibleMessageIdsCustomer,
  });

  const openRequest = useMemo(
    () => [...allMessages].reverse().find((message) => message.message_type === "request_info" && message.requires_reply && !message.replied_at),
    [allMessages],
  );

  const scrollToReplyAndFocus = () => {
    messagesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      replyInputRef.current?.focus();
    }, 400);
  };

  const submitReply = useMutation({
    mutationFn: async () => {
      if (!replyText.trim() && replyFiles.length === 0) return;
      if (!submission) return;
      const sub = submission as any;

      // Idempotency key — same submit (e.g. double-click, retry) must not create two messages.
      const clientRequestId =
        (typeof crypto !== "undefined" && "randomUUID" in crypto)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Server-authoritative send: backend decides sender_type/sender_name
      // based on JWT (intern bruker -> internal, ellers customer).
      const { data: sendResult, error: sendErr } = await supabase.functions.invoke(
        "order-message-public-send",
        {
          body: {
            tracking_token: token,
            body: replyText.trim(),
            has_attachments: replyFiles.length > 0,
            client_request_id: clientRequestId,
          },
        },
      );
      if (sendErr) {
        throw new Error(sendErr.message || "Kunne ikke sende meldingen");
      }
      if ((sendResult as any)?.error) {
        throw new Error((sendResult as any).error);
      }

      const newMessageId: string | null = (sendResult as any)?.message?.id || null;

      for (let i = 0; i < replyFiles.length; i++) {
        const file = replyFiles[i];
        const safeName = sanitizeStorageFileName(file.name);
        const path = `${sub.company_id}/${submission.id}/reply_${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("order-form-attachments")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) {
          console.error("[OrderTracking] upload failed", { path, file: file.name, error: upErr });
          toast.error(`Kunne ikke laste opp ${file.name}: ${upErr.message}`);
          continue;
        }
        const customName = (replyFileNames[i] || "").trim();
        const { error: insErr } = await supabase.from("order_form_submission_attachments").insert({
          submission_id: submission.id,
          field_key: "customer_reply",
          file_name: file.name,
          original_filename: file.name,
          display_name: customName || null,
          file_path: path,
          mime_type: file.type,
          file_size: file.size,
          message_id: newMessageId,
        } as any);
        if (insErr) {
          console.error("[OrderTracking] attachment insert failed", { path, error: insErr });
          toast.error(`Kunne ikke registrere ${file.name}: ${insErr.message}`);
        }
      }

      const wasOpenRequest = !!openRequest;
      if (openRequest) {
        await supabase.from("order_form_messages")
          .update({ replied_at: new Date().toISOString() } as any)
          .eq("id", openRequest.id);
      }

      let hasRemainingOpenRequests = false;
      if (wasOpenRequest) {
        const { data: remaining } = await supabase
          .from("order_form_messages")
          .select("id")
          .eq("submission_id", submission.id)
          .eq("message_type", "request_info")
          .eq("requires_reply", true)
          .is("replied_at", null)
          .neq("id", openRequest!.id);
        hasRemainingOpenRequests = (remaining?.length ?? 0) > 0;
      }

      const shouldAutoUpdateStatus = wasOpenRequest
        && !hasRemainingOpenRequests
        && ["missing_info", "waiting_customer"].includes(sub.status);

      await supabase.from("order_form_submissions")
        .update({
          customer_last_reply_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          last_customer_message_at: new Date().toISOString(),
          ...(wasOpenRequest ? { awaiting_customer_reply: false, open_request_message_id: null } : {}),
          ...(shouldAutoUpdateStatus ? { status: "under_review" } : {}),
        } as any)
        .eq("id", submission.id);

      const logPayload: any = { has_text: !!replyText.trim(), file_count: replyFiles.length };
      if (shouldAutoUpdateStatus) {
        logPayload.auto_status_change = { from: sub.status, to: "under_review" };
      }
      await supabase.from("order_form_activity_log").insert({
        submission_id: submission.id,
        event_type: "customer_reply",
        payload: logPayload,
      } as any);

      if (shouldAutoUpdateStatus) {
        await supabase.from("order_form_activity_log").insert({
          submission_id: submission.id,
          event_type: "auto_status_change",
          payload: {
            from: sub.status,
            to: "under_review",
            reason: "Kundesvar mottatt på åpen forespørsel. Status endret automatisk fra Mangler info til Til vurdering.",
          },
        } as any);
      }
    },
    onSuccess: () => {
      setReplyText("");
      setReplyFiles([]);
      setReplyFileNames({});
      qc.invalidateQueries({ queryKey: ["tracking-messages", token] });
      qc.invalidateQueries({ queryKey: ["tracking-comments-legacy", token] });
      qc.invalidateQueries({ queryKey: ["tracking-attachments", token] });
      qc.invalidateQueries({ queryKey: ["tracking-timeline", token] });
      qc.invalidateQueries({ queryKey: ["tracking", token] });
      toast.success("Svaret ditt er sendt!");
    },
    onError: () => {
      toast.error("Kunne ikke sende svaret. Prøv igjen.");
    },
  });

  const valuesMap = useMemo(() => {
    const m: Record<string, any> = {};
    values.forEach((v: any) => { m[v.field_key] = v.value; });
    return m;
  }, [values]);

  const sub = submission as any;
  // One semantic source for badge, headline, stepper and timeline.
  const view = customerStatusView(conversationState.effectiveInternalStatus, conversationState.hasOpenRequest);
  const needsInfo = view.key === "needs_info";
  const externalStatus: ExternalStatus = view.step;
  const statusCfg = { ...(EXTERNAL_STATUS_CONFIG[externalStatus] || EXTERNAL_STATUS_CONFIG.received), label: view.label, color: view.customerActionNeeded ? "bg-amber-500" : (EXTERNAL_STATUS_CONFIG[externalStatus]?.color || "bg-blue-500") };
  const templateName = sub?.order_form_templates?.external_title || sub?.order_form_templates?.name || "Bestilling";
  const lastUpdated = sub?.last_activity_at || sub?.updated_at || sub?.submitted_at;
  const human = { headline: view.headline, body: view.body };
  const mascot = STATUS_MASCOT[externalStatus] || mascotReceived;

  const visibleAttachments = useMemo(
    () => (attachments as any[]).filter((a) => !a.deleted_at),
    [attachments],
  );

  // Group attachments by message_id for in-bubble rendering
  const attachmentsByMessage = useMemo(() => {
    const map = new Map<string, ChatAttachment[]>();
    visibleAttachments.forEach((a) => {
      if (!a.message_id) return;
      const list = map.get(a.message_id) || [];
      list.push(a as ChatAttachment);
      map.set(a.message_id, list);
    });
    return map;
  }, [visibleAttachments]);

  // Public, token-scoped URL resolver (anonymous customer has no Supabase session,
  // and the storage bucket is private). Goes through an edge function that
  // validates the tracking token + per-attachment visibility.
  const trackingUrlResolver = useCallback(
    async (att: { id: string }) => {
      if (!token) return null;
      const { data, error } = await supabase.functions.invoke(
        "order-attachment-public-fetch",
        { body: { tracking_token: token, attachment_id: att.id } },
      );
      if (error || !(data as any)?.signed_url) {
        console.warn("[OrderTracking] resolver failed", error || data);
        return null;
      }
      return (data as any).signed_url as string;
    },
    [token],
  );

  // Debug: surface what tracking page sees for media rendering.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line no-console
    console.info("[tracking-attachments-render-debug]", visibleAttachments.map((a) => ({
      id: a.id,
      name: a.name,
      file_name: a.file_name,
      mime_type: a.mime_type,
      type: a.type,
      message_id: a.message_id,
      visibility: a.visibility,
      deleted_at: a.deleted_at,
      isImage: isImageAttachment(a),
      hasResolver: true,
    })));
    console.info("[tracking-media-debug]", {
      messages: (allMessages as any[]).map((m) => ({
        id: m.id,
        visible: m.is_visible_to_customer,
        attachmentCount: attachmentsByMessage.get(m.id)?.length ?? 0,
      })),
      visibleAttachments: visibleAttachments.map((a) => ({
        id: a.id,
        name: a.file_name,
        message_id: a.message_id,
        mime_type: a.mime_type,
        field_key: a.field_key,
        deleted_at: a.deleted_at,
        isImage: isImageAttachment(a),
      })),
    });
  }, [allMessages, visibleAttachments, attachmentsByMessage]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">Bestilling ikke funnet</h2>
          <p className="text-sm text-muted-foreground">
            Sporingslenken er ugyldig eller bestillingen finnes ikke lenger.
          </p>
        </div>
      </div>
    );
  }

  const summaryFields = [
    { key: "kundenavn", label: "Kunde" },
    { key: "firmanavn", label: "Firma" },
    { key: "bestiller_navn", label: "Bestiller" },
    { key: "kontaktperson_kunde", label: "Kontaktperson" },
    { key: "anleggsadresse", label: "Oppdragssted" },
    { key: "oensket_dato", label: "Ønsket dato" },
    { key: "oensket_tid", label: "Ønsket tid" },
    { key: "referanse_po", label: "Referanse/PO" },
    { key: "oppdragstittel", label: "Oppdrag" },
  ];

  const visibleSummary = summaryFields.filter((f) => valuesMap[f.key]);
  const hasMessages = allMessages.length > 0;
  const isClosed = externalStatus === "completed" || externalStatus === "closed";

  const openLightbox = (att: ChatAttachment, idx: number, list: ChatAttachment[]) => {
    setLightboxAtts(list);
    setLightboxIndex(idx);
  };

  // === New hero identity: site/address is primary, customer/template secondary ===
  const pickStr = (...vals: any[]) =>
    vals.map((v) => (typeof v === "string" ? v.trim() : "")).find((v) => v) || "";

  const siteTitle =
    pickStr(
      valuesMap.oppdragssted,
      valuesMap.anleggsadresse,
      valuesMap.oppdragstittel,
      getSubmissionDisplayTitle(sub),
    ) || sub.submission_no || "Bestilling";

  const customerName = pickStr(
    valuesMap.firmanavn,
    valuesMap.kundenavn,
    sub.summary?.firmanavn,
    sub.summary?.kundenavn,
  );

  // "Servicejobb for Elektroentreprenøren AS"
  const heroSubtitle = (() => {
    const tmpl = templateName && templateName !== "Bestilling" ? templateName : "";
    if (tmpl && customerName) return `${tmpl} for ${customerName}`;
    if (tmpl) return tmpl;
    if (customerName) return `For ${customerName}`;
    return "";
  })();

  const addressLine = getSubmissionAddressLine(sub) || pickStr(valuesMap.anleggsadresse);
  // Avoid showing address twice when it's already the title
  const showSecondaryAddress = addressLine && addressLine !== siteTitle && !siteTitle.includes(addressLine);

  // Planned event time block
  const ev = (linkedEvent as any) || null;
  const plannedBlock = (() => {
    if (!ev?.start_time) return null;
    if (!["planned", "in_progress"].includes(externalStatus)) return null;
    const start = new Date(ev.start_time);
    const end = ev.end_time ? new Date(ev.end_time) : null;
    const sameDay = end && start.toDateString() === end.toDateString();
    const dayLabel = format(start, "EEEE d. MMMM", { locale: nb });
    const timeLabel = end
      ? sameDay
        ? `${format(start, "HH:mm")}–${format(end, "HH:mm")}`
        : `${format(start, "d. MMM HH:mm")} – ${format(end, "d. MMM HH:mm", { locale: nb })}`
      : format(start, "HH:mm");
    const verb = externalStatus === "in_progress" ? "Pågår" : "Planlagt";
    return { label: `${verb} ${dayLabel} kl. ${timeLabel}` };
  })();


  return (
    <div className="min-h-screen bg-[hsl(36_40%_97%)] dark:bg-background">
      {/* Top brand bar */}
      <div className="bg-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-foreground text-background flex items-center justify-center font-black text-sm tracking-tighter">
              MCS
            </div>
            <div className="leading-tight">
              <div className="text-base font-bold text-foreground tracking-tight">Service</div>
              <div className="text-[10px] text-muted-foreground -mt-0.5">A part of <span className="text-accent font-semibold">Ernstrømgruppen</span></div>
            </div>
          </div>
          <span className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
            <Shield className="h-3.5 w-3.5" />
            Sikker sporing
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-10 space-y-5">
        {/* ── HERO ── */}
        <div className="relative overflow-visible rounded-[32px] bg-gradient-to-br from-[hsl(36_55%_95%)] via-[hsl(34_60%_94%)] to-[hsl(28_70%_91%)] dark:from-card dark:via-card dark:to-muted/40 shadow-[0_20px_50px_-20px_hsl(21_90%_40%/0.25)] ring-1 ring-[hsl(28_50%_85%)]/60">
          {/* Subtle brand background shapes */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]">
            <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-foreground/5 blur-3xl" />
            <div className="absolute top-8 right-10 text-accent/30 text-3xl font-black hidden sm:block">+</div>
            <div className="absolute bottom-16 right-8 text-accent/20 text-4xl font-black hidden sm:block">+</div>
            <div className="absolute top-20 right-32 h-2.5 w-2.5 rounded-full bg-accent/40 hidden sm:block" />
          </div>

          <div className="grid sm:grid-cols-[1.25fr_1fr] gap-0 items-end relative">
            {/* Left: text */}
            <div className="p-6 sm:p-12 space-y-7 order-2 sm:order-1 relative z-10">
              {/* Status + planned time */}
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge
                  className={cn(
                    "text-white border-0 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm",
                    statusCfg.color,
                  )}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/90 mr-1.5 animate-pulse" />
                  {statusCfg.label}
                </Badge>
                {plannedBlock && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] text-foreground/80 px-3 py-1.5 text-xs font-semibold">
                    <Calendar className="h-3.5 w-3.5 text-accent" />
                    {plannedBlock.label}
                  </span>
                )}
              </div>

              {/* Primary identity: site/address */}
              <div className="space-y-2">
                <h1 className="text-[2.25rem] sm:text-[3.25rem] font-black text-foreground tracking-tight leading-[1.05] break-words">
                  {siteTitle}
                </h1>
                {heroSubtitle && (
                  <p className="text-base sm:text-xl text-foreground/75 font-semibold leading-snug">
                    {heroSubtitle}
                  </p>
                )}
                {showSecondaryAddress && (
                  <p className="text-sm text-foreground/60">{addressLine}</p>
                )}
              </div>

              {/* Human-friendly status copy as supporting paragraph */}
              <p className="text-sm sm:text-base text-foreground/70 leading-relaxed max-w-md">
                <span className="font-semibold text-foreground/85">{human.headline}.</span>{" "}
                {human.body}
              </p>

              {needsInfo && (
                <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/50 p-4 sm:p-5 space-y-2 max-w-xl">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                      <AlertCircle className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                        Vi trenger litt mer informasjon fra deg
                      </p>
                      <p className="text-xs sm:text-sm text-amber-800/90 dark:text-amber-200/80 leading-relaxed">
                        For å komme videre med bestillingen trenger vi at du svarer på spørsmålene eller fyller inn manglende opplysninger nedenfor.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Compact metadata line */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/60 font-medium pt-1">
                <span className="inline-flex items-center gap-1.5 font-mono text-foreground/80">
                  <FileText className="h-3.5 w-3.5 text-accent" />
                  {sub.submission_no}
                </span>
                <span aria-hidden className="text-foreground/30">·</span>
                <span>
                  sendt {format(new Date(sub.submitted_at || sub.created_at), "d. MMMM yyyy", { locale: nb })}
                </span>
                {lastUpdated && (
                  <>
                    <span aria-hidden className="text-foreground/30">·</span>
                    <span>
                      oppdatert {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true, locale: nb })}
                    </span>
                  </>
                )}
              </div>


              {needsInfo && (
                <Button
                  onClick={scrollToReplyAndFocus}
                  className="w-full sm:w-auto h-12 rounded-full shadow-md px-6 font-semibold bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Se hva vi trenger
                </Button>
              )}
            </div>

            {/* Right: free-standing mascot (no frame) */}
            <div className="relative order-1 sm:order-2 flex items-end justify-center pt-8 sm:pt-0 sm:pr-4 min-h-[260px] sm:min-h-[440px]">
              <img
                src={mascot}
                alt={statusCfg.label}
                className="relative z-10 w-72 sm:w-[120%] sm:max-w-none sm:-mr-6 sm:-mb-4 h-auto object-contain object-bottom select-none pointer-events-none drop-shadow-[0_18px_24px_rgba(20,15,10,0.18)]"
                draggable={false}
              />
            </div>
          </div>

          {/* Journey stepper */}
          <div className="relative z-10 px-6 sm:px-12 pb-7 pt-5 mt-2 border-t border-foreground/10 bg-white/50 dark:bg-background/40 backdrop-blur-sm rounded-b-[32px]">
            <JourneyStepper status={view.step} subLabel={view.subLabel} />
          </div>
        </div>

        {/* Customer-fillable field requests from admin */}
        <CustomerFieldRequests
          token={token!}
          submitterName={sub.submitter_name || sub.notification_recipient_name}
        />

        {/* Summary */}
        {visibleSummary.length > 0 && (
          <Card className="border-0 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] rounded-3xl">
            <CardContent className="pt-7 pb-6 px-6 sm:px-8">
              <h3 className="text-base font-bold text-foreground mb-5 flex items-center gap-2.5">
                <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Sparkles className="h-4 w-4" />
                </span>
                Oppsummering
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {visibleSummary.map((f) => (
                  <div key={f.key}>
                    <dt className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold">{f.label}</dt>
                    <dd className="text-sm text-foreground mt-0.5">{String(valuesMap[f.key])}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Timeline (1/3) + other submissions (2/3) */}
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <CustomerTimeline token={token!} />
          </div>
          <div className="lg:col-span-2">
            <OtherSubmissions token={token!} />
          </div>
        </div>

        {/* Messages + Attachments side-by-side on desktop */}
        <div className={cn("grid gap-5", visibleAttachments.length > 0 ? "lg:grid-cols-3" : "grid-cols-1")}>
        {/* Messages - the primary conversation section */}
        <div ref={messagesSectionRef} className={visibleAttachments.length > 0 ? "lg:col-span-2" : ""}>
          <Card className="border-0 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] rounded-3xl">
            <CardContent className="pt-7 pb-6 px-6 sm:px-8">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2.5">
                  <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <MessageSquare className="h-4 w-4" />
                  </span>
                  Meldinger
                </h3>
                {needsInfo && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 rounded-full text-[10px]">
                    Venter på deg
                  </Badge>
                )}
              </div>

              {hasMessages ? (
                <div className="space-y-3 mb-5">
                  {allMessages.map((msg) => {
                    const senderKind = resolveSenderKind(msg as any, submission as any);
                    const isCustomer = senderKind === "customer";
                    const isRequestInfo = msg.message_type === "request_info";
                    const isSystem = senderKind === "system";
                    const senderLabel = getMessageSenderLabel(msg as any, submission as any, "customer");

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="text-center py-1">
                          <span className="text-[11px] text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
                            {msg.body}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className={cn("flex gap-2.5", isCustomer ? "justify-end" : "justify-start")}>
                        {!isCustomer && (
                          <div className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                            MCS
                          </div>
                        )}
                        <div
                          className={cn(
                            "rounded-2xl p-3.5 text-sm max-w-[80%] shadow-sm",
                            isCustomer
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : isRequestInfo
                              ? "bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 rounded-bl-sm"
                              : "bg-muted/70 rounded-bl-sm",
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {isRequestInfo && (
                              <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                            )}
                            <span
                              className={cn(
                                "text-[11px] font-semibold",
                                isCustomer
                                  ? "text-primary-foreground/90"
                                  : isRequestInfo
                                  ? "text-amber-800 dark:text-amber-300"
                                  : "text-foreground/80",
                              )}
                            >
                              {senderLabel}
                            </span>
                            {isRequestInfo && (
                              <Badge variant="outline" className="text-[9px] bg-amber-100 text-amber-700 border-amber-300">
                                Vi trenger info
                              </Badge>
                            )}
                            <span
                              className={cn(
                                "text-[10px] ml-auto",
                                isCustomer ? "text-primary-foreground/70" : "text-muted-foreground",
                              )}
                            >
                              {format(new Date(msg.created_at), "d. MMM HH:mm", { locale: nb })}
                            </span>
                          </div>
                          {msg.body && <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.body}</p>}
                          {(() => {
                            const msgAtts = attachmentsByMessage.get(msg.id);
                            if (!msgAtts || msgAtts.length === 0) return null;
                            return (
                              <ChatMediaGrid
                                attachments={msgAtts}
                                bucket="order-form-attachments"
                                onPreview={openLightbox}
                                urlResolver={trackingUrlResolver}
                              />
                            );
                          })()}
                          {isRequestInfo && msg.requires_reply && (
                            <div className="mt-2 pt-2 border-t border-amber-200/70 dark:border-amber-800/70">
                              {msg.replied_at ? (
                                <span className="text-[10px] text-green-700 dark:text-green-400 flex items-center gap-1 font-medium">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Besvart {format(new Date(msg.replied_at), "d. MMM HH:mm", { locale: nb })}
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1 font-medium">
                                  <Clock className="h-3 w-3" />
                                  Venter på svar fra deg
                                </span>
                              )}
                            </div>
                          )}
                          {isCustomer && (() => {
                            const summary = customerReads.get(msg.id);
                            const readByInternal = !!summary && summary.internal_read_count > 0;
                            return (
                              <div className="mt-1.5 flex justify-end text-primary-foreground/80">
                                <CustomerMessageReadIndicator
                                  readByInternal={readByInternal}
                                  readAt={summary?.internal_first_read_at || null}
                                />
                              </div>
                            );
                          })()}
                        </div>
                        {isCustomer && (
                          <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                            Du
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mb-5 italic">
                  Ingen meldinger ennå. Skriv gjerne om du har spørsmål eller mer informasjon.
                </p>
              )}

              {/* Reply input */}
              {!isClosed && (
                <div className="space-y-3 pt-4 border-t border-border/60">
                  {isInternalViewer && (
                    <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        Du er innlogget som <strong>{user?.name || user?.email}</strong>. Meldingen sendes som <strong>MCS Service</strong>, ikke som kunde.
                      </span>
                    </div>
                  )}
                  <Textarea
                    ref={replyInputRef}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={
                      isInternalViewer
                        ? "Skriv en melding til kunden som MCS Service..."
                        : openRequest ? "Skriv svaret ditt her..." : "Skriv en melding til oss..."
                    }
                    rows={3}
                    className="text-sm resize-none rounded-xl"
                  />

                  <div className="space-y-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <Upload className="h-4 w-4" />
                      <span>Legg ved bilder eller filer</span>
                      <input
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setReplyFiles((prev) => [...prev, ...files]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <SelectedFilesPreview
                      files={replyFiles}
                      onRemove={(i) => {
                        setReplyFiles((prev) => prev.filter((_, j) => j !== i));
                        setReplyFileNames((prev) => {
                          const next: Record<number, string> = {};
                          Object.entries(prev).forEach(([k, v]) => {
                            const idx = Number(k);
                            if (idx < i) next[idx] = v;
                            else if (idx > i) next[idx - 1] = v;
                          });
                          return next;
                        });
                      }}
                      displayNames={replyFileNames}
                      onDisplayNameChange={(i, v) =>
                        setReplyFileNames((prev) => ({ ...prev, [i]: v }))
                      }
                    />
                  </div>

                  <Button
                    onClick={() => submitReply.mutate()}
                    disabled={submitReply.isPending || (!replyText.trim() && replyFiles.length === 0)}
                    className="w-full sm:w-auto h-11 text-sm rounded-full px-6 shadow-sm"
                  >
                    {submitReply.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Send className="h-4 w-4 mr-1.5" />
                    )}
                    Send svar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Attachments */}
        {visibleAttachments.length > 0 && (
          <Card className="border-0 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] rounded-3xl">
            <CardContent className="pt-7 pb-6 px-6 sm:px-8">
              <h3 className="text-base font-bold text-foreground mb-5 flex items-center gap-2.5">
                <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Paperclip className="h-4 w-4" />
                </span>
                Vedlegg ({visibleAttachments.length})
              </h3>
              <div className="space-y-2.5">
                {visibleAttachments.map((att: any) => (
                  <TrackingAttachmentRow
                    key={att.id}
                    att={att}
                    resolver={trackingUrlResolver}
                    onPreview={() => {
                      // Build image-only list for lightbox navigation,
                      // and locate the clicked item within it.
                      const imgs = visibleAttachments.filter(isImageAttachment) as ChatAttachment[];
                      if (imgs.length === 0) return;
                      const idx = Math.max(0, imgs.findIndex((a) => a.id === att.id));
                      setLightboxAtts(imgs);
                      setLightboxIndex(idx);
                    }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        </div>

        {/* Footer */}
        <div className="text-center pt-4 pb-10 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Shield className="h-3 w-3" />
            Denne lenken er personlig og skal ikke deles med andre.
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            En tjeneste fra <span className="font-semibold text-foreground/80">MCS Service</span>
          </p>
        </div>
      </div>
      <AttachmentPreviewDrawer
        open={lightboxAtts.length > 0}
        onClose={() => setLightboxAtts([])}
        attachments={lightboxAtts as any}
        initialIndex={lightboxIndex}
        urlResolver={trackingUrlResolver}
      />
    </div>
  );
}

/* ── Tracking attachment row: image thumbnail or file chip, both with preview/download ── */
function TrackingAttachmentRow({
  att,
  resolver,
  onPreview,
}: {
  att: any;
  resolver: (a: { id: string }) => Promise<string | null>;
  onPreview: () => void;
}) {
  const isImage = isImageAttachment(att);

  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    console.info("[tracking-attachment-row-active]", {
      buildVersion: APP_VERSION,
      attachmentId: att.id,
      name: att.display_name || att.file_name || att.name,
      isImage,
      hasResolver: !!resolver,
    });
  }, [att.id, att.display_name, att.file_name, att.name, isImage, resolver]);

  useEffect(() => {
    let cancelled = false;
    if (!isImage) return;
    setThumbFailed(false);
    setThumbUrl(null);
    resolver(att)
      .then((u) => {
        if (cancelled) return;
        if (!u) {
          console.warn("[tracking-media-debug] resolver returned null for", att.id, att.file_name);
          setThumbFailed(true);
        } else {
          setThumbUrl(u);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[tracking-media-debug] resolver threw for", att.id, err);
        setThumbFailed(true);
      });
    return () => { cancelled = true; };
  }, [att, isImage, resolver]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    const url = await resolver(att);
    setDownloading(false);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-2xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors group cursor-pointer"
      onClick={isImage ? onPreview : handleDownload}
    >
      <div className="h-12 w-12 rounded-xl bg-background border border-border/60 flex items-center justify-center shrink-0 overflow-hidden">
        {isImage && thumbUrl ? (
          <img
            src={thumbUrl}
            alt={attachmentLabel(att)}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : isImage && !thumbFailed ? (
          <div className="w-full h-full bg-muted animate-pulse" />
        ) : (
          <FileText className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-semibold text-foreground truncate"
          title={att.display_name && att.file_name && att.display_name !== att.file_name ? `Originalfil: ${att.original_filename || att.file_name}` : undefined}
        >
          {attachmentLabel(att)}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {att.file_size && (
            <span className="text-[11px] text-muted-foreground">
              {att.file_size < 1024 * 1024
                ? `${Math.round(att.file_size / 1024)} KB`
                : `${(att.file_size / 1024 / 1024).toFixed(1)} MB`}
            </span>
          )}
          {att.field_key === "customer_reply" && (
            <Badge variant="outline" className="text-[9px]">Ettersendt</Badge>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="h-9 w-9 rounded-xl bg-background border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40 flex items-center justify-center shrink-0 transition-colors"
        aria-label="Last ned"
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}
