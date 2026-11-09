import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { legacyAdminInCompany, requireGlobalAccessManager } from "../_shared/security-boundary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      email, full_name, company_id, customer_id, project_ids,
      account_id, portal_role, invited_by_portal_user,
    } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let inviterAccountId = account_id || null;
    let inviterIsAdmin = false;

    if (invited_by_portal_user) {
      // Caller is a customer_admin inviting a team member
      const { data: portalCaller } = await supabase
        .from("customer_portal_users")
        .select("id, account_id, portal_role")
        .eq("auth_user_id", caller.id)
        .eq("status", "active")
        .maybeSingle();

      if (!portalCaller || portalCaller.portal_role !== "customer_admin") {
        return new Response(JSON.stringify({ error: "Kun administrator kan invitere" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      inviterAccountId = portalCaller.account_id;
      inviterIsAdmin = false; // portal admin, not system admin
    } else {
      // Staff invite: global superadmin everywhere; legacy admin only for its own company and that
      // company's projects (no cross-company portal grants).
      let allowed = await legacyAdminInCompany(supabase, caller.id, company_id, { includeV1ManageUsers: false });
      if (allowed && Array.isArray(project_ids) && project_ids.length > 0 && !(await requireGlobalAccessManager(supabase, caller.id))) {
        const { data: projects } = await supabase.from("events").select("id, company_id").in("id", project_ids);
        allowed = (projects ?? []).length === project_ids.length && (projects ?? []).every((p: any) => p.company_id === company_id);
      }
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Admin required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      inviterIsAdmin = true;
    }

    // Check existing portal user
    const { data: existing } = await supabase
      .from("customer_portal_users")
      .select("id, status, auth_user_id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    let portalUserId: string;
    let authUserId: string | null = null;

    if (existing) {
      portalUserId = existing.id;
      authUserId = existing.auth_user_id;

      if (existing.status === "disabled") {
        await supabase
          .from("customer_portal_users")
          .update({
            status: "pending",
            account_id: inviterAccountId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", portalUserId);
      }
    } else {
      const { data: newUser, error: insertErr } = await supabase
        .from("customer_portal_users")
        .insert({
          email: email.toLowerCase(),
          full_name: full_name || null,
          company_id: company_id || null,
          customer_id: customer_id || null,
          account_id: inviterAccountId,
          portal_role: portal_role || "customer_user",
          invited_by: caller.id,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;
      portalUserId = newUser.id;
    }

    // Grant project access (for system admin invites)
    if (project_ids && Array.isArray(project_ids)) {
      for (const pid of project_ids) {
        await supabase
          .from("customer_portal_project_access")
          .upsert({
            portal_user_id: portalUserId,
            project_id: pid,
            account_id: inviterAccountId,
            granted_by: caller.id,
          }, { onConflict: "portal_user_id,project_id" });
      }
    }

    // If account_id is set, also grant account-level project access
    if (inviterAccountId) {
      const { data: accountProjects } = await supabase
        .from("customer_portal_project_access")
        .select("project_id")
        .eq("account_id", inviterAccountId);

      // New user inherits account's projects automatically via account_id in RLS
    }

    // Generate magic link
    const redirectUrl = `${req.headers.get("origin") || supabaseUrl.replace(".supabase.co", ".lovable.app")}/portal/activate`;

    const { data: magicData, error: magicErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: email.toLowerCase(),
      options: {
        redirectTo: redirectUrl,
        data: {
          app_role: "customer_user",
          full_name: full_name || email.split("@")[0],
          portal_user_id: portalUserId,
        },
      },
    });

    if (magicErr) throw magicErr;

    if (!authUserId && magicData?.user?.id) {
      await supabase
        .from("customer_portal_users")
        .update({ auth_user_id: magicData.user.id })
        .eq("id", portalUserId);

      await supabase
        .from("user_roles")
        .upsert({
          user_id: magicData.user.id,
          role: "customer_user",
        }, { onConflict: "user_id,role" });
    }

    const actionLink = magicData?.properties?.action_link;

    // Log
    await supabase.from("activity_log").insert({
      entity_type: "customer_portal",
      entity_id: portalUserId,
      action: "invitation_sent",
      performed_by: caller.id,
      description: `Invitasjon sendt til ${email}${inviterAccountId ? " (kontoinvitasjon)" : ""}`,
      type: "system",
      visibility: "internal",
    });

    return new Response(
      JSON.stringify({
        success: true,
        portal_user_id: portalUserId,
        action_link: actionLink,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: (err as any)?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
