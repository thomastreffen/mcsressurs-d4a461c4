// Sender HMS-håndbok (hele eller valgte kapitler) til ansatte via e-post
// og/eller SMS-lenke. Oppretter distribusjon + mottakere med sikker lenke,
// logger alt i hms_audit_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const MAILBOX = "postkontoret@mcsservice.no";

interface RecipientInput {
  person_id?: string | null;
  user_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface ResourceLink {
  type: string;
  label: string;
  url?: string | null;
  note?: string | null;
  section_id?: string | null;
  section_heading?: string | null;
}

interface Body {
  handbook_id: string;
  version_id: string;
  section_ids?: string[];
  channels?: string[];
  subject?: string;
  message?: string;
  kind?: "distribution" | "reminder";
  base_url: string;
  recipients: RecipientInput[];
  /** Hvilke kjemikalier som skal følge med pakken. */
  chemical_mode?: "all_relevant" | "audience" | "specific" | "none";
  chemical_ids?: string[];
  audience_tags?: string[];
  /** Ekstra lenker admin har lagt til for denne utsendingen. */
  extra_resources?: ResourceLink[];
}


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Ikke autorisert" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const authUser = userRes?.user;
    if (!authUser) return json({ error: "Ikke autorisert" }, 401);

    const body: Body = await req.json();
    if (!body?.handbook_id || !body?.version_id || !Array.isArray(body?.recipients) || body.recipients.length === 0) {
      return json({ error: "handbook_id, version_id og recipients er påkrevd" }, 400);
    }
    if (!body.base_url || !/^https?:\/\//.test(body.base_url)) {
      return json({ error: "Ugyldig base_url" }, 400);
    }

    const admin = createClient(url, serviceKey);

    const { data: handbook } = await admin
      .from("hms_handbooks")
      .select("id, title, company_id")
      .eq("id", body.handbook_id)
      .maybeSingle();
    if (!handbook) return json({ error: "Håndbok ikke funnet" }, 404);

    const { data: allowed } = await admin.rpc("has_hms_manage", {
      _auth_user_id: authUser.id,
      _company_id: handbook.company_id,
    });
    if (!allowed) return json({ error: "Mangler tilgang til å sende HMS-dokumenter" }, 403);

    const { data: version } = await admin
      .from("hms_handbook_versions")
      .select("id, version_number, handbook_id")
      .eq("id", body.version_id)
      .maybeSingle();
    if (!version || version.handbook_id !== handbook.id) {
      return json({ error: "Ugyldig versjon" }, 400);
    }

    const requestedIds = (body.section_ids ?? []).filter(Boolean);

    // Alle kapitler i utgaven – trengs både for validering og for koblede ressurser
    const { data: allSecs } = await admin
      .from("hms_handbook_sections")
      .select("id, heading, ordering, resource_links, chemical_ids")
      .eq("version_id", version.id)
      .order("ordering", { ascending: true });

    let sectionIds: string[] = [];
    let sectionTitles: string[] = [];
    let includedSecs = allSecs ?? [];
    if (requestedIds.length > 0) {
      includedSecs = (allSecs ?? []).filter((s: any) => requestedIds.includes(s.id));
      sectionIds = includedSecs.map((s: any) => s.id);
      sectionTitles = includedSecs.map((s: any) => s.heading);
      if (sectionIds.length === 0) {
        return json({ error: "Ingen gyldige kapitler valgt for denne utgaven" }, 400);
      }
    }

    // ---- Bygg HMS-pakken: koblede ressurser + relevante kjemikalier/SDS ----
    const chemMode = body.chemical_mode ?? "all_relevant";
    const audienceTags = (body.audience_tags ?? []).filter(Boolean);

    const sectionChemIds = new Set<string>();
    for (const s of includedSecs as any[]) {
      for (const cid of (s.chemical_ids ?? []) as string[]) sectionChemIds.add(cid);
    }

    let chemicalIds: string[] = [];
    let snapshot: {
      id: string; product_name: string; supplier: string | null; is_high_risk: boolean;
      sds_version: string | null; sds_revision_date: string | null; has_sds: boolean;
    }[] = [];
    if (chemMode !== "none") {
      const { data: chems } = await admin
        .from("hms_chemicals")
        .select("id, product_name, supplier, is_high_risk, relevant_for_all, audience_tags, status, sds_version, sds_revision_date, sds_path")
        .eq("company_id", handbook.company_id)
        .is("deleted_at", null);
      const all = (chems ?? []) as any[];
      const pick = all.filter((c) => {
        if (sectionChemIds.has(c.id)) return true;
        if (chemMode === "specific") return (body.chemical_ids ?? []).includes(c.id);
        if (c.status === "expired") return false;
        if (chemMode === "all_relevant") return c.relevant_for_all || c.is_high_risk;
        if (chemMode === "audience") {
          return c.relevant_for_all || (c.audience_tags ?? []).some((t: string) => audienceTags.includes(t));
        }
        return false;
      });
      chemicalIds = pick.map((c) => c.id);
      snapshot = pick.map((c) => ({
        id: c.id,
        product_name: c.product_name,
        supplier: c.supplier,
        is_high_risk: c.is_high_risk,
        sds_version: c.sds_version,
        sds_revision_date: c.sds_revision_date,
        has_sds: !!c.sds_path,
      }));
    }

    const resources: ResourceLink[] = [];
    for (const s of includedSecs as any[]) {
      for (const l of ((s.resource_links ?? []) as ResourceLink[])) {
        if (!l?.label) continue;
        resources.push({
          type: l.type ?? "vedlegg",
          label: l.label,
          url: l.url ?? null,
          note: l.note ?? null,
          section_id: s.id,
          section_heading: s.heading,
        });
      }
    }
    for (const l of body.extra_resources ?? []) {
      if (l?.label) resources.push({ type: l.type ?? "vedlegg", label: l.label, url: l.url ?? null, note: l.note ?? null });
    }
    if (snapshot.length > 0) {
      resources.unshift({
        type: "stoffkartotek",
        label: "Stoffkartotek – kjemikalier for ditt arbeid",
        note: "Produktene med sikkerhetsdatablad ligger nederst i pakken.",
      });
    }
    // Dedupliser
    const seenRes = new Set<string>();
    const includedResources = resources.filter((r) => {
      const key = `${r.type}|${r.label.toLowerCase()}|${r.url ?? ""}`;
      if (seenRes.has(key)) return false;
      seenRes.add(key);
      return true;
    });

    const channels = (body.channels ?? ["email"]).filter((c) => c === "email" || c === "sms");
    const wantsEmail = channels.includes("email");
    const wantsSms = channels.includes("sms");

    const { data: dist, error: distErr } = await admin
      .from("hms_handbook_distributions")
      .insert({
        company_id: handbook.company_id,
        handbook_id: handbook.id,
        version_id: version.id,
        version_number: version.version_number,
        section_ids: sectionIds,
        section_titles: sectionTitles,
        scope: sectionIds.length > 0 ? "chapters" : "full",
        channels,
        subject: body.subject ?? null,
        message: body.message ?? null,
        kind: body.kind ?? "distribution",
        recipient_count: body.recipients.length,
        sent_by: authUser.id,
        included_resources: includedResources,
        chemical_ids: chemicalIds,
        chemical_snapshot: snapshot,
      })
      .select("id")
      .single();
    if (distErr) return json({ error: distErr.message }, 500);

    const rows = body.recipients.map((r) => ({
      distribution_id: dist.id,
      company_id: handbook.company_id,
      handbook_id: handbook.id,
      version_id: version.id,
      section_ids: sectionIds,
      section_titles: sectionTitles,
      included_resources: includedResources,
      chemical_ids: chemicalIds,
      chemical_snapshot: snapshot,
      person_id: r.person_id ?? null,
      user_id: r.user_id ?? null,
      full_name: r.full_name ?? null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      channel: wantsEmail && r.email ? "email" : wantsSms && r.phone ? "sms" : "link",
    }));

    const { data: recipients, error: recErr } = await admin
      .from("hms_handbook_recipients")
      .insert(rows)
      .select("id, full_name, email, phone, share_token, channel");
    if (recErr) return json({ error: recErr.message }, 500);


    const scopeText = sectionTitles.length > 0
      ? `kapittel: ${sectionTitles.join(", ")}`
      : "hele håndboken";

    let token: string | undefined;
    let tokenError: string | undefined;
    if (wantsEmail) {
      const t = await getGraphToken();
      token = t.token;
      tokenError = t.error;
    }

    const results: any[] = [];
    for (const r of recipients ?? []) {
      const link = `${body.base_url.replace(/\/$/, "")}/hb/${r.share_token}`;
      let status = "link_only";
      let error: string | null = null;

      if (wantsEmail && r.email) {
        if (!token) {
          status = "failed";
          error = tokenError ?? "E-post er ikke konfigurert";
        } else {
          const res = await sendMailViaGraph(token, {
            mailbox: MAILBOX,
            recipients: [r.email],
            subject: body.subject || `${handbook.title} – les og bekreft`,
            bodyHtml: buildHtml({
              name: r.full_name ?? "",
              title: handbook.title,
              versionNumber: version.version_number,
              scopeText,
              message: body.message ?? "",
              link,
              resourceCount: includedResources.length,
              chemicalCount: snapshot.length,
            }),
          });
          if (res.error) {
            status = "failed";
            error = res.error;
          } else {
            status = "sent";
          }
        }
      }

      await admin
        .from("hms_handbook_recipients")
        .update({
          delivery_status: status,
          delivery_error: error,
          sent_at: new Date().toISOString(),
        })
        .eq("id", r.id);

      results.push({
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
        link,
        status,
        error,
        sms_text: wantsSms
          ? `${handbook.title}: les og bekreft ${scopeText}. ${link}`
          : null,
      });
    }

    await admin.from("hms_audit_log").insert({
      company_id: handbook.company_id,
      entity_type: "hms_handbook",
      entity_id: handbook.id,
      action: body.kind === "reminder" ? "distribution.reminded" : "distribution.sent",
      performed_by: authUser.id,
      payload: {
        distribution_id: dist.id,
        version_id: version.id,
        version_number: version.version_number,
        section_ids: sectionIds,
        section_titles: sectionTitles,
        scope: sectionIds.length > 0 ? "chapters" : "full",
        channels,
        included_resources: includedResources,
        chemical_ids: chemicalIds,
        chemical_snapshot: snapshot,
        chemical_mode: chemMode,
        recipient_count: results.length,
        failed: results.filter((r) => r.status === "failed").length,
      },
    });

    return json({ distribution_id: dist.id, recipients: results });
  } catch (e) {
    console.error("hms-handbook-send error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function esc(s: string) {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

function buildHtml(p: {
  name: string; title: string; versionNumber: number; scopeText: string; message: string; link: string;
  resourceCount?: number; chemicalCount?: number;
}) {
  const pkg: string[] = [];
  if (p.chemicalCount) pkg.push(`${p.chemicalCount} kjemikalier med sikkerhetsdatablad`);
  if (p.resourceCount) pkg.push(`${p.resourceCount} viktige vedlegg og lenker`);
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:8px;">
  <h2 style="font-size:18px;color:#111827;margin:0 0 4px;">${esc(p.title)}</h2>
  <p style="margin:0 0 16px;color:#6B7280;font-size:13px;">Utgave ${p.versionNumber} · ${esc(p.scopeText)}</p>
  <p style="font-size:15px;color:#374151;">Hei${p.name ? " " + esc(p.name) : ""},</p>
  <p style="font-size:15px;color:#374151;">${p.message ? esc(p.message) : "Du har fått tilsendt HMS-informasjon som du skal lese og bekrefte."}</p>
  ${pkg.length ? `<p style="font-size:14px;color:#374151;background:#F3F4F6;border-radius:8px;padding:12px;">Pakken inneholder også:<br/>${pkg.map((x) => "&bull; " + esc(x)).join("<br/>")}</p>` : ""}
  <p style="margin:24px 0;">
    <a href="${p.link}" style="background:#111827;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:8px;font-size:15px;display:inline-block;">Åpne, les og bekreft</a>
  </p>
  <p style="font-size:12px;color:#9CA3AF;">Lenken er personlig. Bekreftelsen registreres når du trykker «Jeg har lest og forstått».</p>
</div>`;
}

async function getGraphToken(): Promise<{ token?: string; error?: string }> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) return { error: "Mangler e-postoppsett" };
  try {
    const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!resp.ok) return { error: `Token error ${resp.status}` };
    const data = await resp.json();
    return { token: data.access_token };
  } catch (err) {
    return { error: `Token fetch failed: ${String(err)}` };
  }
}

async function sendMailViaGraph(token: string, opts: {
  subject: string; bodyHtml: string; recipients: string[]; mailbox: string;
}): Promise<{ error?: string }> {
  try {
    const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${opts.mailbox}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: opts.subject,
          body: { contentType: "HTML", content: opts.bodyHtml },
          toRecipients: opts.recipients.map((e) => ({ emailAddress: { address: e } })),
        },
        saveToSentItems: true,
      }),
    });
    if (resp.status === 200 || resp.status === 202) return {};
    return { error: `Graph ${resp.status}: ${await resp.text()}` };
  } catch (err) {
    return { error: `Network error: ${String(err)}` };
  }
}
