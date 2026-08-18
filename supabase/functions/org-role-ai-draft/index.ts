// Foreslår formulering av ansvar, oppgaver og myndighet for en organisasjonsrolle.
// Output er ALLTID et AI-utkast som må bekreftes/redigeres av bruker i UI.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  roleTitle: string;
  roleType?: string;
  personJobTitle?: string | null;
  companyName?: string | null;
  activities?: string | null;
  current?: { responsibilities?: string | null; tasks?: string | null; authority?: string | null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI gateway not configured" }, 500);

    const body: Body = await req.json();
    if (!body?.roleTitle) return json({ error: "Missing roleTitle" }, 400);

    const systemPrompt = [
      "Du er HMS- og elektrofaglig rådgiver for et norsk elektroentreprenørselskap (tavler, strømskinner, datasenter, næringsbygg).",
      "Du foreslår UTKAST til beskrivelse av ansvar, oppgaver og myndighet for en organisasjonsrolle.",
      "Krav:",
      "- Skriv på norsk bokmål, konkret og operativt.",
      "- Ansvar: 2-4 punkter. Oppgaver: 3-6 konkrete punkter. Myndighet: 2-4 punkter om beslutningsrett (f.eks. stanse arbeid, godkjenne avvik, frigi anlegg, innkjøp).",
      "- Vis til relevant regelverk (internkontrollforskriften, FSE, FEK, NEK 400, arbeidsmiljøloven) der det er naturlig.",
      "- Ikke dikt opp navn, tall eller sertifikater.",
      "Svar KUN med JSON: {\"responsibilities\":\"...\",\"tasks\":\"...\",\"authority\":\"...\"} der hver verdi er punktliste med linjeskift og «- » prefiks.",
    ].join("\n");

    const userPrompt = [
      `Rolle: ${body.roleTitle}${body.roleType ? ` (type: ${body.roleType})` : ""}`,
      body.companyName ? `Virksomhet: ${body.companyName}` : "",
      body.personJobTitle ? `Personens stilling i ansattregisteret: ${body.personJobTitle}` : "",
      body.activities ? `Virksomhetens aktiviteter: ${body.activities}` : "",
      body.current?.responsibilities ? `Eksisterende ansvar (bygg videre): ${body.current.responsibilities}` : "",
      body.current?.tasks ? `Eksisterende oppgaver: ${body.current.tasks}` : "",
      body.current?.authority ? `Eksisterende myndighet: ${body.current.authority}` : "",
    ].filter(Boolean).join("\n");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (resp.status === 429) return json({ error: "Rate limit overskredet, prøv igjen om litt." }, 429);
    if (resp.status === 402) return json({ error: "Lovable AI er tom for kreditter." }, 402);
    if (!resp.ok) {
      console.error("AI gateway error", resp.status, await resp.text());
      return json({ error: "AI gateway feil" }, 500);
    }

    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/```json|```/g, "").trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }
    if (!parsed) return json({ error: "Kunne ikke tolke AI-svaret" }, 500);

    return json({
      is_ai_draft: true,
      responsibilities: String(parsed.responsibilities ?? ""),
      tasks: String(parsed.tasks ?? ""),
      authority: String(parsed.authority ?? ""),
    });
  } catch (e) {
    console.error("org-role-ai-draft error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
