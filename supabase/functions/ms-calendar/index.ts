import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/* ── Strip UTC offset so Graph uses the explicit timeZone property ── */
function toLocalDateTimeString(isoString: string): string {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

// ── Structured error helpers ──

interface StructuredError {
  error_code: string;
  message: string;
  recommendation: string;
  graph_status?: number;
}

function classifyGraphError(status: number, body: string): StructuredError {
  const bodyLower = body.toLowerCase();
  if (status === 401 || bodyLower.includes("invalid_grant") || bodyLower.includes("compacttoken")) {
    return {
      error_code: "invalid_grant",
      message: "Autorisasjonstoken er utløpt eller ugyldig.",
      recommendation: "Brukeren må logge inn på nytt via Microsoft på /settings/integrations.",
      graph_status: status,
    };
  }
  if (status === 403) {
    return {
      error_code: "insufficient_privileges",
      message: "Utilstrekkelige rettigheter til brukerens kalender.",
      recommendation: "Sjekk Graph-tillatelser (Calendars.ReadWrite) og admin consent.",
      graph_status: status,
    };
  }
  if (status === 404 || bodyLower.includes("itemnotfound")) {
    return {
      error_code: "itemNotFound",
      message: "Outlook-hendelsen finnes ikke lenger.",
      recommendation: "Klikk 'Reparer synk' for å opprette en ny hendelse.",
      graph_status: status,
    };
  }
  if (status === 429) {
    return {
      error_code: "throttled",
      message: "Microsoft Graph API begrensning (for mange forespørsler).",
      recommendation: "Vent noen minutter og prøv igjen.",
      graph_status: status,
    };
  }
  return {
    error_code: "graph_error",
    message: `Graph API feil: ${status}`,
    recommendation: "Prøv igjen. Kontakt support hvis feilen vedvarer.",
    graph_status: status,
  };
}

function noTokenError(): StructuredError {
  return {
    error_code: "missing_token",
    message: "Ingen gyldig Microsoft-token funnet.",
    recommendation: "Brukeren må koble Microsoft-kontoen sin på /settings/integrations.",
  };
}

// ── Deterministic sync hash for idempotency ──

function normalizeText(s: string | null | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

function computeSyncHash(job: any, userId: string): string {
  // Deterministic: normalized content + updated_at for staleness detection
  const parts = [
    job.start_time || "",
    job.end_time || "",
    normalizeText(job.title),
    normalizeText(job.address),
    normalizeText(job.description),
    normalizeText(job.customer),
    job.updated_at || "",
    userId,
  ];
  const str = parts.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

// ── Build event content deterministically ──

function buildSubject(job: any): string {
  const displayNumber = job.internal_number || job.job_number || job.id.slice(0, 8);
  return `JOBB ${displayNumber} | ${normalizeText(job.customer) || "Ukjent kunde"} | ${normalizeText(job.title)}`;
}

function buildHtmlBody(job: any, jobId: string): string {
  const displayNumber = job.internal_number || job.job_number || job.id.slice(0, 8);
  const jobLink = `https://mcsressurs.lovable.app/projects/${jobId}`;
  return [
    `<b>Jobb:</b> ${displayNumber}`,
    `<b>Kunde:</b> ${normalizeText(job.customer) || "Ikke angitt"}`,
    `<b>Adresse:</b> ${normalizeText(job.address) || "Ikke angitt"}`,
    job.description ? `<b>Beskrivelse:</b> ${normalizeText(job.description)}` : null,
    job.meeting_join_url ? `<br/><b>Teams-møte:</b> <a href="${job.meeting_join_url}">Bli med i møtet</a>` : null,
    `<br/><a href="${jobLink}">Åpne jobb i systemet</a>`,
  ].filter(Boolean).join("<br/>");
}

// ── Token management ──

async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string,
  log: (msg: string) => void
): Promise<string | null> {
  const { data: userData, error: userErr } =
    await supabaseAdmin.auth.admin.getUserById(userId);
  if (userErr || !userData?.user) {
    log(`Failed to fetch user ${userId}: ${userErr?.message}`);
    return null;
  }

  const meta = userData.user.user_metadata || {};
  const accessToken = meta.ms_access_token;
  const refreshToken = meta.ms_refresh_token;
  const expiresAt = meta.ms_expires_at;

  if (!accessToken) {
    log(`No MS access token for user ${userId}`);
    return null;
  }

  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  if (!refreshToken) {
    log(`Token expired, no refresh token for user ${userId}`);
    return null;
  }

  log(`Token expired for ${userId}, refreshing...`);

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${Deno.env.get("AZURE_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("AZURE_CLIENT_ID")!,
        client_secret: Deno.env.get("AZURE_CLIENT_SECRET")!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://graph.microsoft.com/.default offline_access",
      }),
    }
  );

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    log(`Token refresh failed for ${userId}: ${tokenRes.status} ${errText.substring(0, 200)}`);
    return null;
  }

  const tokenData = await tokenRes.json();
  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: tokenData.access_token,
      ms_refresh_token: tokenData.refresh_token || refreshToken,
      ms_expires_at: newExpiry,
    },
  });

  log(`Token refreshed for ${userId}, expires ${newExpiry}`);
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsError } = await supabaseAnon.auth.getClaims(jwt);
    if (claimsError || !claimsData?.claims?.sub) return respond({ error: "Invalid session" }, 401);
    const authUser = { id: claimsData.claims.sub };

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const logs: string[] = [];
    const log = (msg: string) => {
      const ts = new Date().toISOString().slice(11, 23);
      const line = `[${ts}] ${msg}`;
      logs.push(line);
      console.log(`[ms-calendar] ${msg}`);
    };

    log(`Action: ${action}, caller: ${authUser.id}`);

    // ── Server-side permission check via check_permission_v2 ──
    const checkPerm = async (perm: string): Promise<boolean> => {
      const { data } = await supabaseAdmin.rpc("check_permission_v2", {
        _auth_user_id: authUser.id,
        _perm: perm,
      });
      return data === true;
    };

    // ─── ACTION: availability ───
    if (action === "availability") {
      // PERMISSION GUARD: calendar.read_busy required
      const canReadBusy = await checkPerm("calendar.read_busy");
      if (!canReadBusy) {
        log(`DENIED: User ${authUser.id} lacks calendar.read_busy`);
        return respond({ error: "Mangler rettighet: calendar.read_busy", error_code: "permission_denied", results: [], logs }, 403);
      }

      const canViewExternal = await checkPerm("calendar.view_external");

      const { user_ids, start, end } = body;
      if (!user_ids?.length || !start || !end) {
        return respond({ error: "Missing user_ids, start, end", logs }, 400);
      }

      log(`Checking availability for ${user_ids.length} users, ${start} → ${end}`);

      const { data: techs } = await supabaseAdmin
        .from("technicians")
        .select("id, email, name, user_id")
        .in("user_id", user_ids);

      if (!techs?.length) {
        log("No technicians found for given user_ids");
        return respond({ results: [], logs });
      }

      const techEmails = techs.map((t: any) => t.email).filter(Boolean);
      log(`Technician emails: ${techEmails.join(", ")}`);

      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"])
        .limit(5);

      let msToken: string | null = null;
      for (const ar of adminRoles || []) {
        msToken = await ensureValidMsToken(supabaseAdmin, ar.user_id, log);
        if (msToken) break;
      }

      if (!msToken) {
        log("No admin with valid MS token found");
        return respond({ error: "No valid MS token for schedule check", logs }, 400);
      }

      const graphRes = await fetch(`${GRAPH_BASE}/me/calendar/getSchedule`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${msToken}`,
          "Content-Type": "application/json",
          "Prefer": 'outlook.timezone="UTC"',
        },
        body: JSON.stringify({
          schedules: techEmails,
          startTime: { dateTime: start, timeZone: "UTC" },
          endTime: { dateTime: end, timeZone: "UTC" },
          availabilityViewInterval: 15,
        }),
      });

      if (!graphRes.ok) {
        const errText = await graphRes.text();
        log(`getSchedule failed: ${graphRes.status} ${errText.substring(0, 300)}`);
        return respond({ error: "getSchedule failed", details: errText.substring(0, 300), logs }, 500);
      }

      const graphData = await graphRes.json();
      const emailToTech = new Map(
        techs.map((t: any) => [t.email.toLowerCase(), { id: t.id, name: t.name, user_id: t.user_id }])
      );

      const results = (graphData.value || []).map((entry: any) => {
        const tech = emailToTech.get(entry.scheduleId?.toLowerCase());
        const busySlots = (entry.scheduleItems || [])
          .filter((s: any) => s.status !== "free")
          .map((s: any) => ({
            status: s.status,
            // PERMISSION FILTER: strip subject/details unless user has calendar.view_external
            subject: canViewExternal ? (s.subject || null) : null,
            start: s.start?.dateTime,
            end: s.end?.dateTime,
            is_private: s.isPrivate || false,
          }));
        const isBusy = busySlots.length > 0;
        log(`${tech?.name || entry.scheduleId}: ${isBusy ? "BUSY" : "FREE"} (${busySlots.length} slots)`);
        return {
          technician_id: tech?.id || null,
          user_id: tech?.user_id || null,
          name: tech?.name || entry.scheduleId,
          // Strip email for non-external viewers
          email: canViewExternal ? entry.scheduleId : null,
          busy: isBusy,
          busy_slots: busySlots,
        };
      });

      return respond({ results, logs });
    }

    // ─── ACTION: upsert_job_events ───
    if (action === "upsert_job_events") {
      // PERMISSION GUARD: calendar.write_events required
      const canWrite = await checkPerm("calendar.write_events");
      if (!canWrite) {
        log(`DENIED: User ${authUser.id} lacks calendar.write_events`);
        return respond({ error: "Mangler rettighet: calendar.write_events", error_code: "permission_denied", logs }, 403);
      }
      const { job_id, user_ids, override_conflicts } = body;
      if (!job_id) return respond({ error: "Missing job_id", logs }, 400);

      const operationId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      log(`Operation ${operationId}: upsert for job ${job_id}`);

      // Fetch job
      const { data: job, error: jobErr } = await supabaseAdmin
        .from("events")
        .select("*")
        .eq("id", job_id)
        .single();

      if (jobErr || !job) {
        log(`Job not found: ${job_id}`);
        return respond({ error: "Job not found", logs }, 404);
      }

      // Determine technician user_ids
      let targetUserIds = user_ids;
      if (!targetUserIds?.length) {
        const { data: ets } = await supabaseAdmin
          .from("event_technicians")
          .select("technician_id, technicians(user_id)")
          .eq("event_id", job_id);
        targetUserIds = (ets || [])
          .map((et: any) => et.technicians?.user_id)
          .filter(Boolean);
      }

      if (!targetUserIds?.length) {
        log("No technicians assigned to job");
        return respond({ error: "No technicians to sync", logs }, 400);
      }

      const { data: techs } = await supabaseAdmin
        .from("technicians")
        .select("id, email, name, user_id")
        .in("user_id", targetUserIds);

      const subject = buildSubject(job);
      const htmlBody = buildHtmlBody(job, job_id);

      const results: any[] = [];

      for (const tech of techs || []) {
        const techLog = (msg: string) => log(`[${tech.name}] ${msg}`);

        // ── Atomic claim via DB function (SELECT FOR UPDATE) ──
        const syncHash = computeSyncHash(job, tech.user_id);

        const { data: claimResult, error: claimErr } = await supabaseAdmin.rpc(
          "claim_calendar_sync",
          {
            _job_id: job_id,
            _user_id: tech.user_id,
            _technician_id: tech.id,
            _provider: "microsoft",
            _operation_id: operationId,
            _lock_window_seconds: 15,
          }
        );

        if (claimErr) {
          techLog(`Claim failed: ${claimErr.message}`);
          results.push({ technician_id: tech.id, name: tech.name, status: "failed", error: { error_code: "lock_failed", message: "Kunne ikke låse raden", recommendation: "Prøv igjen." } });
          continue;
        }

        if (claimResult?.status === "in_progress") {
          techLog("Another sync operation in progress (DB lock), skipping");
          results.push({ technician_id: tech.id, name: tech.name, status: "in_progress" });
          continue;
        }

        // Use data from the locked row
        const existingLink = {
          sync_status: claimResult?.sync_status,
          last_sync_hash: claimResult?.last_sync_hash,
          calendar_event_id: claimResult?.calendar_event_id,
          calendar_event_url: claimResult?.calendar_event_url,
        };

        // Check if already in sync (no change needed)
        if (
          existingLink.sync_status === "linked" &&
          existingLink.last_sync_hash === syncHash
        ) {
          techLog("No change detected (hash match), skipping Graph call");
          results.push({ technician_id: tech.id, name: tech.name, status: "no_change" });
          continue;
        }

        // ── Get MS token ──
        const msToken = await ensureValidMsToken(supabaseAdmin, tech.user_id, techLog);
        if (!msToken) {
          techLog("No valid MS token");
          const err = noTokenError();
          await supabaseAdmin.from("job_calendar_links").update({
            sync_status: "failed",
            last_error: JSON.stringify(err),
          }).eq("job_id", job_id).eq("user_id", tech.user_id).eq("provider", "microsoft");
          results.push({ technician_id: tech.id, name: tech.name, status: "failed", error: err });
          continue;
        }

        const eventPayload = {
          subject,
          body: { contentType: "HTML", content: htmlBody },
          start: { dateTime: toLocalDateTimeString(job.start_time), timeZone: "Europe/Oslo" },
          end: { dateTime: toLocalDateTimeString(job.end_time), timeZone: "Europe/Oslo" },
          location: job.address ? { displayName: job.address } : undefined,
        };

        const updateLinkSuccess = async (eventId: string, webLink: string | null, action: string) => {
          await supabaseAdmin.from("job_calendar_links").update({
            calendar_event_id: eventId,
            calendar_event_url: webLink,
            sync_status: "linked",
            last_synced_at: new Date().toISOString(),
            last_error: null,
            last_sync_hash: syncHash,
          }).eq("job_id", job_id).eq("user_id", tech.user_id).eq("provider", "microsoft");
          results.push({ technician_id: tech.id, name: tech.name, status: action, event_id: eventId });
        };

        const updateLinkFailure = async (graphStatus: number, errBody: string) => {
          const err = classifyGraphError(graphStatus, errBody);
          await supabaseAdmin.from("job_calendar_links").update({
            sync_status: "failed",
            last_error: JSON.stringify(err),
          }).eq("job_id", job_id).eq("user_id", tech.user_id).eq("provider", "microsoft");
          results.push({ technician_id: tech.id, name: tech.name, status: "failed", error: err });
        };

        if (existingLink?.calendar_event_id) {
          // ── PATCH existing event ──
          techLog(`Updating existing event ${existingLink.calendar_event_id.slice(0, 20)}...`);
          const patchRes = await fetch(
            `${GRAPH_BASE}/me/events/${existingLink.calendar_event_id}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${msToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(eventPayload),
            }
          );

          if (patchRes.ok) {
            const patchData = await patchRes.json();
            techLog("Event updated successfully");
            await updateLinkSuccess(
              existingLink.calendar_event_id,
              patchData.webLink || existingLink.calendar_event_url,
              "updated"
            );
          } else {
            const errText = await patchRes.text();
            techLog(`PATCH failed: ${patchRes.status}`);

            if (patchRes.status === 404) {
              // Event was deleted in Outlook, create new one
              techLog("Event not found, creating new...");
              // Nullify the old event ID
              await supabaseAdmin.from("job_calendar_links").update({
                calendar_event_id: null,
                calendar_event_url: null,
              }).eq("job_id", job_id).eq("user_id", tech.user_id).eq("provider", "microsoft");

              // Fall through to create
              const createRes = await fetch(`${GRAPH_BASE}/me/events`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${msToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(eventPayload),
              });

              if (createRes.ok) {
                const createData = await createRes.json();
                techLog(`New event created after 404: ${createData.id?.slice(0, 20)}`);
                await updateLinkSuccess(createData.id, createData.webLink || null, "recreated");
              } else {
                const createErr = await createRes.text();
                techLog(`Re-create failed: ${createRes.status}`);
                await updateLinkFailure(createRes.status, createErr);
              }
            } else {
              await updateLinkFailure(patchRes.status, errText);
            }
          }
        } else {
          // ── CREATE new event ──
          techLog("Creating new Outlook event...");
          const createRes = await fetch(`${GRAPH_BASE}/me/events`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${msToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(eventPayload),
          });

          if (createRes.ok) {
            const createData = await createRes.json();
            techLog(`Event created: ${createData.id?.slice(0, 20)}`);
            await updateLinkSuccess(createData.id, createData.webLink || null, "created");
          } else {
            const errText = await createRes.text();
            techLog(`Create failed: ${createRes.status}`);
            await updateLinkFailure(createRes.status, errText);
          }
        }
      }

      // ── Update dirty state ──
      const successCount = results.filter((r: any) => r.status !== "failed" && r.status !== "in_progress").length;
      const failureCount = results.filter((r: any) => r.status === "failed").length;
      const allSynced = failureCount === 0 && results.length > 0;

      if (allSynced) {
        await supabaseAdmin.from("events").update({
          calendar_dirty: false,
          calendar_last_synced_at: new Date().toISOString(),
        }).eq("id", job_id);
        log("calendar_dirty cleared, all synced");
      }

      // ── Audit log ──
      await supabaseAdmin.from("job_calendar_audit").insert({
        job_id,
        performed_by: authUser.id,
        operation_id: operationId,
        action: "upsert",
        technicians_count: results.length,
        successes_count: successCount,
        failures_count: failureCount,
        override_conflicts: !!override_conflicts,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        summary: { results: results.map((r: any) => ({ tech: r.name, status: r.status, error_code: r.error?.error_code })) },
      });

      // Legacy event_logs
      await supabaseAdmin.from("event_logs").insert({
        event_id: job_id,
        action_type: "outlook_calendar_sync",
        performed_by: authUser.id,
        change_summary: `Outlook-synk: ${successCount}/${results.length} teknikere synkronisert`,
      });

      return respond({ results, logs, operation_id: operationId });
    }

    // ─── ACTION: unlink_job_events ───
    if (action === "unlink_job_events") {
      // PERMISSION GUARD: calendar.write_events required
      const canWrite = await checkPerm("calendar.write_events");
      if (!canWrite) {
        log(`DENIED: User ${authUser.id} lacks calendar.write_events`);
        return respond({ error: "Mangler rettighet: calendar.write_events", error_code: "permission_denied", logs }, 403);
      }
      const { job_id, user_ids } = body;
      if (!job_id) return respond({ error: "Missing job_id", logs }, 400);

      const operationId = crypto.randomUUID();
      const startedAt = new Date().toISOString();

      let query = supabaseAdmin
        .from("job_calendar_links")
        .select("*, technicians(email, name, user_id)")
        .eq("job_id", job_id);

      if (user_ids?.length) {
        query = query.in("user_id", user_ids);
      }

      const { data: links } = await query;
      const results: any[] = [];

      for (const link of links || []) {
        const tech = link.technicians;
        const techLog = (msg: string) => log(`[${tech?.name || link.user_id}] ${msg}`);

        if (link.calendar_event_id && tech?.user_id) {
          const msToken = await ensureValidMsToken(supabaseAdmin, tech.user_id, techLog);
          if (msToken) {
            techLog(`Deleting event ${link.calendar_event_id.slice(0, 20)}...`);
            const delRes = await fetch(
              `${GRAPH_BASE}/me/events/${link.calendar_event_id}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${msToken}` },
              }
            );
            techLog(`Delete: ${delRes.status} ${delRes.ok || delRes.status === 404 ? "OK" : "FAILED"}`);
            await delRes.text();
          } else {
            techLog("No token, cannot delete Outlook event");
          }
        }

        await supabaseAdmin.from("job_calendar_links").update({
          sync_status: "unlinked",
          calendar_event_id: null,
          calendar_event_url: null,
          last_error: null,
          last_sync_hash: null,
        }).eq("id", link.id);

        results.push({ technician_id: link.technician_id, name: tech?.name, status: "unlinked" });
      }

      // Audit
      await supabaseAdmin.from("job_calendar_audit").insert({
        job_id,
        performed_by: authUser.id,
        operation_id: operationId,
        action: "unlink",
        technicians_count: results.length,
        successes_count: results.length,
        failures_count: 0,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        summary: { results },
      });

      await supabaseAdmin.from("event_logs").insert({
        event_id: job_id,
        action_type: "outlook_calendar_unlinked",
        performed_by: authUser.id,
        change_summary: `Outlook-hendelser fjernet for ${results.length} tekniker(e)`,
      });

      return respond({ results, logs });
    }

    // ─── ACTION: repair_sync ───
    if (action === "repair_sync") {
      // PERMISSION GUARD: calendar.write_events required
      const canWrite = await checkPerm("calendar.write_events");
      if (!canWrite) {
        log(`DENIED: User ${authUser.id} lacks calendar.write_events`);
        return respond({ error: "Mangler rettighet: calendar.write_events", error_code: "permission_denied", logs }, 403);
      }
      const { job_id } = body;
      if (!job_id) return respond({ error: "Missing job_id", logs }, 400);

      log(`Repair sync for job ${job_id}`);

      // Get ALL non-unlinked links (both failed AND linked)
      const { data: allLinks } = await supabaseAdmin
        .from("job_calendar_links")
        .select("*, technicians(name, user_id)")
        .eq("job_id", job_id)
        .neq("sync_status", "unlinked");

      const repairActions: any[] = [];

      for (const link of allLinks || []) {
        const tech = link.technicians;
        const techLog2 = (msg: string) => log(`[repair][${tech?.name || link.user_id}] ${msg}`);

        // ── For linked entries: verify event still exists in Graph ──
        if (link.sync_status === "linked" && link.calendar_event_id && tech?.user_id) {
          const msToken = await ensureValidMsToken(supabaseAdmin, tech.user_id, techLog2);
          if (msToken) {
            techLog2(`Verifying event ${link.calendar_event_id.slice(0, 20)}...`);
            const verifyRes = await fetch(
              `${GRAPH_BASE}/me/events/${link.calendar_event_id}?$select=id`,
              { headers: { Authorization: `Bearer ${msToken}` } }
            );

            if (verifyRes.status === 404) {
              techLog2("Event NOT found in Outlook — marking as failed/itemNotFound");
              const err: StructuredError = {
                error_code: "itemNotFound",
                message: "Outlook-hendelsen finnes ikke lenger.",
                recommendation: "Klikk 'Reparer synk' igjen for å klargjøre for ny synk.",
              };
              await supabaseAdmin.from("job_calendar_links").update({
                sync_status: "failed",
                last_error: JSON.stringify(err),
              }).eq("id", link.id);
              repairActions.push({ technician: tech.name, action: "verified_missing", ready_for_resync: false });
            } else if (verifyRes.ok) {
              techLog2("Event verified OK");
              repairActions.push({ technician: tech.name, action: "verified_ok", ready_for_resync: false });
            } else {
              await verifyRes.text();
              techLog2(`Verify returned ${verifyRes.status}, skipping`);
              repairActions.push({ technician: tech.name, action: "verify_error", ready_for_resync: false });
            }
            continue;
          } else {
            techLog2("No token to verify event");
            repairActions.push({ technician: tech.name, action: "needs_reauth_for_verify", ready_for_resync: false });
            continue;
          }
        }

        // ── For failed entries: handle based on error code ──
        let parsedError: StructuredError | null = null;
        try { parsedError = JSON.parse(link.last_error || "{}"); } catch { /* ignore */ }

        if (parsedError?.error_code === "itemNotFound") {
          // Nullify event ID so next upsert creates fresh
          await supabaseAdmin.from("job_calendar_links").update({
            calendar_event_id: null,
            calendar_event_url: null,
            last_sync_hash: null,
          }).eq("id", link.id);
          repairActions.push({ technician: tech?.name, action: "cleared_event_id", ready_for_resync: true });
        } else if (parsedError?.error_code === "missing_token" || parsedError?.error_code === "invalid_grant") {
          repairActions.push({ technician: tech?.name, action: "needs_reauth", ready_for_resync: false });
        } else {
          // Clear hash to force retry
          await supabaseAdmin.from("job_calendar_links").update({
            last_sync_hash: null,
          }).eq("id", link.id);
          repairActions.push({ technician: tech?.name, action: "cleared_hash", ready_for_resync: true });
        }
      }

      const readyCount = repairActions.filter(a => a.ready_for_resync).length;
      const verifiedMissing = repairActions.filter(a => a.action === "verified_missing").length;
      log(`Repair complete: ${repairActions.length} links processed, ${readyCount} ready for resync, ${verifiedMissing} found missing`);

      return respond({ repair_actions: repairActions, ready_for_resync: readyCount, verified_missing: verifiedMissing, logs });
    }

    return respond({ error: "Unknown action", logs }, 400);
  } catch (err) {
    console.error("[ms-calendar] Exception:", err);
    return respond({ error: "Internal server error", details: String(err) }, 500);
  }
});
