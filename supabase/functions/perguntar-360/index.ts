// perguntar-360 (15/09/2026, proposta 1.4): caixa de pergunta do Painel. A tela
// manda a pergunta E os números que já tem (JSON); a IA só escolhe componentes de
// um catálogo fechado (cartões com frase, tabela, ações com link) e nunca calcula.
// Se o número não está no contexto, a resposta diz que o app ainda não mede aquilo.
import { corpo, db, json } from "../_shared/integracoes.ts";
import { chamarClaude, quemChama, registrarIaEvento } from "../_shared/claude.ts";

const MODELO = "claude-sonnet-5";
const SCHEMA = {
  type: "object",
  properties: {
    respostaCurta: { type: "string", description: "Uma ou duas frases respondendo à pergunta, com os números e a fonte entre colchetes." },
    cartoes: { type: "array", maxItems: 4, items: { type: "object", properties: { rotulo: { type: "string" }, valor: { type: "string" }, frase: { type: "string" }, fonte: { type: "string" } }, required: ["rotulo", "valor", "frase", "fonte"], additionalProperties: false } },
    tabela: { type: "object", properties: { colunas: { type: "array", items: { type: "string" } }, linhas: { type: "array", items: { type: "array", items: { type: "string" } } } }, required: ["colunas", "linhas"], additionalProperties: false },
    acoes: { type: "array", maxItems: 3, items: { type: "object", properties: { rotulo: { type: "string" }, href: { type: "string", description: "Rota interna do app começando com /" } }, required: ["rotulo", "href"], additionalProperties: false } },
    naoSei: { type: "boolean", description: "true quando o contexto não tem o número necessário." },
  },
  required: ["respostaCurta", "cartoes", "tabela", "acoes", "naoSei"],
  additionalProperties: false,
};
const ROTAS = ["/", "/financeiro/painel", "/financeiro/contas", "/financeiro/lucro", "/financeiro/extrato", "/financeiro/lancar-dia", "/crm/vendas", "/crm/minhas-tarefas", "/acompanhamento", "/estoque", "/concierge/nps", "/administracao/configuracoes", "/administracao/ia", "/administracao/integracoes"];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const inicio = Date.now();
  const client = db();
  const pessoa = await quemChama(client, request);
  const entrada = await corpo<{ pergunta: string; contexto: Record<string, unknown>; tela?: string }>(request);
  const pergunta = (entrada.pergunta ?? "").trim().slice(0, 500);
  if (!pergunta) return json({ ok: false, error: "Escreva a pergunta." }, 400);
  const sistema = [
    "Você responde perguntas do time de gestão de uma clínica (Instituto Bratan) usando EXCLUSIVAMENTE os números do contexto JSON enviado. Você nunca calcula, soma, projeta ou estima; se a resposta exigir um número que não está no contexto, marque naoSei=true e diga qual número o app ainda não mede.",
    "Formato: número derivado sempre acompanhado de uma frase que o explica; cite a fonte (nome do bloco do contexto) entre colchetes.",
    "Mês parcial nunca é comparado com mês fechado. Sem nomes de pacientes na resposta.",
    `Ações só podem apontar para estas rotas: ${ROTAS.join(", ")}.`,
    "Português do Brasil, direto, sem jargão.",
  ].join("\n");
  try {
    const r = await chamarClaude<Record<string, unknown>>({ modelo: MODELO, sistema, usuario: `Pergunta: ${pergunta}\nTela: ${entrada.tela ?? "painel"}\nContexto (JSON):\n${JSON.stringify(entrada.contexto ?? {}).slice(0, 50_000)}`, schema: SCHEMA, maxTokens: 1500 });
    const acoes = ((r.dados.acoes as { rotulo: string; href: string }[]) ?? []).filter((a) => ROTAS.includes(a.href.split("?")[0]));
    const resposta = { ...r.dados, acoes };
    await registrarIaEvento(client, { funcao: "perguntar-360", modelo: MODELO, finalidade: "Responder pergunta do gestor com os números do Painel", entidade: "pergunta", entityRef: entrada.tela ?? "painel", atorId: pessoa?.pessoaId ?? null, tokensEntrada: r.tokensEntrada, tokensSaida: r.tokensSaida, custoUsd: r.custoUsd, duracaoMs: Date.now() - inicio, resumo: `${pergunta.slice(0, 120)} → ${String(r.dados.respostaCurta ?? "").slice(0, 200)}`, resultado: { pergunta, resposta }, permissao: "AUTO" });
    return json({ ok: true, resposta, custoUsd: r.custoUsd });
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: detalhe });
  }
});
