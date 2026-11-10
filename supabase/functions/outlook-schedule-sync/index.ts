import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isSystemCaller } from "../_shared/system-caller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GraphEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  lastModifiedDateTime?: string;
  body?: { content?: string };
  bodyPreview?: string;
  webLink?: string;
  organizer?: { emailAddress?: { name?: string; address?: string } };
  categories?: string[];
  sensitivity?: string;
  showAs?: string;
  isAllDay?: boolean;
  iCalUId?: string;
  isCancelled?: boolean;
  seriesMasterId?: string;
  responseStatus?: { response?: string };
  isOrganizer?: boolean;
  // Delta removal marker
  "@removed"?: { reason: string };
}

const BATCH_SIZE = 10;
const PRIVACY_VERSION = 3;
const GRAPH_SELECT =
  "id,subject,start,end,location,lastModifiedDateTime,body,bodyPreview,webLink,organizer,categories,sensitivity,showAs,isAllDay,iCalUId,isCancelled,type,seriesMasterId,responseStatus,isOrganizer";

export function isPrivateSensitivity(s?: string | null): boolean {
  return s === "private" || s === "personal" || s === "confidential";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: service-role, pg_cron shared secret, or global superadmin only
    if (!(await isSystemCaller(supabase, supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, req.headers.get("Authorization")))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const { action = "sync", continuation_after } = body;

    if (action !== "sync") {
      return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
    }

    const runId = crypto.randomUUID();
    await supabase.from("schedule_sync_runs").insert({ run_id: runId, status: "running" });

    // Get Graph app token
    const tenantId = Deno.env.get("AZURE_TENANT_ID")!;
    const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;

    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      await supabase.from("schedule_sync_runs").update({
        status: "error", finished_at: new Date().toISOString(),
        errors: ["Failed to get Graph token"],
      }).eq("run_id", runId);
      return new Response(JSON.stringify({ error: "Failed to get Graph token" }), { status: 500, headers: corsHeaders });
    }
    const graphToken = tokenData.access_token;

    // Get technicians with user accounts
    let techQuery = supabase
      .from("technicians")
      .select("id, user_id, name")
      .not("user_id", "is", null)
      .order("name", { ascending: true })
      .limit(BATCH_SIZE);

    if (continuation_after) {
      techQuery = techQuery.gt("name", continuation_after);
    }

    const { data: techs } = await techQuery;

    if (!techs?.length) {
      await supabase.from("schedule_sync_runs").update({
        status: "complete", finished_at: new Date().toISOString(),
        techs_processed: 0, events_fetched: 0, upserts: 0, needs_confirmation: 0,
      }).eq("run_id", runId);
      return new Response(JSON.stringify({ status: "ok", synced: 0, message: "No technicians to sync" }), { headers: corsHeaders });
    }

    let totalEvents = 0;
    let totalUpserts = 0;
    let totalDeleted = 0;
    let totalNeedsConfirmation = 0;
    const errors: string[] = [];

    for (const tech of techs) {
      try {
        const { data: ua } = await supabase
          .from("user_accounts")
          .select("id, auth_user_id, people(email)")
          .eq("auth_user_id", tech.user_id)
          .eq("is_active", true)
          .single();

        const email = (ua as any)?.people?.email;
        if (!email) continue;

        const { data: scope } = await supabase
          .from("user_scopes")
          .select("company_id")
          .eq("user_account_id", ua!.id)
          .limit(1)
          .single();

        const companyId = scope?.company_id;
        if (!companyId) continue;

        // Get or create sync state (deltaLink tracking)
        const { data: syncState } = await supabase
          .from("schedule_sync_state")
          .select("*")
          .eq("technician_id", tech.id)
          .eq("calendar_id", email)
          .single();

        let calUrl: string;
        const now = new Date();
        const fourWeeks = new Date(now.getTime() + 28 * 86400000);

        const fullDeltaUrl = `https://graph.microsoft.com/v1.0/users/${email}/calendarView/delta?startDateTime=${now.toISOString()}&endDateTime=${fourWeeks.toISOString()}&$select=${GRAPH_SELECT}`;
        // privacy_version < 2 → one full re-read so existing rows get sensitivity scrubbing
        if (syncState?.delta_link && ((syncState as any).privacy_version ?? 1) >= PRIVACY_VERSION) {
          calUrl = syncState.delta_link;
        } else {
          calUrl = fullDeltaUrl;
        }
        let failCode: string | null = null;

        // Fetch events (follow @odata.nextLink for pagination)
        let events: GraphEvent[] = [];
        let nextDeltaLink: string | null = null;
        let currentUrl: string | null = calUrl;

        while (currentUrl) {
          const calRes = await fetch(currentUrl, {
            headers: {
              Authorization: `Bearer ${graphToken}`,
              "Prefer": 'outlook.timezone="UTC"',
            },
          });

          if (!calRes.ok) {
            if (calRes.status === 410 && syncState?.delta_link) {
              const retryRes = await fetch(fullDeltaUrl, {
                headers: {
                  Authorization: `Bearer ${graphToken}`,
                  "Prefer": 'outlook.timezone="UTC"',
                },
              });
              if (!retryRes.ok) {
                errors.push(`${tech.name}: Graph ${retryRes.status} on full resync`);
                failCode = `graph_${retryRes.status}`;
                break;
              }
              const retryData = await retryRes.json();
              events.push(...(retryData.value || []));
              nextDeltaLink = retryData["@odata.deltaLink"] || null;
              currentUrl = retryData["@odata.nextLink"] || null;
              continue;
            }
            errors.push(`${tech.name}: Graph ${calRes.status}`);
            failCode = `graph_${calRes.status}`;
            break;
          }

          const calData = await calRes.json();
          events.push(...(calData.value || []));
          nextDeltaLink = calData["@odata.deltaLink"] || nextDeltaLink;
          currentUrl = calData["@odata.nextLink"] || null;
        }

        totalEvents += events.length;

        // Process events
        for (const ev of events) {
          // ──── HANDLE DELETED EVENTS ────
          // Declined invites are not planned time for this person
          if (ev["@removed"] || ev.isCancelled || ev.responseStatus?.response === "declined") {
            // Delta signals this event was deleted in Outlook
            const { data: deletedBlock } = await supabase
              .from("schedule_blocks")
              .select("id, project_id, outlook_subject, title")
              .eq("calendar_id", email)
              .eq("outlook_event_id", ev.id)
              .is("deleted_at", null)
              .maybeSingle();

            if (deletedBlock) {
              await supabase
                .from("schedule_blocks")
                .update({
                  deleted_at: new Date().toISOString(),
                  deleted_reason: "outlook_deleted",
                } as any)
                .eq("id", deletedBlock.id);

              totalDeleted++;

              // If block was linked to a project, log a system message
              if (deletedBlock.project_id) {
                await supabase.from("activity_log").insert({
                  entity_type: "event",
                  entity_id: deletedBlock.project_id,
                  action: "outlook_event_deleted",
                  type: "system",
                  description: `Outlook-avtale slettet av montør: "${deletedBlock.outlook_subject || deletedBlock.title}" (${tech.name})`,
                });
              }
            }
            continue;
          }

          // Skip MCS-created events: check category tag OR hidden body marker
          const isMcsCreated = ev.categories?.includes("MCS")
            || (ev.body?.content || "").includes("MCS_SOURCE:true");
          if (isMcsCreated) {
            console.log(`[outlook-schedule-sync] Skipping MCS-created event: ${ev.subject} (${ev.id})`);
            continue;
          }

          // Graph returns dateTime in UTC (via Prefer: outlook.timezone="UTC" header)
          // Append Z only if not already present to ensure correct UTC parsing
          const rawStart = ev.start.dateTime;
          const rawEnd = ev.end.dateTime;
          const startAt = new Date(rawStart.endsWith("Z") ? rawStart : rawStart + "Z");
          const endAt = new Date(rawEnd.endsWith("Z") ? rawEnd : rawEnd + "Z");

          console.log(`[outlook-schedule-sync] ${tech.name}: ${ev.subject} | raw start=${rawStart} tz=${ev.start.timeZone} → parsed=${startAt.toISOString()} | raw end=${rawEnd} tz=${ev.end.timeZone} → parsed=${endAt.toISOString()}`);

          // Privacy: private/personal/confidential → only busy time, never content
          const isPrivate = isPrivateSensitivity(ev.sensitivity);
          if (isPrivate) {
            ev.subject = "";
            ev.body = undefined;
            ev.bodyPreview = undefined;
            ev.location = undefined;
            ev.organizer = undefined;
            ev.webLink = undefined;
          }

          const bodyContent = ev.body?.content || "";
          const mcsMatch = bodyContent.match(/MCS_BLOCK_ID:([a-f0-9-]+)/);
          const existingBlockId = mcsMatch?.[1] || null;

          // Check if block already exists (for title rule)
          const { data: existingBlock } = await supabase
            .from("schedule_blocks")
            .select("id, project_id, match_state")
            .eq("calendar_id", email)
            .eq("outlook_event_id", ev.id)
            .is("deleted_at", null)
            .maybeSingle();

          // Project matching
          let projectId: string | null = existingBlock?.project_id || null;
          let matchConfidence = 0;
          let matchReason = "";
          let matchState: "auto" | "needs_confirmation" | "external" = "external";

          // If block already has a confirmed project, keep it
          if (existingBlock?.project_id && existingBlock.match_state === "confirmed") {
            projectId = existingBlock.project_id;
            matchConfidence = 100;
            matchReason = "Previously confirmed";
            matchState = "auto";
          } else {
            // 1. MCS_BLOCK_ID link
            if (existingBlockId) {
              const { data: linkedBlock } = await supabase
                .from("schedule_blocks")
                .select("project_id")
                .eq("id", existingBlockId)
                .single();
              if (linkedBlock?.project_id) {
                projectId = linkedBlock.project_id;
                matchConfidence = 100;
                matchReason = "MCS_BLOCK_ID link";
                matchState = "auto";
              }
            }

            // 2. Fuzzy match on subject + aliases
            if (!projectId && ev.subject && !isPrivate) {
              const words = ev.subject.split(/[\s–\-,]+/).filter((w: string) => w.length > 2);
              // Only letters/digits reach the filter string (no PostgREST filter injection)
              const firstWord = (words[0] || "").replace(/[^\p{L}\p{N}]/gu, "");
              if (firstWord.length > 2) {
                const { data: matchedProjects } = await supabase
                  .from("events")
                  .select("id, title, customer, address, project_aliases")
                  .eq("company_id", companyId)
                  .or(`title.ilike.%${firstWord}%,customer.ilike.%${firstWord}%,project_aliases.cs.{${firstWord}}`)
                  .is("deleted_at", null)
                  .limit(10);

                if (matchedProjects?.length) {
                  const subject = ev.subject.toLowerCase();
                  let bestMatch = matchedProjects[0];
                  let bestScore = 0;

                  for (const p of matchedProjects) {
                    let score = 0;
                    const title = (p.title || "").toLowerCase();
                    const customer = (p.customer || "").toLowerCase();
                    const aliases: string[] = ((p as any).project_aliases || []).map((a: string) => a.toLowerCase());

                    for (const alias of aliases) {
                      if (subject.includes(alias) || alias.includes(subject.split(" ")[0])) {
                        score += 60;
                        break;
                      }
                      for (const w of words) {
                        if (alias === w.toLowerCase()) { score += 45; break; }
                      }
                    }

                    if (subject.includes(title) || title.includes(subject)) score += 50;
                    else {
                      for (const w of words) {
                        if (title.includes(w.toLowerCase())) score += 15;
                        if (customer.includes(w.toLowerCase())) score += 10;
                      }
                    }

                    if (ev.location?.displayName && p.address) {
                      const loc = ev.location.displayName.toLowerCase();
                      const addr = p.address.toLowerCase();
                      if (loc.includes(addr) || addr.includes(loc)) score += 25;
                    }

                    if (score > bestScore) {
                      bestScore = score;
                      bestMatch = p;
                    }
                  }

                  // Text similarity is only a suggestion; a user must confirm the link.
                  if (bestScore >= 80) {
                    projectId = bestMatch.id;
                    matchConfidence = Math.min(bestScore, 100);
                    matchReason = `Subject/location match: ${bestMatch.title}`;
                    matchState = "needs_confirmation";
                  } else if (bestScore >= 50) {
                    projectId = bestMatch.id;
                    matchConfidence = bestScore;
                    matchReason = `Partial match: ${bestMatch.title}`;
                    matchState = "needs_confirmation";
                  }
                }
              }
            }

            // 3. Recent affinity
            if (!projectId && matchConfidence < 50 && !isPrivate) {
              const { data: recentBlocks } = await supabase
                .from("schedule_blocks")
                .select("project_id, events!schedule_blocks_project_id_fkey(title)")
                .eq("technician_id", tech.id)
                .eq("company_id", companyId)
                .not("project_id", "is", null)
                .order("start_at", { ascending: false })
                .limit(5);

              if (recentBlocks?.length) {
                const subject = ev.subject?.toLowerCase() || "";
                for (const rb of recentBlocks) {
                  const projTitle = (rb as any).events?.title?.toLowerCase() || "";
                  if (projTitle && subject.includes(projTitle.split(" ")[0])) {
                    projectId = rb.project_id;
                    matchConfidence = 60;
                    matchReason = `Recent affinity: ${(rb as any).events?.title}`;
                    matchState = "needs_confirmation";
                    break;
                  }
                }
              }
            }
          }

          if (matchState === "needs_confirmation") totalNeedsConfirmation++;

          // ──── TITLE RULE ────
          // If project_id set and project exists (not deleted) → use project title
          // Otherwise → use outlook_subject
          let displayTitle = ev.subject || "Opptatt";
          if (projectId) {
            const { data: proj } = await supabase
              .from("events")
              .select("title")
              .eq("id", projectId)
              .is("deleted_at", null)
              .maybeSingle();
            if (proj?.title) {
              displayTitle = proj.title;
            } else {
              // Project deleted – unlink
              projectId = null;
              matchState = "external";
              matchReason = "Prosjekt slettet under sync";
            }
          }

          // Upsert schedule_block
          const { error: upsertError } = await supabase
            .from("schedule_blocks")
            .upsert(
              {
                outlook_event_id: ev.id,
                calendar_id: email,
                company_id: companyId,
                technician_id: tech.id,
                project_id: projectId,
                source: "outlook",
                start_at: startAt.toISOString(),
                end_at: endAt.toISOString(),
                title: displayTitle,
                location: ev.location?.displayName || null,
                match_confidence: matchConfidence,
                match_reason: matchReason || null,
                match_state: matchState,
                last_modified: ev.lastModifiedDateTime || null,
                mcs_block_id: existingBlockId,
                outlook_subject: ev.subject || null,
                outlook_location: ev.location?.displayName || null,
                outlook_preview: ev.bodyPreview || null,
                outlook_weblink: ev.webLink || null,
                outlook_organizer: ev.organizer?.emailAddress?.name || null,
                outlook_sensitivity: ev.sensitivity || null,
                is_private: isPrivate,
                outlook_ical_uid: ev.iCalUId || null,
                outlook_show_as: ev.showAs || null,
                is_all_day: !!ev.isAllDay,
                outlook_series_master_id: ev.seriesMasterId || null,
                outlook_response_status: ev.responseStatus?.response || null,
                is_organizer: ev.isOrganizer ?? null,
              } as any,
              { onConflict: "outlook_event_id,calendar_id" }
            );

          if (upsertError) {
            errors.push(`${tech.name}/${ev.subject}: ${upsertError.message}`);
          } else {
            totalUpserts++;
          }
        }

        // Save deltaLink + visible per-employee connection status
        const nowIso = new Date().toISOString();
        if (failCode) {
          await supabase.from("schedule_sync_state").upsert({
            technician_id: tech.id,
            calendar_id: email,
            last_status: failCode === "graph_403" ? "access_denied" : "error",
            last_error_code: failCode,
            last_error_at: nowIso,
            consecutive_failures: ((syncState as any)?.consecutive_failures ?? 0) + 1,
            updated_at: nowIso,
          } as any, { onConflict: "technician_id,calendar_id" });
        } else if (nextDeltaLink) {
          await supabase
            .from("schedule_sync_state")
            .upsert(
              {
                technician_id: tech.id,
                calendar_id: email,
                delta_link: nextDeltaLink,
                last_synced_at: nowIso,
                updated_at: nowIso,
                last_status: "ok",
                last_error_code: null,
                consecutive_failures: 0,
                privacy_version: PRIVACY_VERSION,
              } as any,
              { onConflict: "technician_id,calendar_id" }
            );
        }
      } catch (techErr: any) {
        errors.push(`${tech.name}: ${techErr.message}`);
      }
    }

    // ──── POST-SYNC: VERIFY RECENT BLOCKS (catch missed deletes) ────
    let verifiedDeleted = 0;
    try {
      // Get recent non-deleted blocks with outlook_event_id (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: recentBlocks } = await supabase
        .from("schedule_blocks")
        .select("id, calendar_id, outlook_event_id, project_id, outlook_subject, title")
        .is("deleted_at", null)
        .not("outlook_event_id", "is", null)
        .gte("updated_at", sevenDaysAgo)
        .limit(50);

      for (const rb of recentBlocks || []) {
        try {
          const verifyRes = await fetch(
            `https://graph.microsoft.com/v1.0/users/${rb.calendar_id}/events/${rb.outlook_event_id}?$select=id`,
            { headers: { Authorization: `Bearer ${graphToken}` } }
          );
          if (verifyRes.status === 404) {
            await supabase.from("schedule_blocks").update({
              deleted_at: new Date().toISOString(),
              deleted_reason: "outlook_deleted",
            } as any).eq("id", rb.id);
            verifiedDeleted++;

            if (rb.project_id) {
              await supabase.from("activity_log").insert({
                entity_type: "event",
                entity_id: rb.project_id,
                action: "outlook_event_deleted",
                type: "system",
                description: `Outlook-avtale slettet (oppdaget ved verifikasjon): "${rb.outlook_subject || rb.title}"`,
              });
            }
          }
        } catch { /* skip individual verify errors */ }
      }
    } catch (verifyErr: any) {
      errors.push(`Verify sweep: ${verifyErr.message}`);
    }
    totalDeleted += verifiedDeleted;

    // ──── POST-SYNC ORPHAN SWEEP ────
    let orphanResult: any = null;
    try {
      const { data } = await supabase.rpc("sweep_orphan_schedule_blocks");
      orphanResult = data;
    } catch (sweepErr: any) {
      errors.push(`Orphan sweep: ${sweepErr.message}`);
    }

    // Continuation
    const lastTechName = techs[techs.length - 1]?.name;
    const continuationToken = techs.length >= BATCH_SIZE ? lastTechName : null;

    // Trigger AI project matcher if there are needs_confirmation blocks
    if (totalNeedsConfirmation > 0) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/ai-project-matcher`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
      } catch (aiErr: any) {
        console.error("[outlook-schedule-sync] AI matcher trigger failed:", aiErr.message);
      }
    }

    // Log run completion
    await supabase.from("schedule_sync_runs").update({
      status: "complete",
      finished_at: new Date().toISOString(),
      techs_processed: techs.length,
      events_fetched: totalEvents,
      upserts: totalUpserts,
      needs_confirmation: totalNeedsConfirmation,
      errors: errors.length > 0 ? errors : null,
      continuation_token: continuationToken,
    }).eq("run_id", runId);

    return new Response(
      JSON.stringify({
        status: "ok",
        run_id: runId,
        techs_processed: techs.length,
        events_fetched: totalEvents,
        upserts: totalUpserts,
        deleted: totalDeleted,
        needs_confirmation: totalNeedsConfirmation,
        orphan_sweep: orphanResult,
        continuation_token: continuationToken,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[outlook-schedule-sync] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
