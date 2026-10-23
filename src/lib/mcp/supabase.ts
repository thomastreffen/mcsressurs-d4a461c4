import type { ToolContext } from "@lovable.dev/mcp-js";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

function runtimeEnv(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}

export function supabaseProjectUrl(): string {
  const url = (runtimeEnv("SUPABASE_URL") ?? runtimeEnv("VITE_SUPABASE_URL"))?.trim();
  if (!url) throw new Error("SUPABASE_URL is required");
  return url;
}

export function supabasePublishableKey(): string {
  const direct = (runtimeEnv("SUPABASE_PUBLISHABLE_KEY") ?? runtimeEnv("VITE_SUPABASE_PUBLISHABLE_KEY"))?.trim();
  if (direct) return direct;
  const keyset = runtimeEnv("SUPABASE_PUBLISHABLE_KEYS");
  if (keyset) {
    try {
      const keys = JSON.parse(keyset) as Record<string, unknown>;
      const key = [keys.default, ...Object.values(keys)].find((v): v is string => typeof v === "string" && v.trim().startsWith("sb_publishable_"));
      if (key) return key.trim();
    } catch { /* fall through */ }
  }
  const legacy = (runtimeEnv("SUPABASE_ANON_KEY") ?? runtimeEnv("VITE_SUPABASE_ANON_KEY"))?.trim();
  if (legacy) return legacy;
  throw new Error("Publishable key is required");
}

/** Verified OAuth bearer of the calling Hub user; never logged or returned. */
export function userBearer(ctx: ToolContext): string {
  const token = ctx.getToken();
  if (!token) throw new Error("Not authenticated");
  return token;
}
