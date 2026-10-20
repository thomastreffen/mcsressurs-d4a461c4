import { matchesProjectSearch, rankProjectSearch } from "./project-search.ts";
import type { TtImportProject } from "./tripletex-import-core.ts";

type ProjectSearchRead = (method: string, path: string) => Promise<{
  r: { ok: boolean; status: number }; b: { values?: TtImportProject[] } | null;
}>;

/** Literal API filters exclude separator variants and cross-field tokens.
 * Page eligible TEST candidates, then match locally before the result limit. */
export async function searchTripletexProjects(call: ProjectSearchRead, query: string, includeClosed: boolean, fields: string): Promise<TtImportProject[]> {
  const candidates: TtImportProject[] = [];
  const count = 1000;
  for (let from = 0; ; from += count) {
    const x = await call("GET", `/project?from=${from}&count=${count}${includeClosed ? "" : "&isClosed=false"}&fields=${fields}`);
    if (!x.r.ok) throw new Error(`search ${x.r.status}`);
    const page = (x.b?.values ?? []) as TtImportProject[];
    candidates.push(...page);
    if (page.length < count) break;
  }
  return candidates.filter((p) => matchesProjectSearch([p.number, p.name, p.customer?.name, p.customer?.organizationNumber], query))
    .sort((a, b) => rankProjectSearch(a.number, a.name, a.customer?.name, query) - rankProjectSearch(b.number, b.name, b.customer?.name, query)
      || a.number.localeCompare(b.number, "nb", { numeric: true }) || a.id - b.id)
    .slice(0, 50);
}