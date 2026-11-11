import {
  mapToExternalStatus,
  type ExternalStatus,
  type OrderFormSubmissionStatus,
} from "@/types/order-forms";

type SenderType = "admin" | "customer" | "system";
type MessageType = "message" | "request_info" | "system";

interface OrderMessageLike {
  id?: string;
  body?: string | null;
  sender_type?: string | null;
  sender_name?: string | null;
  message_type?: string | null;
  requires_reply?: boolean | null;
  replied_at?: string | null;
  reviewed_at?: string | null;
  review_status?: string | null;
  created_at?: string | null;
  is_visible_to_customer?: boolean | null;
  visibility?: string | null;
  addressed_to_participant_id?: string | null;
  sender_participant_id?: string | null;
}

interface LegacyCommentLike {
  id?: string;
  body?: string | null;
  comment_type?: string | null;
  visibility?: string | null;
  is_customer_reply?: boolean | null;
  author_name?: string | null;
  created_at?: string | null;
}

export interface UnifiedOrderConversationMessage {
  id: string;
  body: string;
  sender_type: SenderType;
  sender_name: string | null;
  message_type: MessageType;
  requires_reply: boolean;
  replied_at: string | null;
  reviewed_at: string | null;
  review_status: string | null;
  created_at: string;
  is_visible_to_customer: boolean;
  source: "messages" | "legacy";
  visibility: "internal" | "shared";
  addressed_to_participant_id: string | null;
}

export interface DerivedOrderConversationState {
  source: "messages" | "legacy" | "none";
  conversation: UnifiedOrderConversationMessage[];
  hasOpenRequest: boolean;
  hasUnreviewedReply: boolean;
  latestCustomerReplyAt: string | null;
  effectiveInternalStatus: OrderFormSubmissionStatus;
  effectiveExternalStatus: ExternalStatus;
  statusSyncTarget: OrderFormSubmissionStatus | null;
}

const ORDER_STATUSES: OrderFormSubmissionStatus[] = [
  "new",
  "under_review",
  "missing_info",
  "waiting_customer",
  "waiting_internal",
  "ready_for_planning",
  "task_created",
  "in_progress",
  "closed",
  "rejected",
];

const REVIEWABLE_STATUSES: OrderFormSubmissionStatus[] = [
  "new",
  "under_review",
  "missing_info",
  "waiting_customer",
  "waiting_internal",
];

function isOrderStatus(value: string | null | undefined): value is OrderFormSubmissionStatus {
  return !!value && ORDER_STATUSES.includes(value as OrderFormSubmissionStatus);
}

function toOrderStatus(value: string | null | undefined): OrderFormSubmissionStatus {
  return isOrderStatus(value) ? value : "new";
}

function normalizeText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function stripLegacyRequestPrefix(value: string | null | undefined) {
  return (value || "")
    .replace(/^forespørsel om mer informasjon:\s*/i, "")
    .trim();
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function senderKindGroup(senderType: SenderType | string | null | undefined): "staff" | "customer" | "system" | "other" {
  const t = (senderType || "").toString();
  if (t === "admin" || t === "internal") return "staff";
  if (t === "customer") return "customer";
  if (t === "system") return "system";
  return "other";
}

function looksLikeDuplicate(
  candidate: UnifiedOrderConversationMessage,
  existing: UnifiedOrderConversationMessage,
) {
  // Treat admin/internal as same kind so the legacy comment mirror (sender_type=admin)
  // is deduped against the canonical order_form_messages row (sender_type=internal).
  if (senderKindGroup(candidate.sender_type) !== senderKindGroup(existing.sender_type)) return false;
  if (candidate.message_type !== existing.message_type) return false;

  const bodyA = normalizeText(candidate.body);
  const bodyB = normalizeText(existing.body);
  const bodyMatch = bodyA === bodyB || bodyA.includes(bodyB) || bodyB.includes(bodyA);
  if (!bodyMatch) return false;

  return Math.abs(toTimestamp(candidate.created_at) - toTimestamp(existing.created_at)) <= 5 * 60 * 1000;
}

export function buildUnifiedOrderConversation(
  orderMessages: OrderMessageLike[] = [],
  legacyComments: LegacyCommentLike[] = [],
): UnifiedOrderConversationMessage[] {
  const normalizedMessages: UnifiedOrderConversationMessage[] = orderMessages
    .filter((message) => message?.created_at)
    .map((message): UnifiedOrderConversationMessage => ({
      id: String(message.id),
      body: message.body || "",
      sender_type: (message.sender_type as SenderType) || "admin",
      sender_name: message.sender_name || null,
      message_type: (message.message_type as MessageType) || "message",
      requires_reply: !!message.requires_reply,
      replied_at: message.replied_at || null,
      reviewed_at: message.reviewed_at || null,
      review_status: message.review_status || null,
      created_at: String(message.created_at),
      is_visible_to_customer: !!message.is_visible_to_customer,
      source: "messages" as const,
      visibility: (message.visibility as "internal" | "shared") || "internal",
      addressed_to_participant_id: message.addressed_to_participant_id || null,
    }));

  const legacyCandidates: UnifiedOrderConversationMessage[] = legacyComments
    .filter((comment) => comment?.created_at)
    .filter(
      (comment) =>
        comment.comment_type === "missing_info_request" ||
        comment.visibility === "shared" ||
        !!comment.is_customer_reply,
    )
    .map((comment): UnifiedOrderConversationMessage => {
      const isCustomerReply = !!comment.is_customer_reply;
      const isRequestInfo = comment.comment_type === "missing_info_request";

      return {
        id: String(comment.id),
        body: isRequestInfo ? stripLegacyRequestPrefix(comment.body) : comment.body || "",
        sender_type: (isCustomerReply ? "customer" : "admin") as SenderType,
        sender_name: isCustomerReply
          ? (comment.author_name || "Du")
          : (comment.author_name || "Saksbehandler"),
        message_type: (isRequestInfo ? "request_info" : "message") as MessageType,
        requires_reply: isRequestInfo,
        replied_at: null,
        reviewed_at: null,
        review_status: null,
        created_at: String(comment.created_at),
        is_visible_to_customer:
          isRequestInfo || comment.visibility === "shared" || !!comment.is_customer_reply,
        source: "legacy" as const,
        visibility: (comment.visibility === "shared" || isRequestInfo || isCustomerReply) ? "shared" : "internal",
        addressed_to_participant_id: null,
      };
    })
    .filter((candidate) => !normalizedMessages.some((existing) => looksLikeDuplicate(candidate, existing)));

  const combined = [...normalizedMessages, ...legacyCandidates].sort(
    (a, b) => toTimestamp(a.created_at) - toTimestamp(b.created_at),
  );

  const byId = new Map(combined.map((message) => [message.id, { ...message }]));
  const pendingRequestIds: string[] = [];

  for (const message of combined) {
    const current = byId.get(message.id);
    if (!current) continue;

    if (current.message_type === "request_info" && current.requires_reply) {
      if (!current.replied_at) {
        pendingRequestIds.push(current.id);
      }
      continue;
    }

    if (current.sender_type === "customer" && pendingRequestIds.length > 0) {
      const requestId = pendingRequestIds[pendingRequestIds.length - 1];
      const request = byId.get(requestId);
      if (request && !request.replied_at && toTimestamp(current.created_at) >= toTimestamp(request.created_at)) {
        request.replied_at = current.created_at;
        pendingRequestIds.pop();
      }
    }
  }

  return combined.map((message) => byId.get(message.id) || message);
}

/** A real reply from the customer side – never Postkontoret/system forwards. */
export function isGenuineCustomerReply(m: { sender_type?: string | null; sender_name?: string | null; message_type?: string | null }): boolean {
  if (m.sender_type !== "customer") return false;
  if (m.message_type === "system") return false;
  if (/postkontor/i.test(m.sender_name || "")) return false;
  return true;
}

export function deriveOrderConversationState(
  submissionStatus: string | null | undefined,
  orderMessages: OrderMessageLike[] = [],
  legacyComments: LegacyCommentLike[] = [],
  statusChangedAt?: string | null,
): DerivedOrderConversationState {
  const rawStatus = toOrderStatus(submissionStatus);
  const conversation = buildUnifiedOrderConversation(orderMessages, legacyComments);
  const requestMessages = conversation.filter((message) => message.message_type === "request_info" && message.requires_reply);
  const hasOpenRequest = requestMessages.some((message) => !message.replied_at);
  const hasUnreviewedReply = requestMessages.some((message) => !!message.replied_at && !message.reviewed_at);
  const latestCustomerReplyAt =
    [...conversation].reverse().find((message) => message.sender_type === "customer")?.created_at || null;

  // A manual "waiting for customer"/"missing info" status only resolves on a
  // GENUINE customer reply written after that status was set. Postkontoret's
  // forwarded order e-mail and older replies never count.
  const changedMs = statusChangedAt ? new Date(statusChangedAt).getTime() : NaN;
  const hasCustomerReplyAfterStatus = conversation.some(
    (m) =>
      isGenuineCustomerReply(m) &&
      (Number.isNaN(changedMs) ? false : new Date(m.created_at).getTime() > changedMs),
  );

  let effectiveInternalStatus = rawStatus;

  if (hasOpenRequest && rawStatus !== "closed" && rawStatus !== "rejected") {
    effectiveInternalStatus = "missing_info";
  } else if (
    ((hasUnreviewedReply && REVIEWABLE_STATUSES.includes(rawStatus)) ||
      ((rawStatus === "missing_info" || rawStatus === "waiting_customer") && !hasOpenRequest && hasCustomerReplyAfterStatus)) &&
    rawStatus !== "closed" &&
    rawStatus !== "rejected"
  ) {
    effectiveInternalStatus = "under_review";
  }

  const effectiveExternalStatus = hasOpenRequest
    ? "needs_info"
    : mapToExternalStatus(effectiveInternalStatus);

  const statusSyncTarget =
    (rawStatus === "missing_info" || rawStatus === "waiting_customer") &&
    effectiveInternalStatus === "under_review"
      ? "under_review"
      : null;

  const source: DerivedOrderConversationState["source"] = orderMessages.length
    ? "messages"
    : legacyComments.length
      ? "legacy"
      : "none";

  return {
    source,
    conversation,
    hasOpenRequest,
    hasUnreviewedReply,
    latestCustomerReplyAt,
    effectiveInternalStatus,
    effectiveExternalStatus,
    statusSyncTarget,
  };
}