// Gir en midlertidig, signert lenke til sikkerhetsdatablad (SDS).
// Brukes både av innloggede ansatte og av mottakere med personlig lenke (/kj/:token).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const token: string | undefined = body?.token;
    const handbookToken: string | undefined = body?.handbook_token;
    const chemicalId: string | undefined = body?.chemical_id;

    let chemId: string | null = null;

    if (handbookToken) {
      // Mottaker av HMS-pakke (/hb/:token) – kun kjemikalier som fulgte med pakken
      const { data: rec } = await admin
        .from("hms_handbook_recipients")
        .select("chemical_ids, expires_at")
        .eq("share_token", handbookToken)
        .maybeSingle();
      if (!rec) return json({ error: "not_found" }, 404);
      if (new Date(rec.expires_at) < new Date()) return json({ error: "expired" }, 410);
      if (!chemicalId || !((rec.chemical_ids ?? []) as string[]).includes(chemicalId)) {
        return json({ error: "not_found" }, 404);
      }
      chemId = chemicalId;
    } else if (token) {
      const { data: rec } = await admin
        .from("hms_chemical_recipients")
        .select("chemical_id, expires_at")
        .eq("share_token", token)
        .maybeSingle();
      if (!rec) return json({ error: "not_found" }, 404);
      if (new Date(rec.expires_at) < new Date()) return json({ error: "expired" }, 410);
      chemId = rec.chemical_id;
    } else if (chemicalId) {
      // Innlogget bruker: krever HMS-lesetilgang i selskapet kjemikaliet hører til
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Ikke autorisert" }, 401);
      const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userRes } = await userClient.auth.getUser();
      const authUser = userRes?.user;
      if (!authUser) return json({ error: "Ikke autorisert" }, 401);

      const { data: chem } = await admin
        .from("hms_chemicals")
        .select("id, company_id")
        .eq("id", chemicalId)
        .maybeSingle();
      if (!chem) return json({ error: "not_found" }, 404);

      const { data: allowed } = await admin.rpc("has_hms_view", {
        _auth_user_id: authUser.id,
        _company_id: chem.company_id,
      });
      if (!allowed) return json({ error: "Mangler tilgang" }, 403);
      chemId = chem.id;
    } else {
      return json({ error: "token eller chemical_id er påkrevd" }, 400);
    }

    const { data: chemical } = await admin
      .from("hms_chemicals")
      .select("sds_path, sds_filename")
      .eq("id", chemId!)
      .maybeSingle();
    if (!chemical?.sds_path) return json({ error: "no_sds" }, 404);

    const { data: signed, error } = await admin.storage
      .from("hms-attachments")
      .createSignedUrl(chemical.sds_path, 3600);
    if (error || !signed?.signedUrl) return json({ error: error?.message ?? "Kunne ikke lage lenke" }, 500);

    return json({ url: signed.signedUrl, filename: chemical.sds_filename });
  } catch (e) {
    console.error("hms-chemical-sds error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
