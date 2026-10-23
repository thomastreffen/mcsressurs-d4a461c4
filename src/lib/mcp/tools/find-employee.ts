import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../userClient";

const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

export default defineTool({
  name: "find_employee",
  title: "Finn ansatt",
  description:
    "Search employees by name or email. Returns only employees the signed-in Hub user may see (person_id, name, email, company).",
  inputSchema: {
    query: z.string().min(2).max(100).describe("Part of name or email"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query }, ctx) => {
    if (!ctx.isAuthenticated()) return fail("Not authenticated");
    const sb = supabaseForUser(ctx);
    const q = query.replace(/[%,()*]/g, " ").trim();
    const { data: people, error } = await sb
      .from("people")
      .select("id, full_name, email")
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .neq("is_active", false)
      .limit(25);
    if (error) return fail(error.message);
    const ids = (people ?? []).map((p) => p.id);
    if (!ids.length) return { content: [{ type: "text", text: "No matching employees" }], structuredContent: { employees: [] } };
    const [{ data: emp }, { data: companies }] = await Promise.all([
      sb.from("employment_profiles").select("person_id, company_id, archived_at").in("person_id", ids),
      sb.from("internal_companies").select("id, name"),
    ]);
    const cname = new Map((companies ?? []).map((c) => [c.id as string, c.name as string]));
    const byPerson = new Map<string, string[]>();
    for (const e of emp ?? []) {
      if (e.archived_at) continue;
      const l = byPerson.get(e.person_id) ?? [];
      const n = cname.get(e.company_id) ?? e.company_id;
      if (!l.includes(n)) l.push(n);
      byPerson.set(e.person_id, l);
    }
    // Only people with a visible active employment count as employees.
    const employees = (people ?? [])
      .filter((p) => byPerson.has(p.id))
      .map((p) => ({ person_id: p.id as string, name: (p.full_name ?? "") as string, email: (p.email ?? null) as string | null, companies: byPerson.get(p.id) ?? [] }));
    return {
      content: [{ type: "text", text: JSON.stringify(employees) }],
      structuredContent: { employees },
    };
  },
});
