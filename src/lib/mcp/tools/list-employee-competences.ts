import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../userClient";

const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

export default defineTool({
  name: "list_employee_competences",
  title: "Vis ansattes kompetanse",
  description:
    "List active competence records for one employee (person_id). Returns competence_id, type/name, issued_at, expires_at, issuer, description and whether a document is attached. Respects the signed-in user's HMS view access.",
  inputSchema: {
    person_id: z.string().uuid().describe("person_id from find_employee"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ person_id }, ctx) => {
    if (!ctx.isAuthenticated()) return fail("Not authenticated");
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("compliance_competences")
      .select("id, type_label, description, issuer, issued_at, expires_at, document_id, compliance_competence_types(name)")
      .eq("person_id", person_id)
      .is("deleted_at", null)
      .order("expires_at", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) return fail(error.message);
    const competences = (data ?? []).map((r: any) => ({
      competence_id: r.id as string,
      type: (r.compliance_competence_types?.name ?? r.type_label ?? null) as string | null,
      issued_at: (r.issued_at ?? null) as string | null,
      expires_at: (r.expires_at ?? null) as string | null,
      issuer: (r.issuer ?? null) as string | null,
      description: (r.description ?? null) as string | null,
      has_document: !!r.document_id,
    }));
    return {
      content: [{ type: "text", text: competences.length ? JSON.stringify(competences) : "No visible competence records" }],
      structuredContent: { competences },
    };
  },
});
