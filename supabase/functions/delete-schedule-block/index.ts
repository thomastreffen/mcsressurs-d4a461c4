import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* Use the recipient's existing delegated identity, never the mail application's grants. */
async function getDelegatedToken(db: any, uid: string): Promise<string | null> {
  const { data, error } = await db.auth.admin.getUserById(uid);
  const meta = data?.user?.user_metadata;
  if (error || typeof meta?.ms_access_token !== "string" || !meta.ms_expires_at ||
    Date.parse(meta.ms_expires_at) <= Date.now() + 60000) return null;
  return meta.ms_access_token;
}

/* ── Delete a single Outlook event by user email ── */
async function deleteOutlookEvent(
  token: string,
  userEmail: string,
  calendarEventId: string
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/events/${encodeURIComponent(calendarEventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  return { ok: res.ok || res.status === 404, status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Auth check ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Permission check ──
    const { data: canDelete } = await supabase.rpc("check_permission_v2", {
      _auth_user_id: user.id,
      _perm: "calendar.delete_events",
    });
    if (!canDelete) {
      return new Response(JSON.stringify({ error: "Mangler rettighet: calendar.delete_events", error_code: "permission_denied" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { schedule_block_id, force_delete_outlook } = await req.json();
    if (!schedule_block_id) {
      return new Response(JSON.stringify({ error: "Missing schedule_block_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the block with technician info
    const { data: block, error: fetchErr } = await anonClient
      .from("schedule_blocks")
      .select("*, technicians(user_id, name, email)")
      .eq("id", schedule_block_id)
      .is("deleted_at", null)
      .single();

    if (fetchErr || !block) {
      return new Response(JSON.stringify({ error: "Block not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: scope } = await supabase.rpc("has_company_access", { _uid: user.id,
      _company: block.company_id, _module: "resource_plan", _level: "edit" });
    if (!block.company_id || !scope) return new Response(JSON.stringify({ error: "Ingen tilgang" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const isHubBlock = ["system", "manual", "linked_outlook"].includes(block.source);
    if (isHubBlock) {
      const routed = await anonClient.functions.invoke("remove-work-visit-from-plan", {
        body: { action: "remove_assignment", schedule_block_id, technician_id: block.technician_id },
        headers: { Authorization: authHeader },
      });
      if (routed.error) return new Response(JSON.stringify({ error: "Planfjerning kunne ikke bekreftes" }), { status: 502, headers: corsHeaders });
      return new Response(JSON.stringify(routed.data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const relatedBlockIds = new Set<string>([block.id]);
    const relatedOutlookBlocks: Array<{
      id: string;
      source: string;
      project_id: string | null;
      technician_id: string;
      outlook_event_id: string | null;
      calendar_id: string | null;
      start_at: string;
      end_at: string;
      title: string | null;
      outlook_subject: string | null;
    }> = [
      {
        id: block.id,
        source: block.source,
        project_id: block.project_id,
        technician_id: block.technician_id,
        outlook_event_id: block.outlook_event_id,
        calendar_id: block.calendar_id,
        start_at: block.start_at,
        end_at: block.end_at,
        title: block.title,
        outlook_subject: block.outlook_subject,
      },
    ];

    // For imported Outlook blocks, include same-slot twins so one click doesn't leave ghost siblings.
    if (block.source === "outlook") {
      const { data: sameSlotBlocks } = await supabase
        .from("schedule_blocks")
        .select("id, source, project_id, technician_id, outlook_event_id, calendar_id, start_at, end_at, title, outlook_subject")
        .eq("technician_id", block.technician_id)
        .eq("start_at", block.start_at)
        .eq("end_at", block.end_at)
        .is("deleted_at", null)
        .limit(20);

      for (const candidate of sameSlotBlocks || []) {
        // Only other Outlook copies are twins – never hide a Hub job block in the same slot.
        if (candidate.id === block.id || candidate.source !== "outlook") continue;
        const sameOutlookObject = !!block.outlook_event_id && candidate.outlook_event_id === block.outlook_event_id;
        if (sameOutlookObject) {
          relatedBlockIds.add(candidate.id);
          relatedOutlookBlocks.push(candidate as any);
        }
      }
    }

    const isSystemBlock = block.source === "system" || block.source === "manual" || block.source === "linked_outlook";
    const isOutlookImported = block.source === "outlook";
    const shouldDeleteOutlook = isSystemBlock || (isOutlookImported && force_delete_outlook === true);
    const deletePath = shouldDeleteOutlook
      ? (isSystemBlock ? "system_with_outlook_delete" : "imported_with_forced_outlook_delete")
      : "local_only";

    const blockTechEmail = (block as any).technicians?.email as string | undefined;

    let deletedInOutlook = false;
    let outlookError: string | null = null;
    const deletedOutlookEvents: string[] = [];
    const graphAttempts: Array<{ path: string; mailbox: string; event_id: string; status: number; ok: boolean }> = [];
    const attemptedTargets = new Set<string>();
    console.log("[delete-schedule-block] Request", JSON.stringify({
      source: block.source,
      schedule_block_id,
      technician_id: block.technician_id,
      technician_user_id: (block as any).technicians?.user_id ?? null,
      outlook_event_id: block.outlook_event_id,
      calendar_event_id: block.outlook_event_id,
      external_event_id: block.outlook_event_id,
      origin: isSystemBlock ? "system" : "imported",
      force_delete_outlook: force_delete_outlook === true,
      delete_path: deletePath,
      related_block_ids: Array.from(relatedBlockIds),
      start_at: block.start_at,
      end_at: block.end_at,
      title: block.outlook_subject || block.title,
    }));

    let appToken: string | null = null;

    const tryDeleteOutlook = async (
      path: string,
      mailbox: string | null | undefined,
      eventId: string | null | undefined
    ) => {
      if (!mailbox || !eventId || eventId.startsWith("pending:")) return;
      if (!appToken) return;

      const targetKey = `${mailbox.toLowerCase()}|${eventId}`;
      if (attemptedTargets.has(targetKey)) return;
      attemptedTargets.add(targetKey);

      let result: {ok:boolean;status:number};
      try { result = await deleteOutlookEvent(appToken, mailbox, eventId); }
      catch { outlookError = "graph_network_unknown_outcome_reconciliation_required"; return; }
      graphAttempts.push({ path, mailbox, event_id: eventId, status: result.status, ok: result.ok });

      console.log("[delete-schedule-block] Graph delete", JSON.stringify({
        path,
        mailbox,
        event_id: eventId,
        status: result.status,
        ok: result.ok,
      }));

      if (result.ok) {
        deletedOutlookEvents.push(eventId);
      } else {
        outlookError = `graph_delete_${result.status}`;
      }
    };

    if (shouldDeleteOutlook) {
      appToken = block.technicians?.user_id ? await getDelegatedToken(supabase, block.technicians.user_id) : null;
      if (!appToken) {
        outlookError = "delegated_token_unavailable_reconnect_required";
        console.error("[delete-schedule-block]", outlookError);
      } else {
        // Strategy 2: Fallback to schedule_blocks.outlook_event_id (legacy/direct)
        for (const relatedBlock of relatedOutlookBlocks) {
          const mailbox = blockTechEmail || null;
          await tryDeleteOutlook("schedule_blocks_fallback", mailbox, relatedBlock.outlook_event_id);
        }

        if ((force_delete_outlook === true || isSystemBlock) && deletedOutlookEvents.length === 0 && !outlookError) {
          outlookError = "No Outlook events deleted (no matching calendar_event_id/outlook_event_id found)";
        }

        deletedInOutlook = deletedOutlookEvents.length > 0;
      }
    }

    if (shouldDeleteOutlook && (!deletedInOutlook || outlookError)) {
      return new Response(JSON.stringify({ status: "reconciliation_required", deleted_in_outlook: false,
        outlook_error: outlookError ?? "no_exact_outlook_id_reconciliation_required", graph_attempts: graphAttempts,
        retry_requires_confirmation: true, block_ids_soft_deleted: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Soft delete all matched blocks (selected + same-slot twins)
    const blockIdsToDelete = Array.from(relatedBlockIds);
    const deletedReason = isSystemBlock
      ? "manual_delete"
      : (force_delete_outlook ? "manual_delete_with_outlook" : "removed_from_plan");

    const { error: updateErr } = await supabase
      .from("schedule_blocks")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_reason: deletedReason,
      } as any)
      .in("id", blockIdsToDelete);

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to soft-delete block" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { count: stillActiveRelatedCount } = await supabase
      .from("schedule_blocks")
      .select("id", { count: "exact", head: true })
      .in("id", blockIdsToDelete)
      .is("deleted_at", null);

    // Log the action
    await supabase.from("activity_log").insert({
      entity_type: "schedule_block",
      entity_id: schedule_block_id,
      action: "deleted",
      type: "system",
      description: `Schedule block deleted (${deletePath}). Blocks soft-deleted: ${blockIdsToDelete.length}. Outlook removed: ${deletedOutlookEvents.length}${outlookError ? ` Error: ${outlookError}` : ""}`,
      metadata: {
        source: block.source,
        delete_path: deletePath,
        origin: isSystemBlock ? "system" : "imported",
        force_delete_outlook: force_delete_outlook === true,
        block_ids_soft_deleted: blockIdsToDelete,
        graph_attempts: graphAttempts,
      },
    });

    return new Response(
      JSON.stringify({
        status: "ok",
        source: block.source,
        origin: isSystemBlock ? "system" : "imported",
        delete_path: deletePath,
        deleted_in_outlook: deletedInOutlook,
        outlook_events_removed: deletedOutlookEvents.length,
        outlook_error: outlookError,
        block_ids_soft_deleted: blockIdsToDelete,
        schedule_blocks_active_after_delete: stillActiveRelatedCount ?? 0,
        debug: {
          selected_block: {
            source: block.source,
            schedule_block_id,
            technician_id: block.technician_id,
            technician_user_id: (block as any).technicians?.user_id ?? null,
            outlook_event_id: block.outlook_event_id,
            calendar_event_id: block.outlook_event_id,
            external_event_id: block.outlook_event_id,
            calendar_id: block.calendar_id,
            project_id: block.project_id,
            start_at: block.start_at,
            end_at: block.end_at,
            title: block.outlook_subject || block.title,
          },
          related_blocks: relatedOutlookBlocks,
          graph_attempts: graphAttempts,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[delete-schedule-block] Exception:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
