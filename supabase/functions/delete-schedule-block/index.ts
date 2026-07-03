import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Get MS token for a user via refresh ── */
async function getAppToken(): Promise<string | null> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID")!;
  const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );
  const tokenData = await tokenRes.json();
  return tokenData.access_token || null;
}

/* ── Delete a single Outlook event by user email ── */
async function deleteOutlookEvent(
  token: string,
  userEmail: string,
  calendarEventId: string
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userEmail}/events/${calendarEventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  return { ok: res.ok, status: res.status };
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
    const { data: block, error: fetchErr } = await supabase
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

    const normalizeTitle = (v: string | null | undefined) => (v || "").trim().toLowerCase();
    const selectedTitle = normalizeTitle(block.outlook_subject || block.title);

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
        if (candidate.id === block.id) continue;
        const sameProject = !!block.project_id && candidate.project_id === block.project_id;
        const sameTitle = normalizeTitle(candidate.outlook_subject || candidate.title) === selectedTitle;
        if (sameProject || sameTitle) {
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
    const eventTechnicianTargets: Array<{
      event_technician_id: string;
      technician_id: string | null;
      technician_email: string | null;
      calendar_event_id: string | null;
    }> = [];

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

      const result = await deleteOutlookEvent(appToken, mailbox, eventId);
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
        outlookError = `Graph DELETE failed (${path}) for ${mailbox}: ${result.status}`;
      }
    };

    if (shouldDeleteOutlook) {
      appToken = await getAppToken();
      if (!appToken) {
        outlookError = "Failed to get Graph app token";
        console.error("[delete-schedule-block]", outlookError);
      } else {
        // Strategy 1: Delete via event_technicians.calendar_event_id (new flow)
        if (block.project_id) {
          const { data: eventTechs } = await supabase
            .from("event_technicians")
            .select("id, calendar_event_id, technician_id, technicians(email, name)")
            .eq("event_id", block.project_id);

          if (eventTechs && eventTechs.length > 0) {
            for (const et of eventTechs) {
              const calEventId = et.calendar_event_id as string | null;
              const techEmail = (et as any).technicians?.email as string | null;

              eventTechnicianTargets.push({
                event_technician_id: et.id,
                technician_id: et.technician_id,
                technician_email: techEmail,
                calendar_event_id: calEventId,
              });

              await tryDeleteOutlook("event_technicians", techEmail, calEventId);

              if (calEventId && deletedOutlookEvents.includes(calEventId)) {
                await supabase.from("event_technicians")
                  .update({ calendar_event_id: null } as any)
                  .eq("id", et.id);
              }
            }
          }

          // Also check job_calendar_links
          const { data: calLinks } = await supabase
            .from("job_calendar_links")
            .select("id, calendar_event_id, user_id, technician_id, technicians(email, name)")
            .eq("job_id", block.project_id)
            .eq("provider", "microsoft")
            .eq("sync_status", "linked");

          if (calLinks && calLinks.length > 0) {
            for (const link of calLinks) {
              const calEventId = link.calendar_event_id as string | null;
              const techEmail = (link as any).technicians?.email as string | null;
              await tryDeleteOutlook("job_calendar_links", techEmail, calEventId);

              if (calEventId && deletedOutlookEvents.includes(calEventId)) {
                await supabase.from("job_calendar_links")
                  .update({ sync_status: "unlinked", calendar_event_id: null, calendar_event_url: null } as any)
                  .eq("id", link.id);
              }
            }
          }
        }

        // Strategy 2: Fallback to schedule_blocks.outlook_event_id (legacy/direct)
        for (const relatedBlock of relatedOutlookBlocks) {
          const mailbox = relatedBlock.calendar_id || blockTechEmail || null;
          await tryDeleteOutlook("schedule_blocks_fallback", mailbox, relatedBlock.outlook_event_id);
        }

        if ((force_delete_outlook === true || isSystemBlock) && deletedOutlookEvents.length === 0 && !outlookError) {
          outlookError = "No Outlook events deleted (no matching calendar_event_id/outlook_event_id found)";
        }

        deletedInOutlook = deletedOutlookEvents.length > 0;
      }
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

    // Also soft-delete the linked task event(s) if they exist.
    // Tasks (project_type='task') have no existence outside the plan — when
    // removed from plan they should also be soft-deleted so no ghost card
    // survives via a stale schedule_block pointing to a "live" event.
    // We check BOTH job_id (canonical activity reference) and project_id
    // (legacy path where project_id pointed directly to the child task event).
    if (isSystemBlock) {
      const linkedEventIds = [block.job_id, block.project_id].filter(Boolean) as string[];
      if (linkedEventIds.length > 0) {
        const { data: linkedEvents } = await supabase
          .from("events")
          .select("id, project_type")
          .in("id", linkedEventIds)
          .is("deleted_at", null);

        for (const linkedEvent of linkedEvents || []) {
          if (linkedEvent.project_type === "task") {
            // Before soft-deleting the task, check if any OTHER active
            // schedule_blocks still reference this event. If yes, leave it.
            const { data: refBlocks } = await supabase
              .from("schedule_blocks")
              .select("id")
              .or(`job_id.eq.${linkedEvent.id},project_id.eq.${linkedEvent.id}`)
              .is("deleted_at", null);
            const otherRefs = (refBlocks || []).filter((r) => !blockIdsToDelete.includes(r.id)).length;

            if (otherRefs === 0) {
              await supabase.from("events")
                .update({ deleted_at: new Date().toISOString(), status: "cancelled" })
                .eq("id", linkedEvent.id);
              console.log(`[delete-schedule-block] Soft-deleted linked task event ${linkedEvent.id}`);
            } else {
              console.log(`[delete-schedule-block] Kept linked task ${linkedEvent.id} — ${otherRefs} other active blocks still reference it`);
            }
          }
        }
      }
    }

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
          event_technician_targets: eventTechnicianTargets,
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
