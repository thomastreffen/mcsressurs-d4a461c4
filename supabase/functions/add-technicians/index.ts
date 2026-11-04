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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    const { data: { user }, error: userErr } = await supabaseAnon.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!roleData || !["admin", "super_admin"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { employees, company_id, role_ids } = body;

    if (!Array.isArray(employees) || employees.length === 0) {
      return new Response(JSON.stringify({ error: "No employees provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-fetch all auth users once (not per employee)
    const { data: allAuthUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emailToAuthUser = new Map(
      (allAuthUsers?.users || []).map((u: any) => [u.email?.toLowerCase(), u])
    );

    const results = [];
    for (const emp of employees) {
      const email = emp.email.toLowerCase();
      const name = emp.name;

      try {
        // 1. Find or create auth user
        let authUserId: string | null = null;
        let createdAuthUser = false;

        const existing = emailToAuthUser.get(email);

        if (existing) {
          authUserId = existing.id;
        } else {
          const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { full_name: name },
          });
          if (inviteErr) {
            // Fallback to createUser
            const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
              email,
              email_confirm: false,
              user_metadata: { full_name: name },
            });
            if (createErr || !created?.user) {
              results.push({ email, success: false, error: "Auth creation failed: " + (createErr?.message || "unknown") });
              continue;
            }
            authUserId = created.user.id;
          } else {
            authUserId = invited?.user?.id || null;
          }
          createdAuthUser = true;
        }

        // 2. Create or find person
        let personId: string | null = null;
        const { data: existingPerson } = await supabaseAdmin
          .from("people")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (existingPerson) {
          personId = existingPerson.id;
        } else {
          const { data: newPerson, error: pErr } = await supabaseAdmin
            .from("people")
            .insert({ full_name: name, email, is_active: true })
            .select("id")
            .single();
          if (pErr || !newPerson) {
            results.push({ email, success: false, error: "Person creation failed" });
            continue;
          }
          personId = newPerson.id;
        }

        // 3. Employment profile (if company_id provided)
        if (company_id) {
          const { data: existingEp } = await supabaseAdmin
            .from("employment_profiles")
            .select("id")
            .eq("person_id", personId)
            .eq("company_id", company_id)
            .maybeSingle();

          if (!existingEp) {
            await supabaseAdmin.from("employment_profiles").insert({
              person_id: personId,
              company_id,
              is_plannable_resource: true,
            });
          }
        }

        // 4. User account
        let userAccountId: string | null = null;
        if (authUserId) {
          const { data: existingUa } = await supabaseAdmin
            .from("user_accounts")
            .select("id")
            .eq("person_id", personId)
            .maybeSingle();

          if (existingUa) {
            userAccountId = existingUa.id;
          } else {
            const { data: newUa } = await supabaseAdmin
              .from("user_accounts")
              .insert({
                person_id: personId,
                auth_user_id: authUserId,
                company_id: company_id || null,
                is_active: true,
              })
              .select("id")
              .single();
            userAccountId = newUa?.id || null;
          }

          // Roles
          if (userAccountId && Array.isArray(role_ids) && role_ids.length > 0) {
            for (const rid of role_ids) {
              // Idempotent global assignment; never touches company-scoped rows of the same role.
              const { data: existing } = await supabaseAdmin.from("user_roles_v2").select("id")
                .eq("user_account_id", userAccountId).eq("role_id", rid).is("scope_company_id", null).maybeSingle();
              if (!existing) {
                await supabaseAdmin.from("user_roles_v2").insert({ user_account_id: userAccountId, role_id: rid });
              }
            }
          }

          // Memberships
          if (company_id) {
            await supabaseAdmin.from("user_memberships").upsert(
              { user_id: authUserId, company_id, is_active: true },
              { onConflict: "user_id,company_id" }
            );
            if (userAccountId) {
              await supabaseAdmin.from("user_scopes").upsert(
                { user_account_id: userAccountId, company_id },
                { onConflict: "user_account_id,company_id" }
              );
            }
          }

          // Legacy roles
          await supabaseAdmin.from("user_roles").upsert(
            { user_id: authUserId, role: "user" },
            { onConflict: "user_id,role" }
          );
        }

        // 5. Legacy technician record
        await supabaseAdmin
          .from("technicians")
          .upsert(
            {
              name,
              email,
              microsoft_user_id: emp.microsoftId || null,
              user_id: authUserId,
            },
            { onConflict: "email" }
          );

        results.push({
          email,
          success: true,
          createdAuthUser,
          authUserId,
          personId,
        });
      } catch (err: any) {
        results.push({ email, success: false, error: err.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
