// marketing-briefing-parse: recebe o id de um briefing de marketing, baixa a
// foto/PDF do bucket marketing-briefings e usa o Claude (Anthropic) para
// extrair o plano de conteúdo do mês em JSON, gravando em marketing_briefings.
//
// Segredos necessários (supabase secrets set ...):
//   ANTHROPIC_API_KEY - chave da API da Anthropic (console.anthropic.com)
//
// Sem a chave configurada, responde configured:false e marca o briefing como
// ERRO com orientação, sem quebrar o app.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    monthLabel: { type: "string", description: "Mês do briefing por extenso, ex.: Julho 2026" },
    summary: { type: "string", description: "Resumo curto (2-3 frases) da estratégia do mês" },
    cadence: {
      type: "array",
      description: "Cadência de produção por formato (quantidades do mês/semana)",
      items: {
        type: "object",
        properties: {
          format: { type: "string", description: "REEL, CARROSSEL, STORY, YOUTUBE ou OUTRO" },
          target: { type: "string", description: "Meta em texto, ex.: 16 no mês (4 por semana)" },
        },
        required: ["format", "target"],
        additionalProperties: false,
      },
    },
    weeklyThemes: {
      type: "array",
      description: "Temas-âncora por semana",
      items: {
        type: "object",
        properties: {
          week: { type: "integer", description: "Número da semana no mês (1 a 5)" },
          theme: { type: "string" },
          notes: { type: "string", description: "Gancho/observações da semana; string vazia se não houver" },
        },
        required: ["week", "theme", "notes"],
        additionalProperties: false,
      },
    },
    pieces: {
      type: "array",
      description: "Todas as peças/posts do calendário, uma por linha do briefing",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "Data ISO AAAA-MM-DD; se o briefing só indicar a semana, use a segunda-feira daquela semana" },
          format: { type: "string", enum: ["REEL", "CARROSSEL", "STORY", "YOUTUBE", "OUTRO"] },
          title: { type: "string", description: "Título/tema da peça" },
          notes: { type: "string", description: "CTA, roteiro ou observações; string vazia se não houver" },
        },
        required: ["date", "format", "title", "notes"],
        additionalProperties: false,
      },
    },
  },
  required: ["monthLabel", "summary", "cadence", "weeklyThemes", "pieces"],
  additionalProperties: false,
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

function buildSourceBlock(mime: string, bytes: Uint8Array): AnthropicContentBlock {
  if (mime.startsWith("image/")) {
    return { type: "image", source: { type: "base64", media_type: mime, data: toBase64(bytes) } };
  }
  if (mime === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(bytes) } };
  }
  // Arquivos de texto (txt, html, md…): manda o conteúdo como texto puro.
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return { type: "text", text: `Conteúdo do briefing (arquivo ${mime}):\n\n${text.slice(0, 180_000)}` };
}

async function extractPlan(apiKey: string, monthRef: string, mime: string, bytes: Uint8Array) {
  const instruction = [
    "Você é o assistente de marketing do Instituto Bratan (clínica de emagrecimento e longevidade).",
    `Este é o briefing de conteúdo do mês ${monthRef}. Extraia o plano completo em JSON seguindo o schema:`,
    "- cadence: as metas de produção por formato (carrosséis, reels, stories, YouTube).",
    "- weeklyThemes: os temas-âncora de cada semana.",
    "- pieces: TODAS as peças do calendário, uma por post, com data, formato e título. Não invente peças que não estão no briefing; se uma informação não existir, use string vazia.",
    "Escreva os textos em português do Brasil, exatamente como estão no briefing (pode corrigir abreviações óbvias).",
  ].join("\n");

  const body = {
    model: MODEL,
    max_tokens: 16000,
    output_config: {
      format: { type: "json_schema", schema: PLAN_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [buildSourceBlock(mime, bytes), { type: "text", text: instruction }],
      },
    ],
  };

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Anthropic respondeu ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }

  const payload = await response.json();
  if (payload.stop_reason === "refusal") {
    throw new Error("A IA recusou processar este arquivo. Confira se é mesmo o briefing do mês.");
  }
  const textBlock = (payload.content ?? []).find((block: { type: string }) => block.type === "text");
  if (!textBlock?.text) {
    throw new Error("A IA não retornou conteúdo. Tente novamente.");
  }
  return JSON.parse(textBlock.text) as {
    monthLabel: string;
    summary: string;
    cadence: { format: string; target: string }[];
    weeklyThemes: { week: number; theme: string; notes: string }[];
    pieces: { date: string; format: string; title: string; notes: string }[];
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Supabase env ausente" }, 500);

  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let briefingId = "";
  try {
    const payload = await request.json();
    briefingId = String(payload?.briefingId ?? "");
  } catch {
    return json({ error: "Body inválido: envie { briefingId }" }, 400);
  }
  if (!briefingId) return json({ error: "briefingId é obrigatório" }, 400);

  const { data: briefing, error: loadError } = await client
    .from("marketing_briefings")
    .select("id, month_ref, source_path, source_mime")
    .eq("id", briefingId)
    .maybeSingle();

  if (loadError) return json({ error: `Falha ao carregar briefing: ${loadError.message}` }, 500);
  if (!briefing) return json({ error: "Briefing não encontrado" }, 404);
  if (!briefing.source_path) return json({ error: "Briefing sem arquivo anexado" }, 400);

  const markError = async (detail: string) => {
    await client
      .from("marketing_briefings")
      .update({ status: "ERRO", error_detail: detail.slice(0, 800), updated_at: new Date().toISOString() })
      .eq("id", briefingId);
  };

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    const detail = "Chave da IA não configurada. Rode no terminal: node scripts/marketing-ia-setup.mjs";
    await markError(detail);
    return json({ configured: false, error: detail });
  }

  await client
    .from("marketing_briefings")
    .update({ status: "PROCESSANDO", error_detail: null, updated_at: new Date().toISOString() })
    .eq("id", briefingId);

  try {
    const { data: file, error: downloadError } = await client.storage
      .from("marketing-briefings")
      .download(briefing.source_path);
    if (downloadError || !file) {
      throw new Error(`Não consegui baixar o arquivo do briefing: ${downloadError?.message ?? "arquivo vazio"}`);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = briefing.source_mime || file.type || "application/octet-stream";
    const plan = await extractPlan(apiKey, briefing.month_ref, mime, bytes);

    const content = {
      ...plan,
      monthRef: briefing.month_ref,
      pieces: plan.pieces.map((piece) => ({
        ...piece,
        id: crypto.randomUUID(),
        status: "A_PRODUZIR",
      })),
      generatedAt: new Date().toISOString(),
      generatedBy: MODEL,
    };

    const { error: saveError } = await client
      .from("marketing_briefings")
      .update({ status: "PROCESSADO", content, error_detail: null, updated_at: new Date().toISOString() })
      .eq("id", briefingId);
    if (saveError) throw new Error(`Plano extraído, mas falhou ao salvar: ${saveError.message}`);

    return json({ configured: true, ok: true, pieces: content.pieces.length });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await markError(detail);
    return json({ configured: true, ok: false, error: detail }, 500);
  }
});
