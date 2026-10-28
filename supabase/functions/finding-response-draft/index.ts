// Foreslår svartekst til tilsynsmyndigheten for ett konkret funn.
// Forslaget er ALLTID et utkast: det skrives ikke til databasen her, og
// bruker må godkjenne teksten i grensesnittet før den kan brukes i svarpakken.
// Samme auth-mønster som inspection-report-analyze (auth.getUser på token).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { activeOrganizationRoles } from "../_shared/organization-coverage.ts";
import { buildDraftContext, finalizeDraft, SYSTEM_PROMPT } from "./context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Stage = "auth" | "input" | "ai_request" | "ai_response" | "unknown";

function fail(rid: string, status: number, stage: Stage, error_code: string, message: string, technical_details?: string) {
  console.error(`[finding-response-draft] rid=${rid} stage=${stage} code=${error_code} status=${status} ${technical_details ?? ""}`);
  return json({ ok: false, requestId: rid, stage, error_code, message, technical_details: technical_details ?? null }, status);
}

const TOOL = {
  type: "function",
  function: {
    name: "draft_authority_response",
    description: "Utkast til svartekst til tilsynsmyndigheten for ett funn.",
    parameters: {
      type: "object",
      properties: {
        response_text: { type: "string", description: "Selve svarteksten til myndigheten" },
        missing_information: {
          type: "array",
          items: { type: "string" },
          description: "Opplysninger som mangler for at svaret skal være komplett",
        },
      },
      required: ["response_text"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const rid = crypto.randomUUID().slice(0, 8);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return fail(rid, 401, "auth", "missing_token", "Du er ikke innlogget");

    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return fail(rid, 500, "auth", "missing_config", "Tjenesten er ikke konfigurert");
    const authClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: authData, error: authErr } = await authClient.auth.getUser(token);
    if (authErr || !authData?.user?.id) {
      return fail(rid, 401, "auth", "invalid_token", "Innloggingen er utløpt. Last siden på nytt og prøv igjen.", authErr?.message);
    }

    const body = await req.json().catch(() => ({}));
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof body.finding_id !== "string" || !uuid.test(body.finding_id) || typeof body.inspection_id !== "string" || !uuid.test(body.inspection_id)) {
      return fail(rid, 400, "input", "missing_finding", "Velg et gyldig funn og en tilsynssak");
    }
    // Read-only caller-bearer queries: company is resolved from the authorized case, never the request.
    const { data: inspection, error: inspectionError } = await authClient.from("compliance_inspections")
      .select("id, company_id, title, authority_name").eq("id", body.inspection_id).is("deleted_at", null).maybeSingle();
    if (inspectionError || !inspection) return fail(rid, 403, "auth", "inspection_unavailable", "Tilsynssaken er ikke tilgjengelig");
    const { data: allowed, error: accessError } = await authClient.rpc("has_company_access", {
      _uid: authData.user.id, _company: inspection.company_id, _module: "hms", _level: "edit",
    });
    if (accessError || !allowed) return fail(rid, 403, "auth", "access_denied", "Du mangler tilgang til å foreslå svar i dette selskapet");
    const { data: finding, error: findingError } = await authClient.from("compliance_findings").select("*")
      .eq("id", body.finding_id).eq("inspection_id", inspection.id).eq("company_id", inspection.company_id).is("deleted_at", null).maybeSingle();
    if (findingError || !finding) return fail(rid, 403, "auth", "finding_unavailable", "Funnet er ikke tilgjengelig i saken");
    const [actionResult, evidenceResult, roleResult] = await Promise.all([
      authClient.from("hms_action_items").select("title, description, status, due_date")
        .eq("compliance_finding_id", finding.id).eq("company_id", inspection.company_id).is("deleted_at", null),
      authClient.from("compliance_finding_evidence").select("source_kind, ref_id, label, note")
        .eq("finding_id", finding.id).eq("inspection_id", inspection.id).eq("company_id", inspection.company_id),
      authClient.from("compliance_org_roles").select("title, sort_order, is_active, valid_from, valid_to")
        .eq("company_id", inspection.company_id).is("deleted_at", null),
    ]);
    if (actionResult.error || evidenceResult.error || roleResult.error) {
      return fail(rid, 503, "input", "context_unavailable", "Kunne ikke kontrollere oppdatert dokumentasjon og tiltak. Prøv igjen.");
    }
    const strings = (value: unknown): string[] => Array.isArray(value)
      ? value.filter((x): x is string => typeof x === "string").slice(0, 30).map(x => x.slice(0, 2000)) : [];
    const context = buildDraftContext({
      companyId: inspection.company_id, inspection, finding,
      actions: actionResult.data ?? [], evidence: evidenceResult.data ?? [],
      activeRoleCount: activeOrganizationRoles(roleResult.data ?? []).length,
      systemFacts: strings(body.system_facts), registryGaps: strings(body.unresolved_gaps),
    });
    const prompt = context.prompt;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return fail(rid, 500, "ai_request", "ai_not_configured", "AI er ikke konfigurert");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "draft_authority_response" } },
      }),
    });

    if (!aiRes.ok) {
      const text = (await aiRes.text()).slice(0, 500);
      if (aiRes.status === 429) return fail(rid, 429, "ai_request", "ai_rate_limited", "AI er opptatt akkurat nå. Prøv igjen om litt.");
      if (aiRes.status === 402) return fail(rid, 402, "ai_request", "ai_no_credits", "AI-kreditt er oppbrukt.");
      return fail(rid, 502, "ai_request", `ai_http_${aiRes.status}`, "Kunne ikke lage forslag til svartekst", text);
    }

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      return fail(rid, 502, "ai_response", "no_tool_call", "AI returnerte ikke noe svarforslag");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch (e) {
      return fail(rid, 502, "ai_response", "invalid_json", "Kunne ikke tolke svarforslaget", (e as Error).message);
    }

    const responseText = finalizeDraft(typeof parsed.response_text === "string" ? parsed.response_text : "", context);
    if (!responseText) return fail(rid, 502, "ai_response", "contradictory_draft", "Forslaget samsvarte ikke med dokumentert nåstatus. Prøv igjen.");

    return json({
      ok: true,
      requestId: rid,
      response_text: responseText,
      missing_information: (Array.isArray(parsed.missing_information) ? parsed.missing_information : [])
        .filter((x: any) => typeof x === "string" && x.trim()).slice(0, 8),
    });
  } catch (e) {
    console.error(`[finding-response-draft] rid=${rid} unhandled`, e);
    return fail(rid, 500, "unknown", "unhandled_error", "Uventet feil ved forslag til svartekst", (e as Error)?.message);
  }
});
