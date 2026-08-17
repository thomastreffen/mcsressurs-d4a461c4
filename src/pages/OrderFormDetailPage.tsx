import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, MessageSquare, Clock, Paperclip, AlertTriangle,
  ArrowRight, FileText, Download, Mail, MailCheck, MailX, ExternalLink, UserPlus,
  Tag, User, LinkIcon, X, MoreHorizontal, Eye, Send, Globe, UserCheck, Bell, BellRing, Inbox,
  CalendarDays, LockKeyhole, Loader2, Pencil, FormInput, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ORDER_STATUS_CONFIG,
  ORDER_PRIORITY_CONFIG,
  CHANNEL_LABELS,
  EXTERNAL_STATUS_CONFIG,
  mapToExternalStatus,
  type OrderFormSubmissionStatus,
} from "@/types/order-forms";
import { format, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { computeQualityScore, type QualityResult } from "@/lib/order-quality";
import { getMessageSenderLabel, resolveSenderKind } from "@/lib/order-message-sender";
import { QualityBadge } from "@/components/orders/QualityBadge";
import { QualityIssuesPanel } from "@/components/orders/QualityIssuesPanel";
import { RequestInfoDialog } from "@/components/orders/RequestInfoDialog";
import { ConvertDialog } from "@/components/orders/ConvertDialog";
import { TripletexExportPanel } from "@/components/orders/TripletexExportPanel";
import { AttachmentPreviewDrawer } from "@/components/orders/AttachmentPreviewDrawer";
import { AssignResourceTaskDialog } from "@/components/orders/AssignResourceTaskDialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { LinkedTaskSection } from "@/components/orders/LinkedTaskSection";
import { deriveOrderConversationState } from "@/lib/order-request-state";
import { OrderParticipantsPanel } from "@/components/orders/OrderParticipantsPanel";
import { ConversationParticipantsCard } from "@/components/orders/conversation/ConversationParticipantsCard";
import { MessageReadStatus } from "@/components/orders/conversation/MessageReadStatus";
import { useConversationReads } from "@/hooks/useConversationReads";
import { useUnreadOrderMessages } from "@/hooks/useUnreadOrderMessages";
import { EditFieldsDialog } from "@/components/orders/EditFieldsDialog";
import { RequestFieldsDialog } from "@/components/orders/RequestFieldsDialog";
import { LinkExistingTaskDialog } from "@/components/orders/LinkExistingTaskDialog";
// FileUpload removed in favor of SelectedFilesPreview chat composer
import { sanitizeStorageFileName } from "@/lib/storage-path";
import { ChatMediaGrid } from "@/components/chat/ChatMediaGrid";
import { SelectedFilesPreview } from "@/components/chat/SelectedFilesPreview";
import { AttachmentRenameDialog, type RenameTarget } from "@/components/chat/AttachmentRenameDialog";
import { type ChatAttachment, isImageAttachment, formatBytes, attachmentLabel } from "@/components/chat/chat-attachments-util";
import { APP_VERSION } from "@/pwa/buildVersion";
import { FlowTrail } from "@/components/flow/FlowTrail";
import { useFlowChain } from "@/components/flow/useFlowChain";
import { OrderMaterialSection } from "@/components/orders/OrderMaterialSection";
import { buildEntries, findValueIn, findValuesIn } from "@/lib/order-field-resolver";
import { formatPricingModel } from "@/lib/pricing-model";

export default function OrderFormDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const [comment, setComment] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentFileNames, setCommentFileNames] = useState<Record<number, string>>({});
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [commentVisibility, setCommentVisibility] = useState<"internal" | "shared">("internal");
  const [sendEmailNotification, setSendEmailNotification] = useState(false);
  const [requestInfoOpen, setRequestInfoOpen] = useState(false);
  const [convertOpen] = useState(false); // kept for compat, now navigates
  const [tripletexOpen, setTripletexOpen] = useState(false);
  const [assignTaskOpen, setAssignTaskOpen] = useState(false);
  const [previewAttIdx, setPreviewAttIdx] = useState<number | null>(null);
  const [assignPopoverOpen, setAssignPopoverOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [notifyOnStatusChange, setNotifyOnStatusChange] = useState(false);
  const [notifyOnAssign, setNotifyOnAssign] = useState(false);
  const [recipientOverrideOpen, setRecipientOverrideOpen] = useState(false);
  const [recipientOverrideEmail, setRecipientOverrideEmail] = useState("");
  const [recipientOverrideName, setRecipientOverrideName] = useState("");
  const [addressedTo, setAddressedTo] = useState<string | null>(null);
  const [editFieldsOpen, setEditFieldsOpen] = useState(false);
  const [requestFieldsOpen, setRequestFieldsOpen] = useState(false);
  const [linkTaskOpen, setLinkTaskOpen] = useState(false);

  useEffect(() => {
    console.info("[mcs-build-version]", APP_VERSION, window.location.pathname);
  }, []);

  const { data: submission, isLoading } = useQuery({
    queryKey: ["order-form-submission", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_form_submissions")
        .select("*, order_form_templates(name, slug)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch source lead if order was created from a lead
  const sourceLeadId = (submission as any)?.source_lead_id as string | null | undefined;
  const { data: sourceLead } = useQuery({
    queryKey: ["order-form-source-lead", sourceLeadId],
    enabled: !!sourceLeadId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("leads")
        .select("id, company_name, contact_name, email, phone, notes, status")
        .eq("id", sourceLeadId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: values = [] } = useQuery({
    queryKey: ["order-form-values", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_form_submission_values")
        .select("*")
        .eq("submission_id", id!);
      return data || [];
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["order-form-attachments", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_form_submission_attachments")
        .select("*")
        .eq("submission_id", id!)
        .is("deleted_at", null);
      return data || [];
    },
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["order-form-comments", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_form_comments")
        .select("*")
        .eq("submission_id", id!)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  // Fetch messages from the new order_form_messages table
  const { data: orderMessages = [] } = useQuery({
    queryKey: ["order-form-messages", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_form_messages")
        .select("*")
        .eq("submission_id", id!)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  // Conversation reads (internal/admin flow)
  const visibleMessageIdsAdmin = useMemo(
    () => (orderMessages as any[]).map((m) => m.id as string),
    [orderMessages],
  );
  const conversation = useConversationReads({
    submissionId: id,
    visibleMessageIds: visibleMessageIdsAdmin,
    enableInternalMarkRead: true,
  });
  const latestMessageId = visibleMessageIdsAdmin[visibleMessageIdsAdmin.length - 1] || null;

  // Realtime: refresh detail when new messages or submission updates arrive
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`order-detail-rt-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_form_messages", filter: `submission_id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["order-form-messages", id] });
          qc.invalidateQueries({ queryKey: ["order-form-submission", id] });
          qc.invalidateQueries({ queryKey: ["order-form-activity", id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "order_form_submissions", filter: `id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["order-form-submission", id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  // Mark unread order_message notifications for this submission as read
  // whenever this detail page is opened (and refresh when new ones arrive).
  const { markSubmissionRead, unreadMessageCount, submissions: globalUnreadSubs } = useUnreadOrderMessages();
  useEffect(() => {
    if (!id) return;
    markSubmissionRead(id);
    // Re-run when new unread arrives while the page is open.
  }, [id, unreadMessageCount, markSubmissionRead]);




  // Fetch participants for this order
  const { data: participants = [] } = useQuery({
    queryKey: ["order-participants", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_form_participants")
        .select("*")
        .eq("submission_id", id!)
        .order("created_at", { ascending: true });
      return (data || []) as any[];
    },
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["order-form-activity", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_form_activity_log")
        .select("*")
        .eq("submission_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  // Fetch available users for assignment with membership info
  const { data: companyUsers = [] } = useQuery({
    queryKey: ["company-users-for-assign", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_accounts")
        .select("auth_user_id, person:people(full_name)")
        .eq("is_active", true);
      if (!data) return [];
      // Get memberships to determine cross-company status
      const orderCompanyId = submission?.company_id;
      let memberUserIds = new Set<string>();
      if (orderCompanyId) {
        const { data: memberships } = await supabase
          .from("user_memberships")
          .select("user_id")
          .eq("company_id", orderCompanyId)
          .eq("is_active", true);
        for (const m of memberships || []) {
          memberUserIds.add((m as any).user_id);
        }
      }
      return (data as any[])
        .filter(u => u.person?.full_name)
        .map(u => ({
          id: u.auth_user_id,
          name: u.person.full_name,
          isCrossCompany: orderCompanyId ? !memberUserIds.has(u.auth_user_id) : false,
        }))
        .sort((a, b) => {
          // Show same-company users first
          if (a.isCrossCompany !== b.isCrossCompany) return a.isCrossCompany ? 1 : -1;
          return a.name.localeCompare(b.name);
        });
    },
  });

  // Resolve current assignee name
  const { data: assigneeName } = useQuery({
    queryKey: ["assignee-name", submission?.assigned_to],
    enabled: !!submission?.assigned_to,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_accounts")
        .select("person:people(full_name)")
        .eq("auth_user_id", submission!.assigned_to!)
        .eq("is_active", true)
        .single();
      return (data as any)?.person?.full_name || null;
    },
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["order-form-template-structure", submission?.template_id],
    enabled: !!submission?.template_id,
    queryFn: async () => {
      const { data: secs } = await supabase
        .from("order_form_template_sections")
        .select("*")
        .eq("template_id", submission!.template_id)
        .order("sort_order");
      if (!secs) return [];
      const { data: fields } = await supabase
        .from("order_form_template_fields")
        .select("*")
        .eq("template_id", submission!.template_id)
        .eq("is_active", true)
        .order("sort_order");
      return secs.map((s: any) => ({
        ...s,
        fields: (fields || []).filter((f: any) => f.section_id === s.id),
      }));
    },
  });

  const valuesMap: Record<string, any> = useMemo(() => {
    const map: Record<string, any> = {};
    values.forEach((v: any) => { map[v.field_key] = v.value; });
    return map;
  }, [values]);

  const conversationState = useMemo(
    () => deriveOrderConversationState(submission?.status, orderMessages as any[], comments as any[]),
    [submission?.status, orderMessages, comments],
  );

  const autoStatusSyncRef = useRef<string | null>(null);

  useEffect(() => {
    const targetStatus = conversationState.statusSyncTarget;

    if (!id || !submission?.status || !targetStatus) {
      autoStatusSyncRef.current = null;
      return;
    }

    const syncKey = `${id}:${submission.status}->${targetStatus}`;
    if (autoStatusSyncRef.current === syncKey) return;
    autoStatusSyncRef.current = syncKey;

    (async () => {
      const { error } = await supabase
        .from("order_form_submissions")
        .update({
          status: targetStatus,
          external_status: mapToExternalStatus(targetStatus),
          external_status_updated_at: new Date().toISOString(),
        } as any)
        .eq("id", id);

      if (error) {
        console.error("Failed to auto-sync order status from conversation state", error);
        return;
      }

      await supabase.from("order_form_activity_log").insert({
        submission_id: id,
        event_type: "auto_status_change",
        payload: {
          from: submission.status,
          to: targetStatus,
          reason: "Kundesvar er mottatt og ingen åpen forespørsel finnes. Status synkronisert til Til vurdering.",
        },
        created_by: user?.id,
      } as any);

      qc.invalidateQueries({ queryKey: ["order-form-submission", id] });
      qc.invalidateQueries({ queryKey: ["order-form-activity", id] });
    })();
  }, [conversationState.statusSyncTarget, id, submission?.status, qc, user?.id]);

  const findVal = useCallback((...prefixes: string[]): string => {
    for (const prefix of prefixes) {
      if (valuesMap[prefix]) return String(valuesMap[prefix]);
      const key = Object.keys(valuesMap).find(k => k.startsWith(prefix));
      if (key && valuesMap[key]) return String(valuesMap[key]);
    }
    return "";
  }, [valuesMap]);

  // Resolve notification recipient with explicit fallback chain
  const resolvedRecipient = useMemo(() => {
    const sub = submission as any;
    const recipientEmail = sub?.notification_recipient_email
      || sub?.submitter_email
      || findVal("bestiller_epost", "epost_kunde", "epost", "kontakt_epost")
      || "";
    const recipientName = sub?.notification_recipient_name
      || sub?.submitter_name
      || findVal("bestiller_navn", "kontaktperson", "kontaktperson_kunde")
      || "";
    const recipientSource: string = sub?.notification_recipient_source || "auto";
    const isManual = recipientSource === "manual";
    const sourceLabel = recipientSource === "manual"
      ? "Manuelt overstyrt"
      : recipientSource === "bestiller_fields"
      ? "Fra bestiller-felt i skjema"
      : sub?.submitter_email
      ? "Fra innsenderinformasjon"
      : "Fallback fra skjemadata";
    return { email: recipientEmail, name: recipientName, source: recipientSource, isManual, sourceLabel };
  }, [submission, findVal]);

  const bestillerEpost = resolvedRecipient.email;

  // Auto-default email notification checkbox based on visibility + auto-notify setting
  useEffect(() => {
    if (commentVisibility === "shared" && bestillerEpost) {
      setSendEmailNotification(!!(submission as any)?.auto_notify_on_status_change);
    } else {
      setSendEmailNotification(false);
    }
  }, [commentVisibility, submission, bestillerEpost]);

  const allTemplateFields = useMemo(() => {
    return sections.flatMap((s: any) => (s.fields || []).map((f: any) => ({
      field_key: f.field_key,
      label: f.label,
      field_type: f.field_type,
      is_required: f.is_required,
      created_at: f.created_at ?? null,
    })));
  }, [sections]);

  const qualityResult: QualityResult = useMemo(() => {
    return computeQualityScore(
      valuesMap,
      attachments as any,
      allTemplateFields,
      (submission as any)?.submitted_at || (submission as any)?.created_at || null,
    );
  }, [valuesMap, attachments, allTemplateFields, submission]);


  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const nextStatus = newStatus as OrderFormSubmissionStatus;
      const { error } = await supabase
        .from("order_form_submissions")
        .update({
          status: newStatus,
          external_status: mapToExternalStatus(nextStatus),
          external_status_updated_at: new Date().toISOString(),
        } as any)
        .eq("id", id!);
      if (error) throw error;
      await supabase.from("order_form_activity_log").insert({
        submission_id: id!,
        event_type: "status_changed",
        payload: { from: submission?.status, to: newStatus, notified_requester: !!notifyOnStatusChange },
        created_by: user?.id,
      });
      // Send customer notification if toggle is on
      let notify: { attempted: boolean; sent: boolean; error?: string } = { attempted: false, sent: false };
      if (notifyOnStatusChange) {
        notify.attempted = true;
        const eventKeyMap: Record<string, string> = {
          in_progress: "in_progress",
          closed: "completed",
          rejected: "rejected",
          task_created: "task_created",
          ready_for_planning: "task_created",
        };
        const eventKey = eventKeyMap[newStatus] || "status_changed";
        try {
          const { data, error: invErr } = await supabase.functions.invoke("order-form-notify", {
            body: { submission_id: id, notification_type: "customer_update", event_key: eventKey },
          });
          if (invErr) throw invErr;
          if (data && data.success === false) notify.error = data.error || data.reason || "Sending feilet";
          else notify.sent = true;
        } catch (e: any) {
          notify.error = e?.message || String(e);
        }
      }
      return notify;
    },
    onSuccess: (notify) => {
      qc.invalidateQueries({ queryKey: ["order-form-submission", id] });
      qc.invalidateQueries({ queryKey: ["order-form-activity", id] });
      setNotifyOnStatusChange(false);
      if (notify.attempted && notify.sent) {
        toast.success("Status oppdatert og bestiller varslet");
      } else if (notify.attempted && !notify.sent) {
        toast.warning("Status oppdatert – varsel ikke sendt", { description: notify.error });
      } else {
        toast.success("Status oppdatert");
      }
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!comment.trim() && commentFiles.length === 0) return;
      const isShared = commentVisibility === "shared";
      const shouldEmail = isShared && sendEmailNotification && !!bestillerEpost;

      // Get sender name
      const { data: ua } = await supabase
        .from("user_accounts")
        .select("person:people(full_name)")
        .eq("auth_user_id", user?.id!)
        .eq("is_active", true)
        .maybeSingle();
      const senderName = (ua as any)?.person?.full_name || "Saksbehandler";

      // Find sender's participant record if exists
      const senderParticipant = participants.find((p: any) => p.user_id === user?.id);

      // Write to new messages table (primary)
      const { data: insertedMsg, error } = await supabase.from("order_form_messages").insert({
        submission_id: id!,
        sender_type: "admin",
        sender_user_id: user?.id,
        sender_name: senderName,
        message_type: "message",
        body: comment.trim(),
        is_visible_to_customer: isShared,
        requires_reply: false,
        visibility: commentVisibility,
        source: "app",
        addressed_to_participant_id: addressedTo || null,
        sender_participant_id: senderParticipant?.id || null,
        email_notification_sent: shouldEmail,
        email_notification_sent_at: shouldEmail ? new Date().toISOString() : null,
      } as any).select("id").single();
      if (error) throw error;

      // Upload attachments (if any) to storage + register in DB
      const companyId = (submission as any)?.company_id;
      const uploadFailures: string[] = [];
      for (let i = 0; i < commentFiles.length; i++) {
        const file = commentFiles[i];
        const safeName = sanitizeStorageFileName(file.name);
        const path = `${companyId}/${id}/admin_${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("order-form-attachments")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) {
          console.error("[admin-message upload] failed", { path, file: file.name, error: upErr });
          uploadFailures.push(`${file.name}: ${upErr.message}`);
          continue;
        }
        const customName = (commentFileNames[i] || "").trim();
        const { error: insErr } = await supabase.from("order_form_submission_attachments").insert({
          submission_id: id!,
          field_key: "admin_message",
          category: isShared ? "Sendt til kunde" : "Intern",
          file_name: file.name,
          original_filename: file.name,
          display_name: customName || null,
          file_path: path,
          mime_type: file.type,
          file_size: file.size,
          uploaded_by: user?.id,
          message_id: insertedMsg?.id || null,
        } as any);
        if (insErr) {
          console.error("[admin-message attachment insert] failed", { path, error: insErr });
          uploadFailures.push(`${file.name}: ${insErr.message}`);
        }
      }
      if (uploadFailures.length > 0) {
        toast.error("Noen vedlegg ble ikke lastet opp", { description: uploadFailures.join("\n") });
      }

      // Also write to legacy comments for backward compatibility
      await supabase.from("order_form_comments").insert({
        submission_id: id!,
        body: comment.trim(),
        comment_type: isShared ? "shared_message" : "internal",
        visibility: commentVisibility,
        created_by: user?.id,
      } as any);

      if (isShared) {
        await supabase.from("order_form_submissions")
          .update({ last_admin_message_at: new Date().toISOString(), last_activity_at: new Date().toISOString() } as any)
          .eq("id", id!);
      }

      // Trigger email notification to bestiller if checked
      if (shouldEmail && insertedMsg?.id) {
        try {
          await supabase.functions.invoke("order-form-notify", {
            body: { submission_id: id, notification_type: "shared_message", message_id: insertedMsg.id },
          });
        } catch (emailErr) {
          console.error("Email notification failed:", emailErr);
          // Don't fail the whole operation if email fails
        }
      }
    },
    onSuccess: () => {
      setComment("");
      setCommentFiles([]);
      setCommentFileNames({});
      setAddressedTo(null);
      setSendEmailNotification(false);
      qc.invalidateQueries({ queryKey: ["order-form-comments", id] });
      qc.invalidateQueries({ queryKey: ["order-form-messages", id] });
      qc.invalidateQueries({ queryKey: ["order-form-attachments", id] });
      toast.success(commentVisibility === "shared" ? "Melding delt med bestiller" : "Intern kommentar lagt til");
    },
    onError: (err: any) => {
      console.error("[addComment] Error:", err);
      toast.error("Kunne ikke sende melding", { description: err?.message || "Ukjent feil" });
    },
  });

  const assignResponsible = useMutation({
    mutationFn: async (assigneeId: string | null) => {
      const previousAssignee = sub.assigned_to;
      const assignee = companyUsers.find(u => u.id === assigneeId);
      const isCrossCompany = assignee?.isCrossCompany || false;

      const { error } = await supabase
        .from("order_form_submissions")
        .update({ assigned_to: assigneeId })
        .eq("id", id!);
      if (error) throw error;

      // Handle cross-company access grant
      if (assigneeId && isCrossCompany) {
        // Create scoped access grant
        await supabase.from("cross_company_access_grants").upsert({
          user_id: assigneeId,
          entity_type: "order_form_submission",
          entity_id: id!,
          source_company_id: submission?.company_id,
          granted_by: user?.id,
          reason: "assignment",
          revoked_at: null,
        }, { onConflict: "user_id,entity_type,entity_id" });
      }

      // Revoke previous cross-company grant if removing or changing assignee
      if (previousAssignee && previousAssignee !== assigneeId) {
        await supabase
          .from("cross_company_access_grants")
          .update({ revoked_at: new Date().toISOString() })
          .eq("user_id", previousAssignee)
          .eq("entity_type", "order_form_submission")
          .eq("entity_id", id!)
          .eq("reason", "assignment");
      }

      // Log activity
      const assigneeName = assignee?.name || "Ingen";
      await supabase.from("order_form_activity_log").insert({
        submission_id: id!,
        event_type: "assigned",
        payload: {
          assigned_to: assigneeId,
          assigned_to_name: assigneeName,
          cross_company: isCrossCompany,
        },
        created_by: user?.id,
      });

      // Create notification for assignee
      if (assigneeId && assigneeId !== user?.id) {
        await supabase.from("notifications").insert({
          user_id: assigneeId,
          company_id: submission?.company_id || activeCompanyId,
          type: "order_assigned",
          priority: "important",
          title: `Du er tildelt ansvar for bestilling ${submission?.submission_no}`,
          message: `${(submission?.summary as any)?.oppdragstittel || submission?.submission_no || "Bestilling"} er tildelt deg.${isCrossCompany ? " (Tilgang gitt på tvers av selskap)" : ""}`,
          link_url: `/orders/${id}`,
          entity_type: "order_form_submission",
          entity_id: id,
          actor_user_id: user?.id,
        });
      }

      // Send customer notification if toggle is on
      let notify: { attempted: boolean; sent: boolean; error?: string } = { attempted: false, sent: false };
      if (notifyOnAssign && assigneeId) {
        notify.attempted = true;
        try {
          const { data, error: invErr } = await supabase.functions.invoke("order-form-notify", {
            body: { submission_id: id, notification_type: "customer_update", event_key: "assigned" },
          });
          if (invErr) throw invErr;
          if (data && data.success === false) notify.error = data.error || data.reason || "Sending feilet";
          else notify.sent = true;
        } catch (e: any) {
          notify.error = e?.message || String(e);
        }
      }
      return notify;
    },
    onSuccess: (notify) => {
      qc.invalidateQueries({ queryKey: ["order-form-submission", id] });
      qc.invalidateQueries({ queryKey: ["order-form-activity", id] });
      qc.invalidateQueries({ queryKey: ["assignee-name"] });
      setAssignPopoverOpen(false);
      setAssignSearch("");
      setNotifyOnAssign(false);
      if (notify.attempted && notify.sent) {
        toast.success("Ansvarlig oppdatert og bestiller varslet");
      } else if (notify.attempted && !notify.sent) {
        toast.warning("Ansvarlig oppdatert – varsel ikke sendt", { description: notify.error });
      } else {
        toast.success("Ansvarlig oppdatert");
      }
    },
  });

  const sendNotification = useMutation({
    mutationFn: async (type: string) => {
      const { data, error } = await supabase.functions.invoke("order-form-notify", {
        body: { submission_id: id, notification_type: type },
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || data.reason || "Sending feilet");
      return data;
    },
    onSuccess: (_, type) => {
      qc.invalidateQueries({ queryKey: ["order-form-submission", id] });
      qc.invalidateQueries({ queryKey: ["order-form-activity", id] });
      const labels: Record<string, string> = {
        new_order: "Varsling sendt til postkontor",
        confirmation: "Bekreftelse sendt til bestiller",
      };
      toast.success(labels[type] || "E-post sendt");
    },
    onError: (err: any) => {
      toast.error("E-postsending feilet: " + (err.message || "Ukjent feil"));
    },
  });

  const updateRecipient = useMutation({
    mutationFn: async ({ email, name, source }: { email: string; name: string; source: string }) => {
      const { error } = await supabase
        .from("order_form_submissions")
        .update({
          notification_recipient_email: email || null,
          notification_recipient_name: name || null,
          notification_recipient_source: source,
        } as any)
        .eq("id", id!);
      if (error) throw error;
      await supabase.from("order_form_activity_log").insert({
        submission_id: id!,
        event_type: "recipient_changed",
        payload: { email, name, source },
        created_by: user?.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-form-submission", id] });
      qc.invalidateQueries({ queryKey: ["order-form-activity", id] });
      setRecipientOverrideOpen(false);
      toast.success("Oppdateringsmottaker endret");
    },
  });


  const resendTrackingLink = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("order-form-notify", {
        body: { submission_id: id, notification_type: "confirmation" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sporingslenke sendt");
      qc.invalidateQueries({ queryKey: ["order-form-activity", id] });
      qc.invalidateQueries({ queryKey: ["order-form-submission", id] });
    },
    onError: (err: any) => {
      toast.error("Kunne ikke sende sporingslenke", { description: err?.message || "Ukjent feil" });
    },
  });

  const removeAttachment = useMutation({
    mutationFn: async (attId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("order_form_submission_attachments")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id ?? null,
          deleted_reason: "removed_by_admin",
        } as any)
        .eq("id", attId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-form-attachments", id] });
      toast.success("Vedlegg fjernet");
    },
    onError: (err: any) => {
      toast.error("Kunne ikke fjerne vedlegg", { description: err?.message });
    },
  });

  const renameAttachment = useMutation({
    mutationFn: async (input: { id: string; displayName: string; description: string }) => {
      const { error } = await supabase.rpc("rename_submission_attachment" as any, {
        _attachment_id: input.id,
        _display_name: input.displayName,
        _description: input.description,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-form-attachments", id] });
      toast.success("Visningsnavn oppdatert");
      setRenameTarget(null);
    },
    onError: (err: any) => {
      toast.error("Kunne ikke endre navn", { description: err?.message });
    },
  });

  const confirmRemoveAttachment = (att: { id: string; file_name: string; display_name?: string | null }) => {
    const label = att.display_name?.trim() || att.file_name;
    if (window.confirm(`Fjerne "${label}" fra bestillingen? Kunden vil ikke lenger se vedlegget.`)) {
      removeAttachment.mutate(att.id);
    }
  };

  // Resolve material AI context from order form values (same source as Oppdragsinformasjon)
  // MUST be declared before any early-return so hook order stays stable.
  const materialContext = useMemo(() => {
    try {
      const safeValues = Array.isArray(values) ? values : [];
      const entries = buildEntries(safeValues as any);
      const subAny = (submission as any) ?? {};
      const summary = (subAny?.summary as Record<string, unknown> | null) ?? {};
      const description = findValueIn(
        entries,
        summary,
        "detaljert_arbeidsbeskrivelse",
        "arbeidsbeskrivelse",
        "beskrivelse",
        "problem_beskrivelse",
        "melding",
      );
      const customer = findValueIn(
        entries,
        summary,
        "kundenavn",
        "firmanavn",
        "bestiller_firma",
        "kunde",
        "company_name",
      );
      const address = findValuesIn(
        entries,
        summary,
        "anleggsadresse",
        "oppdragssted",
        "adresse",
      ).join(", ");
      return {
        description: description || subAny?.subject || subAny?.title || "",
        customer: customer || subAny?.submitter_name || "",
        address: address || "",
      };
    } catch (err) {
      console.error("[OrderFormDetailPage] materialContext resolver failed", err);
      return { description: "", customer: "", address: "" };
    }
  }, [values, submission]);

  if (!submission) return <div className="p-6 text-center text-muted-foreground">Ikke funnet</div>;

  const effectiveStatus = conversationState.effectiveInternalStatus;
  const statusConfig = ORDER_STATUS_CONFIG[effectiveStatus];
  const priorityConfig = ORDER_PRIORITY_CONFIG[submission.priority];
  const sub = submission as any;

  const externalStatus = conversationState.effectiveExternalStatus;
  const externalConfig = EXTERNAL_STATUS_CONFIG[externalStatus];

  const eventTypeLabels: Record<string, string> = {
    submitted: "Bestilling innsendt",
    status_changed: "Status endret",
    missing_info_requested: "Forespørsel om mer info sendt",
    comment_added: "Kommentar lagt til",
    customer_reply: "Svar mottatt fra bestiller",
    converted_to_case: "Konvertert til sak",
    converted_to_order: "Oppgave opprettet i ressursplan",
    notification_sent: "E-post sendt",
    notification_failed: "E-postsending feilet",
    exported_to_tripletex: "Eksportert til Tripletex",
    assigned: "Ansvarlig tildelt",
    recipient_changed: "Oppdateringsmottaker endret",
    fields_updated: "Bestillingsdata etterfylt",
    field_request_created: "Forespurt felter fra bestiller",
    customer_filled_field: "Bestiller fylte inn felt",
    linked_to_existing_task: "Koblet til eksisterende oppgave",
    unlinked_task: "Kobling til oppgave fjernet",
  };

  const trackingUrl = sub.public_tracking_token
    ? `${window.location.origin}/bestilling/status/${sub.public_tracking_token}`
    : null;

  const activeAttachments = (attachments as any[]).filter((a) => !a.deleted_at);

  console.info("[admin-attachments-render-debug]", activeAttachments.map((a: any) => ({
    id: a.id,
    name: a.name,
    file_name: a.file_name,
    mime_type: a.mime_type,
    type: a.type,
    url: !!a.url,
    storage_path: a.storage_path || a.file_path,
    message_id: a.message_id,
    visibility: a.visibility,
    category: a.category,
    deleted_at: a.deleted_at,
    isImage: isImageAttachment(a),
  })));

  const attByCategory: Record<string, any[]> = {};
  activeAttachments.forEach((a: any) => {
    const cat = a.category || "Annet";
    if (!attByCategory[cat]) attByCategory[cat] = [];
    attByCategory[cat].push(a);
  });

  // Index attachments by message_id for in-bubble chat rendering
  const attachmentsByMessage = new Map<string, ChatAttachment[]>();
  activeAttachments.forEach((a) => {
    if (!a.message_id) return;
    const list = attachmentsByMessage.get(a.message_id) || [];
    list.push(a as ChatAttachment);
    attachmentsByMessage.set(a.message_id, list);
  });

  const openChatLightbox = (att: ChatAttachment) => {
    const idx = activeAttachments.findIndex((a) => a.id === att.id);
    if (idx >= 0) setPreviewAttIdx(idx);
  };

  const hasNotification = !!sub.notification_sent_at;
  const hasConfirmation = !!sub.confirmation_sent_at;
  const hasError = !!sub.notification_error;
  const sharedCount = (orderMessages as any[]).filter((m: any) => m.is_visible_to_customer).length
    || comments.filter((c: any) => c.visibility === "shared" || c.is_customer_reply).length;
  const lastCustomerMsg = (orderMessages as any[]).filter((m: any) => m.sender_type === "customer").pop();
  const customerReplies = comments.filter((c: any) => c.is_customer_reply);
  const lastCustomerReply = lastCustomerMsg || (customerReplies.length > 0 ? customerReplies[customerReplies.length - 1] : null);
  const hasOpenRequest = conversationState.hasOpenRequest;
  const hasUnreviewedReply = conversationState.hasUnreviewedReply;
  const isWaitingOnCustomer = hasOpenRequest;
  const isWaitingOnUs = ["new", "under_review", "waiting_internal"].includes(effectiveStatus) && !hasOpenRequest;
  const isClosed = effectiveStatus === "closed" || effectiveStatus === "rejected";

  // Customer notification history from activity log
  const customerNotifications = activity.filter((a: any) =>
    a.event_type === "notification_sent" &&
    a.payload?.type && a.payload.type !== "new_order"
  );

  // Per-user unread (notifications-based) — consistent with /orders list, sidebar, home, topbar.
  // Do NOT use last_admin_message_at as proxy for "read".
  const hasUnreadCustomerMessage = !!id && globalUnreadSubs.some((s) => s.submission_id === id);
  const unreadCustomerSnippet = hasUnreadCustomerMessage
    ? (orderMessages as any[])
        .filter((m: any) => ["customer", "external", "bestiller"].includes(m.sender_type))
        .slice(-1)[0]?.body?.slice(0, 200)
    : null;

  return (
    <div className="space-y-5 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/orders")} className="mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{submission.submission_no}</h1>
            <Badge className={statusConfig?.color || ""}>{statusConfig?.label || effectiveStatus}</Badge>
            {submission.priority !== "normal" && priorityConfig && (
              <Badge variant="outline" className="text-[10px] font-semibold border-orange-200 text-orange-700 bg-orange-50">
                {priorityConfig.label}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {(() => {
              const parts: string[] = [];
              const tmplName = sub.order_form_templates?.name;
              if (tmplName) parts.push(tmplName);
              const name = sub.submitter_name || (submission.summary as any)?.kundenavn || (submission.summary as any)?.bestiller_navn;
              if (name) parts.push(name);
              if ((submission.summary as any)?.oppdragstittel) parts.push((submission.summary as any).oppdragstittel);
              parts.push(format(new Date(submission.submitted_at), "d. MMMM yyyy HH:mm", { locale: nb }));
              return parts.join(" · ");
            })()}
          </p>
        </div>
        {/* Quality badge - subtle, separate from status */}
        <QualityBadge score={qualityResult.score} />
      </div>

      {hasUnreadCustomerMessage && (
        <div className="rounded-lg border-l-4 border-l-green-500 border border-green-200 bg-green-50 px-3 py-2 flex items-start gap-2 text-sm">
          <MessageSquare className="h-4 w-4 text-green-700 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-green-900">Ny melding fra bestiller</div>
            {unreadCustomerSnippet && (
              <div className="text-green-900/80 truncate text-xs mt-0.5">{unreadCustomerSnippet}</div>
            )}
          </div>
        </div>
      )}

      {/* Primary + secondary actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Primary: Status with notify toggle */}
          <div className="flex items-center gap-2">
            <Select value={effectiveStatus} onValueChange={(v) => updateStatus.mutate(v)}>
            <SelectTrigger className="w-48 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ORDER_STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bestillerEpost && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">
              <Checkbox
                checked={notifyOnStatusChange}
                onCheckedChange={(c) => setNotifyOnStatusChange(!!c)}
                className="h-3.5 w-3.5"
              />
              <Bell className="h-3 w-3" />
              Varsle bestiller nå
            </label>
          )}
        </div>

        {/* Primary: Tildel ansvarlig */}
        <Popover open={assignPopoverOpen} onOpenChange={setAssignPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant={sub.assigned_to ? "outline" : "default"} size="sm">
              {sub.assigned_to ? (
                <>
                  <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                  {assigneeName || "Tildelt"}
                </>
              ) : (
                <>
                  <User className="h-3.5 w-3.5 mr-1.5" />
                  Tildel ansvarlig
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <Input
              placeholder="Søk etter bruker..."
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              className="h-8 text-sm mb-2"
              autoFocus
            />
            <div className="max-h-52 overflow-y-auto space-y-0.5">
              {sub.assigned_to && (
                <button
                  onClick={() => assignResponsible.mutate(null)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted text-destructive"
                >
                  <X className="h-3 w-3 inline mr-1.5" />
                  Fjern ansvarlig
                </button>
              )}
              {companyUsers
                .filter(u => !assignSearch || u.name.toLowerCase().includes(assignSearch.toLowerCase()))
                .map((u, idx, arr) => {
                  // Show separator before cross-company section
                  const showCrossDivider = u.isCrossCompany && (idx === 0 || !arr[idx - 1]?.isCrossCompany);
                  return (
                    <div key={u.id}>
                      {showCrossDivider && (
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-1 border-t mt-1">
                          Andre selskap
                        </div>
                      )}
                      <button
                        onClick={() => assignResponsible.mutate(u.id)}
                        className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2 ${sub.assigned_to === u.id ? "bg-primary/10 font-medium" : ""}`}
                      >
                        <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{u.name}</span>
                        {u.isCrossCompany && (
                          <Globe className="h-3 w-3 shrink-0 text-amber-500" />
                        )}
                        {sub.assigned_to === u.id && <UserCheck className="h-3 w-3 shrink-0 text-primary" />}
                      </button>
                    </div>
                  );
                })
              }
            </div>
            {/* Cross-company info */}
            {(() => {
              const hoveredCross = companyUsers.some(u => u.isCrossCompany);
              return hoveredCross ? (
                <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded p-1.5 mt-2 flex gap-1.5 items-start">
                  <Globe className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>Brukere med <Globe className="h-2.5 w-2.5 inline" /> tilhører et annet selskap. Ved tildeling gis tilgang kun til denne bestillingen og tilhørende vedlegg, meldinger og aktivitetslogg.</span>
                </div>
              ) : null;
            })()}
            {bestillerEpost && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none mt-2 pt-2 border-t">
                <Checkbox
                  checked={notifyOnAssign}
                  onCheckedChange={(c) => setNotifyOnAssign(!!c)}
                  className="h-3.5 w-3.5"
                />
                <Bell className="h-3 w-3" />
                Varsle bestiller nå
              </label>
            )}
          </PopoverContent>
        </Popover>

        {/* Primary: Be om mer info (freeform message) */}
        <Button variant="outline" size="sm" onClick={() => setRequestInfoOpen(true)}>
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
          Be om mer info
        </Button>

        {/* Primary: Be om spesifikke felter fra bestiller */}
        <Button variant="outline" size="sm" onClick={() => setRequestFieldsOpen(true)}>
          <FormInput className="h-3.5 w-3.5 mr-1.5" />
          Be om felter
        </Button>

        {/* Primary: Etterfyll informasjon (admin selv) */}
        <Button variant="outline" size="sm" onClick={() => setEditFieldsOpen(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Etterfyll informasjon
        </Button>

        {/* Primary: Opprett oppgave */}
        <Button variant="outline" size="sm" onClick={() => setAssignTaskOpen(true)}>
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Opprett oppgave
        </Button>

        {/* Primary: Koble til eksisterende oppgave */}
        <Button variant="outline" size="sm" onClick={() => setLinkTaskOpen(true)}>
          <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
          Koble til oppgave
        </Button>

        {/* Primary: Materiell / Plukkliste */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const el = document.getElementById("order-material-section");
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              el.classList.add("ring-2", "ring-primary");
              setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1600);
            }
          }}
        >
          <Package className="h-3.5 w-3.5 mr-1.5" />
          Materiell
        </Button>

        {/* Secondary: overflow menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="px-2">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => sendNotification.mutate("new_order")}>
              <Mail className="h-3.5 w-3.5 mr-2" />
              {hasNotification ? "Send varsling på nytt" : "Send varsling"}
            </DropdownMenuItem>
            {bestillerEpost && !hasConfirmation && (
              <DropdownMenuItem onClick={() => sendNotification.mutate("confirmation")}>
                <MailCheck className="h-3.5 w-3.5 mr-2" />
                Send bekreftelse
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTripletexOpen(true)}>
              <Download className="h-3.5 w-3.5 mr-2" />
              Tripletex-eksport
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/orders/${id}/convert`)} disabled={!!sub.converted_to_id}>
              <ArrowRight className="h-3.5 w-3.5 mr-2" />
              Konverter til sak / oppdrag
            </DropdownMenuItem>
            {!isClosed && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => updateStatus.mutate("closed")}>
                  <X className="h-3.5 w-3.5 mr-2" />
                  Lukk bestilling
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateStatus.mutate("rejected")} className="text-destructive focus:text-destructive">
                  Avvis
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Flyt-kjede (Lead → Bestilling → Oppdrag) */}
      <OrderFlowTrail
        submissionId={id!}
        submissionNo={sub.submission_no}
        sourceLeadId={(sub as any).source_lead_id || null}
        convertedToId={sub.converted_to_id || null}
        convertedToType={sub.converted_to_type || null}
      />


      {/* Ticket info bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 p-3 rounded-lg bg-muted/30 border">
        {[
          { label: "Innsender", value: sub.submitter_name || (submission.summary as any)?.bestiller_navn || "–" },
          { label: "E-post", value: sub.submitter_email || bestillerEpost || "–" },
          { label: "Kunde", value: (submission.summary as any)?.kundenavn || "–" },
          { label: "Oppdrag", value: (submission.summary as any)?.oppdragstittel || "–" },
          { label: "Kanal", value: CHANNEL_LABELS[sub.channel] || "–" },
        ].map(({ label, value }) => (
          <div key={label} className="text-sm">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</span>
            <p className="font-medium truncate text-xs">{value}</p>
          </div>
        ))}
        {/* Ansvarlig - interactive */}
        <div className="text-sm">
          <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Ansvarlig</span>
          {sub.assigned_to ? (
            <p className="font-medium truncate text-xs flex items-center gap-1">
              <UserCheck className="h-3 w-3 text-primary shrink-0" />
              {assigneeName || "Laster..."}
              {companyUsers.find(u => u.id === sub.assigned_to)?.isCrossCompany && (
                <span title="Tildelt på tvers av selskap"><Globe className="h-3 w-3 text-amber-500 shrink-0" /></span>
              )}
            </p>
          ) : (
            <p className="font-medium truncate text-xs text-muted-foreground">Ikke tildelt</p>
          )}
        </div>
      </div>

      {/* Linked task section - prominent */}
      <LinkedTaskSection
        submissionId={id!}
        convertedToId={sub.converted_to_id}
        convertedToType={sub.converted_to_type}
        linkedEventId={(sub as any).linked_event_id}
        onManageLink={() => setLinkTaskOpen(true)}
      />

      {/* Materiell / Plukkliste */}
      <OrderMaterialSection
        orderId={id!}
        linkedEventId={(sub as any).linked_event_id || null}
        customer={materialContext.customer}
        address={materialContext.address}
        description={materialContext.description}
        orderNumber={(sub as any).submission_no || null}
      />

      {/* Linked entities + notification status */}
      <div className="flex flex-wrap gap-2">
        {sourceLead && (
          <Badge
            variant="outline"
            className="text-[10px] gap-1 cursor-pointer hover:bg-muted border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
            onClick={() => navigate(`/sales/leads/${sourceLead.id}`)}
            title={`Lead: ${sourceLead.company_name}${sourceLead.contact_name ? ` · ${sourceLead.contact_name}` : ""}${sourceLead.email ? ` · ${sourceLead.email}` : ""}${sourceLead.phone ? ` · ${sourceLead.phone}` : ""}`}
          >
            <User className="h-2.5 w-2.5" />
            Opprettet fra lead: {sourceLead.company_name}
            <ExternalLink className="h-2.5 w-2.5" />
          </Badge>
        )}
        {sub.linked_case_id && (
          <Badge variant="outline" className="text-[10px] gap-1 cursor-pointer hover:bg-muted border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" onClick={() => {
            navigate(`/inbox`);
          }}>
            <Inbox className="h-2.5 w-2.5" />
            Kilde: Postkontoret
            <ExternalLink className="h-2.5 w-2.5" />
          </Badge>
        )}
        {sub.converted_to_id && sub.converted_to_type === "case" && (
          <Badge variant="outline" className="text-[10px] gap-1 cursor-pointer hover:bg-muted" onClick={() => {
            navigate(`/cases/${sub.converted_to_id}`);
          }}>
            <LinkIcon className="h-2.5 w-2.5" />
            Sak koblet
            <ExternalLink className="h-2.5 w-2.5" />
          </Badge>
        )}
        {hasNotification && (
          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
            <MailCheck className="h-3 w-3 mr-1" />
            Varsling sendt {format(new Date(sub.notification_sent_at), "d. MMM HH:mm", { locale: nb })}
          </Badge>
        )}
        {hasConfirmation && (
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
            <MailCheck className="h-3 w-3 mr-1" />
            Bekreftelse sendt {format(new Date(sub.confirmation_sent_at), "d. MMM HH:mm", { locale: nb })}
          </Badge>
        )}
        {hasError && (
          <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
            <MailX className="h-3 w-3 mr-1" />
            E-postfeil
          </Badge>
        )}
      </div>

      {/* Quality issues */}
      {qualityResult.score !== "green" && <QualityIssuesPanel result={qualityResult} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {sections.map((section: any) => {
            const sectionFields = section.fields || [];
            const hasValues = sectionFields.some((f: any) => valuesMap[f.field_key] != null);
            if (!hasValues && sectionFields.length > 0) return null;
            return (
              <Card key={section.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{section.title}</CardTitle>
                  {section.description && (
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {sectionFields.map((field: any) => {
                      const val = valuesMap[field.field_key];
                      if (val == null && !field.is_required) return null;
                      return (
                        <div key={field.id} className="flex flex-col">
                          <span className="text-xs text-muted-foreground">{field.label}</span>
                          <span className="text-sm font-medium">
                            {renderFieldValue(val, field.field_type)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Attachments */}
          {activeAttachments.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Vedlegg ({activeAttachments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(attByCategory).map(([cat, files]) => (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{cat}</p>
                      <div className="space-y-1.5">
                        {files.map((att: any) => {
                          const globalIdx = activeAttachments.findIndex((a: any) => a.id === att.id);
                          return (
                            <AttachmentRow
                              key={att.id}
                              attachment={att}
                              onPreview={() => setPreviewAttIdx(globalIdx)}
                              onRemove={() => confirmRemoveAttachment(att)}
                              onRename={() => setRenameTarget(att as any)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Customer tracking section */}
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                Kundeside
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Notification recipient */}
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Oppdateringsmottaker</span>
                <div className="mt-1 space-y-1">
                  {resolvedRecipient.email ? (
                    <>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                        {resolvedRecipient.email}
                      </p>
                      {resolvedRecipient.name && (
                        <p className="text-xs text-muted-foreground ml-[18px]">{resolvedRecipient.name}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground ml-[18px]">
                        {resolvedRecipient.sourceLabel}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Ingen e-post funnet – varsler kan ikke sendes</p>
                  )}
                </div>
                <Popover open={recipientOverrideOpen} onOpenChange={(open) => {
                  setRecipientOverrideOpen(open);
                  if (open) {
                    setRecipientOverrideEmail(resolvedRecipient.email);
                    setRecipientOverrideName(resolvedRecipient.name);
                  }
                }}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs h-7 mt-1.5 w-full">
                      <Mail className="h-3 w-3 mr-1" />
                      {resolvedRecipient.email ? "Endre mottaker" : "Sett mottaker"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-3 space-y-2">
                    <p className="text-xs font-medium">Oppdateringsmottaker</p>
                    <p className="text-[10px] text-muted-foreground">Denne adressen brukes for bekreftelser, sporingslenker og statusoppdateringer.</p>
                    <Input
                      placeholder="Navn"
                      value={recipientOverrideName}
                      onChange={(e) => setRecipientOverrideName(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="E-post"
                      type="email"
                      value={recipientOverrideEmail}
                      onChange={(e) => setRecipientOverrideEmail(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="flex-1 text-xs h-7"
                        disabled={!recipientOverrideEmail}
                        onClick={() => updateRecipient.mutate({
                          email: recipientOverrideEmail,
                          name: recipientOverrideName,
                          source: "manual",
                        })}
                      >
                        Lagre
                      </Button>
                      {resolvedRecipient.isManual && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => {
                            // Reset to auto
                            const autoEmail = sub.submitter_email || findVal("bestiller_epost", "epost_kunde", "epost", "kontakt_epost") || "";
                            const autoName = sub.submitter_name || findVal("bestiller_navn", "kontaktperson", "kontaktperson_kunde") || "";
                            updateRecipient.mutate({ email: autoEmail, name: autoName, source: "auto" });
                          }}
                        >
                          Tilbakestill
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Auto-notify toggle */}
              <div className="pt-2 border-t">
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <Checkbox
                    checked={!!(submission as any).auto_notify_on_status_change}
                    onCheckedChange={async (checked) => {
                      await supabase.from("order_form_submissions")
                        .update({ auto_notify_on_status_change: !!checked } as any)
                        .eq("id", id!);
                      qc.invalidateQueries({ queryKey: ["order-form-submission", id] });
                      toast.success(checked ? "Auto-varsling aktivert" : "Auto-varsling deaktivert");
                    }}
                    className="h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium flex items-center gap-1">
                      {(submission as any).auto_notify_on_status_change ? (
                        <BellRing className="h-3 w-3 text-primary" />
                      ) : (
                        <Bell className="h-3 w-3 text-muted-foreground" />
                      )}
                      Varsle bestiller automatisk ved fremtidige oppdateringer
                    </span>
                    <p className="text-[10px] text-muted-foreground">
                      {(submission as any).auto_notify_on_status_change
                        ? "Forhåndskrysser «Varsle bestiller nå» ved status-endring, tildeling og delte meldinger. Du kan alltid huke av."
                        : "«Varsle bestiller nå» må aktivt hukes av for hver handling for å sende e-post."}
                    </p>
                  </div>
                </label>
              </div>

              {/* Divider */}
              <div className="border-t" />

              {/* External status — what the customer actually sees */}
              <div className="space-y-2">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Intern status</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${statusConfig?.dotClass || "bg-muted"}`} />
                    <span className="text-sm font-medium">{statusConfig?.label || effectiveStatus}</span>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Bestiller ser</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${externalConfig.color}`} />
                    <span className="text-sm font-medium">
                      {conversationState.hasOpenRequest ? "Under behandling" : externalConfig.label}
                    </span>
                  </div>
                  {conversationState.hasOpenRequest && (
                    <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 px-2 py-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                      <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-snug">
                        <span className="font-semibold">Delstatus:</span> Vi venter på svar fra deg
                      </p>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">{externalConfig.description}</p>
                </div>
              </div>

              {/* Tracking link — bestillerens personlige sporingslenke */}
              {trackingUrl && (
                <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <LinkIcon className="h-3 w-3" />
                      Personlig sporingslenke
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">Kun bestiller</Badge>
                  </div>
                  <input
                    readOnly
                    value={trackingUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full text-[11px] font-mono bg-background border rounded px-2 py-1.5 text-foreground/80 truncate cursor-text focus:outline-none focus:ring-1 focus:ring-primary"
                    title={trackingUrl}
                  />
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={() => { navigator.clipboard.writeText(trackingUrl); toast.success("Sporingslenke kopiert"); }}
                    >
                      <LinkIcon className="h-3 w-3 mr-1" />
                      Kopiér
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      asChild
                    >
                      <a href={trackingUrl} target="_blank" rel="noopener noreferrer">
                        <Eye className="h-3 w-3 mr-1" />
                        Åpne
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      disabled={!resolvedRecipient.email || resendTrackingLink.isPending}
                      title={resolvedRecipient.email ? "Send sporingslenken på nytt til bestiller" : "Ingen mottakeradresse satt"}
                      onClick={() => resendTrackingLink.mutate()}
                    >
                      {resendTrackingLink.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-3 w-3 mr-1" />
                          Send på nytt
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Bruk denne hvis e-post eller Safe Links skaper problemer. Lenken gir tilgang til kundesiden uten innlogging.
                  </p>
                </div>
              )}

              {/* Customer activity summary */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delte meldinger</span>
                  <span className="font-medium">{sharedCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bekreftelse sendt</span>
                  <span className="font-medium">{hasConfirmation ? "Ja" : "Nei"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Varsler sendt til bestiller</span>
                  <span className="font-medium">{customerNotifications.length}</span>
                </div>
                {lastCustomerReply && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Siste svar fra bestiller</span>
                    <span className="font-medium">
                      {formatDistanceToNow(new Date(lastCustomerReply.created_at), { addSuffix: true, locale: nb })}
                    </span>
                  </div>
                )}
                {sub.customer_last_viewed_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sist åpnet</span>
                    <span className="font-medium">
                      {formatDistanceToNow(new Date(sub.customer_last_viewed_at), { addSuffix: true, locale: nb })}
                    </span>
                  </div>
                )}
              </div>

              {/* Customer notification history */}
              {customerNotifications.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sendte varsler</span>
                  {customerNotifications.slice(0, 5).map((n: any) => {
                    const typeLabels: Record<string, string> = {
                      confirmation: "Bekreftelse",
                      missing_info: "Mer info",
                      customer_update: "Oppdatering",
                    };
                    return (
                      <div key={n.id} className="flex items-center gap-1.5 text-[11px]">
                        <BellRing className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium">{typeLabels[n.payload?.type] || "E-post"}</span>
                        <span className="text-muted-foreground ml-auto">
                          {format(new Date(n.created_at), "d. MMM HH:mm", { locale: nb })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Waiting indicator */}
              {isWaitingOnCustomer && (
                <div className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                  <Clock className="h-3 w-3" />
                  Venter på svar fra bestiller
                </div>
              )}
              {!isWaitingOnCustomer && hasUnreviewedReply && (
                <div className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-green-50 text-green-700 border border-green-200">
                  <MessageSquare className="h-3 w-3" />
                  Kundesvar mottatt — venter på vurdering
                </div>
              )}
              {isWaitingOnUs && !hasUnreviewedReply && !isClosed && (
                <div className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                  <Clock className="h-3 w-3" />
                  Bestiller venter på oss
                </div>
              )}
            </CardContent>
          </Card>

          {/* Participants panel */}
          <ConversationParticipantsCard
            submissionId={id!}
            companyId={submission.company_id}
            latestMessageId={latestMessageId}
          />

          {/* Messages - unified view */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Meldinger
                {!!lastCustomerReply && (
                  <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700 border-green-200 ml-auto">
                    Kundesvar mottatt
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* New messages from order_form_messages */}
              {(orderMessages as any[]).length > 0 && (
                <div className="space-y-3 mb-3 max-h-64 overflow-y-auto">
                  {(orderMessages as any[]).map((m: any) => {
                    const senderKind = resolveSenderKind(m, submission as any);
                    const isCustomer = senderKind === "customer";
                    const isRequestInfo = m.message_type === "request_info";
                    const isSystem = senderKind === "system";
                    const isOwn = senderKind === "internal" && m.sender_user_id && user?.id && m.sender_user_id === user.id;
                    const senderLabel = getMessageSenderLabel(m, submission as any, "admin");
                    const displaySender = isOwn ? `Du · ${senderLabel}` : senderLabel;
                    const addressedParticipant = m.addressed_to_participant_id
                      ? participants.find((p: any) => p.id === m.addressed_to_participant_id)
                      : null;
                    // Find if this customer message is a reply to an open request_info
                    const isReplyToRequest = isCustomer && (orderMessages as any[]).some(
                      (prev: any) => prev.message_type === "request_info" && prev.requires_reply && prev.replied_at &&
                        new Date(prev.replied_at).getTime() <= new Date(m.created_at).getTime() + 60000
                    );

                    return (
                      <div key={m.id} className={`text-sm border-l-2 pl-3 ${
                        isRequestInfo ? "border-amber-400"
                        : isSystem ? "border-muted"
                        : isCustomer ? "border-green-400"
                        : m.is_visible_to_customer ? "border-primary/60"
                        : "border-border"
                      }`}>
                        {isRequestInfo && (
                          <Badge variant="outline" className="text-[9px] mb-1 bg-amber-50 text-amber-700 border-amber-200">
                            Forespørsel om mer info
                          </Badge>
                        )}
                        {isCustomer && (
                          <Badge variant="outline" className="text-[9px] mb-1 bg-green-50 text-green-700 border-green-200">
                            Svar fra bestiller
                          </Badge>
                        )}
                        {isSystem && (
                          <Badge variant="outline" className="text-[9px] mb-1 text-muted-foreground">
                            Automatisk
                          </Badge>
                        )}
                        {!isCustomer && !isRequestInfo && !isSystem && m.is_visible_to_customer && (
                          <Badge variant="outline" className="text-[9px] mb-1 bg-primary/10 text-primary border-primary/20">
                            Delt med kunde
                          </Badge>
                        )}
                        {!m.is_visible_to_customer && !isCustomer && !isSystem && (
                          <Badge variant="outline" className="text-[9px] mb-1 text-muted-foreground">
                            Intern
                          </Badge>
                        )}
                        {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                        {(() => {
                          const msgAtts = attachmentsByMessage.get(m.id);
                          if (!msgAtts || msgAtts.length === 0) return null;
                          return (
                            <ChatMediaGrid
                              attachments={msgAtts}
                              bucket="order-form-attachments"
                              onPreview={(att) => openChatLightbox(att)}
                              canDelete
                              onDelete={(att) => confirmRemoveAttachment(att as any)}
                              canRename
                              onRename={(att) => setRenameTarget(att as any)}
                            />
                          );
                        })()}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">
                            {displaySender} · {format(new Date(m.created_at), "d. MMM HH:mm", { locale: nb })}
                          </span>
                          {m.source === "email" && (
                            <Badge variant="outline" className="text-[8px] bg-blue-50 text-blue-600 border-blue-200">
                              <Mail className="h-2.5 w-2.5 mr-0.5" /> via e-post
                            </Badge>
                          )}
                          {m.email_notification_sent && (
                            <Badge variant="outline" className="text-[8px] bg-blue-50 text-blue-600 border-blue-200">
                              <MailCheck className="h-2.5 w-2.5 mr-0.5" /> E-post sendt
                            </Badge>
                          )}
                          {m.is_visible_to_customer && !m.email_notification_sent && m.sender_type === "admin" && !isRequestInfo && (
                            <Badge variant="outline" className="text-[8px] bg-muted text-muted-foreground">
                              Kun kundeside
                            </Badge>
                          )}
                          {addressedParticipant && (
                            <Badge variant="outline" className="text-[8px] bg-muted">
                              → {addressedParticipant.name} ({addressedParticipant.role_label || addressedParticipant.participant_type})
                            </Badge>
                          )}
                          {isRequestInfo && m.requires_reply && (
                            m.replied_at ? (
                              <Badge variant="outline" className="text-[8px] bg-green-50 text-green-600 border-green-200">
                                Besvart
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[8px] bg-amber-50 text-amber-600 border-amber-200">
                                Venter svar
                              </Badge>
                            )
                          )}
                          {/* Review status on request_info */}
                          {isRequestInfo && m.review_status === "approved" && (
                            <Badge variant="outline" className="text-[8px] bg-green-50 text-green-600 border-green-200">
                              ✓ Vurdert OK
                            </Badge>
                          )}
                          {isRequestInfo && m.review_status === "insufficient" && (
                            <Badge variant="outline" className="text-[8px] bg-red-50 text-red-600 border-red-200">
                              Utilstrekkelig
                            </Badge>
                          )}
                          {!isSystem && (
                            <MessageReadStatus
                              messageId={m.id}
                              senderUserId={m.sender_user_id || null}
                              senderType={isCustomer ? "customer" : isSystem ? "system" : "internal"}
                              isSharedWithCustomer={!!m.is_visible_to_customer || isCustomer}
                              isLastInThread={m.id === latestMessageId}
                              participants={conversation.participants}
                              readsForMessage={conversation.readsByMessage.get(m.id)}
                              className="ml-auto"
                            />
                          )}
                        </div>

                        {/* Admin review actions: show on request_info that has been replied to but not yet reviewed */}
                        {isRequestInfo && m.replied_at && !m.reviewed_at && (
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                            <span className="text-[10px] text-muted-foreground mr-auto">Kundesvar mottatt — vurder svaret:</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2 text-green-700 border-green-300 hover:bg-green-50"
                              onClick={async () => {
                                await supabase.from("order_form_messages")
                                  .update({
                                    reviewed_at: new Date().toISOString(),
                                    review_status: "approved",
                                    reviewed_by_user_id: user?.id,
                                  } as any)
                                  .eq("id", m.id);
                                await supabase.from("order_form_activity_log").insert({
                                  submission_id: id!,
                                  event_type: "request_info_reviewed",
                                  payload: { message_id: m.id, review_status: "approved" },
                                  created_by: user?.id,
                                } as any);
                                qc.invalidateQueries({ queryKey: ["order-form-messages", id] });
                                toast.success("Kundesvar godkjent");
                              }}
                            >
                              <UserCheck className="h-3 w-3 mr-1" />
                              Informasjon er tilstrekkelig
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2 text-amber-700 border-amber-300 hover:bg-amber-50"
                              onClick={async () => {
                                await supabase.from("order_form_messages")
                                  .update({
                                    reviewed_at: new Date().toISOString(),
                                    review_status: "insufficient",
                                    reviewed_by_user_id: user?.id,
                                  } as any)
                                  .eq("id", m.id);
                                await supabase.from("order_form_activity_log").insert({
                                  submission_id: id!,
                                  event_type: "request_info_reviewed",
                                  payload: { message_id: m.id, review_status: "insufficient" },
                                  created_by: user?.id,
                                } as any);
                                qc.invalidateQueries({ queryKey: ["order-form-messages", id] });
                                setRequestInfoOpen(true);
                                toast.info("Åpner ny forespørsel...");
                              }}
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Be om mer info igjen
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Legacy comments (shown if no new messages, or internal ones) */}
              {(orderMessages as any[]).length === 0 && (
                <div className="space-y-3 mb-3 max-h-64 overflow-y-auto">
                  {comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Ingen meldinger ennå</p>
                  ) : (
                    comments.map((c: any) => (
                      <div key={c.id} className={`text-sm border-l-2 pl-3 ${
                        c.comment_type === "missing_info_request" ? "border-amber-400"
                        : c.visibility === "shared" || c.is_customer_reply ? "border-primary/60"
                        : "border-border"
                      }`}>
                        {c.comment_type === "missing_info_request" && (
                          <Badge variant="outline" className="text-[9px] mb-1 bg-amber-50 text-amber-700 border-amber-200">
                            Forespørsel sendt til bestiller
                          </Badge>
                        )}
                        {c.visibility === "shared" && !c.is_customer_reply && c.comment_type !== "missing_info_request" && (
                          <Badge variant="outline" className="text-[9px] mb-1 bg-primary/10 text-primary border-primary/20">
                            Synlig for bestiller
                          </Badge>
                        )}
                        {c.is_customer_reply && (
                          <Badge variant="outline" className="text-[9px] mb-1 bg-green-50 text-green-700 border-green-200">
                            Svar fra bestiller
                          </Badge>
                        )}
                        {!c.visibility || (c.visibility === "internal" && !c.is_customer_reply && c.comment_type !== "missing_info_request") ? (
                          <Badge variant="outline" className="text-[9px] mb-1 text-muted-foreground">
                            Intern
                          </Badge>
                        ) : null}
                        <p className="whitespace-pre-wrap">{c.body}</p>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(c.created_at), "d. MMM HH:mm", { locale: nb })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Internal-only comments when new messages exist */}
              {(orderMessages as any[]).length > 0 && comments.filter((c: any) => c.visibility === "internal" && !c.is_customer_reply && c.comment_type !== "missing_info_request").length > 0 && (
                <div className="space-y-2 mb-3 pt-2 border-t">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Interne notater</span>
                  {comments.filter((c: any) => c.visibility === "internal" && !c.is_customer_reply && c.comment_type !== "missing_info_request").map((c: any) => (
                    <div key={c.id} className="text-sm border-l-2 pl-3 border-border">
                      <Badge variant="outline" className="text-[9px] mb-1 text-muted-foreground">Intern</Badge>
                      <p className="whitespace-pre-wrap">{c.body}</p>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(c.created_at), "d. MMM HH:mm", { locale: nb })}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <Textarea
                  placeholder="Skriv melding..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="min-h-[60px] text-sm"
                />

                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>Legg ved bilder eller filer</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setCommentFiles((prev) => [...prev, ...files]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <SelectedFilesPreview
                    files={commentFiles}
                    onRemove={(i) => {
                      setCommentFiles((prev) => prev.filter((_, j) => j !== i));
                      setCommentFileNames((prev) => {
                        const next: Record<number, string> = {};
                        Object.entries(prev).forEach(([k, v]) => {
                          const idx = Number(k);
                          if (idx < i) next[idx] = v;
                          else if (idx > i) next[idx - 1] = v;
                        });
                        return next;
                      });
                    }}
                    displayNames={commentFileNames}
                    onDisplayNameChange={(i, v) =>
                      setCommentFileNames((prev) => ({ ...prev, [i]: v }))
                    }
                  />
                </div>



                {/* Row 1: Synlighet */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Synlighet</label>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={commentVisibility === "internal" ? "default" : "outline"}
                      className="text-xs h-7 gap-1.5"
                      onClick={() => setCommentVisibility("internal")}
                    >
                      <LockKeyhole className="h-3 w-3" />
                      Intern
                    </Button>
                    <Button
                      size="sm"
                      variant={commentVisibility === "shared" ? "default" : "outline"}
                      className="text-xs h-7 gap-1.5"
                      onClick={() => setCommentVisibility("shared")}
                    >
                      <Eye className="h-3 w-3" />
                      Delt med kunde
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {commentVisibility === "internal"
                      ? "Kun synlig for interne brukere med tilgang til bestillingen."
                      : "Synlig for bestiller på sporingssiden og for alle interne."}
                  </p>
                  {commentVisibility === "shared" && bestillerEpost && (
                    <div className="mt-2 flex items-center gap-2 p-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                      <Checkbox
                        id="send-email-now"
                        checked={sendEmailNotification}
                        onCheckedChange={(c) => setSendEmailNotification(!!c)}
                        className="h-4 w-4"
                      />
                      <label htmlFor="send-email-now" className="flex-1 cursor-pointer select-none">
                        <span className="text-xs font-medium flex items-center gap-1">
                          <Mail className="h-3 w-3 text-blue-600" />
                          Send e-postvarsel nå
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          {sendEmailNotification
                            ? `E-post sendes til ${bestillerEpost}`
                            : "Meldingen vises på kundesiden uten e-postvarsel"}
                        </p>
                      </label>
                    </div>
                  )}
                </div>

                {/* Row 2: Adressat */}
                {participants.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Adressat</label>
                    <Select value={addressedTo || "__none__"} onValueChange={(v) => setAddressedTo(v === "__none__" ? null : v)}>
                      <SelectTrigger className="h-8 text-xs w-48">
                        <SelectValue placeholder="Til alle" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Til alle</SelectItem>
                        {participants.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.role_label || "Deltaker"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {addressedTo && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">
                        Meldingen varsler og adresseres til valgt deltaker, men er fortsatt synlig for alle innen valgt synlighet.
                      </p>
                    )}
                  </div>
                )}

                {/* Row 3: Send */}
                <div className="flex items-center justify-end pt-1 border-t border-border/40">
                  <Button
                    size="sm"
                    disabled={(!comment.trim() && commentFiles.length === 0) || addComment.isPending}
                    onClick={() => addComment.mutate()}
                    className="gap-1.5"
                  >
                    {addComment.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {addComment.isPending ? "Sender…" : "Send melding"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Aktivitetslogg
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ingen aktivitet</p>
                ) : (
                  activity.map((a: any) => (
                    <div key={a.id} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {eventTypeLabels[a.event_type] || a.event_type}
                      </span>
                      {a.payload?.summary && (
                        <> · {a.payload.summary}</>
                      )}
                      {a.payload?.from && a.payload?.to && (
                        <> · {ORDER_STATUS_CONFIG[a.payload.from as OrderFormSubmissionStatus]?.label || a.payload.from} → {ORDER_STATUS_CONFIG[a.payload.to as OrderFormSubmissionStatus]?.label || a.payload.to}</>
                      )}
                      {a.payload?.assigned_to_name && !a.payload?.summary && (
                        <> · {a.payload.assigned_to_name}</>
                      )}
                      {a.payload?.recipients && (
                        <> · {(a.payload.recipients as string[]).join(", ")}</>
                      )}
                      {a.event_type === "fields_updated" && Array.isArray(a.payload?.changes) && (
                        <div className="mt-1 ml-2 space-y-0.5">
                          {a.payload.changes.map((c: any, i: number) => (
                            <div key={i} className="text-[11px]">
                              <span className="text-foreground">{c.label || c.field_key}:</span>{" "}
                              <span className="line-through text-muted-foreground/70">{c.old_display ?? "(tom)"}</span>
                              {" → "}
                              <span className="text-foreground">{c.new_display ?? "(tom)"}</span>
                            </div>
                          ))}
                          {a.payload.actor_name && (
                            <div className="text-[10px] italic">av {a.payload.actor_name} · manuelt etterfylt</div>
                          )}
                        </div>
                      )}
                      <br />
                      {format(new Date(a.created_at), "d. MMM HH:mm", { locale: nb })}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <RequestInfoDialog
        open={requestInfoOpen}
        onOpenChange={setRequestInfoOpen}
        submissionId={id!}
        submissionNo={submission.submission_no}
        bestillerEpost={bestillerEpost}
      />
      <EditFieldsDialog
        open={editFieldsOpen}
        onOpenChange={setEditFieldsOpen}
        submissionId={id!}
        submissionNo={submission.submission_no}
        sections={sections as any}
        valuesMap={valuesMap}
      />
      <RequestFieldsDialog
        open={requestFieldsOpen}
        onOpenChange={setRequestFieldsOpen}
        submissionId={id!}
        submissionNo={submission.submission_no}
        sections={sections as any}
        valuesMap={valuesMap}
        recipientEmail={resolvedRecipient.email}
        recipientName={resolvedRecipient.name}
      />
      <LinkExistingTaskDialog
        open={linkTaskOpen}
        onOpenChange={setLinkTaskOpen}
        submissionId={id!}
        submissionNo={submission.submission_no}
        submissionCompanyId={(sub as any).company_id}
        customerId={(sub as any).linked_customer_id}
        currentLinkedEventId={(sub as any).linked_event_id}
      />
      {/* ConvertDialog removed — now uses /orders/:id/convert route */}
      <TripletexExportPanel
        open={tripletexOpen}
        onOpenChange={setTripletexOpen}
        submissionId={id!}
        values={valuesMap}
        summary={submission.summary as Record<string, any> | null}
        submissionNo={submission.submission_no}
      />
      <AssignResourceTaskDialog
        open={assignTaskOpen}
        onOpenChange={setAssignTaskOpen}
        submissionId={id!}
        submissionNo={submission.submission_no}
        summary={submission.summary as Record<string, any> | null}
        values={valuesMap}
        attachments={attachments as any[]}
        bestillerEpost={bestillerEpost || undefined}
        autoNotifyDefault={!!(submission as any).auto_notify_on_status_change}
      />
      <AttachmentPreviewDrawer
        open={previewAttIdx !== null}
        onClose={() => setPreviewAttIdx(null)}
        attachments={activeAttachments as any[]}
        initialIndex={previewAttIdx ?? 0}
        urlResolver={(att) => resolveOrderAttachmentSignedUrl(att as any)}
        onRename={(att) => setRenameTarget(att as any)}
      />
      <AttachmentRenameDialog
        open={renameTarget !== null}
        onOpenChange={(o) => !o && setRenameTarget(null)}
        attachment={renameTarget}
        saving={renameAttachment.isPending}
        onSubmit={async ({ displayName, description }) => {
          if (!renameTarget) return;
          await renameAttachment.mutateAsync({
            id: renameTarget.id,
            displayName,
            description,
          });
        }}
      />
    </div>
  );
}

const IMAGE_EXT_FOR_STORAGE = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i;

function imageStemForStorage(name: string) {
  return name
    .replace(/\.[^.]+$/i, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

async function resolveOrderAttachmentSignedUrl(attachment: any): Promise<string | null> {
  const path = attachment.file_path || attachment.storage_path;
  if (!path) return null;
  const first = await supabase.storage.from("order-form-attachments").createSignedUrl(path, 600);
  if (!first.error && first.data?.signedUrl) return first.data.signedUrl;

  if (!isImageAttachment(attachment)) return null;
  const slash = path.lastIndexOf("/");
  const folder = slash > 0 ? path.slice(0, slash) : "";
  if (!folder) return null;
  const wanted = imageStemForStorage(attachment.file_name || "");
  const { data, error } = await supabase.storage.from("order-form-attachments").list(folder, {
    limit: 100,
    sortBy: { column: "name", order: "desc" },
  });
  if (error || !data) return null;
  const match = data.find((obj) => IMAGE_EXT_FOR_STORAGE.test(obj.name) && imageStemForStorage(obj.name).includes(wanted));
  if (!match) return null;
  const fallback = await supabase.storage.from("order-form-attachments").createSignedUrl(`${folder}/${match.name}`, 600);
  return fallback.data?.signedUrl || null;
}

function AttachmentRow({
  attachment,
  onPreview,
  onRemove,
  onRename,
}: {
  attachment: any;
  onPreview?: () => void;
  onRemove?: () => void;
  onRename?: () => void;
}) {
  const isImage = isImageAttachment(attachment);
  const [url, setUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const label = attachmentLabel(attachment);
  const originalName = attachment.original_filename || attachment.file_name;
  const showOriginal = !!attachment.display_name && originalName && originalName !== label;

  useEffect(() => {
    let cancelled = false;
    const path = attachment.file_path || attachment.storage_path;
    if (!path || !isImage) return;
    setLoadingUrl(true);
    resolveOrderAttachmentSignedUrl(attachment)
      .then((signedUrl) => {
        if (cancelled) return;
        if (!signedUrl) {
          console.warn("[admin-attachments-render-debug] thumbnail failed", {
            id: attachment.id,
            file_name: attachment.file_name,
          });
          setUrl(null);
        } else {
          setUrl(signedUrl);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingUrl(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.file_path, attachment.storage_path, attachment.file_name, isImage]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const signedUrl = await resolveOrderAttachmentSignedUrl(attachment);
    if (!signedUrl) {
      toast.error("Kunne ikke åpne vedlegget");
      return;
    }
    window.open(signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="group relative rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors">
      <button
        type="button"
        onClick={() => onPreview?.()}
        className="flex items-center gap-3 text-sm p-2.5 pr-20 sm:pr-16 w-full text-left cursor-pointer"
      >
        <div className="h-14 w-14 rounded-lg border border-border/60 bg-background overflow-hidden flex items-center justify-center shrink-0">
          {isImage && url ? (
            <img src={url} alt={attachment.file_name} className="h-full w-full object-cover" loading="lazy" />
          ) : isImage && loadingUrl ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate font-medium" title={showOriginal ? `Originalfil: ${originalName}` : label}>{label}</span>
          <span className="block text-[10px] text-muted-foreground truncate">
            {showOriginal ? `${originalName}` : (isImage ? "Bilde" : "Fil")}
            {attachment.file_size ? ` · ${formatBytes(attachment.file_size)}` : ""}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={handleDownload}
        aria-label={`Last ned ${label}`}
        title="Last ned"
        className="absolute top-1/2 -translate-y-1/2 right-[4.75rem] sm:right-[4.25rem] h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-background border border-transparent hover:border-border flex items-center justify-center cursor-pointer"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      {onRename && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
          aria-label={`Endre navn på ${label}`}
          title="Endre visningsnavn"
          className="absolute top-1/2 -translate-y-1/2 right-10 sm:right-9 h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-background border border-transparent hover:border-border flex items-center justify-center cursor-pointer"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Fjern ${label}`}
          title="Fjern vedlegg"
          className="absolute top-1/2 -translate-y-1/2 right-1.5 h-8 min-w-8 px-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
          <span className="ml-1 text-xs sm:hidden">Fjern</span>
        </button>
      )}
    </div>
  );
}

function renderFieldValue(val: any, type: string): string {
  if (type === "pricing_model") return formatPricingModel(val);
  if (val == null) return "–";
  if (typeof val === "boolean") return val ? "Ja" : "Nei";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

// ─── Inline flow-trail wrapper for a bestilling ───
function OrderFlowTrail({
  submissionId,
  submissionNo,
  sourceLeadId,
  convertedToId,
  convertedToType,
}: {
  submissionId: string;
  submissionNo: string | null;
  sourceLeadId: string | null;
  convertedToId: string | null;
  convertedToType: string | null;
}) {
  const { steps } = useFlowChain({
    leadId: sourceLeadId,
    orderSubmissionId: submissionId,
    orderSubmissionNo: submissionNo,
    orderConvertedToId: convertedToId,
    orderConvertedToType: convertedToType,
  });
  if (!sourceLeadId && !convertedToId) return null;
  if (steps.length <= 1) return null;
  return <FlowTrail steps={steps} />;
}
