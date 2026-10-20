/** Discovery only: never use normalized values for identity or linking. */
export function normalizeProjectSearch(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
export function projectSearchTokens(query: string): string[] {
  return query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
export function matchesProjectSearch(fields: (string | null | undefined)[], query: string): boolean {
  const values = fields.map(normalizeProjectSearch);
  const compact = normalizeProjectSearch(query);
  return !compact || values.some((value) => value.includes(compact))
    || projectSearchTokens(query).every((token) => values.some((value) => value.includes(token)));
}
export function rankProjectSearch(number: string | null | undefined, name: string, customer: string | null | undefined, query: string): number {
  const term = normalizeProjectSearch(query);
  if (!term) return 5;
  const n = normalizeProjectSearch(number), title = normalizeProjectSearch(name), client = normalizeProjectSearch(customer);
  if (n === term) return 0;
  if (title === term || client === term) return 1;
  if (n.startsWith(term) || title.startsWith(term)) return 2;
  if (client.includes(term)) return 3;
  return 4;
}