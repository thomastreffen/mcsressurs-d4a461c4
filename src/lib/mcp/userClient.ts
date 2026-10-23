import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseProjectUrl, supabasePublishableKey, userBearer } from "./supabase";

/** Database client acting as the verified Hub user; RLS decides what is visible. */
export function supabaseForUser(ctx: ToolContext) {
  return createClient(supabaseProjectUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${userBearer(ctx)}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
