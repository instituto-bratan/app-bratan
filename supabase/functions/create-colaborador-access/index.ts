import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const defaultAllowedOrigins = [
  "https://app-bratan.vercel.app",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

function allowedOrigins() {
  const configured = Deno.env.get("APP_ALLOWED_ORIGINS");
  if (!configured) return defaultAllowedOrigins;

  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowedOrigin = allowedOrigins().includes(origin) ? origin : defaultAllowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
}

function hasAllowedOrigin(req: Request) {
  const origin = req.headers.get("Origin");
  return !origin || allowedOrigins().includes(origin);
}

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

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  if (!hasAllowedOrigin(req)) {
    return json(req, { error: "Origin not allowed" }, 403);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(req, { error: "Supabase environment is not configured." }, 500);
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
      return json(req, { error: "Unauthorized" }, 401);
    }

    const { data: allowed, error: allowedError } = await userClient.rpc("is_coordenacao", { _user: user.id });

    if (allowedError || allowed !== true) {
      return json(req, { error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => null);
    const colaboradorId = String(body?.colaboradorId ?? "").trim();
    const nome = String(body?.nome ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const cargo = String(body?.cargo ?? "").trim();
    const password = String(body?.password ?? "");

    if (
      !colaboradorId ||
      nome.length < 2 ||
      nome.length > 120 ||
      !email.endsWith("@institutobratan.com.br") ||
      !cargos.has(cargo) ||
      password.length < 12
    ) {
      return json(req, { error: "Invalid payload" }, 400);
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
      return json(req, { error: "Colaborador not found" }, 404);
    }
    if (colaborador.auth_id) {
      return json(req, { error: "Colaborador already has access" }, 409);
    }

    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, cargo },
    });

    if (createUserError) throw createUserError;
    if (!createdUser.user) {
      return json(req, { error: "User was not created" }, 500);
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

    return json(req, { authId, colaboradorId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(req, { error: message }, 500);
  }
});
