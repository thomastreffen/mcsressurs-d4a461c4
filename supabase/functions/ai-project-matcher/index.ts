import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { maySuggestProject } from "../_shared/outlook-match-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Extract lowercase tokens from a string (words > 2 chars) */
function tokenize(s: string | null): string[] {
  if (!s) return [];
  return s.split(/[\s–\-,.:;/()]+/).filter(w => w.length > 2).map(w => w.toLowerCase());
}

/** Check if any token appears in text */
function hasTokenOverlap(tokens: string[], text: string): boolean {
  const lower = text.toLowerCase();
  return tokens.some(t => lower.includes(t));
}

interface GuardrailResult {
  passed: boolean;
  signals: string[];
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: corsHeaders,
      });
    }

    // Fetch blocks that need AI matching
    const { data: blocks, error: blocksErr } = await supabase
      .from("schedule_blocks")
      .select("id, technician_id, company_id, title, location, outlook_subject, outlook_location, outlook_preview, outlook_organizer, start_at, end_at, match_confidence, match_state, project_id, match_reason, ai_confidence, is_private, is_all_day, outlook_show_as, source")
      .eq("source", "outlook")
      .eq("match_state", "needs_confirmation")
      .is("ai_confidence", null)
      .order("start_at", { ascending: true })
      .limit(20);

    if (blocksErr || !blocks?.length) {
      return new Response(JSON.stringify({ status: "ok", processed: 0 }), { headers: corsHeaders });
    }

    // Fetch candidate projects
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: projects } = await supabase
      .from("events")
      .select("id, company_id, job_number, title, customer, address, project_aliases, status")
      .or(`status.in.(planned,requested,scheduled,in_progress),start_time.gte.${ninetyDaysAgo}`)
      .is("deleted_at", null)
      .order("start_time", { ascending: false })
      .limit(200);

    if (!projects?.length) {
      return new Response(JSON.stringify({ status: "ok", processed: 0, reason: "no projects" }), { headers: corsHeaders });
    }

    const projectList = projects.map(p => ({
      id: p.id,
      company_id: (p as any).company_id,
      job_number: p.job_number,
      title: p.title,
      customer: p.customer,
      address: p.address,
      aliases: p.project_aliases || [],
    }));

    // Build a project lookup for guardrail checks
    const projectMap = new Map(projects.map(p => [p.id, p]));

    let totalProcessed = 0;
    let totalAutoMatched = 0;
    let totalSuggested = 0;

    for (const block of blocks) {
      const startTime = Date.now();
      // Fail-closed: never suggest for private / all-day / leisure ("FRI", ferie …) appointments.
      if (!maySuggestProject({ subject: block.outlook_subject, isPrivate: (block as any).is_private, isAllDay: (block as any).is_all_day, showAs: (block as any).outlook_show_as })) {
        await supabase.from("schedule_blocks").update({ ai_confidence: 0, ai_match_reason: "AI: ikke vurdert (privat/heldag/fri)" }).eq("id", block.id);
        continue;
      }
      // Company isolation: only candidates from the block's own company.
      const companyProjects = projectList.filter((p: any) => p.company_id === block.company_id);
      if (companyProjects.length === 0) continue;

      try {
        const eventPayload = {
          subject: block.outlook_subject || block.title,
          location: block.outlook_location || block.location,
          organizer: block.outlook_organizer,
          bodyPreview: block.outlook_preview,
          start: block.start_at,
          end: block.end_at,
        };

        const systemPrompt = `Du er en prosjekt-matcher for et elektro/service-selskap. Gitt en Outlook-kalenderavtale og en liste med prosjekter, finn det mest sannsynlige prosjektet.

Bruk subject, lokasjon, organisator og bodyPreview for å matche mot prosjekt-titler, kundenavn, adresser og aliases.

Regler:
- Aliases er kallenavn montører bruker. "DC Odin" = "Datasenter Odin".
- Vekt: eksakt alias-match > tittel-match > kunde-match > adresse-match.
- Hvis usikker, returner null som project_id med lav confidence.
- Svar KUN med tool-kallet, ingen ekstra tekst.`;

        const userPrompt = `Outlook-event:
${JSON.stringify(eventPayload, null, 2)}

Montør ID: ${block.technician_id}

Kandidatprosjekter:
${JSON.stringify(companyProjects.map(({ company_id: _c, ...rest }: any) => rest), null, 2)}`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "match_project",
                  description: "Return the best matching project for this calendar event",
                  parameters: {
                    type: "object",
                    properties: {
                      suggested_project_id: { type: "string", description: "UUID of the matched project, or null if no match", nullable: true },
                      confidence: { type: "integer", description: "Confidence 0-100" },
                      reason: { type: "string", description: "One-sentence explanation" },
                      extracted_signals: { type: "array", items: { type: "string" }, description: "Key signals used for matching" },
                    },
                    required: ["suggested_project_id", "confidence", "reason", "extracted_signals"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "match_project" } },
          }),
        });

        const latencyMs = Date.now() - startTime;

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error(`[ai-project-matcher] AI error ${aiResponse.status}:`, errText);
          await supabase.from("ai_match_runs").insert({
            schedule_block_id: block.id,
            event_subject: block.outlook_subject || block.title,
            confidence: 0,
            reason: `AI error: ${aiResponse.status}`,
            outcome: "no_change",
            final_decision: "no_change",
            guardrail_reason: "AI call failed",
            latency_ms: latencyMs,
          });
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

        if (!toolCall?.function?.arguments) {
          await supabase.from("ai_match_runs").insert({
            schedule_block_id: block.id,
            event_subject: block.outlook_subject || block.title,
            confidence: 0,
            reason: "No tool call returned",
            outcome: "no_change",
            final_decision: "no_change",
            latency_ms: latencyMs,
          });
          continue;
        }

        const result = JSON.parse(toolCall.function.arguments);
        const aiConfidence = result.confidence ?? 0;
        const aiProjectId = result.suggested_project_id;
        const aiReason = result.reason ?? "";
        const signals = result.extracted_signals ?? [];

        // === GUARDRAIL CHECK ===
        // Even if AI confidence >= 85, require at least one hard/soft signal
        let guardrail: GuardrailResult = { passed: false, signals: [], reason: "" };

        if (aiProjectId && aiConfidence >= 85) {
          guardrail = await checkGuardrails(
            supabase, block, aiProjectId, projectMap, signals
          );
        }

        // === DECISION LOGIC ===
        let outcome = "no_change";
        let finalDecision = "none";
        const updates: Record<string, any> = {
          ai_confidence: aiConfidence,
          ai_match_reason: `AI: ${aiReason}`,
        };

        // Fail-closed: AI never sets project_id or auto-links. It only stores a suggestion that a
        // human must confirm (ConfirmationsPage). Unknown/cross-company IDs are dropped.
        const validSuggestion = aiProjectId && projectMap.get(aiProjectId)?.company_id === block.company_id;
        if (validSuggestion && aiConfidence >= 60) {
          updates.suggested_project_id = aiProjectId;
          outcome = "suggestion";
          finalDecision = guardrail.passed ? "suggest_strong" : "suggest";
          totalSuggested++;
        }

        await supabase
          .from("schedule_blocks")
          .update(updates)
          .eq("id", block.id);

        // Log the run with guardrail info
        await supabase.from("ai_match_runs").insert({
          schedule_block_id: block.id,
          event_subject: block.outlook_subject || block.title,
          chosen_project_id: aiProjectId || null,
          confidence: aiConfidence,
          reason: aiReason,
          extracted_signals: signals,
          outcome,
          final_decision: finalDecision,
          guardrail_reason: guardrail.reason || null,
          guardrail_signals: guardrail.signals,
          latency_ms: latencyMs,
        });

        totalProcessed++;
      } catch (blockErr: any) {
        console.error(`[ai-project-matcher] Block ${block.id} error:`, blockErr.message);
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        processed: totalProcessed,
        auto_matched: totalAutoMatched,
        suggested: totalSuggested,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[ai-project-matcher] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

/**
 * Guardrail check: require at least one hard/soft signal before auto-matching.
 * Signals checked:
 *   a) Alias match in subject/location
 *   b) Customer name match in subject/location
 *   c) Recent affinity (technician linked to same project in last 30 days)
 *   d) Location overlap (event location contains project address tokens)
 */
async function checkGuardrails(
  supabase: any,
  block: any,
  projectId: string,
  projectMap: Map<string, any>,
  aiSignals: string[]
): Promise<GuardrailResult> {
  const project = projectMap.get(projectId);
  if (!project) return { passed: false, signals: [], reason: "Project not found in candidates" };

  const foundSignals: string[] = [];
  const subject = (block.outlook_subject || block.title || "").toLowerCase();
  const location = (block.outlook_location || block.location || "").toLowerCase();
  const searchText = `${subject} ${location}`;

  // a) Alias match
  const aliases: string[] = (project.project_aliases || []).map((a: string) => a.toLowerCase());
  for (const alias of aliases) {
    if (searchText.includes(alias)) {
      foundSignals.push(`alias:${alias}`);
      break;
    }
  }

  // b) Customer name match
  if (project.customer) {
    const custTokens = tokenize(project.customer);
    if (custTokens.length > 0 && hasTokenOverlap(custTokens, searchText)) {
      foundSignals.push(`customer:${project.customer}`);
    }
  }

  // c) Recent affinity: same technician + project in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count } = await supabase
    .from("schedule_blocks")
    .select("id", { count: "exact", head: true })
    .eq("technician_id", block.technician_id)
    .eq("project_id", projectId)
    .in("match_state", ["auto", "confirmed", "manual"])
    .gte("start_at", thirtyDaysAgo);

  if (count && count > 0) {
    foundSignals.push(`affinity:${count}_blocks_30d`);
  }

  // d) Location overlap: project address tokens in event location
  if (project.address && location) {
    const addrTokens = tokenize(project.address);
    const matchingTokens = addrTokens.filter(t => location.includes(t));
    if (matchingTokens.length >= 2) {
      foundSignals.push(`location:${matchingTokens.join(",")}`);
    }
  }

  // Also check confirmation_learnings for learned token boosts
  const { data: learnings } = await supabase
    .from("confirmation_learnings")
    .select("signal_tokens")
    .eq("technician_id", block.technician_id)
    .eq("project_id", projectId)
    .gte("expires_at", new Date().toISOString())
    .limit(5);

  if (learnings?.length) {
    const learnedTokens = learnings.flatMap((l: any) => l.signal_tokens || []);
    const subjectTokens = tokenize(block.outlook_subject || block.title);
    const overlap = subjectTokens.filter(t => learnedTokens.includes(t));
    if (overlap.length > 0) {
      foundSignals.push(`learned:${overlap.join(",")}`);
    }
  }

  const passed = foundSignals.length > 0;
  return {
    passed,
    signals: foundSignals,
    reason: passed
      ? `Guardrails passed: ${foundSignals.join("; ")}`
      : "No hard/soft signals found – downgraded to suggestion",
  };
}
