import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isSystemCaller } from "../_shared/system-caller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Escalation windows
const IMPORTANT_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours
const URGENT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// Max reminders per message per user
const MAX_REMINDERS: Record<string, number> = {
  important: 1,
  urgent: 2,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: service-role, pg_cron shared secret, or global superadmin only
  if (!(await isSystemCaller(supabase, supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, req.headers.get("Authorization")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(msg);
  };

  log("=== ESCALATION RUN START ===");

  try {
    // 1. Fetch candidate messages: important/urgent, not system_event, created within reasonable window (24h)
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data: candidates, error: msgErr } = await supabase
      .from("task_messages")
      .select("id, thread_id, task_id, company_id, priority, author_user_id, author_name, body, message_type, metadata, created_at")
      .in("priority", ["important", "urgent"])
      .neq("message_type", "system_event")
      .gte("created_at", cutoff24h)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (msgErr) throw msgErr;

    log(`Found ${candidates?.length ?? 0} candidate messages`);

    if (!candidates || candidates.length === 0) {
      log("No candidates, exiting.");
      return new Response(JSON.stringify({ ok: true, logs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Collect unique task IDs to find relevant users
    const taskIds = [...new Set(candidates.map((m: any) => m.task_id))];

    // Get relevant users per task (technicians + participants)
    const { data: techRows } = await supabase
      .from("event_technicians")
      .select("event_id, technician_id, technicians!inner(user_id)")
      .in("event_id", taskIds);

    const { data: participantRows } = await supabase
      .from("job_participants")
      .select("job_id, user_id")
      .in("job_id", taskIds);

    // Build task -> user_ids map
    const taskUsers = new Map<string, Set<string>>();
    for (const tid of taskIds) {
      taskUsers.set(tid, new Set());
    }
    if (techRows) {
      for (const row of techRows as any[]) {
        const uid = row.technicians?.user_id;
        if (uid) taskUsers.get(row.event_id)?.add(uid);
      }
    }
    if (participantRows) {
      for (const row of participantRows as any[]) {
        if (row.user_id) taskUsers.get(row.job_id)?.add(row.user_id);
      }
    }

    // 3. Fetch thread reads for relevant threads
    const threadIds = [...new Set(candidates.map((m: any) => m.thread_id))];
    const { data: reads } = await supabase
      .from("task_thread_reads")
      .select("thread_id, user_id, last_read_at")
      .in("thread_id", threadIds);

    // Build thread+user -> last_read_at
    const readMap = new Map<string, string>();
    if (reads) {
      for (const r of reads as any[]) {
        readMap.set(`${r.thread_id}:${r.user_id}`, r.last_read_at);
      }
    }

    // 4. Fetch existing escalations for these messages
    const msgIds = candidates.map((m: any) => m.id);
    const { data: existingEscalations } = await supabase
      .from("task_thread_escalations")
      .select("message_id, user_id, reminder_count")
      .in("message_id", msgIds);

    const escMap = new Map<string, number>();
    if (existingEscalations) {
      for (const e of existingEscalations as any[]) {
        escMap.set(`${e.message_id}:${e.user_id}`, e.reminder_count);
      }
    }

    // 5. Check if messages have led to actions (system_events with source_message_id)
    const { data: actionEvents } = await supabase
      .from("task_messages")
      .select("metadata")
      .eq("message_type", "system_event")
      .in("task_id", taskIds);

    const actedMessageIds = new Set<string>();
    if (actionEvents) {
      for (const ae of actionEvents as any[]) {
        const srcId = ae.metadata?.source_message_id;
        if (srcId) actedMessageIds.add(srcId);
      }
    }

    // 6. Process each candidate
    let created = 0;
    let skipped = 0;

    for (const msg of candidates as any[]) {
      const priority = msg.priority as string;
      const windowMs = priority === "urgent" ? URGENT_WINDOW_MS : IMPORTANT_WINDOW_MS;
      const maxReminders = MAX_REMINDERS[priority] ?? 0;
      const msgAge = now.getTime() - new Date(msg.created_at).getTime();

      if (msgAge < windowMs) {
        log(`SKIP msg=${msg.id.slice(0, 8)} (${priority}): not yet past window (${Math.round(msgAge / 60000)}m < ${Math.round(windowMs / 60000)}m)`);
        skipped++;
        continue;
      }

      // Skip if action already created from this message
      if (actedMessageIds.has(msg.id)) {
        log(`SKIP msg=${msg.id.slice(0, 8)}: action already created`);
        skipped++;
        continue;
      }

      const users = taskUsers.get(msg.task_id);
      if (!users || users.size === 0) {
        log(`SKIP msg=${msg.id.slice(0, 8)}: no relevant users`);
        skipped++;
        continue;
      }

      for (const userId of users) {
        // Skip self
        if (userId === msg.author_user_id) continue;

        // Check if user has read it
        const lastRead = readMap.get(`${msg.thread_id}:${userId}`);
        if (lastRead && new Date(lastRead) >= new Date(msg.created_at)) {
          continue; // Already read
        }

        // Check existing escalation count
        const key = `${msg.id}:${userId}`;
        const currentCount = escMap.get(key) ?? 0;
        if (currentCount >= maxReminders) {
          continue; // Max reached
        }

        // Get task title for notification
        const { data: task } = await supabase
          .from("events")
          .select("title, company_id")
          .eq("id", msg.task_id)
          .single();

        const taskTitle = task?.title || "Oppgave";
        const companyId = task?.company_id || msg.company_id;

        const notifType = priority === "urgent"
          ? "task_thread_reminder_urgent"
          : "task_thread_reminder_important";

        const notifTitle = priority === "urgent"
          ? `🔴 Haster: melding krever oppfølging – ${taskTitle}`
          : `⚠️ Viktig melding er fortsatt ikke lest – ${taskTitle}`;

        const notifBody = msg.body ? msg.body.slice(0, 200) : "";
        const linkUrl = `/projects/plan?openTask=${msg.task_id}&tab=thread&messageId=${msg.id}`;

        const notifPriority = priority === "urgent" ? "critical" : "important";

        // Create notification
        const { error: notifErr } = await supabase
          .from("notifications")
          .insert({
            user_id: userId,
            company_id: companyId,
            type: notifType,
            priority: notifPriority,
            title: notifTitle,
            message: notifBody,
            link_url: linkUrl,
            entity_type: "task_thread",
            entity_id: msg.task_id,
            actor_user_id: msg.author_user_id,
            actor_name: msg.author_name,
          });

        if (notifErr) {
          log(`ERROR creating notification for user=${userId.slice(0, 8)} msg=${msg.id.slice(0, 8)}: ${notifErr.message}`);
          continue;
        }

        // Upsert escalation tracking
        const newCount = currentCount + 1;
        const { error: escErr } = await supabase
          .from("task_thread_escalations")
          .upsert(
            {
              message_id: msg.id,
              user_id: userId,
              reminder_count: newCount,
              last_reminded_at: now.toISOString(),
            },
            { onConflict: "message_id,user_id" },
          );

        if (escErr) {
          log(`ERROR upserting escalation: ${escErr.message}`);
        } else {
          escMap.set(key, newCount);
          created++;
          log(`ESCALATED msg=${msg.id.slice(0, 8)} user=${userId.slice(0, 8)} priority=${priority} reminder #${newCount}`);
        }
      }
    }

    log(`=== ESCALATION RUN DONE: ${created} reminders created, ${skipped} messages skipped ===`);

    return new Response(
      JSON.stringify({ ok: true, created, skipped, logs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    log(`FATAL ERROR: ${err.message}`);
    console.error(err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message, logs }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
