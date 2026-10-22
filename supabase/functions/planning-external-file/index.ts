import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Ugyldig metode" }, 405);
  try {
    const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), file_id: z.string().uuid() }).strict().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Ugyldig forespørsel" }, 400);
    const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !service) return json({ error: "Tjenesten er ikke konfigurert" }, 503);
    const admin = createClient(url, service);
    // The RPC derives participant/project from the hashed live token and checks this exact file's visibility.
    const { data: file, error } = await admin.rpc("planning_external_file", { _token: parsed.data.token, _file_id: parsed.data.file_id });
    if (error || !file || file.bucket !== "planning-files") return json({ error: "Ingen tilgang til filen" }, 403);
    const { data: signed, error: signingError } = await admin.storage.from(file.bucket).createSignedUrl(file.path, 60);
    if (signingError || !signed) return json({ error: "Filen kunne ikke åpnes" }, 404);
    return json({ url: signed.signedUrl, expires_in: 60 });
  } catch { return json({ error: "Filen kunne ikke åpnes" }, 500); }
});