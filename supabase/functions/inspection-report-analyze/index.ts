// Analyserer en mottatt tilsyns-/revisjonsrapport og returnerer strukturert forslag
// til tilsynssak + funn. Gjenbruker samme mønster som analyze-document:
//   1. Last ned filen fra storage med service role.
//   2. Tekst-først for PDF (heuristisk uttrekk). Er teksten for tynn sendes filen
//      som base64 til modellen (multimodal fallback).
//   3. Strukturert output via tool calling.
// AI skal ALDRI dikte opp verdier: felter som ikke finnes i rapporten skal utelates.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 80_000;
const MIN_PDF_TEXT_CHARS = 800;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Strukturert feilrespons slik at frontend kan vise forståelig norsk melding + feilkode. */
type Stage =
  | "auth" | "input" | "storage_download" | "text_extraction"
  | "ai_request" | "ai_response" | "unknown";

function fail(
  rid: string,
  status: number,
  stage: Stage,
  error_code: string,
  message: string,
  technical_details?: string,
) {
  console.error(`[inspection-report-analyze] rid=${rid} stage=${stage} code=${error_code} status=${status} ${technical_details ?? ""}`);
  return json({ ok: false, requestId: rid, stage, error_code, message, technical_details: technical_details ?? null }, status);
}

function extractPdfText(arrayBuf: ArrayBuffer): string {
  try {
    const raw = new TextDecoder("latin1").decode(new Uint8Array(arrayBuf));
    const parts: string[] = [];
    const btEt = /BT\s([\s\S]*?)ET/g;
    let m: RegExpExecArray | null;
    while ((m = btEt.exec(raw)) !== null) {
      const strRegex = /\(([^)]*)\)/g;
      let s: RegExpExecArray | null;
      while ((s = strRegex.exec(m[1])) !== null) {
        const dec = s[1]
          .replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, " ")
          .replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\");
        if (dec.trim()) parts.push(dec);
      }
      parts.push("\n");
    }
    return parts.join(" ").replace(/[ \t]+/g, " ").trim();
  } catch {
    return "";
  }
}

const SYSTEM_PROMPT = `Du er fagperson på elsikkerhet og internkontroll i en norsk elektroentreprenør.
Du leser mottatte tilsyns- og revisjonsrapporter (DLE, DSB, Arbeidstilsynet, kunde, hovedentreprenør, intern revisjon)
og trekker ut informasjon EKSAKT slik den står i rapporten.

Absolutte regler:
- Du skal ALDRI konstruere, gjette eller normalisere informasjon som ikke står i rapporten.
  Finnes ikke et felt (f.eks. svarfrist eller saksnummer) skal feltet utelates helt.
- original_text for hvert funn skal være ordrett kopi fra rapporten. Ikke omskriv, ikke oppsummer, ikke oversett.
- legal_basis skal bare fylles ut når hjemmel/paragraf eksplisitt fremgår (f.eks. "fel § 12", "NEK 400:2022 pkt 8-1").
- authority_requirement skal være rapportens egen formulering av hva som kreves rettet eller dokumentert.
- internal_category er DIN korte interne kategorisering (maks 6 ord) og er tydelig merket som forslag – den skal aldri
  blandes inn i originalteksten.
- match_keywords skal være 1-4 korte nøkkelord som kan brukes til å finne relevant regelverk, kompetansetype,
  ansvarsrolle eller internkontroll i vårt system (f.eks. "FSE", "internkontroll", "NEK 400", "førstehjelp").
- Datoer skal returneres som YYYY-MM-DD. Er datoen uklar utelates feltet.
- Skriv all tekst på norsk. Ikke bruk sannsynlighet eller prosenter.`;

const TOOL = {
  type: "function",
  function: {
    name: "register_inspection_report",
    description: "Strukturert uttrekk fra en tilsyns-/revisjonsrapport.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Kort tittel på saken slik rapporten beskriver den" },
        inspection_type: {
          type: "string",
          enum: ["dle", "dsb", "arbeidstilsynet", "customer", "main_contractor", "internal_audit", "other"],
        },
        authority_name: { type: "string", description: "Tilsynsmyndighet, nettselskap eller revisor" },
        case_number: { type: "string" },
        inspection_date: { type: "string", description: "Kontrolldato, YYYY-MM-DD" },
        response_deadline: { type: "string", description: "Svarfrist, YYYY-MM-DD" },
        contact_name: { type: "string" },
        contact_email: { type: "string" },
        contact_phone: { type: "string" },
        description: { type: "string", description: "Beskrivelse/omfang, med rapportens egne ord" },
        report_summary: { type: "string", description: "Kort nøytralt sammendrag av rapporten (internt forslag)" },
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              reference: { type: "string", description: "Nummer/referanse i rapporten, f.eks. 'Avvik 3' eller '2.1'" },
              finding_type: { type: "string", enum: ["deviation", "remark", "observation"] },
              title: { type: "string", description: "Kort tittel basert på rapportens ordlyd" },
              original_text: { type: "string", description: "Ordrett tekst fra rapporten" },
              legal_basis: { type: "string", description: "Krav/hjemmel/paragraf – kun når det eksplisitt fremgår" },
              authority_requirement: { type: "string", description: "Hva myndigheten krever rettet eller dokumentert" },
              deadline: { type: "string", description: "Frist for dette funnet, YYYY-MM-DD" },
              internal_category: { type: "string", description: "Kort intern kategorisering (AI-forslag)" },
              match_keywords: { type: "array", items: { type: "string" } },
            },
            required: ["finding_type", "title", "original_text"],
            additionalProperties: false,
          },
        },
      },
      required: ["title", "inspection_type", "findings"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const rid = crypto.randomUUID().slice(0, 8);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return fail(rid, 401, "auth", "missing_token", "Du er ikke innlogget");

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(url, anon);
    const { data: authData, error: authErr } = await authClient.auth.getUser(token);
    if (authErr || !authData?.user?.id) {
      return fail(rid, 401, "auth", "invalid_token", "Innloggingen er utløpt. Last siden på nytt og prøv igjen.", authErr?.message);
    }

    const body = await req.json().catch(() => ({}));
    const bucket: string = body.bucket ?? "job-attachments";
    const path: string | undefined = body.path;
    const fileName: string = body.fileName ?? "rapport";
    const mime: string = body.mime ?? "application/pdf";
    if (!path) return fail(rid, 400, "input", "missing_path", "Filreferansen mangler");

    const admin = createClient(url, service);
    const { data: file, error: dlErr } = await admin.storage.from(bucket).download(path);
    if (dlErr || !file) {
      return fail(rid, 400, "storage_download", "download_failed",
        "Fant ikke den opplastede rapporten", `${bucket}/${path}: ${dlErr?.message ?? "ingen fil"}`);
    }
    if (file.size > MAX_FILE_SIZE) {
      return fail(rid, 400, "storage_download", "file_too_large", "Filen er for stor (maks 15 MB)");
    }

    const buf = await file.arrayBuffer();
    const isPdf = mime.includes("pdf") || fileName.toLowerCase().endsWith(".pdf");
    const isImage = mime.startsWith("image/");

    let content: any[];
    let mode = "text";
    const plainText = isPdf ? extractPdfText(buf) : (!isImage ? new TextDecoder().decode(buf) : "");

    if (plainText && plainText.length >= MIN_PDF_TEXT_CHARS) {
      content = [{
        type: "text",
        text: `Analyser denne tilsyns-/revisjonsrapporten (filnavn: ${fileName}).\n\n${plainText.slice(0, MAX_TEXT_CHARS)}`,
      }];
    } else if (isImage) {
      mode = "image";
      content = [
        { type: "text", text: `Analyser denne tilsyns-/revisjonsrapporten (filnavn: ${fileName}).` },
        { type: "image_url", image_url: { url: `data:${mime};base64,${encodeBase64(buf)}` } },
      ];
    } else {
      mode = "file";
      content = [
        { type: "text", text: `Analyser denne tilsyns-/revisjonsrapporten (filnavn: ${fileName}).` },
        { type: "file", file: { filename: fileName, file_data: `data:${mime};base64,${encodeBase64(buf)}` } },
      ];
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return fail(rid, 500, "ai_request", "ai_not_configured", "AI er ikke konfigurert");

    console.info(`[inspection-report-analyze] rid=${rid} mode=${mode} size=${file.size}`);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "register_inspection_report" } },
      }),
    });

    if (!aiRes.ok) {
      const text = (await aiRes.text()).slice(0, 500);
      if (aiRes.status === 429) {
        return fail(rid, 429, "ai_request", "ai_rate_limited", "AI er opptatt akkurat nå. Prøv igjen om litt.");
      }
      if (aiRes.status === 402) {
        return fail(rid, 402, "ai_request", "ai_no_credits", "AI-kreditt er oppbrukt.");
      }
      return fail(rid, 502, "ai_request", `ai_http_${aiRes.status}`,
        mode === "text"
          ? "Dokumentanalysen feilet"
          : "Rapporten inneholder ikke lesbar tekst og bildeanalysen kunne ikke gjennomføres.",
        text);
    }

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      return fail(rid, 502, "ai_response", "no_tool_call", "AI fant ingen tilsynsopplysninger i rapporten",
        JSON.stringify(aiJson?.choices?.[0]?.message ?? aiJson).slice(0, 500));
    }

    let parsed: any;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch (parseErr) {
      return fail(rid, 502, "ai_response", "invalid_json", "Kunne ikke tolke analysen av rapporten",
        (parseErr as Error).message);
    }

    const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const analysis = {
      title: clean(parsed.title),
      inspection_type: clean(parsed.inspection_type) ?? "other",
      authority_name: clean(parsed.authority_name),
      case_number: clean(parsed.case_number),
      inspection_date: clean(parsed.inspection_date),
      response_deadline: clean(parsed.response_deadline),
      contact_name: clean(parsed.contact_name),
      contact_email: clean(parsed.contact_email),
      contact_phone: clean(parsed.contact_phone),
      description: clean(parsed.description),
      report_summary: clean(parsed.report_summary),
      findings: (Array.isArray(parsed.findings) ? parsed.findings : []).map((f: any, idx: number) => ({
        reference: clean(f.reference) ?? `${idx + 1}`,
        finding_type: ["deviation", "remark", "observation"].includes(f.finding_type) ? f.finding_type : "observation",
        title: clean(f.title) ?? `Funn ${idx + 1}`,
        original_text: clean(f.original_text),
        legal_basis: clean(f.legal_basis),
        authority_requirement: clean(f.authority_requirement),
        deadline: clean(f.deadline),
        internal_category: clean(f.internal_category),
        match_keywords: (Array.isArray(f.match_keywords) ? f.match_keywords : [])
          .map((k: any) => clean(k)).filter(Boolean).slice(0, 4),
      })),
      analysis_mode: mode,
      source_file_name: fileName,
    };

    return json({ ok: true, requestId: rid, analysis });
  } catch (e) {
    console.error(`[inspection-report-analyze] rid=${rid} unhandled`, e);
    return fail(rid, 500, "unknown", "unhandled_error", "Uventet feil under analysen", (e as Error)?.message);
  }
});
