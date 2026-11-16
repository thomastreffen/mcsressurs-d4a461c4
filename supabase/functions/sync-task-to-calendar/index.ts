import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { task_id, remove_user_id } = await req.json();
    if (!task_id) throw new Error("task_id required");

    // Handle removal: delete calendar event for specific user
    if (remove_user_id) {
      const { data: task } = await userClient.from("tasks").select("company_id").eq("id", task_id).maybeSingle();
      const { data: scope } = task ? await sb.rpc("has_company_access", { _uid: user.id,
        _company: task.company_id, _module: "resource_plan", _level: "edit" }) : { data: false };
      if (!scope) return new Response(JSON.stringify({ error: "Ingen tilgang" }), { status: 403, headers: corsHeaders });
      const { data: assignee } = await userClient.from("task_assignees")
        .select("*")
        .eq("task_id", task_id)
        .eq("user_id", remove_user_id)
        .not("calendar_event_id", "is", null)
        .limit(1)
        .single();

      if (assignee?.calendar_event_id) {
        let confirmed = false;
        let graphStatus: number | null = null;
        const { data: account } = await sb.from("user_accounts").select("auth_user_id")
          .eq("auth_user_id", remove_user_id).eq("is_active", true).maybeSingle();
        const { data: userData } = account ? await sb.auth.admin.getUserById(remove_user_id) : { data: null };
        const meta = userData?.user?.user_metadata;
        if (meta?.ms_access_token && Date.parse(meta.ms_expires_at ?? "") > Date.now() + 60000) {
          try {
            const deleted = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(assignee.calendar_event_id)}`, {
              method: "DELETE", headers: { Authorization: `Bearer ${meta.ms_access_token}` },
            });
            graphStatus = deleted.status;
            confirmed = deleted.status === 204 || deleted.status === 404;
          } catch { /* Unknown outcome: retain mapping for reconciliation. */ }
        }
        if (!confirmed) return new Response(JSON.stringify({ status: "reconciliation_required", graph_status: graphStatus,
          reason: graphStatus ? "graph_delete_rejected" : "delegated_delete_not_confirmed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        // Clear only after confirmed deletion or already absent.
        const cleanup = await sb.from("task_assignees").update({ calendar_event_id: null }).eq("id", assignee.id);
        if (cleanup.error) return new Response(JSON.stringify({ status: "reconciliation_required", reason: "mapping_cleanup_requires_reconciliation" }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ status: "removed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Standard sync: create/update events for all active assignees
    const [taskRes, assigneesRes] = await Promise.all([
      sb.from("tasks").select("*").eq("id", task_id).single(),
      sb.from("task_assignees").select("*").eq("task_id", task_id).is("removed_at", null),
    ]);

    const task = taskRes.data;
    if (!task) throw new Error("Task not found");
    if (!task.planned_start_at || !task.planned_end_at) {
      return new Response(JSON.stringify({ status: "skipped", reason: "no schedule" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const assignees = assigneesRes.data || [];
    if (assignees.length === 0) {
      return new Response(JSON.stringify({ status: "skipped", reason: "no assignees" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const azureClientId = Deno.env.get("AZURE_CLIENT_ID");
    const azureTenantId = Deno.env.get("AZURE_TENANT_ID");
    const azureClientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
    const hasMsIntegration = !!(azureClientId && azureTenantId && azureClientSecret);

    const results: any[] = [];

    for (const assignee of assignees) {
      if (hasMsIntegration) {
        const { data: userData } = await sb.auth.admin.getUserById(assignee.user_id);
        const msTokens = userData?.user?.user_metadata?.ms_tokens;

        if (msTokens?.access_token) {
          try {
            const eventBody = {
              subject: `[Oppgave] ${task.title}`,
              body: { contentType: "Text", content: task.description || "" },
              start: { dateTime: task.planned_start_at, timeZone: "Europe/Oslo" },
              end: { dateTime: task.planned_end_at, timeZone: "Europe/Oslo" },
              isReminderOn: true,
              reminderMinutesBeforeStart: 15,
            };

            const existingEventId = assignee.calendar_event_id;
            const method = existingEventId ? "PATCH" : "POST";
            const url = existingEventId
              ? `https://graph.microsoft.com/v1.0/me/events/${existingEventId}`
              : "https://graph.microsoft.com/v1.0/me/events";

            const msRes = await fetch(url, {
              method,
              headers: {
                Authorization: `Bearer ${msTokens.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(eventBody),
            });

            if (msRes.ok) {
              const msEvent = await msRes.json();
              await sb.from("task_assignees")
                .update({ calendar_event_id: msEvent.id })
                .eq("id", assignee.id);
              results.push({ user_id: assignee.user_id, status: "synced", provider: "microsoft" });
            } else {
              results.push({ user_id: assignee.user_id, status: "ms_error", code: msRes.status });
            }
          } catch (e: any) {
            results.push({ user_id: assignee.user_id, status: "ms_error", message: e.message });
          }
        } else {
          results.push({ user_id: assignee.user_id, status: "no_ms_token" });
        }
      } else {
        results.push({ user_id: assignee.user_id, status: "internal_only" });
      }
    }

    return new Response(JSON.stringify({ status: "ok", results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
