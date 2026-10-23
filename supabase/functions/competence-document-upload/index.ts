// Upload a PDF as documentation for one compliance_competence, or get a short-lived link to it.
// Auth: caller's own Hub user bearer token (verified with getClaims). Permissions are checked
// server-side against the competence's own company; company_id from the client is never accepted.
//
// POST multipart/form-data: competence_id, file (PDF ≤10 MB), client_request_id (optional uuid)
//   -> { document_id, file_path }
// POST application/json: { action: "sign", competence_id } -> { url, file_name, expires_in }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BUCKET = "compliance-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const safeName = (n: string) =>
  (n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "") || "dokument.pdf").slice(0, 150);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Ugyldig metode" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return json({ error: "Ikke innlogget" }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: header } } });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(header.slice(7).trim());
  const actor = claims?.claims?.sub;
  if (claimsErr || !actor) return json({ error: "Ikke innlogget" }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false } });

  try {
    const ctype = req.headers.get("content-type") ?? "";
    if (ctype.includes("application/json")) {
      const p = z.object({ action: z.literal("sign"), competence_id: z.string().uuid() }).strict().safeParse(await req.json().catch(() => null));
      if (!p.success) return json({ error: "Ugyldig forespørsel" }, 400);
      const { data: ok } = await admin.rpc("competence_document_can_view", { _actor: actor, _competence_id: p.data.competence_id });
      if (!ok) return json({ error: "Ingen tilgang" }, 403);
      const { data: comp } = await admin.from("compliance_competences").select("document_id").eq("id", p.data.competence_id).single();
      if (!comp?.document_id) return json({ error: "Ingen dokumentasjon" }, 404);
      const { data: doc } = await admin.from("documents").select("storage_bucket,file_path,file_name,public_url").eq("id", comp.document_id).is("deleted_at", null).single();
      if (!doc) return json({ error: "Ingen dokumentasjon" }, 404);
      const { data: s, error } = await admin.storage.from(doc.storage_bucket).createSignedUrl(doc.file_path, 120);
      if (error || !s) return doc.public_url ? json({ url: doc.public_url, file_name: doc.file_name }) : json({ error: "Filen kunne ikke åpnes" }, 404);
      return json({ url: s.signedUrl, file_name: doc.file_name, expires_in: 120 });
    }

    const form = await req.formData().catch(() => null);
    if (!form) return json({ error: "Forventet skjema med fil" }, 400);
    const fields = z.object({
      competence_id: z.string().uuid(),
      client_request_id: z.string().uuid().optional(),
    }).safeParse({ competence_id: form.get("competence_id"), client_request_id: form.get("client_request_id") ?? undefined });
    const file = form.get("file");
    if (!fields.success || !(file instanceof File)) return json({ error: "competence_id og file kreves" }, 400);
    if (file.size === 0 || file.size > MAX_BYTES) return json({ error: "Filen må være mellom 1 byte og 10 MB" }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return json({ error: "Kun PDF-filer er tillatt" }, 400);

    const { competence_id } = fields.data;
    const requestId = fields.data.client_request_id ?? crypto.randomUUID();
    const { data: company } = await admin.rpc("competence_document_can_manage", { _actor: actor, _competence_id: competence_id });
    if (!company) return json({ error: "Ingen tilgang" }, 403);

    const path = `compliance/${company}/${competence_id}/${requestId}_${safeName(file.name)}`;
    const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) return json({ error: "Opplasting feilet" }, 500);

    const { data: docId, error: rpcErr } = await admin.rpc("attach_competence_document", {
      _actor: actor, _competence_id: competence_id, _path: path, _file_name: file.name, _file_size: file.size, _client_request_id: requestId,
    });
    if (rpcErr || !docId) {
      await admin.storage.from(BUCKET).remove([path]);
      return json({ error: rpcErr?.code === "42501" ? "Ingen tilgang" : "Kunne ikke lagre dokumentet" }, rpcErr?.code === "42501" ? 403 : 500);
    }
    return json({ document_id: docId, file_path: path });
  } catch (e) {
    console.error("competence-document-upload", e);
    return json({ error: "Uventet feil" }, 500);
  }
});
