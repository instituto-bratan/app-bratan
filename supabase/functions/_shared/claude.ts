// Chamada padrão ao Claude (Messages API) com saída estruturada + registro em
// ia_evento. Regime de dados da casa: aqui só passam AGREGADOS e textos internos;
// nunca prontuário, CPF ou documento com nome de paciente.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// Preços públicos por milhão de tokens (14/09/2026).
const PRECOS: Record<string, { entrada: number; saida: number }> = {
  "claude-opus-5": { entrada: 5, saida: 25 },
  "claude-sonnet-5": { entrada: 2, saida: 10 },
  "claude-haiku-4-5": { entrada: 1, saida: 5 },
};

export type ChamadaClaude = { modelo: string; sistema: string; usuario: string; schema: Record<string, unknown>; maxTokens?: number };

export async function chamarClaude<T>(chamada: ChamadaClaude): Promise<{ dados: T; tokensEntrada: number; tokensSaida: number; custoUsd: number }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Chave da IA não configurada (ANTHROPIC_API_KEY).");
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: chamada.modelo,
      max_tokens: chamada.maxTokens ?? 2500,
      system: chamada.sistema,
      output_config: { format: { type: "json_schema", schema: chamada.schema } },
      messages: [{ role: "user", content: [{ type: "text", text: chamada.usuario }] }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic respondeu ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const payload = await response.json();
  if (payload.stop_reason === "refusal") throw new Error("A IA recusou esta tarefa.");
  const bloco = (payload.content ?? []).find((b: { type: string }) => b.type === "text");
  if (!bloco?.text) throw new Error("A IA não devolveu conteúdo.");
  const tokensEntrada = Number(payload.usage?.input_tokens ?? 0);
  const tokensSaida = Number(payload.usage?.output_tokens ?? 0);
  const preco = PRECOS[chamada.modelo] ?? PRECOS["claude-sonnet-5"];
  const custoUsd = Math.round(((tokensEntrada * preco.entrada + tokensSaida * preco.saida) / 1_000_000) * 1_000_000) / 1_000_000;
  return { dados: JSON.parse(bloco.text) as T, tokensEntrada, tokensSaida, custoUsd };
}

export async function registrarIaEvento(
  client: SupabaseClient,
  evento: { funcao: string; modelo: string; finalidade: string; classeRisco?: "BAIXO" | "MEDIO" | "ALTO"; entidade?: string; entityRef?: string; atorId?: string | null; tokensEntrada: number; tokensSaida: number; custoUsd: number; confianca?: number | null; duracaoMs: number; resumo: string; resultado: unknown; permissao?: "PROPOSTA" | "AUTO" | "ERRO" },
) {
  await client.from("ia_evento").insert({
    funcao: evento.funcao,
    modelo: evento.modelo,
    finalidade: evento.finalidade,
    classe_risco: evento.classeRisco ?? "BAIXO",
    entidade: evento.entidade ?? null,
    entity_ref: evento.entityRef ?? null,
    ator_id: evento.atorId ?? null,
    tokens_entrada: evento.tokensEntrada,
    tokens_saida: evento.tokensSaida,
    custo_usd: evento.custoUsd,
    confianca: evento.confianca ?? null,
    duracao_ms: evento.duracaoMs,
    resumo: evento.resumo.slice(0, 500),
    resultado: evento.resultado,
    permissao: evento.permissao ?? "PROPOSTA",
  });
}

/** Quem está chamando (JWT do usuário no Authorization) → id/cargo do colaborador. */
export async function quemChama(client: SupabaseClient, request: Request): Promise<{ authId: string; pessoaId: string | null; nome: string; cargo: string } | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await client.auth.getUser(token);
  const user = data?.user;
  if (!user) return null;
  const { data: pessoa } = await client.from("colaborador_app").select("id, nome, cargo").eq("auth_id", user.id).eq("ativo", true).maybeSingle();
  return { authId: user.id, pessoaId: pessoa?.id ?? null, nome: pessoa?.nome ?? "", cargo: pessoa?.cargo ?? "" };
}
