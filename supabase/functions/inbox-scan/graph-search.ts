// Graph $search cannot be combined with $orderby (400 SearchWithOrderBy).
// Build a protocol-valid search URL and sort locally; follow @odata.nextLink with a page cap.
export const SEARCH_SELECT =
  "id,subject,bodyPreview,from,toRecipients,receivedDateTime,webLink,internetMessageId,conversationId,isDraft";

export function buildSearchUrl(base: string, query: string, top = 50): string {
  return `${base}/me/messages?$search="${encodeURIComponent(query)}"&$top=${top}&$select=${SEARCH_SELECT}`;
}

export type SearchResult = { messages: any[]; ok: boolean; status?: number; code?: string };

export async function searchAllPages(
  firstUrl: string,
  token: string,
  sinceIso: string,
  maxPages = 5,
  fetchFn: typeof fetch = fetch,
): Promise<SearchResult> {
  const out: any[] = [];
  const seen = new Set<string>();
  let url: string | undefined = firstUrl;
  for (let page = 0; url && page < maxPages; page++) {
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      let code: string | undefined;
      try { code = (await res.json())?.error?.code; } catch { /* ignore */ }
      return { messages: out, ok: false, status: res.status, code };
    }
    const data = await res.json();
    for (const m of data.value || []) {
      if (!m?.id || seen.has(m.id)) continue;
      if (m.receivedDateTime && m.receivedDateTime < sinceIso) continue;
      seen.add(m.id);
      out.push(m);
    }
    url = data["@odata.nextLink"];
  }
  out.sort((a, b) => String(b.receivedDateTime || "").localeCompare(String(a.receivedDateTime || "")));
  return { messages: out, ok: true };
}
