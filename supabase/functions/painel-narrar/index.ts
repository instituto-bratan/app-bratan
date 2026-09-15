// painel-narrar (15/09/2026, proposta 1.5): escreve o resumo de fechamento do
// Painel do Mês a partir dos AGREGADOS que a tela já calculou (KPIs, pontos da
// reunião, ponte dos 3 lucros, momento do mês). A IA não calcula nada e cita a
// tabela de origem de cada número. Regra da casa: mês parcial nunca é comparado
// com mês fechado — só com o mesmo dia do mês anterior ou com o ritmo.
import { corpo, db, json } from "../_shared/integracoes.ts";
import { chamarClaude, quemChama, registrarIaEvento } from "../_shared/claude.ts";

const MODELO = "claude-opus-5";
const SCHEMA = {
  type: "object",
  properties: {
    titulo: { type: "string", description: "Título curto do resumo, em português (ex.: 'Setembro até o dia 15: ritmo abaixo da meta, custo sob controle')." },
    resumo: { type: "string", description: "Três frases que um gestor lê em voz alta na reunião. Cada número entre colchetes com a fonte, ex.: R$ 246.877 [Faturamento · KPIs]." },
    oQueAconteceu: { type: "array", items: { type: "string" }, description: "3 a 5 frases factuais, cada uma com o número e a fonte entre colchetes." },
    porQue: { type: "array", items: { type: "string" }, description: "2 a 4 causas prováveis, marcadas como hipótese quando não estiverem nos dados." },
    oQueFazer: { type: "array", items: { type: "string" }, description: "3 a 5 ações concretas, com responsável sugerido entre parênteses (CEO, Dr. Daniel, financeiro, recepção)." },
    numerosCitados: { type: "array", items: { type: "object", properties: { valor: { type: "string" }, fonte: { type: "string" } }, required: ["valor", "fonte"], additionalProperties: false }, description: "Todos os números usados, com a tabela de origem." },
    alerta: { type: "string", description: "Se algum dado parecer incompleto ou inconsistente, diga aqui; senão string vazia." },
  },
  required: ["titulo", "resumo", "oQueAconteceu", "porQue", "oQueFazer", "numerosCitados", "alerta"],
  additionalProperties: false,
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const inicio = Date.now();
  const client = db();
  const pessoa = await quemChama(client, request);
  const entrada = await corpo<{ monthKey: string; agregados: Record<string, unknown> }>(request);
  if (!entrada.monthKey || !entrada.agregados) return json({ ok: false, error: "Informe monthKey e agregados." }, 400);
  const texto = JSON.stringify(entrada.agregados).slice(0, 60_000);
  const sistema = [
    "Você escreve o resumo da reunião de líderes de uma clínica médica em São Paulo (Instituto Bratan), para o gestor financeiro apresentar.",
    "Use SOMENTE os números que estão nos dados fornecidos; nunca calcule, estime ou invente. Cada número citado vem com a fonte entre colchetes, com o nome do bloco/tabela de onde saiu.",
    "Regra inegociável da casa: mês em andamento (parcial) NUNCA é comparado com um mês fechado; compare só com o mesmo dia do mês anterior, com o ritmo necessário ou com a meta. Se os dados não trouxerem essa base, diga que não há comparação válida.",
    "Português do Brasil, frases curtas, sem jargão financeiro sem explicação (a régua é a SUPER-SUPERMETA; envelopes = Lucro Inteligente). Sem nomes de pacientes.",
    "Quando não houver dado para uma seção, escreva menos itens em vez de preencher com generalidades.",
  ].join("\n");
  try {
    const r = await chamarClaude<Record<string, unknown>>({ modelo: MODELO, sistema, usuario: `Mês: ${entrada.monthKey}. Dados do Painel (JSON):\n${texto}`, schema: SCHEMA, maxTokens: 3000 });
    await registrarIaEvento(client, { funcao: "painel-narrar", modelo: MODELO, finalidade: "Escrever o resumo do Painel do Mês a partir dos agregados", entidade: "painel_mes", entityRef: entrada.monthKey, atorId: pessoa?.pessoaId ?? null, tokensEntrada: r.tokensEntrada, tokensSaida: r.tokensSaida, custoUsd: r.custoUsd, duracaoMs: Date.now() - inicio, resumo: String(r.dados.titulo ?? "").slice(0, 200), resultado: r.dados, permissao: "PROPOSTA" });
    return json({ ok: true, narrativa: r.dados, custoUsd: r.custoUsd });
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    await registrarIaEvento(client, { funcao: "painel-narrar", modelo: MODELO, finalidade: "Escrever o resumo do Painel do Mês", entidade: "painel_mes", entityRef: entrada.monthKey, atorId: pessoa?.pessoaId ?? null, tokensEntrada: 0, tokensSaida: 0, custoUsd: 0, duracaoMs: Date.now() - inicio, resumo: `ERRO: ${detalhe}`, resultado: { erro: detalhe }, permissao: "ERRO" });
    return json({ ok: false, error: detalhe });
  }
});
