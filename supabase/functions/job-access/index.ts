import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getApprovalCallerId } from "../_shared/approval-auth.ts";
import { attachmentLocation, jobInfoPath } from "../_shared/job-access-policy.ts";
import { buildOperationalJobBrief } from "../_shared/job-brief.ts";

// Read-only. An approval token locates a job only for its authenticated recipient.
// Files always recheck caller event RLS and exact attachment membership, never arbitrary paths.
Deno.serve(async req => {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return json({});
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const origin = Deno.env.get("SUPABASE_URL") ?? "";
    const auth = req.headers.get("Authorization");
    const caller = createClient(origin, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: auth ?? "" } } });
    const uid = await getApprovalCallerId(auth, caller);
    if (!uid) return json({ error: "Logg inn for å åpne jobbinfo" }, 401);
    const body = await req.json();
    const admin = createClient(origin, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: account } = await caller.from("user_accounts").select("is_active").eq("auth_user_id", uid).maybeSingle();
    if (account?.is_active === false) return json({ error: "Kontoen er deaktivert" }, 403);
    let id = body.event_id;
    if (body.action === "resolve") {
      if (typeof body.token !== "string" || body.token.length > 200 || !body.token) return json({ error: "Ugyldig lenke" }, 400);
      const { data: approval } = await admin.from("job_approvals").select("job_id,status").eq("token", body.token).eq("technician_user_id", uid).maybeSingle();
      if (!approval) return json({ error: "Lenken tilhører ikke denne kontoen eller finnes ikke lenger" }, 404);
      id = approval.job_id;
    } else if (!["read", "file"].includes(body.action)) return json({ error: "Ugyldig handling" }, 400);
    if (typeof id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return json({ error: "Ugyldig jobb" }, 400);
    const { data: ownJob } = await caller.rpc("read_my_assigned_job", { _event: id });
    let event = ownJob?.event;
    let assignment = ownJob?.assignment;
    const { data: canPlan } = await caller.rpc("check_permission_v2", { _auth_user_id: uid, _perm: "resource_plan.plan_resources" });
    if (!event && canPlan === true) {
      const { data } = await caller.from("events").select("id,title,job_number,internal_number,status,start_time,end_time,address,postal_code,city,customer,site_contact_name,site_contact_phone,description,access_notes,location_details,source_order_form_id,attachments,deleted_at").eq("id", id).is("deleted_at", null).maybeSingle();
      event = data;
    }
    if (!event) return json({ error: "Jobben er fjernet eller du er ikke lenger tildelt oppdraget" }, 403);
    if (body.action === "resolve") return json({ path: jobInfoPath(id) });
    let orderId = event.source_order_form_id;
    if (!orderId) {
      const { data: linked } = await caller.from("order_form_submissions").select("id").eq("linked_event_id", id).is("deleted_at", null).limit(1).maybeSingle();
      orderId = linked?.id;
    }
    const { data: order } = orderId ? await caller.from("order_form_submissions").select("summary").eq("id", orderId).is("deleted_at", null).maybeSingle() : { data: null };
    const { data: values } = order ? await caller.from("order_form_submission_values").select("field_key,value").eq("submission_id", orderId) : { data: [] };
    const { data: orderFiles } = order ? await caller.from("order_form_submission_attachments").select("id,file_name,file_path").eq("submission_id", orderId) : { data: [] };
    const eventFiles = Array.isArray(event.attachments) ? event.attachments : [];
    const files = [
      ...eventFiles.map((raw: any, index: number) => ({ key: `event:${index}`, name: String(raw.name ?? "Vedlegg"), location: attachmentLocation(raw, origin) })),
      ...(orderFiles ?? []).map(f => ({ key: `order:${f.id}`, name: f.file_name, location: attachmentLocation({ bucket: "order-form-attachments", path: f.file_path }, origin) })),
    ];
    if (body.action === "file") {
      if (typeof body.file_key !== "string" || body.file_key.length > 100) return json({ error: "Ugyldig vedlegg" }, 400);
      const file = files.find(f => f.key === body.file_key);
      if (!file?.location) return json({ error: "Vedlegget er ikke tilgjengelig. Kontakt planlegger." }, 404);
      const { data, error: signError } = await admin.storage.from(file.location.bucket).createSignedUrl(file.location.path, 300);
      if (signError || !data?.signedUrl) return json({ error: "Kunne ikke åpne vedlegget. Prøv igjen eller kontakt planlegger." }, 404);
      return json({ url: data.signedUrl, expires_in: 300 });
    }
    return json({ brief: buildOperationalJobBrief({ event, orderSummary: order?.summary as Record<string, unknown> | null, orderValues: values }), status: event.status, start: assignment?.start_at ?? event.start_time, end: assignment?.end_at ?? event.end_time, files: files.map(f => ({ key: f.key, name: f.name, available: !!f.location })) });
  } catch { return json({ error: "Kunne ikke hente jobbinfo" }, 500); }
});