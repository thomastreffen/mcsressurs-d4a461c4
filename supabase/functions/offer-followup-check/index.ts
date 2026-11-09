import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCronBearer, isExactServiceBearer } from "../_shared/security-boundary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface OfferRow {
  id: string;
  customer_name: string;
  project_title: string;
  status: string;
  total_price: number;
  created_by: string;
  lead_id: string | null;
  company_id: string | null;
  updated_at: string;
  created_at: string;
}

interface ActivityRow {
  offer_id: string;
  event_type: string;
  event_at: string;
  actor_type: string;
}

interface ExistingTask {
  offer_id: string;
  task_type: string;
  status: string;
  priority: string;
}

const SENT_NO_RESPONSE_DAYS = 5;
const HOT_LEAD_VIEW_THRESHOLD = 2;
const HOT_LEAD_RECENT_HOURS = 24;
const ACTIVE_CUSTOMER_NO_FOLLOWUP_DAYS = 2;
const NO_NEXT_STEP_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  // Auth: service-role / pg_cron shared secret (scheduled sweep) or any authenticated user
  // (UI single-offer trigger). Anonymous calls are rejected.
  const authHeader = req.headers.get("Authorization");
  const isSystem = isExactServiceBearer(authHeader, serviceKey) || (await isCronBearer(sb, authHeader));
  if (!isSystem) {
    const jwt = authHeader?.replace("Bearer ", "") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(jwt);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const singleOfferId = body.offer_id as string | undefined;

    // 1. Fetch active offers
    let offersQuery = sb
      .from("calculations")
      .select("id, customer_name, project_title, status, total_price, created_by, lead_id, company_id, updated_at, created_at")
      .is("deleted_at", null)
      .in("status", ["draft", "generated", "sent"]);

    if (singleOfferId) {
      offersQuery = offersQuery.eq("id", singleOfferId);
    }

    const { data: offers, error: offersErr } = await offersQuery.limit(200);
    if (offersErr) throw offersErr;
    if (!offers || offers.length === 0) {
      return new Response(JSON.stringify({ created: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const offerIds = offers.map((o: OfferRow) => o.id);

    // 2. Fetch customer activity for these offers
    const { data: activities } = await sb
      .from("offer_activity_events")
      .select("offer_id, event_type, event_at, actor_type")
      .in("offer_id", offerIds)
      .order("event_at", { ascending: false })
      .limit(1000);

    // 3. Fetch existing active followup tasks
    const { data: existingTasks } = await sb
      .from("offer_followup_tasks")
      .select("offer_id, task_type, status, priority")
      .in("offer_id", offerIds)
      .in("status", ["open", "snoozed"]);

    const activityByOffer = groupBy(activities || [], "offer_id");
    const tasksByOffer = groupBy(existingTasks || [], "offer_id");

    const now = Date.now();
    let created = 0;
    let skipped = 0;

    for (const offer of offers as OfferRow[]) {
      const offerActivities = (activityByOffer[offer.id] || []) as ActivityRow[];
      const offerTasks = (tasksByOffer[offer.id] || []) as ExistingTask[];

      const customerActivities = offerActivities.filter((a) => a.actor_type === "customer");
      const userActivities = offerActivities.filter((a) => a.actor_type === "user");

      const customerViewCount = customerActivities.filter((a) => a.event_type === "offer_viewed").length;
      const latestCustomerActivity = customerActivities[0];
      const latestUserActivity = userActivities[0];
      const daysSinceUpdate = (now - new Date(offer.updated_at).getTime()) / 86400000;

      const tasksToCreate: Array<{
        task_type: string;
        title: string;
        description: string;
        priority: string;
        due_days: number;
      }> = [];

      // A. Sent without response
      if (offer.status === "sent" && customerActivities.length === 0 && daysSinceUpdate > SENT_NO_RESPONSE_DAYS) {
        tasksToCreate.push({
          task_type: "offer_follow_up",
          title: `Følg opp sendt tilbud: ${offer.project_title}`,
          description: `Tilbudet til ${offer.customer_name} ble sendt for ${Math.floor(daysSinceUpdate)} dager siden uten respons.`,
          priority: daysSinceUpdate > 14 ? "high" : "medium",
          due_days: 0,
        });
      }

      // B. Hot lead - customer viewed 2+ times or recently
      if (customerViewCount >= HOT_LEAD_VIEW_THRESHOLD || (latestCustomerActivity && (now - new Date(latestCustomerActivity.event_at).getTime()) < HOT_LEAD_RECENT_HOURS * 3600000)) {
        const hasUserFollowup = latestUserActivity && latestCustomerActivity && new Date(latestUserActivity.event_at) > new Date(latestCustomerActivity.event_at);
        if (!hasUserFollowup) {
          tasksToCreate.push({
            task_type: "offer_hot_lead_follow_up",
            title: `Ring kunde – viser interesse: ${offer.customer_name}`,
            description: `Kunden har åpnet tilbudet ${customerViewCount} ${customerViewCount === 1 ? "gang" : "ganger"}. Siste aktivitet: ${latestCustomerActivity ? relativeTime(latestCustomerActivity.event_at) : "ukjent"}.`,
            priority: "urgent",
            due_days: 0,
          });
        }
      }

      // C. Active customer without followup
      if (customerActivities.length > 0 && !latestUserActivity) {
        const daysSinceCustomer = latestCustomerActivity ? (now - new Date(latestCustomerActivity.event_at).getTime()) / 86400000 : 999;
        if (daysSinceCustomer > ACTIVE_CUSTOMER_NO_FOLLOWUP_DAYS && daysSinceCustomer < 30) {
          tasksToCreate.push({
            task_type: "offer_active_customer_follow_up",
            title: `Følg opp aktiv kunde: ${offer.customer_name}`,
            description: `Kunden har vist aktivitet på tilbudet, men ingen oppfølging er registrert.`,
            priority: "medium",
            due_days: 0,
          });
        }
      }

      // E. No next step - active offer without any activity
      if (["draft", "generated"].includes(offer.status) && daysSinceUpdate > NO_NEXT_STEP_DAYS && offerActivities.length === 0) {
        tasksToCreate.push({
          task_type: "offer_next_step_missing",
          title: `Sett neste steg: ${offer.project_title}`,
          description: `Tilbudet har vært inaktivt i ${Math.floor(daysSinceUpdate)} dager uten planlagt oppfølging.`,
          priority: "low",
          due_days: 1,
        });
      }

      // Create tasks (with dedup via partial unique index)
      for (const task of tasksToCreate) {
        const existing = offerTasks.find((t) => t.task_type === task.task_type);
        if (existing) {
          // Update priority if escalated
          const priorityOrder = { low: 0, medium: 1, high: 2, urgent: 3 };
          if ((priorityOrder[task.priority as keyof typeof priorityOrder] || 0) > (priorityOrder[existing.priority as keyof typeof priorityOrder] || 0)) {
            await sb
              .from("offer_followup_tasks")
              .update({ priority: task.priority, description: task.description, updated_at: new Date().toISOString() })
              .eq("offer_id", offer.id)
              .eq("task_type", task.task_type)
              .in("status", ["open", "snoozed"]);
          }
          skipped++;
          continue;
        }

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + task.due_days);

        const { error: insertErr } = await sb.from("offer_followup_tasks").insert({
          offer_id: offer.id,
          company_id: offer.company_id,
          task_type: task.task_type,
          title: task.title,
          description: task.description,
          priority: task.priority,
          assigned_to: offer.created_by,
          due_date: dueDate.toISOString().split("T")[0],
          lead_id: offer.lead_id,
          customer_name: offer.customer_name,
          meta: {
            customer_view_count: customerViewCount,
            days_since_update: Math.floor(daysSinceUpdate),
          },
        });

        if (insertErr) {
          // Likely dedup constraint violation — that's fine
          if (insertErr.code === "23505") {
            skipped++;
          } else {
            console.error("Insert error:", insertErr);
          }
        } else {
          created++;
        }
      }
    }

    return new Response(JSON.stringify({ created, skipped, checked: offers.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("offer-followup-check error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function groupBy<T>(arr: T[], key: string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = (item as any)[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min siden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}t siden`;
  return `${Math.floor(hours / 24)}d siden`;
}
