import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireGlobalAccessManager } from "../_shared/security-boundary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REGIME_LABELS: Record<string, string> = {
  nek: "NEK 439 / NEK 400",
  fel: "Forskrift om elektriske lavspenningsanlegg (FEL)",
  fse: "Forskrift om sikkerhet ved arbeid i og drift av elektriske anlegg (FSE)",
  fsl: "Forskrift om sikkerhet ved arbeid i og drift av elektriske anlegg – lavspent (FSL)",
  annet: "Generelt regelverk / andre forskrifter",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "unauthorized", message: "Mangler autorisasjon" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ ok: false, error: "unauthorized", message: "Ugyldig token" }, 401);

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const {
      fag_request_id, company_id, regime, question, images = [],
      context, conversation_history = [], analysis_type = "general",
    } = body;

    if (!fag_request_id || !company_id || !regime || !question) {
      return json({ ok: false, error: "validation_failed", message: "Mangler påkrevde felter" }, 400);
    }

    // Verify company membership
    const { data: membership } = await serviceClient
      .from("user_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", company_id)
      .eq("is_active", true)
      .limit(1);

    const isAdmin = await checkAdmin(serviceClient, user.id);
    if (!isAdmin && (!membership || membership.length === 0)) {
      return json({ ok: false, error: "unauthorized", message: "Ingen tilgang til dette selskapet" }, 403);
    }

    // Verify request belongs to company
    const { data: fagReq } = await serviceClient
      .from("fag_requests")
      .select("id, company_id")
      .eq("id", fag_request_id)
      .single();

    if (!fagReq || fagReq.company_id !== company_id) {
      return json({ ok: false, error: "validation_failed", message: "Forespørselen tilhører ikke dette selskapet" }, 400);
    }

    // Verify image paths
    for (const img of images) {
      if (!img.path?.startsWith(`${company_id}/`)) {
        return json({ ok: false, error: "validation_failed", message: "Bildesti utenfor selskapets mappe" }, 400);
      }
    }

    // Set status = analyzing
    await serviceClient
      .from("fag_requests")
      .update({ status: "analyzing", last_activity_at: new Date().toISOString() })
      .eq("id", fag_request_id);

    // Load company fag profile for specialization
    const { data: fagProfile } = await serviceClient
      .from("fag_company_profiles")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();

    // Generate signed URLs for images
    const imageContents: Array<{ type: string; image_url: { url: string } }> = [];
    for (const img of images) {
      const { data: signedData, error: signErr } = await serviceClient.storage
        .from("fag-attachments")
        .createSignedUrl(img.path, 300);
      if (signErr || !signedData?.signedUrl) {
        console.error("Signed URL error:", signErr);
        continue;
      }
      imageContents.push({
        type: "image_url",
        image_url: { url: signedData.signedUrl },
      });
    }

    // Build specialized system prompt
    const regimeLabel = REGIME_LABELS[regime] || regime;
    const specialization = fagProfile?.specialization?.join(", ") || "Tavler og fordelingsanlegg, Lavspent kraftfordeling, Industri og næringsbygg";
    const primaryStandards = fagProfile?.primary_standards?.join(", ") || "NEK 439";
    const secondaryStandards = fagProfile?.secondary_standards?.join(", ") || "NEK 400, FEL, FSE";

    const isThermography = analysis_type === "thermography";

    const systemPrompt = isThermography
      ? buildThermographySystemPrompt(specialization, primaryStandards, secondaryStandards, regimeLabel, fagProfile?.custom_system_prompt)
      : buildGeneralSystemPrompt(specialization, primaryStandards, secondaryStandards, regimeLabel, fagProfile?.custom_system_prompt);

    // Build messages with conversation history
    const messages: any[] = [{ role: "system", content: systemPrompt }];
    for (const hist of conversation_history) {
      messages.push({ role: hist.role, content: hist.content });
    }

    const userContent: any[] = [
      { type: "text", text: `Regelverk: ${regimeLabel}\n\n${isThermography ? "Termografi-analyse: " : "Spørsmål: "}${question}${context?.notes ? `\n\nKontekst: ${context.notes}` : ""}${context?.site ? `\nSted: ${context.site}` : ""}` },
      ...imageContents,
    ];
    messages.push({ role: "user", content: userContent });

    // Select tool schema based on analysis type
    const tools = isThermography ? getThermographyTools() : getGeneralTools();
    const toolName = isThermography ? "thermography_assessment" : "fag_assessment";

    // Call AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.3,
        tools,
        tool_choice: { type: "function", function: { name: toolName } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      await serviceClient
        .from("fag_requests")
        .update({ status: "error", last_activity_at: new Date().toISOString() })
        .eq("id", fag_request_id);

      if (aiResponse.status === 429) return json({ ok: false, error: "rate_limited", message: "For mange forespørsler. Prøv igjen om litt." }, 429);
      if (aiResponse.status === 402) return json({ ok: false, error: "payment_required", message: "AI-kreditter er brukt opp." }, 402);
      return json({ ok: false, error: "ai_failed", message: "AI-analyse feilet" }, 500);
    }

    const aiData = await aiResponse.json();

    let rawContent: string;
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      rawContent = toolCall.function.arguments;
    } else {
      rawContent = aiData.choices?.[0]?.message?.content || "{}";
    }
    const usage = aiData.usage;

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("Failed to parse AI JSON:", rawContent);
      await serviceClient
        .from("fag_requests")
        .update({ status: "error", last_activity_at: new Date().toISOString() })
        .eq("id", fag_request_id);
      return json({ ok: false, error: "ai_failed", message: "Kunne ikke tolke AI-respons" }, 500);
    }

    const md = isThermography ? buildThermographyMarkdown(parsed) : buildMarkdown(parsed);

    const assessments = Array.isArray(parsed.assessment || parsed.hotspots) ? (parsed.assessment || parsed.hotspots) : [];
    const confidences = assessments.map((a: any) => a.confidence || 0).filter((c: number) => c > 0);
    const avgConfidence = confidences.length > 0 ? Math.round(confidences.reduce((s: number, c: number) => s + c, 0) / confidences.length) : null;

    const followups = Array.isArray(parsed.followup_questions) ? parsed.followup_questions : [];
    const newStatus = followups.length >= 2 ? "needs_followup" : "answered";

    await serviceClient.from("fag_answers").insert({
      fag_request_id,
      company_id,
      answer_markdown: md,
      model: aiData.model || "google/gemini-2.5-flash",
      tokens_in: usage?.prompt_tokens || null,
      tokens_out: usage?.completion_tokens || null,
    });

    await serviceClient
      .from("fag_requests")
      .update({
        status: newStatus,
        ai_summary: parsed.summary || null,
        ai_confidence: avgConfidence,
        ai_followup_questions: followups,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", fag_request_id);

    return json({
      ok: true,
      fag_request_id,
      status: newStatus,
      ai_confidence: avgConfidence,
      answer_preview: (parsed.summary || "").substring(0, 200),
      answer_markdown: md,
      followup_questions: followups,
      analysis_type,
      // Thermography-specific response data
      ...(isThermography ? {
        thermography: {
          overall_risk: parsed.overall_risk || "unknown",
          hotspots: parsed.hotspots || [],
          possible_causes: parsed.possible_causes || [],
          action_items: parsed.action_items || [],
          nek_references: parsed.nek_references || [],
          max_temperature: parsed.max_temperature || null,
          delta_t: parsed.delta_t || null,
          load_estimate: parsed.load_estimate || null,
        },
      } : {
        nek_references: parsed.nek_references || [],
      }),
    });
  } catch (err: any) {
    console.error("Unexpected error:", err);
    return json({ ok: false, error: "ai_failed", message: err.message || "Ukjent feil" }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Cross-company bypass only for global superadmin; others need membership in the request's company.
async function checkAdmin(client: any, userId: string): Promise<boolean> {
  return await requireGlobalAccessManager(client, userId);
}

// ─── System Prompts ────────────────────────────────────────

function buildGeneralSystemPrompt(specialization: string, primary: string, secondary: string, regime: string, custom?: string): string {
  return `Du er en spesialisert fagassistent for elektrobransjen i Norge.

DITT SPESIALOMRÅDE:
${specialization}

PRIMÆRE REGELVERK: ${primary}
SEKUNDÆRE REGELVERK: ${secondary}

Gjeldende regelverksvalg fra bruker: ${regime}

DIN ROLLE:
- Du er en erfaren fagkollega som gir konkrete, praksisnære råd
- Du kjenner NEK 439-serien (tavlekonstruksjon) svært godt
- Du forstår temperaturstigning, kortslutningsytelse, vernselektivitet, kapslingskrav, strømskinner og dokumentasjonskrav
- Du relaterer svarene til faktisk tavlebygging og fordelingsanlegg

NORMHENVISNINGER:
- Henvis ALLTID til spesifikke NEK-paragrafer og avsnitt der relevant
- Formater referanser som: "NEK 439-1:2023 – Avsnitt X.X Tittel"
- Prioriter NEK 439 ved tavle-relaterte spørsmål
- Inkluder også relevante NEK 400-referanser som supplering

VIKTIG:
- Vær konkret og teknisk presis
- Merk alltid usikkerhet tydelig
- Hvis bildet er uklart, si det rett ut
- Svar ALLTID på norsk
- Skriv i en uformell, kollegial tone – som en erfaren kollega
- Hold svarene konsise og handlingsrettede
${custom ? `\nEKSTRA INSTRUKSJONER:\n${custom}` : ""}`;
}

function buildThermographySystemPrompt(specialization: string, primary: string, secondary: string, regime: string, custom?: string): string {
  return `Du er en spesialisert termografi-analytiker for tavleanlegg og fordelingsanlegg i Norge.

DITT SPESIALOMRÅDE:
${specialization}
Termografisk analyse av lavspent tavler, samleskinner, effektbrytere, kontaktorer og kabeltilkoblinger.

PRIMÆRE REGELVERK: ${primary}
SEKUNDÆRE REGELVERK: ${secondary}
Gjeldende regelverksvalg: ${regime}

DIN OPPGAVE:
Analyser termografibilder (IR-bilder, kombibilder med IR+visuelt) fra tavleanlegg og fordelingsanlegg.

ANALYSE SKAL INKLUDERE:
1. HOTSPOT-IDENTIFIKASJON: Identifiser varme punkter med alvorlighetsnivå
   - critical: Umiddelbar fare, overtemperatur som kan føre til brann eller havari
   - warning: Bør følges opp, avvik fra normal drift
   - normal: Ingen tiltak nødvendig
2. KOMPONENTGJENKJENNING: Identifiser komponenttyper (samleskinner, sikringer, effektbrytere, kabeltilkoblinger, kontaktorer, klemmer)
3. TEMPERATURVURDERING: Estimert temperatur, delta-T mot omgivelser, lastforhold
4. MULIGE ÅRSAKER: Overbelastning, dårlig tiltrekking, overgangsmotstand, ubalanse mellom faser, feildimensjonert komponent
5. RISIKOVURDERING: Overordnet risiko for hele bildet
6. TILTAKSLISTE: Konkrete, handlingsrettede tiltak for montør

NEK-REFERANSER:
- Henvis til NEK 439 temperaturkrav og driftssikkerhet
- Forebygging av termisk degradering
- Kapslingskrav og ventilasjonskrav
- Formater som: "NEK 439-1:2023 – Avsnitt X.X Tittel"

VIKTIG:
- Vær konkret om hva du ser i bildet
- Hvis bildet er uklart eller ikke et termografibilde, si det rett ut
- Estimer temperaturer konservativt
- Svar ALLTID på norsk
- Bruk en profesjonell, direkte tone
${custom ? `\nEKSTRA INSTRUKSJONER:\n${custom}` : ""}`;
}

// ─── Tool Schemas ──────────────────────────────────────────

function getGeneralTools() {
  return [
    {
      type: "function",
      function: {
        name: "fag_assessment",
        description: "Return a structured professional assessment with norm references.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string" },
            what_i_see: { type: "array", items: { type: "string" } },
            assessment: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  topic: { type: "string" },
                  guidance: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["topic", "guidance", "confidence"],
              },
            },
            recommendations: { type: "array", items: { type: "string" } },
            risks: { type: "array", items: { type: "string" } },
            nek_references: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  reference: { type: "string", description: "e.g. NEK 439-1:2023 – Avsnitt 7.1 Mekanisk styrke" },
                  relevance: { type: "string", enum: ["high", "supplementary", "related"] },
                  plain_summary: { type: "string", description: "What does this mean in practice?" },
                  why_relevant: { type: "string", description: "Why is this relevant to the question?" },
                  used_in_assessment: { type: "boolean" },
                },
                required: ["reference", "relevance", "plain_summary", "why_relevant", "used_in_assessment"],
              },
            },
            followup_questions: { type: "array", items: { type: "string" } },
            disclaimer: { type: "string" },
          },
          required: ["summary", "assessment", "recommendations", "nek_references", "followup_questions", "disclaimer"],
        },
      },
    },
  ];
}

function getThermographyTools() {
  return [
    {
      type: "function",
      function: {
        name: "thermography_assessment",
        description: "Return a structured thermography analysis of switchboard/distribution panel images.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "2-3 sentence overview of findings" },
            overall_risk: { type: "string", enum: ["critical", "warning", "normal"], description: "Overall risk level for the image" },
            max_temperature: { type: "string", description: "Estimated max temperature observed, e.g. '~85°C'" },
            delta_t: { type: "string", description: "Delta-T vs ambient, e.g. '~45K over ambient'" },
            load_estimate: { type: "string", description: "Estimated load conditions, e.g. '70-80% belastning'" },
            hotspots: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  component: { type: "string", description: "Component type: samleskinne, sikring, effektbryter, kabeltilkobling, kontaktor, klemme, annet" },
                  location: { type: "string", description: "Location description in the image" },
                  severity: { type: "string", enum: ["critical", "warning", "normal"] },
                  temperature_estimate: { type: "string", description: "Estimated temperature" },
                  description: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["component", "location", "severity", "description", "confidence"],
              },
            },
            possible_causes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  cause: { type: "string" },
                  likelihood: { type: "string", enum: ["high", "medium", "low"] },
                  explanation: { type: "string" },
                },
                required: ["cause", "likelihood", "explanation"],
              },
            },
            action_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  priority: { type: "string", enum: ["immediate", "planned", "monitoring"] },
                  description: { type: "string" },
                },
                required: ["action", "priority", "description"],
              },
            },
            nek_references: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  reference: { type: "string" },
                  relevance: { type: "string", enum: ["high", "supplementary", "related"] },
                  plain_summary: { type: "string" },
                  why_relevant: { type: "string" },
                  used_in_assessment: { type: "boolean" },
                },
                required: ["reference", "relevance", "plain_summary", "why_relevant", "used_in_assessment"],
              },
            },
            followup_questions: { type: "array", items: { type: "string" } },
            disclaimer: { type: "string" },
          },
          required: ["summary", "overall_risk", "hotspots", "possible_causes", "action_items", "nek_references", "followup_questions", "disclaimer"],
        },
      },
    },
  ];
}

// ─── Markdown Builders ─────────────────────────────────────

function buildMarkdown(parsed: any): string {
  const sections: string[] = [];

  if (parsed.summary) sections.push(`## Oppsummering\n${parsed.summary}`);

  if (Array.isArray(parsed.what_i_see) && parsed.what_i_see.length > 0) {
    sections.push(`## Observasjoner fra bildet\n${parsed.what_i_see.map((s: string) => `- ${s}`).join("\n")}`);
  }

  if (Array.isArray(parsed.assessment) && parsed.assessment.length > 0) {
    const items = parsed.assessment.map((a: any) =>
      `### ${a.topic} (${a.confidence || "?"}% sikkerhet)\n${a.guidance}`
    ).join("\n\n");
    sections.push(`## Vurdering\n${items}`);
  }

  if (Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
    sections.push(`## Anbefalinger\n${parsed.recommendations.map((r: string) => `- ${r}`).join("\n")}`);
  }

  if (Array.isArray(parsed.risks) && parsed.risks.length > 0) {
    sections.push(`## Risikoer\n${parsed.risks.map((r: string) => `⚠️ ${r}`).join("\n")}`);
  }

  // NEK references section
  if (Array.isArray(parsed.nek_references) && parsed.nek_references.length > 0) {
    const refs = parsed.nek_references.map((r: any) => {
      const icon = r.relevance === "high" ? "🎯" : r.relevance === "supplementary" ? "➕" : "ℹ️";
      const used = r.used_in_assessment ? " ✅" : "";
      return `- ${icon} **${r.reference}**${used}\n  ${r.plain_summary}`;
    }).join("\n");
    sections.push(`## 📚 Relevante normhenvisninger\n${refs}`);
  }

  if (Array.isArray(parsed.followup_questions) && parsed.followup_questions.length > 0) {
    sections.push(`## Oppfølgingsspørsmål\n${parsed.followup_questions.map((q: string) => `- ${q}`).join("\n")}`);
  }

  if (parsed.disclaimer) sections.push(`---\n*${parsed.disclaimer}*`);

  return sections.join("\n\n");
}

function buildThermographyMarkdown(parsed: any): string {
  const sections: string[] = [];

  // Risk header
  const riskEmoji = parsed.overall_risk === "critical" ? "🔴" : parsed.overall_risk === "warning" ? "🟠" : "🟢";
  const riskLabel = parsed.overall_risk === "critical" ? "Kritisk – bør utbedres umiddelbart" : parsed.overall_risk === "warning" ? "Bør følges opp" : "Ingen tiltak nødvendig";
  sections.push(`## 🌡️ Termografi-analyse\n**Risikonivå: ${riskEmoji} ${riskLabel}**`);

  if (parsed.summary) sections.push(parsed.summary);

  // Temperature data
  const tempParts: string[] = [];
  if (parsed.max_temperature) tempParts.push(`**Maks temperatur:** ${parsed.max_temperature}`);
  if (parsed.delta_t) tempParts.push(`**Delta-T:** ${parsed.delta_t}`);
  if (parsed.load_estimate) tempParts.push(`**Lastforhold:** ${parsed.load_estimate}`);
  if (tempParts.length > 0) sections.push(`### Temperaturdata\n${tempParts.join("\n")}`);

  // Hotspots
  if (Array.isArray(parsed.hotspots) && parsed.hotspots.length > 0) {
    const items = parsed.hotspots.map((h: any) => {
      const sev = h.severity === "critical" ? "🔴" : h.severity === "warning" ? "🟠" : "🟢";
      return `- ${sev} **${h.component}** (${h.location})${h.temperature_estimate ? ` – ${h.temperature_estimate}` : ""}\n  ${h.description}`;
    }).join("\n");
    sections.push(`### Identifiserte hotspots\n${items}`);
  }

  // Possible causes
  if (Array.isArray(parsed.possible_causes) && parsed.possible_causes.length > 0) {
    const items = parsed.possible_causes.map((c: any) => {
      const icon = c.likelihood === "high" ? "⚡" : c.likelihood === "medium" ? "⚠️" : "ℹ️";
      return `- ${icon} **${c.cause}** (${c.likelihood === "high" ? "høy" : c.likelihood === "medium" ? "middels" : "lav"} sannsynlighet)\n  ${c.explanation}`;
    }).join("\n");
    sections.push(`### Mulige årsaker\n${items}`);
  }

  // Action items
  if (Array.isArray(parsed.action_items) && parsed.action_items.length > 0) {
    const items = parsed.action_items.map((a: any) => {
      const icon = a.priority === "immediate" ? "🔴" : a.priority === "planned" ? "🟡" : "🔵";
      const label = a.priority === "immediate" ? "Umiddelbart" : a.priority === "planned" ? "Planlagt" : "Overvåking";
      return `- ${icon} **${a.action}** [${label}]\n  ${a.description}`;
    }).join("\n");
    sections.push(`### 🔧 Tiltaksliste\n${items}`);
  }

  // NEK references
  if (Array.isArray(parsed.nek_references) && parsed.nek_references.length > 0) {
    const refs = parsed.nek_references.map((r: any) => {
      const icon = r.relevance === "high" ? "🎯" : r.relevance === "supplementary" ? "➕" : "ℹ️";
      const used = r.used_in_assessment ? " ✅" : "";
      return `- ${icon} **${r.reference}**${used}\n  ${r.plain_summary}`;
    }).join("\n");
    sections.push(`### 📚 Relevante normhenvisninger\n${refs}`);
  }

  if (Array.isArray(parsed.followup_questions) && parsed.followup_questions.length > 0) {
    sections.push(`### Oppfølgingsspørsmål\n${parsed.followup_questions.map((q: string) => `- ${q}`).join("\n")}`);
  }

  if (parsed.disclaimer) sections.push(`---\n*${parsed.disclaimer}*`);

  return sections.join("\n\n");
}
