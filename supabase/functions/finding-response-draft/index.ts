// Foreslår svartekst til tilsynsmyndigheten for ett konkret funn.
// Forslaget er ALLTID et utkast: det skrives ikke til databasen her, og
// bruker må godkjenne teksten i grensesnittet før den kan brukes i svarpakken.
// Samme auth-mønster som inspection-report-analyze (auth.getUser på token).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

const SYSTEM_PROMPT = `Du skriver svar til norske tilsynsmyndigheter (DLE, DSB, Arbeidstilsynet) på vegne av en elektroentreprenør.

Regler:
- Svaret skal være saklig, kort og profesjonelt. Norsk bokmål. Ingen markedsføring, ingen unnskyldninger utover det saklige.
- Bygg svaret KUN på informasjonen du får: funnets ordlyd, interne tiltak, systemfakta og koblede bevis.
- Du skal ALDRI påstå at noe er dokumentert, utført eller lukket hvis det ikke fremgår av opplysningene du får.
- Er tiltak ikke ferdigstilt skal svaret beskrive planlagt tiltak og frist, ikke at det er utført.
- Ikke oppgi tall, datoer, navn eller dokumentnavn som ikke finnes i opplysningene.
- Ikke bruk sannsynlighet eller prosenter.
- 1-3 avsnitt: hva som er gjort/planlagt, hvordan det dokumenteres, og eventuell frist.`;

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

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(url, anon);
    const { data: authData, error: authErr } = await authClient.auth.getUser(token);
    if (authErr || !authData?.user?.id) {
      return fail(rid, 401, "auth", "invalid_token", "Innloggingen er utløpt. Last siden på nytt og prøv igjen.", authErr?.message);
    }

    const body = await req.json().catch(() => ({}));
    const finding = body.finding;
    if (!finding?.title) return fail(rid, 400, "input", "missing_finding", "Funnet mangler opplysninger");

    const actions: any[] = Array.isArray(body.actions) ? body.actions : [];
    const evidence: string[] = Array.isArray(body.evidence) ? body.evidence : [];
    const systemFacts: string[] = Array.isArray(body.system_facts) ? body.system_facts : [];
    const unresolvedGaps: string[] = Array.isArray(body.unresolved_gaps) ? body.unresolved_gaps : [];
    const doneActions = actions.filter((a) => ["done", "closed", "completed"].includes(String(a.status)));

    const prompt = [
      `TILSYNSSAK: ${body.inspection_title ?? "Ukjent sak"}${body.authority_name ? ` (${body.authority_name})` : ""}`,
      "",
      "FUNN – MYNDIGHETENS ORDLYD (skal ikke gjentas ordrett i svaret):",
      `Tittel: ${finding.title}`,
      finding.original_text ? `Ordlyd: ${finding.original_text}` : null,
      finding.legal_basis_text ? `Hjemmel: ${finding.legal_basis_text}` : null,
      finding.authority_requirement ? `Krav: ${finding.authority_requirement}` : null,
      finding.deadline ? `Myndighetens frist: ${finding.deadline}` : null,
      "",
      "INTERN BEHANDLING:",
      finding.internal_assessment ? `Vurdering: ${finding.internal_assessment}` : "Vurdering: ikke registrert",
      finding.proposed_solution ? `Planlagt løsning: ${finding.proposed_solution}` : null,
      finding.internal_deadline ? `Intern frist: ${finding.internal_deadline}` : null,
      finding.condition_corrected_at
        ? `Forholdet er internt bekreftet rettet ${finding.condition_corrected_at}`
        : "Forholdet er IKKE bekreftet rettet – ikke skriv at forholdet er utbedret.",
      finding.documentation_complete_at
        ? `Dokumentasjonen er bekreftet komplett ${finding.documentation_complete_at}`
        : "Dokumentasjonen er IKKE bekreftet komplett.",
      "",
      "FAKTISK UTFØRTE TILTAK (kun disse kan omtales som gjennomført):",
      doneActions.length
        ? doneActions.map((a) => `- ${a.title}${a.description ? `: ${a.description}` : ""}`).join("\n")
        : "- Ingen tiltak er ferdigstilt",
      "",
      "TILTAK SOM PÅGÅR (omtales som planlagt, ikke utført):",
      actions.filter((a) => !doneActions.includes(a)).length
        ? actions.filter((a) => !doneActions.includes(a)).map((a) => `- ${a.title} (status: ${a.status}${a.due_date ? `, frist ${a.due_date}` : ""})`).join("\n")
        : "- Ingen",
      "",
      "SYSTEMFAKTA FRA VÅRE EGNE REGISTRE:",
      systemFacts.length ? systemFacts.map((f) => `- ${f}`).join("\n") : "- Ingen",
      "",
      "FORHOLD SYSTEMET FORTSATT VISER SOM IKKE RETTET (må ikke omtales som lukket):",
      unresolvedGaps.length ? unresolvedGaps.map((g) => `- ${g}`).join("\n") : "- Ingen",
      "",
      "GODKJENTE BEVIS/VEDLEGG (kun disse kan nevnes som vedlagt dokumentasjon):",
      evidence.length ? evidence.map((e) => `- ${e}`).join("\n") : "- Ingen",
    ].filter(Boolean).join("\n");


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

    return json({
      ok: true,
      requestId: rid,
      response_text: typeof parsed.response_text === "string" ? parsed.response_text.trim() : "",
      missing_information: (Array.isArray(parsed.missing_information) ? parsed.missing_information : [])
        .filter((x: any) => typeof x === "string" && x.trim()).slice(0, 8),
    });
  } catch (e) {
    console.error(`[finding-response-draft] rid=${rid} unhandled`, e);
    return fail(rid, 500, "unknown", "unhandled_error", "Uventet feil ved forslag til svartekst", (e as Error)?.message);
  }
});
