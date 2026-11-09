/**
 * task-thread-daily-digest
 *
 * Daily digest email: sends one summary email per user listing their
 * unread task-thread messages (internal_message + inbound external_email).
 *
 * Triggered by pg_cron at ~15:30 CET daily.
 *
 * Selection logic:
 *  1. Find all users who are technicians or job participants on tasks
 *     that have task_threads with messages.
 *  2. For each user, compare task_thread_reads.last_read_at against
 *     task_messages.created_at to find unread messages.
 *  3. Exclude: own messages, system_event, messages < 30 min old.
 *  4. Skip user if digest already sent today.
 *  5. Group unread messages by task, build HTML, send via Graph.
 *  6. Log delivery to task_thread_digest_deliveries.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isExactServiceBearer } from "../_shared/security-boundary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const MAILBOX = "postkontoret@mcsservice.no";
const APP_BASE_URL = "https://mcsressurs.lovable.app";
const FRESHNESS_MINUTES = 30; // ignore messages younger than this

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Auth: require service_role or admin ──
    const authHeader = req.headers.get("authorization") || "";
    const isServiceRole = isExactServiceBearer(authHeader, serviceKey);
    if (!isServiceRole) {
      const jwt = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
      if (authErr || !user) return json({ error: "Unauthorized" }, 401);
      const { data: isAdmin } = await supabase.rpc("check_permission_v2", {
        _auth_user_id: user.id,
        _perm: "admin.manage_users",
      });
      if (!isAdmin) return json({ error: "Admin required" }, 403);
    }

    const today = new Date().toISOString().slice(0, 10);
    const cutoffTime = new Date(Date.now() - FRESHNESS_MINUTES * 60 * 1000).toISOString();

    console.log("[DailyDigest] Starting", { today, cutoffTime });

    // ── Step 1: Find all users with potential unread messages ──
    // Get all user_ids that have task_thread_reads entries (they've interacted with threads)
    // PLUS users assigned as technicians on tasks that have threads (they may not have read records yet)
    const { data: threadData } = await supabase
      .from("task_threads")
      .select("id, task_id, company_id");

    if (!threadData || threadData.length === 0) {
      console.log("[DailyDigest] No task threads found. Skipping.");
      return json({ sent: 0, skipped: 0, reason: "no_threads" });
    }

    const threadIds = threadData.map((t: any) => t.id);
    const threadMap = new Map<string, { taskId: string; companyId: string }>();
    for (const t of threadData as any[]) {
      threadMap.set(t.id, { taskId: t.task_id, companyId: t.company_id });
    }

    // Get all relevant unread messages (not system_event, not too fresh)
    const { data: allMessages } = await supabase
      .from("task_messages")
      .select("id, thread_id, task_id, company_id, message_type, direction, author_user_id, author_name, body, created_at, priority")
      .in("thread_id", threadIds)
      .in("message_type", ["internal_message", "external_email"])
      .is("deleted_at", null)
      .lt("created_at", cutoffTime)
      .order("created_at", { ascending: false });

    if (!allMessages || allMessages.length === 0) {
      console.log("[DailyDigest] No eligible messages found. Skipping.");
      return json({ sent: 0, skipped: 0, reason: "no_messages" });
    }

    // Filter: only internal_message and inbound external_email
    const eligibleMessages = (allMessages as any[]).filter((m) => {
      if (m.message_type === "internal_message") return true;
      if (m.message_type === "external_email" && m.direction === "inbound") return true;
      return false;
    });

    if (eligibleMessages.length === 0) {
      console.log("[DailyDigest] No eligible messages after filtering. Skipping.");
      return json({ sent: 0, skipped: 0, reason: "no_eligible_messages" });
    }

    // ── Step 2: Find candidate users ──
    // Users who are technicians on tasks with threads, or who have read records
    const taskIds = [...new Set(threadData.map((t: any) => t.task_id))];

    const { data: techLinks } = await supabase
      .from("event_technicians")
      .select("technician_id, event_id, technicians(id, user_id, name, email)")
      .in("event_id", taskIds);

    const { data: participants } = await supabase
      .from("job_participants")
      .select("user_id, job_id")
      .in("job_id", taskIds);

    // Build user -> tasks mapping
    type UserCandidate = {
      userId: string;
      email: string;
      name: string;
      taskIds: Set<string>;
    };
    const userCandidates = new Map<string, UserCandidate>();

    for (const link of (techLinks || []) as any[]) {
      const tech = link.technicians;
      if (!tech?.user_id || !tech?.email) continue;
      if (!userCandidates.has(tech.user_id)) {
        userCandidates.set(tech.user_id, {
          userId: tech.user_id,
          email: tech.email,
          name: tech.name || "",
          taskIds: new Set(),
        });
      }
      userCandidates.get(tech.user_id)!.taskIds.add(link.event_id);
    }

    // Also add participants
    for (const p of (participants || []) as any[]) {
      if (!p.user_id) continue;
      if (!userCandidates.has(p.user_id)) {
        // Need to look up email for this user
        const { data: ua } = await supabase
          .from("user_accounts")
          .select("auth_user_id, people(full_name, email)")
          .eq("auth_user_id", p.user_id)
          .eq("is_active", true)
          .maybeSingle();
        const person = (ua as any)?.people;
        if (!person?.email) continue;
        userCandidates.set(p.user_id, {
          userId: p.user_id,
          email: person.email,
          name: person.full_name || "",
          taskIds: new Set(),
        });
      }
      userCandidates.get(p.user_id)!.taskIds.add(p.job_id);
    }

    if (userCandidates.size === 0) {
      console.log("[DailyDigest] No user candidates found.");
      return json({ sent: 0, skipped: 0, reason: "no_candidates" });
    }

    // ── Step 3: Get read records for all candidates ──
    const userIds = [...userCandidates.keys()];
    const { data: readRecords } = await supabase
      .from("task_thread_reads")
      .select("thread_id, user_id, last_read_at")
      .in("user_id", userIds);

    const readMap = new Map<string, string>(); // "userId:threadId" -> last_read_at
    for (const r of (readRecords || []) as any[]) {
      readMap.set(`${r.user_id}:${r.thread_id}`, r.last_read_at);
    }

    // ── Step 4: Check existing digests for today ──
    const { data: existingDigests } = await supabase
      .from("task_thread_digest_deliveries")
      .select("user_id")
      .eq("summary_date", today)
      .eq("digest_type", "task_thread_daily_summary")
      .in("user_id", userIds);

    const alreadySent = new Set((existingDigests || []).map((d: any) => d.user_id));

    // ── Step 5: Get task details for email content ──
    const { data: tasks } = await supabase
      .from("events")
      .select("id, title, customer, internal_number, company_id, start_time")
      .in("id", taskIds)
      .is("deleted_at", null);

    const taskInfoMap = new Map<string, any>();
    for (const t of (tasks || []) as any[]) {
      taskInfoMap.set(t.id, t);
    }

    // ── Step 6: Process each user ──
    const graphToken = await getGraphToken();
    if (graphToken.error) {
      console.error("[DailyDigest] Graph token error:", graphToken.error);
      return json({ error: "Graph token failed" }, 500);
    }

    let sentCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const [userId, candidate] of userCandidates) {
      try {
        // Skip if already sent today
        if (alreadySent.has(userId)) {
          skippedCount++;
          continue;
        }

        // Find unread messages for this user
        type UnreadTask = {
          taskId: string;
          taskTitle: string;
          customer: string;
          internalNumber: string;
          companyId: string;
          startTime: string | null;
          unreadCount: number;
          lastActivity: string;
          lastAuthor: string;
          lastMessageType: string;
          maxPriority: string;
        };

        const unreadByTask = new Map<string, UnreadTask>();
        const priorityRank: Record<string, number> = { urgent: 3, important: 2, normal: 1 };

        for (const msg of eligibleMessages) {
          const threadInfo = threadMap.get(msg.thread_id);
          if (!threadInfo) continue;

          if (!candidate.taskIds.has(threadInfo.taskId)) continue;
          if (msg.author_user_id === userId) continue;

          const readKey = `${userId}:${msg.thread_id}`;
          const lastReadAt = readMap.get(readKey);
          if (lastReadAt && new Date(msg.created_at) <= new Date(lastReadAt)) continue;

          const taskInfo = taskInfoMap.get(threadInfo.taskId);
          if (!taskInfo) continue;

          const msgPriority = (msg as any).priority || "normal";

          if (!unreadByTask.has(threadInfo.taskId)) {
            unreadByTask.set(threadInfo.taskId, {
              taskId: threadInfo.taskId,
              taskTitle: taskInfo.title || "Oppgave",
              customer: taskInfo.customer || "",
              internalNumber: taskInfo.internal_number || "",
              companyId: taskInfo.company_id || "",
              startTime: taskInfo.start_time || null,
              unreadCount: 0,
              lastActivity: msg.created_at,
              lastAuthor: msg.author_name || "Ukjent",
              lastMessageType: msg.message_type,
              maxPriority: msgPriority,
            });
          }

          const entry = unreadByTask.get(threadInfo.taskId)!;
          entry.unreadCount++;
          if ((priorityRank[msgPriority] || 1) > (priorityRank[entry.maxPriority] || 1)) {
            entry.maxPriority = msgPriority;
          }
          if (new Date(msg.created_at) > new Date(entry.lastActivity)) {
            entry.lastActivity = msg.created_at;
            entry.lastAuthor = msg.author_name || "Ukjent";
            entry.lastMessageType = msg.message_type;
          }
        }

        if (unreadByTask.size === 0) {
          skippedCount++;
          continue;
        }

        // Sort: urgent first, then important, then normal, then by last activity
        const taskSummaries = [...unreadByTask.values()].sort((a, b) => {
          const pa = priorityRank[a.maxPriority] || 1;
          const pb = priorityRank[b.maxPriority] || 1;
          if (pa !== pb) return pb - pa;
          return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
        });
        const totalUnread = taskSummaries.reduce((sum, t) => sum + t.unreadCount, 0);

        const html = buildDigestHtml(candidate.name, taskSummaries, totalUnread);
        const subject = `Du har ${totalUnread} ${totalUnread === 1 ? "ulest melding" : "uleste meldinger"} i MCS`;

        const sendResult = await sendMailViaGraph(graphToken.token!, {
          subject,
          bodyHtml: html,
          recipients: [candidate.email],
          mailbox: MAILBOX,
        });

        if (sendResult.error) {
          console.error("[DailyDigest] Send failed for", candidate.email, sendResult.error);
          errors.push(`${candidate.email}: ${sendResult.error}`);
          continue;
        }

        // Log delivery
        await supabase.from("task_thread_digest_deliveries").insert({
          user_id: userId,
          company_id: taskSummaries[0]?.companyId || null,
          digest_type: "task_thread_daily_summary",
          summary_date: today,
          item_count: totalUnread,
          metadata: {
            tasks_count: taskSummaries.length,
            task_ids: taskSummaries.map((t) => t.taskId),
            recipient_email: candidate.email,
          },
        });

        sentCount++;
        console.log("[DailyDigest] Sent to", candidate.email, {
          tasks: taskSummaries.length,
          unread: totalUnread,
        });
      } catch (userErr: any) {
        console.error("[DailyDigest] Error processing user", userId, userErr?.message);
        errors.push(`${userId}: ${userErr?.message}`);
      }
    }

    console.log("[DailyDigest] Complete", { sent: sentCount, skipped: skippedCount, errors: errors.length });

    return json({
      sent: sentCount,
      skipped: skippedCount,
      candidates: userCandidates.size,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error("[DailyDigest] Fatal error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});

// ═══════════════════════════════════════════
// HTML Builder
// ═══════════════════════════════════════════

interface TaskSummary {
  taskId: string;
  taskTitle: string;
  customer: string;
  internalNumber: string;
  companyId: string;
  startTime: string | null;
  unreadCount: number;
  lastActivity: string;
  lastAuthor: string;
  lastMessageType: string;
  maxPriority: string;
}

function buildDigestHtml(userName: string, tasks: TaskSummary[], totalUnread: number): string {
  const greeting = userName ? `Hei ${userName.split(" ")[0]}` : "Hei";

  const taskRows = tasks
    .map((t) => {
      const lastTime = new Date(t.lastActivity).toLocaleDateString("nb-NO", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

      const taskRef = t.internalNumber || t.taskId.slice(0, 8);
      const titleDisplay = t.customer
        ? `${taskRef} ${t.customer} – ${t.taskTitle}`
        : `${taskRef} ${t.taskTitle}`;

      const typeLabel =
        t.lastMessageType === "external_email" ? "Svar fra montør" : "Intern melding";

      const taskDate = t.startTime ? new Date(t.startTime).toISOString().slice(0, 10) : "";
      const deepLinkParams = new URLSearchParams({
        openTask: t.taskId,
        companyId: t.companyId,
        tab: "thread",
        ...(taskDate ? { date: taskDate } : {}),
      });
      const deepLink = `${APP_BASE_URL}/projects/plan?${deepLinkParams.toString()}`;

      const priorityBadge = t.maxPriority === 'urgent'
        ? '<span style="display:inline-block;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;margin-left:8px;">🔴 HASTER</span>'
        : t.maxPriority === 'important'
        ? '<span style="display:inline-block;background:#fef3c7;color:#b45309;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;margin-left:8px;">⚠️ Viktig</span>'
        : '';

      return `
        <tr>
          <td style="padding: 16px 20px; border-bottom: 1px solid #f3f4f6;${t.maxPriority === 'urgent' ? ' border-left: 3px solid #dc2626;' : t.maxPriority === 'important' ? ' border-left: 3px solid #f59e0b;' : ''}">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  <p style="margin: 0 0 4px; font-weight: 600; color: #1a1a1a; font-size: 14px;">
                    ${escapeHtml(titleDisplay)}${priorityBadge}
                  </p>
                  <p style="margin: 0; color: #6b7280; font-size: 13px;">
                    ${t.unreadCount} ${t.unreadCount === 1 ? "ulest melding" : "uleste meldinger"}
                    · ${typeLabel}
                    · siste aktivitet: ${lastTime}
                  </p>
                  <p style="margin: 2px 0 0; color: #9ca3af; font-size: 12px;">
                    Sist fra: ${escapeHtml(t.lastAuthor)}
                  </p>
                </td>
                <td align="right" valign="middle" style="padding-left: 12px; white-space: nowrap;">
                  <a href="${deepLink}" target="_blank"
                     style="display: inline-block; background: #2563eb; color: #ffffff;
                            font-size: 13px; font-weight: 600; padding: 8px 18px;
                            border-radius: 6px; text-decoration: none;">
                    Åpne oppgave
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="nb">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table cellpadding="0" cellspacing="0" width="100%" style="background: #f3f4f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: #1e293b; padding: 24px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 700;">
                📋 Daglig oppsummering
              </h1>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding: 24px 20px 16px;">
              <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.5;">
                ${greeting}, du har <strong>${totalUnread} ${totalUnread === 1 ? "ulest melding" : "uleste meldinger"}</strong>
                fordelt på <strong>${tasks.length} ${tasks.length === 1 ? "oppgave" : "oppgaver"}</strong>
                som venter på din oppmerksomhet.
              </p>
            </td>
          </tr>

          <!-- Task list -->
          <tr>
            <td style="padding: 0 20px 16px;">
              <table cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <tr>
                  <td style="background: #f9fafb; padding: 12px 20px; border-bottom: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Oppgaver med uleste meldinger
                    </p>
                  </td>
                </tr>
                ${taskRows}
              </table>
            </td>
          </tr>

          <!-- Global CTA -->
          <tr>
            <td style="padding: 8px 20px 28px; text-align: center;">
              <a href="${APP_BASE_URL}/projects/plan" target="_blank"
                 style="display: inline-block; background: #1e293b; color: #ffffff;
                        font-size: 14px; font-weight: 600; padding: 12px 32px;
                        border-radius: 8px; text-decoration: none;">
                Åpne MCS
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f9fafb; padding: 16px 20px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.5;">
                Dette er en automatisk daglig oppsummering fra MCS Ressurs.<br/>
                Du mottar denne fordi du har uleste meldinger i oppgaver du er knyttet til.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ═══════════════════════════════════════════
// Graph API helpers
// ═══════════════════════════════════════════

async function getGraphToken(): Promise<{ token?: string; error?: string }> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    return { error: "Missing Azure credentials" };
  }
  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );
  const data = await resp.json();
  if (!data.access_token) {
    return { error: `Token failed (${resp.status}): ${data.error_description || data.error}` };
  }
  return { token: data.access_token };
}

interface SendOpts {
  subject: string;
  bodyHtml: string;
  recipients: string[];
  mailbox: string;
}

async function sendMailViaGraph(token: string, opts: SendOpts) {
  const endpoint = `https://graph.microsoft.com/v1.0/users/${opts.mailbox}/sendMail`;
  const payload = {
    message: {
      subject: opts.subject,
      body: { contentType: "HTML", content: opts.bodyHtml },
      toRecipients: opts.recipients.map((e) => ({ emailAddress: { address: e } })),
      internetMessageHeaders: [
        { name: "X-MCS-Entity", value: "daily_digest" },
        { name: "X-MCS-Digest-Type", value: "task_thread_daily_summary" },
      ],
    },
    saveToSentItems: false,
  };

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (resp.status === 202 || resp.ok) return {};
    const errBody = await resp.text();
    return { error: `Graph ${resp.status}: ${errBody}` };
  } catch (e) {
    return { error: `Network: ${String(e)}` };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
