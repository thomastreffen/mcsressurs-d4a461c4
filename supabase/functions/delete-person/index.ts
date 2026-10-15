import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: callerErr } = await supabaseAnon.auth.getUser(jwt);
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only super_admin can use this
    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!callerRole || callerRole.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { person_id, action } = body; // action: "check" | "delete" | "reset_onboarding"

    if (!person_id) {
      return new Response(JSON.stringify({ error: "Missing person_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch person
    const { data: person } = await supabaseAdmin
      .from("people")
      .select("id, full_name, email")
      .eq("id", person_id)
      .maybeSingle();

    if (!person) {
      return new Response(JSON.stringify({ error: "Person not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user account
    const { data: userAccount } = await supabaseAdmin
      .from("user_accounts")
      .select("id, auth_user_id, is_active")
      .eq("person_id", person_id)
      .maybeSingle();

    const authUserId = userAccount?.auth_user_id || null;

    // ---- DEPENDENCY CHECK ----
    const deps: Record<string, number> = {};

    // Employment profiles
    const { count: epCount } = await supabaseAdmin
      .from("employment_profiles")
      .select("id", { count: "exact", head: true })
      .eq("person_id", person_id);
    deps.employment_profiles = epCount || 0;

    // Roles
    if (userAccount) {
      const { count: rolesCount } = await supabaseAdmin
        .from("user_roles_v2")
        .select("id", { count: "exact", head: true })
        .eq("user_account_id", userAccount.id);
      deps.roles = rolesCount || 0;

      const { count: scopesCount } = await supabaseAdmin
        .from("user_scopes")
        .select("id", { count: "exact", head: true })
        .eq("user_account_id", userAccount.id);
      deps.scopes = scopesCount || 0;

      const { count: overridesCount } = await supabaseAdmin
        .from("user_permission_overrides_v2")
        .select("id", { count: "exact", head: true })
        .eq("user_account_id", userAccount.id);
      deps.permission_overrides = overridesCount || 0;

      // Project memberships
      const { count: pmCount } = await supabaseAdmin
        .from("project_members")
        .select("id", { count: "exact", head: true })
        .eq("user_account_id", userAccount.id);
      deps.project_memberships = pmCount || 0;

      // Conversation posts
      const { count: postsCount } = await supabaseAdmin
        .from("conversation_posts")
        .select("id", { count: "exact", head: true })
        .eq("author_id", userAccount.id);
      deps.conversation_posts = postsCount || 0;
    }

    // Activity log (by auth user id)
    if (authUserId) {
      const { count: actCount } = await supabaseAdmin
        .from("activity_log")
        .select("id", { count: "exact", head: true })
        .eq("performed_by", authUserId);
      deps.activity_log = actCount || 0;

      // Legacy memberships
      const { count: memCount } = await supabaseAdmin
        .from("user_memberships")
        .select("id", { count: "exact", head: true })
        .eq("user_id", authUserId);
      deps.legacy_memberships = memCount || 0;

      // Legacy role assignments
      const { count: raCount } = await supabaseAdmin
        .from("user_role_assignments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", authUserId);
      deps.legacy_role_assignments = raCount || 0;
    }

    // Audit log
    const { count: auditCount } = await supabaseAdmin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("target_id", person_id);
    deps.audit_log = auditCount || 0;

    // Determine if safe to delete
    const heavyRefs = (deps.conversation_posts || 0) + (deps.activity_log || 0) + (deps.project_memberships || 0);
    const canHardDelete = heavyRefs === 0;

    if (action === "check") {
      return new Response(JSON.stringify({
        person: { id: person.id, full_name: person.full_name, email: person.email },
        has_auth_account: !!authUserId,
        has_user_account: !!userAccount,
        dependencies: deps,
        can_hard_delete: canHardDelete,
        heavy_references: heavyRefs,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- RESET ONBOARDING ----
    if (action === "reset_onboarding") {
      if (!authUserId) {
        return new Response(JSON.stringify({ error: "No auth account to reset" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Reset password/confirmation so user must go through activate flow again
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUser(authUserId, {
        email_confirm: false,
        password: undefined,
      });

      if (updateErr) {
        console.error("[delete-person] reset onboarding updateUser error:", updateErr.message);
      }

      // Re-send invite
      const siteUrl = Deno.env.get("SITE_URL") || req.headers.get("origin") || "https://mcsressurs.lovable.app";
      const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(person.email, {
        data: { full_name: person.full_name },
        redirectTo: `${siteUrl}/activate`,
      });

      // Audit log
      await supabaseAdmin.from("audit_log").insert({
        action: "reset_onboarding",
        target_type: "person",
        target_id: person_id,
        actor_user_account_id: userAccount?.id || null,
        metadata: { performed_by_auth: caller.id, person_email: person.email },
      });

      return new Response(JSON.stringify({
        success: true,
        invite_resent: !inviteErr,
        invite_error: inviteErr?.message || null,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- DEACTIVATE / REACTIVATE ACCESS (keeps all data) ----
    if (action === "set_access") {
      const active = body.active === true;
      if (authUserId === caller.id && !active) {
        return new Response(JSON.stringify({ error: "Du kan ikke deaktivere deg selv" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (authUserId) {
        const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          ban_duration: active ? "none" : "876000h",
        } as any);
        if (banErr) {
          return new Response(JSON.stringify({ error: banErr.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      if (userAccount) {
        const { error: uaErr } = await supabaseAdmin.from("user_accounts")
          .update({ is_active: active }).eq("id", userAccount.id);
        if (uaErr) {
          return new Response(JSON.stringify({ error: uaErr.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      await supabaseAdmin.from("audit_log").insert({
        action: active ? "access_reactivated" : "access_deactivated",
        target_type: "person",
        target_id: person_id,
        actor_user_account_id: userAccount?.id || null,
        metadata: { performed_by_auth: caller.id, person_email: person.email },
      });
      return new Response(JSON.stringify({ success: true, active }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- HARD DELETE ----
    if (action === "delete") {
      if (!canHardDelete) {
        return new Response(JSON.stringify({
          error: "Cannot hard delete: user has significant references",
          heavy_references: heavyRefs,
          dependencies: deps,
        }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Audit log BEFORE deletion
      await supabaseAdmin.from("audit_log").insert({
        action: "hard_delete_person",
        target_type: "person",
        target_id: person_id,
        metadata: {
          performed_by_auth: caller.id,
          person_email: person.email,
          person_name: person.full_name,
          dependencies_at_delete: deps,
        },
      });

      // Delete in correct order (reverse dependency)
      if (userAccount) {
        await supabaseAdmin.from("user_permission_overrides_v2").delete().eq("user_account_id", userAccount.id);
        await supabaseAdmin.from("user_roles_v2").delete().eq("user_account_id", userAccount.id);
        await supabaseAdmin.from("user_scopes").delete().eq("user_account_id", userAccount.id);
        await supabaseAdmin.from("space_members").delete().eq("user_account_id", userAccount.id);
        await supabaseAdmin.from("folder_members").delete().eq("user_account_id", userAccount.id);
        await supabaseAdmin.from("user_accounts").delete().eq("id", userAccount.id);
      }

      if (authUserId) {
        await supabaseAdmin.from("user_permission_overrides").delete().eq("user_id", authUserId);
        await supabaseAdmin.from("user_role_assignments").delete().eq("user_id", authUserId);
        await supabaseAdmin.from("user_memberships").delete().eq("user_id", authUserId);
        await supabaseAdmin.from("user_roles").delete().eq("user_id", authUserId);

        // Delete auth user
        const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
        if (authDeleteErr) {
          console.error("[delete-person] Auth delete error:", authDeleteErr.message);
        }
      }

      // Delete employment profiles
      await supabaseAdmin.from("employment_profiles").delete().eq("person_id", person_id);

      // Delete person record
      await supabaseAdmin.from("people").delete().eq("id", person_id);

      return new Response(JSON.stringify({
        success: true,
        deleted: {
          person: true,
          auth_user: !!authUserId,
          user_account: !!userAccount,
          employment_profiles: deps.employment_profiles,
        },
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: check, delete, reset_onboarding" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[delete-person] Error:", err?.message || String(err));
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
