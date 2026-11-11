import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const MAILBOX = "postkontoret@mcsservice.no";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { submission_id, notification_type } = body;
    // notification_type: "new_order" | "confirmation" | "missing_info" | "critical_alert"

    if (!submission_id || !notification_type) {
      return json({ error: "submission_id and notification_type required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch submission with template
    const { data: submission, error: subErr } = await supabase
      .from("order_form_submissions")
      .select("*, order_form_templates(name, send_email_to)")
      .eq("id", submission_id)
      .single();

    if (subErr || !submission) {
      console.error("SUBMISSION_NOT_FOUND", { submission_id, error: subErr });
      return json({ error: "Submission not found" }, 404);
    }

    // Fetch field values
    const { data: values } = await supabase
      .from("order_form_submission_values")
      .select("field_key, value")
      .eq("submission_id", submission_id);

    const valMap: Record<string, any> = {};
    (values || []).forEach((v: any) => { valMap[v.field_key] = v.value; });

    // Smart field resolver: finds values by field key prefix (handles suffixed keys like "firmanavn_abc123")
    const findVal = (...prefixes: string[]): string => {
      for (const prefix of prefixes) {
        // Exact match first
        if (valMap[prefix]) return String(valMap[prefix]);
        // Prefix match (for keys with generated suffixes)
        const key = Object.keys(valMap).find(k => k.startsWith(prefix));
        if (key && valMap[key]) return String(valMap[key]);
      }
      return "";
    };

    // Fetch attachments
    const { data: attachments } = await supabase
      .from("order_form_submission_attachments")
      .select("file_name, category")
      .eq("submission_id", submission_id);

    const summary = submission.summary || {};
    const template = (submission as any).order_form_templates;
    const appUrl = supabaseUrl.replace(".supabase.co", "").includes("localhost")
      ? "http://localhost:8080"
      : "https://mcsressurs.lovable.app";
    const detailUrl = `${appUrl}/orders/${submission_id}`;

    // Smart fallback resolution for key fields using prefix matching
    const kundenavn = findVal("firmanavn", "kundenavn", "kunde_navn") || (summary as any).kundenavn || (summary as any).firmanavn || "Ikke angitt";
    const oppdragstittel = findVal("oppdragstittel", "oppdragssted") || (summary as any).oppdragstittel || template?.name || "Bestilling";
    const hastegrad = findVal("hastegrad") || (summary as any).hastegrad || "Normal";
    const bestillingstype = submission.requester_type === "internal" ? "Intern" : "Ekstern";
    const priorityEmoji = hastegrad === "Kritisk stopp" ? "🔴" : hastegrad === "Høy" ? "🟠" : "";
    const bestillerNavn = findVal("bestiller_navn", "kontaktperson", "kontaktperson_kunde") || (summary as any).bestiller_navn || "Ikke angitt";
    const bestillerTelefon = findVal("bestiller_telefon", "telefon_kunde", "telefon", "kontakt_telefon") || "";

    // Resolve notification recipient using explicit fields with fallback chain
    const resolvedRecipientEmail = submission.notification_recipient_email
      || submission.submitter_email
      || findVal("bestiller_epost", "epost_kunde", "epost", "kontakt_epost")
      || "";
    const bestillerEpost = resolvedRecipientEmail;
    const resolvedRecipientName = submission.notification_recipient_name
      || submission.submitter_name
      || bestillerNavn;
    const anleggsadresse = findVal("anleggsadresse", "oppdragssted", "adresse") || "";
    const materialansvar = findVal("materialansvar") || "Ikke angitt";
    const referanse = findVal("referanse_po", "fakturamerking_po", "midlertidig_referanse", "po_nummer") || "Ikke angitt";
    const onsketDato = findVal("onsket_utfort_dato", "onsket_dato", "oensket_dato") || "Ikke angitt";
    const arbeidsbeskrivelse = findVal("detaljert_arbeidsbeskrivelse", "arbeidsbeskrivelse", "beskrivelse") || "";

    // Build email based on type
    let subject = "";
    let bodyHtml = "";
    let recipients: string[] = [];

    if (notification_type === "new_order") {
      subject = `${priorityEmoji ? priorityEmoji + " " : ""}[Ny bestilling] ${submission.submission_no} | ${kundenavn} | ${hastegrad}`;
      
      const sendTo = template?.send_email_to;
      recipients = Array.isArray(sendTo) && sendTo.length > 0 ? sendTo : [MAILBOX];

      // Add extra recipients for critical
      if (hastegrad === "Kritisk stopp" && !recipients.includes(MAILBOX)) {
        recipients.push(MAILBOX);
      }

      bodyHtml = buildNewOrderEmail({
        submissionNo: submission.submission_no,
        templateName: template?.name || "Bestillingsskjema",
        kundenavn,
        oppdragstittel,
        hastegrad,
        bestillingstype,
        onsketDato,
        bestillerNavn,
        bestillerEpost,
        bestillerTelefon,
        anleggsadresse,
        materialansvar,
        referanse,
        arbeidsbeskrivelse,
        attachments: attachments || [],
        detailUrl,
        qualityScore: submission.quality_score,
      });

      // Update notification_sent_at
      await supabase.from("order_form_submissions")
        .update({ notification_sent_at: new Date().toISOString() })
        .eq("id", submission_id);

    } else if (notification_type === "confirmation") {
      if (!bestillerEpost) {
        console.log("NO_BESTILLER_EMAIL", { submission_id });
        return json({ success: false, reason: "no_bestiller_email" });
      }

      subject = `Bestilling mottatt: ${submission.submission_no} - ${oppdragstittel}`;
      recipients = [bestillerEpost];

      const trackingToken = submission.public_tracking_token;
      const trackingUrl = trackingToken ? `${appUrl}/bestilling/status/${trackingToken}` : null;

      bodyHtml = buildConfirmationEmail({
        submissionNo: submission.submission_no,
        kundenavn,
        oppdragstittel,
        detailUrl,
        trackingUrl,
      });

      await supabase.from("order_form_submissions")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", submission_id);

    } else if (notification_type === "missing_info") {
      if (!bestillerEpost) {
        return json({ success: false, reason: "no_bestiller_email" });
      }

      const { missing_items, free_text } = body;
      subject = `Forespørsel om mer info: ${submission.submission_no} - ${oppdragstittel}`;
      recipients = [bestillerEpost];

      const trackingToken = submission.public_tracking_token;
      const trackingUrl = trackingToken ? `${appUrl}/bestilling/status/${trackingToken}` : null;

      bodyHtml = buildMissingInfoEmail({
        submissionNo: submission.submission_no,
        kundenavn,
        oppdragstittel,
        missingItems: missing_items || [],
        freeText: free_text || "",
        detailUrl,
        trackingUrl,
      });

    } else if (notification_type === "customer_update") {
      // Generic customer update notification - triggered by status changes, assignments, etc.
      if (!bestillerEpost) {
        return json({ success: false, reason: "no_bestiller_email" });
      }

      const { event_key, custom_message } = body;
      recipients = [bestillerEpost];
      // Idempotency: the same customer_update event is sent at most once per 10 minutes.
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recent } = await supabase.from("order_form_activity_log")
        .select("payload").eq("submission_id", submission_id).eq("event_type", "notification_sent").gte("created_at", since);
      // A combined «Venter kunde» + message e-mail counts as the status e-mail too.
      if ((recent || []).some((r: any) => (r?.payload?.type === "customer_update" || r?.payload?.type === "shared_message") && r?.payload?.event_key === (event_key || "status_changed"))) {
        return json({ success: true, skipped_duplicate: true });
      }

      const trackingToken = submission.public_tracking_token;
      const trackingUrl = trackingToken ? `${appUrl}/bestilling/status/${trackingToken}` : null;

      const eventTemplates: Record<string, { subject: string; heading: string; body: string; color: string; colorFg: string }> = {
        assigned: {
          subject: `Oppdatering: ${submission.submission_no} - Ansvarlig tildelt`,
          heading: "Ansvarlig er tildelt",
          body: "Det er nå satt en ansvarlig for oppfølging av din bestilling. Vi vil holde deg oppdatert om videre fremdrift.",
          color: "#DBEAFE", colorFg: "#1E40AF",
        },
        received: {
          subject: `Bekreftelse: ${submission.submission_no} - Bestilling mottatt`,
          heading: "Vi har mottatt bestillingen",
          body: "Bestillingen din er registrert hos MCS. Du kan følge saken på sporingslenken.",
          color: "#DBEAFE", colorFg: "#1E40AF",
        },
        under_review: {
          subject: `Oppdatering: ${submission.submission_no} - Vi har tatt tak i saken`,
          heading: "Vi har tatt tak i bestillingen",
          body: "MCS har startet behandlingen av bestillingen din. Du får beskjed når den er planlagt.",
          color: "#DBEAFE", colorFg: "#1E40AF",
        },
        closed: {
          subject: `Oppdatering: ${submission.submission_no} - Saken er avsluttet`,
          heading: "Saken er avsluttet",
          body: "Bestillingen er avsluttet hos MCS. Se sporingslenken for status, og ta kontakt om du har spørsmål.",
          color: "#F3F4F6", colorFg: "#374151",
        },
        status_changed: {
          subject: `Oppdatering: ${submission.submission_no} - Status endret`,
          heading: "Status er oppdatert",
          body: "Statusen på din bestilling er oppdatert. Sjekk sporingslenken for detaljer.",
          color: "#DBEAFE", colorFg: "#1E40AF",
        },
        task_created: {
          subject: `Oppdatering: ${submission.submission_no} - Oppgave opprettet`,
          heading: "Oppgave er opprettet",
          body: "Det er nå opprettet en oppgave for din bestilling og arbeidet vil bli planlagt.",
          color: "#DBEAFE", colorFg: "#1E40AF",
        },
        in_progress: {
          subject: `Oppdatering: ${submission.submission_no} - Under arbeid`,
          heading: "Arbeidet er i gang",
          body: "Vi har startet arbeidet med din bestilling.",
          color: "#FEF3C7", colorFg: "#92400E",
        },
        completed: {
          subject: `Oppdatering: ${submission.submission_no} - Ferdig behandlet`,
          heading: "Bestillingen er ferdig behandlet",
          body: "Din bestilling er nå ferdig behandlet. Ta gjerne kontakt om du har spørsmål.",
          color: "#DCFCE7", colorFg: "#166534",
        },
        waiting_customer: {
          subject: `Oppdatering: ${submission.submission_no} - Vi venter på svar fra deg`,
          heading: "Status endret til Venter på kunde",
          body: "Status endret til Venter på kunde. Vi avventer tilbakemelding fra deg. Følg saken via sporingslenken.",
          color: "#FEF3C7", colorFg: "#92400E",
        },
        rejected: {
          subject: `Oppdatering: ${submission.submission_no} - Avvist`,
          heading: "Bestillingen er avvist",
          body: "Din bestilling er dessverre avvist. Ta gjerne kontakt for mer informasjon.",
          color: "#FEE2E2", colorFg: "#991B1B",
        },
      };

      const tmpl = eventTemplates[event_key] || eventTemplates.status_changed;
      subject = tmpl.subject;

      bodyHtml = buildCustomerUpdateEmail({
        submissionNo: submission.submission_no,
        kundenavn,
        oppdragstittel,
        heading: tmpl.heading,
        bodyText: custom_message || tmpl.body,
        headingBg: tmpl.color,
        headingFg: tmpl.colorFg,
        trackingUrl,
      });
    } else if (notification_type === "field_request") {
      // Dedicated, action-oriented email when admin asks bestiller to fill in missing fields.
      if (!bestillerEpost) {
        return json({ success: false, reason: "no_bestiller_email" });
      }

      const { field_request_batch_id } = body;

      // Fetch the open requests for this batch (or all open if no batch given)
      let frQuery = supabase
        .from("order_form_field_requests")
        .select("field_label, is_free_text, requested_by_name")
        .eq("submission_id", submission_id)
        .eq("status", "open");
      if (field_request_batch_id) {
        frQuery = frQuery.eq("request_batch_id", field_request_batch_id);
      }
      const { data: requests } = await frQuery;

      const fieldItems = (requests || [])
        .filter((r: any) => !r.is_free_text)
        .map((r: any) => r.field_label as string);
      const freeTextItems = (requests || [])
        .filter((r: any) => r.is_free_text)
        .map((r: any) => r.field_label as string);
      const requestedBy = (requests || []).find((r: any) => r.requested_by_name)?.requested_by_name || "";

      const trackingToken = submission.public_tracking_token;
      const trackingUrl = trackingToken ? `${appUrl}/bestilling/status/${trackingToken}` : null;

      subject = `Vi trenger litt mer info: ${submission.submission_no} – ${oppdragstittel}`;
      recipients = [bestillerEpost];

      bodyHtml = buildFieldRequestEmail({
        submissionNo: submission.submission_no,
        kundenavn,
        oppdragstittel,
        recipientName: resolvedRecipientName,
        fieldItems,
        freeTextItems,
        requestedBy,
        trackingUrl,
      });

    } else if (notification_type === "shared_message") {
      // Shared message notification to bestiller
      if (!bestillerEpost) {
        return json({ success: false, reason: "no_bestiller_email" });
      }

      const { message_id } = body;
      let messageBody = "";
      let senderName = "Saksbehandler";

      if (message_id) {
        const { data: msg } = await supabase
          .from("order_form_messages")
          .select("body, sender_name, is_visible_to_customer, visibility, email_notification_sent, submission_id")
          .eq("id", message_id)
          .single();
        // Never e-mail an internal note; never e-mail the same message twice.
        if (!msg || msg.submission_id !== submission_id) return json({ success: false, reason: "message_not_found" });
        if (!msg.is_visible_to_customer || msg.visibility !== "shared") return json({ success: false, reason: "message_not_shared" });
        if (msg.email_notification_sent) return json({ success: true, skipped_duplicate: true });
        if (msg) {
          messageBody = msg.body || "";
          senderName = msg.sender_name || senderName;
        }
      }

      const trackingToken = submission.public_tracking_token;
      const trackingUrl = trackingToken ? `${appUrl}/bestilling/status/${trackingToken}` : null;

      // Optional combined status: one e-mail for «Venter kunde» + the personal message.
      const combinedWaiting = body.status_event_key === "waiting_customer";
      subject = combinedWaiting
        ? `Oppdatering: ${submission.submission_no} - Vi venter på svar fra deg`
        : `Melding: ${submission.submission_no} - ${oppdragstittel}`;
      recipients = [bestillerEpost];

      const baseText = messageBody || "Du har fått en ny melding angående din bestilling. Se sporingslenken for detaljer.";
      bodyHtml = buildCustomerUpdateEmail({
        submissionNo: submission.submission_no,
        kundenavn,
        oppdragstittel,
        heading: combinedWaiting ? "Status endret til Venter på kunde" : "Ny melding fra " + senderName,
        bodyText: combinedWaiting
          ? `${baseText}<br><br>— ${senderName}<br><br>Vi avventer tilbakemelding fra deg. Følg saken via sporingslenken.`
          : baseText,
        headingBg: "#DBEAFE",
        headingFg: "#1E40AF",
        trackingUrl,
      });
    }

    if (recipients.length === 0) {
      return json({ success: false, reason: "no_recipients" });
    }

    // Get Graph token and send
    const tokenResult = await getGraphToken();
    if (tokenResult.error) {
      console.error("GRAPH_TOKEN_ERROR", tokenResult.error);
      await supabase.from("order_form_submissions")
        .update({ notification_error: tokenResult.error })
        .eq("id", submission_id);
      return json({ success: false, error: tokenResult.error });
    }

    // For customer-facing notifications, set replyTo so customer replies are
    // routed back to this submission via the inbox-sync matcher.
    const customerFacingTypes = new Set(["shared_message", "missing_info", "customer_update", "confirmation", "field_request"]);
    const isCustomerFacing = customerFacingTypes.has(notification_type);
    const inboundToken = (submission as any).inbound_token as string | undefined;
    const replyToAddress = isCustomerFacing && inboundToken
      ? `order-msg+${inboundToken}@mcsservice.no`
      : undefined;
    const extraHeaders = isCustomerFacing
      ? [
          { name: "X-MCS-Order-Submission-ID", value: submission.id },
          { name: "X-MCS-Order-Submission-No", value: submission.submission_no || "" },
          { name: "X-MCS-Entity", value: "order_form_submission" },
          ...(inboundToken ? [{ name: "X-MCS-Order-Inbound-Token", value: inboundToken }] : []),
        ]
      : undefined;

    const sendResult = await sendMailViaGraph(tokenResult.token!, {
      subject,
      bodyHtml,
      recipients,
      mailbox: MAILBOX,
      saveToSentItems: true,
      replyToAddress,
      replyToName: replyToAddress ? `Bestilling ${submission.submission_no}` : undefined,
      extraHeaders,
    });

    if (sendResult.error) {
      console.error("SEND_FAILED", { error: sendResult.error, statusCode: sendResult.statusCode });
      await supabase.from("order_form_submissions")
        .update({ notification_error: sendResult.error })
        .eq("id", submission_id);
      
      await supabase.from("order_form_activity_log").insert({
        submission_id,
        event_type: "notification_failed",
        payload: { type: notification_type, error: sendResult.error, recipients, event_key: body.event_key || null, message_id: body.message_id || null },
      });

      return json({ success: false, error: sendResult.error });
    }

    // Log success
    await supabase.from("order_form_activity_log").insert({
      submission_id,
      event_type: "notification_sent",
      payload: { type: notification_type, recipients, subject, reply_to: replyToAddress || null, event_key: body.event_key || body.status_event_key || null, message_id: body.message_id || null, provider: "graph_accepted" },
    });
    // Mark the message as e-mailed ONLY after Microsoft accepted the send.
    if (notification_type === "shared_message" && body.message_id) {
      await supabase.from("order_form_messages")
        .update({ email_notification_sent: true, email_notification_sent_at: new Date().toISOString() })
        .eq("id", body.message_id);
    }

    console.log("EMAIL_SENT", { submission_id, notification_type, recipients, reply_to: replyToAddress || null });
    return json({ success: true, recipients });

  } catch (err) {
    console.error("ORDER_FORM_NOTIFY_ERROR", String(err));
    return json({ error: String(err) }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

// ── Email builders ──

function buildNewOrderEmail(p: {
  submissionNo: string; templateName: string; kundenavn: string; oppdragstittel: string;
  hastegrad: string; bestillingstype: string; onsketDato: string;
  bestillerNavn: string; bestillerEpost: string; bestillerTelefon: string;
  anleggsadresse: string; materialansvar: string; referanse: string;
  arbeidsbeskrivelse: string; attachments: any[]; detailUrl: string;
  qualityScore: string;
}): string {
  const hasteBg = p.hastegrad === "Kritisk stopp" ? "#FEE2E2" : p.hastegrad === "Høy" ? "#FFF7ED" : "#F0FDF4";
  const hasteFg = p.hastegrad === "Kritisk stopp" ? "#991B1B" : p.hastegrad === "Høy" ? "#9A3412" : "#166534";
  const qualityBg = p.qualityScore === "red" ? "#FEE2E2" : p.qualityScore === "yellow" ? "#FEF3C7" : "#DCFCE7";
  const qualityLabel = p.qualityScore === "red" ? "Utilstrekkelig" : p.qualityScore === "yellow" ? "Noe mangler" : "Komplett";

  const attHtml = p.attachments.length > 0
    ? `<tr><td style="padding:6px 12px;color:#6B7280;font-size:13px;">Vedlegg</td><td style="padding:6px 12px;font-size:13px;">${p.attachments.map((a: any) => `${a.file_name} (${a.category || "Annet"})`).join("<br/>")}</td></tr>`
    : "";

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;">
  <div style="background:${hasteBg};border-radius:8px;padding:16px;margin-bottom:16px;">
    <h2 style="margin:0 0 4px;color:${hasteFg};font-size:18px;">Ny bestilling: ${p.submissionNo}</h2>
    <p style="margin:0;color:${hasteFg};font-size:14px;">${p.kundenavn} · ${p.oppdragstittel}</p>
    <p style="margin:4px 0 0;color:${hasteFg};font-size:12px;opacity:0.8;">Skjema: ${p.templateName}</p>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:16px;">
    <span style="background:${hasteBg};color:${hasteFg};padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;">${p.hastegrad}</span>
    <span style="background:#EFF6FF;color:#1E40AF;padding:4px 10px;border-radius:4px;font-size:12px;">${p.bestillingstype}</span>
    <span style="background:${qualityBg};padding:4px 10px;border-radius:4px;font-size:12px;">${qualityLabel}</span>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr style="background:#F9FAFB"><td style="padding:6px 12px;color:#6B7280;">Bestiller</td><td style="padding:6px 12px;">${p.bestillerNavn}${p.bestillerTelefon ? ` · ${p.bestillerTelefon}` : ""}${p.bestillerEpost ? ` · ${p.bestillerEpost}` : ""}</td></tr>
    <tr><td style="padding:6px 12px;color:#6B7280;">Kunde</td><td style="padding:6px 12px;">${p.kundenavn}</td></tr>
    <tr style="background:#F9FAFB"><td style="padding:6px 12px;color:#6B7280;">Adresse</td><td style="padding:6px 12px;">${p.anleggsadresse || "Ikke angitt"}</td></tr>
    <tr><td style="padding:6px 12px;color:#6B7280;">Ønsket dato</td><td style="padding:6px 12px;">${p.onsketDato}</td></tr>
    <tr style="background:#F9FAFB"><td style="padding:6px 12px;color:#6B7280;">Material</td><td style="padding:6px 12px;">${p.materialansvar}</td></tr>
    <tr><td style="padding:6px 12px;color:#6B7280;">Referanse</td><td style="padding:6px 12px;">${p.referanse}</td></tr>
    ${attHtml}
  </table>
  ${p.arbeidsbeskrivelse ? `<div style="margin:16px 0;padding:12px;background:#F9FAFB;border-radius:6px;font-size:13px;"><strong>Beskrivelse:</strong><br/>${p.arbeidsbeskrivelse.replace(/\n/g, "<br/>")}</div>` : ""}
  <div style="margin:20px 0;">
    <a href="${p.detailUrl}" style="display:inline-block;background:#2563EB;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">Åpne bestilling i MCS</a>
  </div>
  <p style="color:#9CA3AF;font-size:11px;">Denne e-posten er sendt automatisk fra MCS Ressurs.</p>
</div>`;
}

/**
 * Felles svar-blokk for kundevendte e-poster.
 * Forklarer eksplisitt at mottaker kan svare direkte på e-posten (med vedlegg)
 * eller bruke knappen for å gå til kundesiden.
 */
function buildReplyBlock(trackingUrl: string | null, buttonLabel = "Følg bestillingen"): string {
  const button = trackingUrl
    ? `<div style="margin:14px 0 4px;">
         <a href="${trackingUrl}" style="display:inline-block;background:#2563EB;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">${buttonLabel}</a>
       </div>`
    : "";
  const altLine = trackingUrl
    ? `<p style="margin:6px 0 0;font-size:14px;color:#374151;">Du kan også bruke knappen under for å åpne kundesiden og sende melding derfra.</p>`
    : "";
  return `
  <div style="margin:18px 0;padding:14px 16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
    <p style="margin:0;font-size:14px;color:#0F172A;font-weight:600;">Slik svarer du oss</p>
    <p style="margin:6px 0 0;font-size:14px;color:#374151;">Du kan svare direkte på denne e-posten – også med vedlegg. Svaret havner automatisk i bestillingstråden.</p>
    ${altLine}
    ${button}
  </div>`;
}

function buildConfirmationEmail(p: {
  submissionNo: string; kundenavn: string; oppdragstittel: string; detailUrl: string; trackingUrl: string | null;
}): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;">
  <div style="background:#DCFCE7;border-radius:8px;padding:16px;margin-bottom:16px;">
    <h2 style="margin:0 0 4px;color:#166534;font-size:18px;">✅ Bestilling mottatt</h2>
    <p style="margin:0;color:#166534;font-size:14px;">${p.submissionNo}</p>
  </div>
  <p style="font-size:14px;color:#374151;">Hei,</p>
  <p style="font-size:14px;color:#374151;">Vi har mottatt bestillingen din for <strong>${p.oppdragstittel}</strong> (kunde: ${p.kundenavn}).</p>
  <p style="font-size:14px;color:#374151;">Bestillingen er registrert med nummer <strong>${p.submissionNo}</strong> og vil bli behandlet av vårt serviceteam.</p>
  <p style="font-size:14px;color:#374151;">Du vil bli kontaktet dersom vi trenger mer informasjon.</p>
  ${buildReplyBlock(p.trackingUrl, "Følg bestillingen")}
  <p style="color:#9CA3AF;font-size:11px;margin-top:24px;">Denne e-posten er sendt automatisk fra MCS Service.</p>
</div>`;
}

function buildMissingInfoEmail(p: {
  submissionNo: string; kundenavn: string; oppdragstittel: string;
  missingItems: string[]; freeText: string; detailUrl: string; trackingUrl: string | null;
}): string {
  const itemsHtml = p.missingItems.length > 0
    ? `<ul style="margin:8px 0;padding-left:20px;">${p.missingItems.map(i => `<li style="font-size:14px;color:#374151;margin:4px 0;">${i}</li>`).join("")}</ul>`
    : "";
  const freeTextHtml = p.freeText ? `<div style="margin:12px 0;padding:12px;background:#FEF3C7;border-radius:6px;font-size:13px;">${p.freeText.replace(/\n/g, "<br/>")}</div>` : "";

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;">
  <div style="background:#FEF3C7;border-radius:8px;padding:16px;margin-bottom:16px;">
    <h2 style="margin:0 0 4px;color:#92400E;font-size:18px;">⚠️ Vi trenger mer informasjon</h2>
    <p style="margin:0;color:#92400E;font-size:14px;">${p.submissionNo} · ${p.kundenavn} · ${p.oppdragstittel}</p>
  </div>
  <p style="font-size:14px;color:#374151;">Hei,</p>
  <p style="font-size:14px;color:#374151;">For å kunne behandle bestillingen din trenger vi følgende informasjon:</p>
  ${itemsHtml}
  ${freeTextHtml}
  ${buildReplyBlock(p.trackingUrl, "Svar på forespørselen")}
  <p style="color:#9CA3AF;font-size:11px;margin-top:24px;">Denne e-posten er sendt automatisk fra MCS Service.</p>
</div>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildFieldRequestEmail(p: {
  submissionNo: string;
  kundenavn: string;
  oppdragstittel: string;
  recipientName?: string;
  fieldItems: string[];
  freeTextItems: string[];
  requestedBy?: string;
  trackingUrl: string | null;
}): string {
  const greeting = p.recipientName ? `Hei ${escapeHtml(p.recipientName.split(" ")[0])},` : "Hei,";

  const badgesHtml = p.fieldItems.length > 0
    ? `<div style="margin:8px 0 4px;">
         ${p.fieldItems
           .map(
             (label) =>
               `<span style="display:inline-block;background:#EFF6FF;color:#1E40AF;border:1px solid #BFDBFE;padding:5px 11px;border-radius:999px;font-size:13px;font-weight:500;margin:0 6px 6px 0;">${escapeHtml(label)}</span>`
           )
           .join("")}
       </div>`
    : "";

  const freeTextHtml = p.freeTextItems.length > 0
    ? `<div style="margin:18px 0 6px;">
         <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0F172A;">Tilleggsinformasjon vi ønsker fra deg</p>
         <ul style="margin:0;padding-left:20px;">
           ${p.freeTextItems
             .map(
               (q) =>
                 `<li style="font-size:14px;color:#374151;margin:4px 0;line-height:1.5;">${escapeHtml(q)}</li>`
             )
             .join("")}
         </ul>
       </div>`
    : "";

  const ctaButton = p.trackingUrl
    ? `<div style="margin:22px 0 6px;">
         <a href="${p.trackingUrl}" style="display:inline-block;background:#2563EB;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">Fyll inn manglende informasjon</a>
       </div>
       <p style="margin:8px 0 0;font-size:12px;color:#6B7280;">Eller åpne lenken: <a href="${p.trackingUrl}" style="color:#2563EB;">${p.trackingUrl}</a></p>`
    : "";

  const fromLine = p.requestedBy
    ? `<p style="margin:14px 0 0;font-size:13px;color:#6B7280;">— ${escapeHtml(p.requestedBy)}, MCS Service</p>`
    : "";

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#0F172A;">
  <div style="background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:8px;padding:16px 18px;margin-bottom:18px;">
    <h2 style="margin:0 0 4px;color:#92400E;font-size:18px;">Vi trenger litt mer informasjon</h2>
    <p style="margin:0;color:#92400E;font-size:13px;">${escapeHtml(p.submissionNo)} · ${escapeHtml(p.kundenavn)} · ${escapeHtml(p.oppdragstittel)}</p>
  </div>

  <p style="font-size:15px;color:#0F172A;margin:0 0 10px;">${greeting}</p>
  <p style="font-size:14px;color:#374151;line-height:1.55;margin:0 0 14px;">
    Vi trenger litt mer informasjon for å komme videre med bestillingen din.
    Det går raskt — du kan fylle det inn direkte på kundesiden.
  </p>

  ${p.fieldItems.length > 0 ? `<p style="margin:18px 0 4px;font-size:14px;font-weight:600;color:#0F172A;">Dette mangler vi fra deg:</p>${badgesHtml}` : ""}
  ${freeTextHtml}

  ${ctaButton}

  <p style="font-size:13px;color:#6B7280;margin:18px 0 0;line-height:1.5;">
    Du kan også svare direkte på denne e-posten hvis det er enklere — meldingen havner i bestillingstråden.
  </p>

  ${fromLine}

  <p style="color:#9CA3AF;font-size:11px;margin-top:26px;border-top:1px solid #E5E7EB;padding-top:12px;">
    Denne e-posten er sendt fordi vi mangler informasjon på bestilling ${escapeHtml(p.submissionNo)}.
  </p>
</div>`;
}

function buildCustomerUpdateEmail(p: {
  submissionNo: string; kundenavn: string; oppdragstittel: string;
  heading: string; bodyText: string; headingBg: string; headingFg: string;
  trackingUrl: string | null;
}): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;">
  <div style="background:${p.headingBg};border-radius:8px;padding:16px;margin-bottom:16px;">
    <h2 style="margin:0 0 4px;color:${p.headingFg};font-size:18px;">${p.heading}</h2>
    <p style="margin:0;color:${p.headingFg};font-size:14px;">${p.submissionNo} · ${p.oppdragstittel}</p>
  </div>
  <p style="font-size:14px;color:#374151;">Hei,</p>
  <p style="font-size:14px;color:#374151;">${p.bodyText}</p>
  ${buildReplyBlock(p.trackingUrl, "Se status på bestillingen")}
  <p style="color:#9CA3AF;font-size:11px;margin-top:24px;">Denne e-posten er sendt automatisk fra MCS Service.</p>
</div>`;
}

// ── Graph helpers (same pattern as conversation-email-send) ──

async function getGraphToken(): Promise<{ token?: string; error?: string }> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");

  if (!tenantId || !clientId || !clientSecret) {
    return { error: "Missing Azure credentials" };
  }

  try {
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

    if (!resp.ok) {
      const errText = await resp.text();
      return { error: `Token error ${resp.status}: ${errText}` };
    }

    const data = await resp.json();
    return { token: data.access_token };
  } catch (err) {
    return { error: `Token fetch failed: ${String(err)}` };
  }
}

async function sendMailViaGraph(
  token: string,
  opts: {
    subject: string;
    bodyHtml: string;
    recipients: string[];
    mailbox: string;
    saveToSentItems: boolean;
    replyToAddress?: string;
    replyToName?: string;
    extraHeaders?: { name: string; value: string }[];
  }
): Promise<{ error?: string; statusCode?: number }> {
  const message: any = {
    subject: opts.subject,
    body: { contentType: "HTML", content: opts.bodyHtml },
    toRecipients: opts.recipients.map((e) => ({
      emailAddress: { address: e },
    })),
  };

  if (opts.replyToAddress) {
    message.replyTo = [{
      emailAddress: {
        address: opts.replyToAddress,
        ...(opts.replyToName ? { name: opts.replyToName } : {}),
      },
    }];
  }

  if (opts.extraHeaders && opts.extraHeaders.length > 0) {
    // Microsoft Graph requires custom header names to start with "X-"
    message.internetMessageHeaders = opts.extraHeaders.filter(h => h.name.toUpperCase().startsWith("X-"));
  }

  const payload = { message, saveToSentItems: opts.saveToSentItems };

  try {
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${opts.mailbox}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (resp.status === 202 || resp.status === 200) {
      return {};
    }

    const errText = await resp.text();
    return { error: `Graph ${resp.status}: ${errText}`, statusCode: resp.status };
  } catch (err) {
    return { error: `Network error: ${String(err)}` };
  }
}
