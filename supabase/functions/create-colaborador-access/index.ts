import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cargos = new Set([
  "dr_daniel",
  "ceo",
  "gestor",
  "gestor_financeiro",
  "marketing",
  "secretaria_executiva",
  "recepcionista",
  "enfermeira",
  "nutricionista",
  "limpeza",
]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Supabase environment is not configured." }, 500);
    }

    const authorization = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: allowed, error: allowedError } = await userClient.rpc("is_coordenacao", { _user: user.id });

    if (allowedError || allowed !== true) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => null);
    const colaboradorId = String(body?.colaboradorId ?? "").trim();
    const nome = String(body?.nome ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const cargo = String(body?.cargo ?? "").trim();
    const password = String(body?.password ?? "");

    if (!colaboradorId || !nome || !email.includes("@") || !cargos.has(cargo) || password.length < 8) {
      return json({ error: "Invalid payload" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: colaborador, error: colaboradorError } = await adminClient
      .from("colaborador")
      .select("id, auth_id")
      .eq("id", colaboradorId)
      .maybeSingle();

    if (colaboradorError) throw colaboradorError;
    if (!colaborador) {
      return json({ error: "Colaborador not found" }, 404);
    }
    if (colaborador.auth_id) {
      return json({ error: "Colaborador already has access" }, 409);
    }

    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, cargo },
    });

    if (createUserError) throw createUserError;
    if (!createdUser.user) {
      return json({ error: "User was not created" }, 500);
    }

    const authId = createdUser.user.id;
    const { error: updateColaboradorError } = await adminClient
      .from("colaborador")
      .update({ auth_id: authId, nome, email, ativo: true })
      .eq("id", colaboradorId);

    if (updateColaboradorError) {
      await adminClient.auth.admin.deleteUser(authId);
      throw updateColaboradorError;
    }

    const { error: upsertCargoError } = await adminClient.from("colaborador_cargo").upsert(
      {
        colaborador_id: colaboradorId,
        auth_id: authId,
        cargo,
      },
      { onConflict: "colaborador_id" },
    );

    if (upsertCargoError) {
      await adminClient.auth.admin.deleteUser(authId);
      throw upsertCargoError;
    }

    const { data: actor } = await adminClient.from("colaborador").select("id").eq("auth_id", user.id).maybeSingle();

    await adminClient.from("audit_event").insert({
      actor_id: actor?.id ?? null,
      action: "auth.create_colaborador_access",
      entity: "colaborador",
      entity_id: colaboradorId,
      metadata: { cargo, email },
    });

    return json({ authId, colaboradorId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});
