import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jobAttachmentLinks } from "../_shared/job-access-policy.ts";
import { buildOperationalJobBrief, briefEmailRows } from "../_shared/job-brief.ts";
import { formatJobSchedule } from "../_shared/job-time.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Determine overall job status based on all approval statuses.
 */
function computeJobStatus(approvals: any[]): string {
  if (approvals.some((a: any) => a.status === "rejected")) return "rejected";
  if (approvals.some((a: any) => a.status === "reschedule_requested")) return "time_change_proposed";
  if (approvals.every((a: any) => a.status === "approved")) return "scheduled";
  return "requested";
}

/**
 * Ensure Microsoft access token is valid; refresh if expired.
 * Returns a valid access_token or null.
 */
async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string
): Promise<string | null> {
  const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userErr || !userData?.user) {
    console.error("[handle-approval] Failed to fetch user:", userErr);
    return null;
  }

  const meta = userData.user.user_metadata || {};
  const accessToken = meta.ms_access_token;
  const refreshToken = meta.ms_refresh_token;
  const expiresAt = meta.ms_expires_at;

  if (!accessToken) {
    console.error("[handle-approval] No MS access token in user metadata");
    return null;
  }

  // Check if token is still valid (with 5 min buffer)
  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  // Token expired – refresh
  if (!refreshToken) {
    console.error("[handle-approval] No refresh token available");
    return null;
  }

  console.log("[handle-approval] Refreshing expired MS token for user", userId);

  const tokenRes = await fetch("https://login.microsoftonline.com/" + Deno.env.get("AZURE_TENANT_ID") + "/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("AZURE_CLIENT_ID")!,
      client_secret: Deno.env.get("AZURE_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "https://graph.microsoft.com/.default offline_access",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[handle-approval] Token refresh failed:", errText);
    return null;
  }

  const tokenData = await tokenRes.json();
  const newExpires = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  // Update metadata with spread to preserve existing fields
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: tokenData.access_token,
      ms_refresh_token: tokenData.refresh_token || refreshToken,
      ms_expires_at: newExpires,
    },
  });

  if (updateErr) {
    console.error("[handle-approval] Failed to update token metadata:", updateErr);
  }

  return tokenData.access_token;
}

/* ── Strip UTC offset so Graph uses the explicit timeZone property ── */
function toLocalDateTimeString(isoString: string): string {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/**
 * Create an Outlook calendar event for the technician.
 */
async function createOutlookEvent(
  accessToken: string,
  techEmail: string,
  job: any
): Promise<string | null> {
  const displayNumber = job.internal_number || job.job_number || "";
  const subject = displayNumber ? `${displayNumber} - ${job.title}` : job.title;

  const body: any = {
    subject,
    body: {
      contentType: "HTML",
      content: `<table>${briefEmailRows(buildOperationalJobBrief({ event: job }), { date: formatJobSchedule(job.start_time, job.end_time).startDate, time: `${formatJobSchedule(job.start_time, job.end_time).startTime} – ${formatJobSchedule(job.start_time, job.end_time).endTime}` })}</table>${jobAttachmentLinks(job.id, job.attachments)}`,
    },
    start: {
      dateTime: toLocalDateTimeString(job.start_time),
      timeZone: "Europe/Oslo",
    },
    end: {
      dateTime: toLocalDateTimeString(job.end_time),
      timeZone: "Europe/Oslo",
    },
  };

  if (job.address) {
    body.location = { displayName: job.address };
  }

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${techEmail}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[handle-approval] Graph API create event failed:", res.status, errText);
    return null;
  }

  const eventData = await res.json();
  return eventData.id || null;
}

/**
 * Delete an Outlook calendar event.
 */
async function deleteOutlookEvent(
  accessToken: string,
  techEmail: string,
  outlookEventId: string
): Promise<boolean> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${techEmail}/events/${outlookEventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok && res.status !== 404) {
    console.error("[handle-approval] Graph DELETE failed:", res.status);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, action, comment, proposed_start, proposed_end } = await req.json();

    if (!token || !action) {
      return new Response(JSON.stringify({ error: "Missing token or action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["approve", "reject", "reschedule"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch approval by token
    const { data: approval, error: fetchErr } = await supabaseAdmin
      .from("job_approvals")
      .select("*")
      .eq("token", token)
      .single();

    if (fetchErr || !approval) {
      return new Response(JSON.stringify({ error: "Ugyldig token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (approval.status !== "pending") {
      return new Response(JSON.stringify({ error: "Denne forespørselen er allerede besvart" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(approval.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Denne lenken har utløpt" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get technician info
    const { data: tech } = await supabaseAdmin
      .from("technicians")
      .select("name, email, user_id")
      .eq("user_id", approval.technician_user_id)
      .single();

    const techName = tech?.name || "Ukjent montør";

    // Update approval based on action
    let approvalStatus: string;
    let logMessage: string;
    const updateData: any = {
      responded_at: new Date().toISOString(),
    };

    if (action === "approve") {
      approvalStatus = "approved";
      logMessage = `Montør ${techName} godkjente jobben`;
    } else if (action === "reject") {
      if (!comment) {
        return new Response(JSON.stringify({ error: "Begrunnelse er påkrevd ved avslag" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      approvalStatus = "rejected";
      updateData.comment = comment;
      logMessage = `Montør ${techName} avslo jobben (begrunnelse: ${comment})`;
    } else {
      if (!proposed_start || !proposed_end) {
        return new Response(JSON.stringify({ error: "Foreslått start og slutt er påkrevd" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      approvalStatus = "reschedule_requested";
      updateData.proposed_start = proposed_start;
      updateData.proposed_end = proposed_end;
      if (comment) updateData.comment = comment;
      logMessage = `Montør ${techName} foreslo nytt tidspunkt`;
    }

    updateData.status = approvalStatus;

    const { data: claimedApproval, error: updateErr } = await supabaseAdmin
      .from("job_approvals")
      .update(updateData)
      .eq("id", approval.id)
      .eq("token", token)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateErr) {
      console.error("[handle-approval] Update error:", updateErr);
      return new Response(JSON.stringify({ error: "Kunne ikke oppdatere svar" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!claimedApproval) {
      return new Response(JSON.stringify({ error: "Denne forespørselen er allerede besvart eller erstattet" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Outlook Calendar Sync on Approve ---
    let calendarWarning: string | null = null;

    if (action === "approve") {
      // Idempotency: skip if event already created
      if (approval.outlook_event_id) {
        console.log("[handle-approval] Outlook event already exists, skipping:", approval.outlook_event_id);
      } else if (tech?.email && tech?.user_id) {
        try {
          // Fetch job details
          const { data: job } = await supabaseAdmin
            .from("events")
            .select("id,title,description,start_time,end_time,address,customer,internal_number,job_number,microsoft_event_id,site_contact_name,site_contact_phone,access_notes,attachments")
            .eq("id", approval.job_id)
            .single();

          if (job) {
            // Skip if calendar-write-sync already created an Outlook event for this job
            if (job.microsoft_event_id) {
              console.log("[handle-approval] Outlook event already exists via calendar-write-sync, skipping");
            } else {
              const msToken = await ensureValidMsToken(supabaseAdmin, tech.user_id);

              if (msToken) {
                const outlookEventId = await createOutlookEvent(msToken, tech.email, job);

                if (outlookEventId) {
                  // Save outlook_event_id on the approval row AND on the event
                  await Promise.all([
                    supabaseAdmin
                      .from("job_approvals")
                      .update({ outlook_event_id: outlookEventId })
                      .eq("id", approval.id),
                    supabaseAdmin
                      .from("events")
                      .update({
                        microsoft_event_id: outlookEventId,
                        outlook_sync_status: "synced",
                        outlook_last_synced_at: new Date().toISOString(),
                      })
                      .eq("id", approval.job_id),
                  ]);

                  console.log("[handle-approval] Outlook event created:", outlookEventId);

                  await supabaseAdmin.from("event_logs").insert({
                    event_id: approval.job_id,
                    performed_by: approval.technician_user_id,
                    action_type: "calendar_synced",
                    change_summary: `Kalenderavtale opprettet for ${techName}`,
                  });
                } else {
                  calendarWarning = "Godkjenning registrert, men kalenderavtale kunne ikke opprettes.";
                  console.error("[handle-approval] Failed to create Outlook event");
                }
              } else {
                calendarWarning = "Godkjenning registrert, men Microsoft-token er ugyldig eller utløpt.";
                console.error("[handle-approval] No valid MS token for calendar sync");
              }
            }
          }
        } catch (calErr) {
          calendarWarning = "Godkjenning registrert, men kalendersynk feilet.";
          console.error("[handle-approval] Calendar sync exception:", calErr);
        }
      }
    }

    // --- Outlook Calendar Cleanup on Reject ---
    // Delete ALL outlook events for this job (from events table + all approvals)
    if (action === "reject" && tech?.email && tech?.user_id) {
      try {
        const msToken = await ensureValidMsToken(supabaseAdmin, tech.user_id);
        if (msToken) {
          // Collect all unique outlook event IDs to delete
          const outlookIdsToDelete = new Set<string>();

          // 1. From events table
          const { data: job } = await supabaseAdmin
            .from("events")
            .select("microsoft_event_id")
            .eq("id", approval.job_id)
            .single();
          if (job?.microsoft_event_id) outlookIdsToDelete.add(job.microsoft_event_id);

          // 2. From ALL approvals for this job (catches orphaned events from re-assignments)
          const { data: allJobApprovals } = await supabaseAdmin
            .from("job_approvals")
            .select("outlook_event_id")
            .eq("job_id", approval.job_id)
            .not("outlook_event_id", "is", null);

          for (const a of allJobApprovals || []) {
            if (a.outlook_event_id) outlookIdsToDelete.add(a.outlook_event_id);
          }

          // 3. Current approval
          if (approval.outlook_event_id) outlookIdsToDelete.add(approval.outlook_event_id);

          console.log(`[handle-approval] Deleting ${outlookIdsToDelete.size} Outlook event(s) on rejection`);

          let anyDeleted = false;
          for (const oid of outlookIdsToDelete) {
            const deleted = await deleteOutlookEvent(msToken, tech.email, oid);
            if (deleted) anyDeleted = true;
          }

          if (anyDeleted) {
            // Clear events table
            await supabaseAdmin
              .from("events")
              .update({
                microsoft_event_id: null,
                microsoft_etag: null,
                outlook_sync_status: "not_synced",
                outlook_last_synced_at: null,
              })
              .eq("id", approval.job_id);

            // Clear all approval outlook_event_ids for this job
            await supabaseAdmin
              .from("job_approvals")
              .update({ outlook_event_id: null })
              .eq("job_id", approval.job_id);

            console.log("[handle-approval] All Outlook events deleted on rejection");

            await supabaseAdmin.from("event_logs").insert({
              event_id: approval.job_id,
              performed_by: approval.technician_user_id,
              action_type: "calendar_deleted",
              change_summary: `${outlookIdsToDelete.size} kalenderavtale(r) slettet etter avslag fra ${techName}`,
            });
          }
        }
      } catch (calErr) {
        console.error("[handle-approval] Rejection calendar cleanup failed:", calErr);
      }
    }

    // Re-fetch all approvals for this job to compute overall status
    const { data: allApprovals } = await supabaseAdmin
      .from("job_approvals")
      .select("status")
      .eq("job_id", approval.job_id);

    const newJobStatus = computeJobStatus(allApprovals || []);

    // Update job status
    const jobUpdate: any = { status: newJobStatus };
    if (approvalStatus === "reschedule_requested" && proposed_start && proposed_end) {
      jobUpdate.proposed_start = proposed_start;
      jobUpdate.proposed_end = proposed_end;
    }

    await supabaseAdmin
      .from("events")
      .update(jobUpdate)
      .eq("id", approval.job_id);

    // Log status change
    await supabaseAdmin.from("event_logs").insert({
      event_id: approval.job_id,
      performed_by: approval.technician_user_id,
      action_type: "status_changed",
      change_summary: logMessage,
    });

    // If all approved → log that job is now scheduled
    if (newJobStatus === "scheduled") {
      await supabaseAdmin.from("event_logs").insert({
        event_id: approval.job_id,
        performed_by: approval.technician_user_id,
        action_type: "status_changed",
        change_summary: "Alle montører godkjente – jobb satt til Planlagt",
      });
    }

    // Response notifications are created atomically by notify_job_approval_change.
    // No second producer, broad admin fan-out, e-mail or push dispatch here.

    const responseBody: any = {
      success: true,
      message: action === "approve" ? "Jobben er godkjent!" :
               action === "reject" ? "Jobben er avslått." :
               "Nytt tidspunkt er foreslått.",
    };

    if (calendarWarning) {
      responseBody.warning = calendarWarning;
    }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[handle-approval] Exception:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
