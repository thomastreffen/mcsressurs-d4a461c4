// Project-local support for MCP tool descriptor `_meta` (e.g. OpenAI `openai/fileParams`).
// SDK 3.2.2 has no `_meta` passthrough. Two pieces cover it:
//  1. patches/@lovable.dev%2Fmcp-js@3.2.2.patch makes the manifest extractor (and local runtime) emit `tool._meta`.
//  2. installToolsListMetaInterceptor() adds `_meta` to live `tools/list` responses in the Deno edge
//     runtime, which loads the unpatched SDK from npm. Remove both once the SDK supports `_meta`.

type Meta = Record<string, unknown>;
const registry = new Map<string, Meta>();

/** Attach descriptor `_meta` to a tool definition (keeps the object returned by defineTool). */
export function withToolMeta<T extends { name: string }>(tool: T, meta: Meta): T {
  registry.set(tool.name, meta);
  return Object.assign(tool, { _meta: meta });
}

/** Add registered `_meta` to every tools/list result inside a JSON-RPC payload. */
export function addToolMeta(payload: unknown): unknown {
  const visit = (msg: unknown) => {
    const tools = (msg as { result?: { tools?: unknown } } | null)?.result?.tools;
    if (!Array.isArray(tools)) return;
    for (const t of tools as { name?: string; _meta?: Meta }[]) {
      const meta = t?.name ? registry.get(t.name) : undefined;
      if (meta) t._meta = { ...(t._meta ?? {}), ...meta };
    }
  };
  if (Array.isArray(payload)) payload.forEach(visit);
  else visit(payload);
  return payload;
}

async function rewrite(res: Response): Promise<Response> {
  const type = res.headers.get("content-type") ?? "";
  const isJson = type.includes("application/json");
  const isSse = type.includes("text/event-stream");
  if (!res.body || (!isJson && !isSse)) return res;
  const text = await res.text();
  let out = text;
  try {
    if (isJson) out = JSON.stringify(addToolMeta(JSON.parse(text)));
    else
      out = text.replace(/^data: (.*)$/gm, (line, data: string) => {
        try {
          return `data: ${JSON.stringify(addToolMeta(JSON.parse(data)))}`;
        } catch {
          return line;
        }
      });
  } catch {
    out = text;
  }
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(out, { status: res.status, statusText: res.statusText, headers });
}

type Handler = (req: Request, info?: unknown) => Response | Promise<Response>;

/** Wrap Deno.serve so tools/list responses carry registered `_meta`. No-op outside Deno. */
export function installToolsListMetaInterceptor(): void {
  const deno = (globalThis as { Deno?: { serve?: (...a: unknown[]) => unknown } }).Deno;
  if (!deno?.serve || (deno.serve as { __toolMeta?: boolean }).__toolMeta) return;
  const original = deno.serve.bind(deno);
  const wrap = (h: Handler): Handler => async (req, info) => {
    if (req.method !== "POST") return h(req, info);
    let isList = false;
    try {
      const body = await req.clone().json();
      const msgs = Array.isArray(body) ? body : [body];
      isList = msgs.some((m) => m?.method === "tools/list");
    } catch {
      /* not JSON */
    }
    const res = await h(req, info);
    return isList ? rewrite(res) : res;
  };
  const patched = (...args: unknown[]) => {
    const i = args.findIndex((a) => typeof a === "function");
    if (i >= 0) args[i] = wrap(args[i] as Handler);
    else if (args[0] && typeof (args[0] as { handler?: unknown }).handler === "function") {
      const o = args[0] as { handler: Handler };
      args[0] = { ...o, handler: wrap(o.handler) };
    }
    return original(...args);
  };
  (patched as { __toolMeta?: boolean }).__toolMeta = true;
  deno.serve = patched;
}
