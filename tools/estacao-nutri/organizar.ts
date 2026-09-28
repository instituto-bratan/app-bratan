// ORGANIZAR A CONSULTA COM A IA (28/09/2026).
//
// Monta o pedido com o roteiro da Dra. Géssica (mesmo arquivo que o app usa),
// pede saída estruturada no formato de `esquemaOrganizacao.ts` e confere o
// motivo de parada antes de ler a resposta. Este arquivo não importa o SDK:
// recebe o cliente pronto (em testes, um cliente falso). A tradução dos erros
// do SDK fica em `ia.ts`.
import { ESQUEMA_ORGANIZACAO } from "../../src/features/nutricao/dominio/esquemaOrganizacao.ts";
import type { RespostaOrganizacao } from "../../src/features/nutricao/dominio/esquemaOrganizacao.ts";
import { ROTEIRO } from "../../src/features/nutricao/dominio/roteiro.ts";
import { ErroEstacao } from "./erros.ts";
import type { SegmentoTranscricao } from "./whisper.ts";

export type ItemRegistrado = { id: string; nome: string; prescricao: string };

export type EntradaOrganizacao = {
  pessoa: { nome: string };
  /** YYYY-MM-DD */
  data: string;
  segmentos: SegmentoTranscricao[];
  itensRegistrados: ItemRegistrado[];
  anterior: { data: string; linhas: { campo: string; texto: string }[] } | null;
};

export type ResultadoOrganizacao = {
  resposta: RespostaOrganizacao;
  modelo: string;
  uso: { entrada: number; saida: number; custoUsd: number };
  duracaoMs: number;
};

/** O pedaço do cliente do SDK que a estação usa (o cliente real e o falso dos testes). */
export type ClienteIA = {
  beta: { messages: { stream: (pedido: any) => { finalMessage: () => Promise<any> } } };
};

// ---------------------------------------------------------------- pedido

function linhasDoRoteiro(): string {
  return ROTEIRO.map((linha) => `- ${linha.id} (${linha.rotulo}): ${linha.oQueRegistrar}`).join("\n");
}

const SYSTEM = `Você ajuda a nutricionista Dra. Géssica Barbara, do Instituto Bratan, a registrar uma consulta de acompanhamento (checkpoint) a partir da transcrição da consulta.

A transcrição chega em segmentos numerados, um por linha, no formato [i] (mm:ss) texto. O número i é o índice do segmento. A transcrição é automática: pode ter erros de reconhecimento e não diz quem está falando.

## Temas do roteiro

Para cada tema do roteiro abaixo, escreva UMA linha concisa, sem o nome do tema no começo, com tudo o que foi dito sobre ele na consulta. A regra da Dra. Géssica é esta: informações concisas e, ao mesmo tempo, não pode deixar de informar nada.

Tema que não foi falado na consulta fica de fora da resposta. O app mostra "não informado" nesses casos. Cada tema aparece no máximo uma vez.

Cada tema tem o valor que vai em "campo", o rótulo entre parênteses e o que registrar:
${linhasDoRoteiro()}

O tema bio vai só no bloco "bio" (veja abaixo), não em "campos".

## Regras que valem para tudo

- Nunca invente, deduza, complete ou generalize informação. Registre só o que foi dito.
- Nunca escreva "não" para algo que não foi perguntado. Se o assunto não apareceu, deixe de fora.
- Todo item precisa citar um ou mais trechos copiados literalmente dos segmentos da transcrição, com o índice i do segmento de onde veio cada trecho (em "segmento").
- Em cada trecho, diga quem fala (em "quem"): "pessoa" para a pessoa atendida, "profissional" para a nutricionista, ou "incerto" quando não dá para saber.
- Se a transcrição estiver confusa ou ambígua num ponto, marque incerto como true e explique o motivo em motivoIncerteza. Quando não há incerteza, motivoIncerteza fica vazio.
- Escreva sempre "e", nunca "&".
- Não use emojis.
- Escreva em português do Brasil.

## Bio

Registre só os números da bioimpedância ditos em voz alta: peso em kg (pesoKg), percentual de gordura corporal em % (pgc) e nível de gordura visceral (visceral). Número que não foi dito fica null. Não calcule nem converta nada. As evidências são os trechos em que os números foram ditos.

## Suplementos e medicamentos

Para cada suplemento ou medicamento mencionado na consulta, registre como a pessoa diz que está usando (usoRelatado) e a orientação que a profissional deu sobre ele na consulta (orientacao; vazio se não houve).

Compare com a lista registrada que vem no pedido, com id e prescrição de cada item. Quando o item mencionado for um da lista, preencha itemId com o id dele; quando não for, itemId fica null.

Classifique a adesão:
- ok: o uso relatado bate com a prescrição registrada.
- divergente: o uso relatado é diferente da prescrição registrada (dose, horário, frequência ou forma de uso).
- nao_usa: a pessoa diz que não está usando ou que parou.
- nao_informado: o item foi mencionado, mas não dá para saber como está sendo usado, ou não há prescrição registrada para comparar.

NUNCA crie, sugira ou altere uma prescrição, dose ou horário. Você só registra o que a pessoa relatou e o que a profissional orientou na consulta.

## Acordos para o plano alimentar

Em acordosPlano, registre o que foi combinado para o plano alimentar, por refeição. Por exemplo: refeição "Café da manhã", acordo "trocar a manteiga por ovo". Não coloque quantidades que não foram ditas.

## Conduta

Em conduta, registre as orientações que a profissional deu na consulta. Se ela não deu orientação, conduta fica null.

## Não classificados

Em naoClassificados, registre a informação clinicamente relevante que foi dita e não cabe em nenhum tema, para que nada do que foi dito se perca.

## Checkpoint anterior

As linhas do checkpoint anterior, quando vierem no pedido, servem SOMENTE como contexto, para entender comparações como "melhorou" ou "continua igual". Nunca copie nada do checkpoint anterior e nunca registre algo que não foi dito hoje.`;

function dataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** 65.4 → "01:05"; passa de 59 minutos sem virar hora ("62:07"). */
export function tempoMmSs(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function rotuloOuCampo(campo: string): string {
  const linha = ROTEIRO.find((l) => l.id === campo);
  return linha ? linha.rotulo : campo;
}

export function montarPedido(entrada: EntradaOrganizacao): { system: string; userText: string } {
  const partes: string[] = [];
  partes.push(`Consulta de acompanhamento de ${entrada.pessoa.nome}, em ${dataBr(entrada.data)}.`);

  partes.push("");
  if (entrada.itensRegistrados.length) {
    partes.push("Suplementos e medicamentos registrados (id | nome | prescrição):");
    for (const item of entrada.itensRegistrados) partes.push(`- ${item.id} | ${item.nome} | ${item.prescricao}`);
  } else {
    partes.push("Nenhum suplemento ou medicamento registrado.");
  }

  partes.push("");
  if (entrada.anterior && entrada.anterior.linhas.length) {
    partes.push(`Checkpoint anterior, de ${dataBr(entrada.anterior.data)}. Use SOMENTE como contexto. Não copie nada daqui:`);
    for (const linha of entrada.anterior.linhas) partes.push(`- ${rotuloOuCampo(linha.campo)}: ${linha.texto}`);
  } else {
    partes.push("Sem checkpoint anterior.");
  }

  partes.push("");
  partes.push("Transcrição da consulta de hoje:");
  for (const s of entrada.segmentos) partes.push(`[${s.i}] (${tempoMmSs(s.inicio)}) ${s.texto}`);

  return { system: SYSTEM, userText: partes.join("\n") };
}

// ---------------------------------------------------------------- validação da entrada

function invalido(motivo: string): never {
  throw new ErroEstacao(`Pedido inválido: ${motivo}`, 400);
}

const texto = (v: unknown): v is string => typeof v === "string";
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validarEntradaOrganizacao(valor: unknown): EntradaOrganizacao {
  if (!valor || typeof valor !== "object") invalido("o corpo precisa ser um objeto JSON.");
  const v = valor as Record<string, any>;
  if (!v.pessoa || !texto(v.pessoa.nome) || !v.pessoa.nome.trim()) invalido("falta o nome da pessoa (pessoa.nome).");
  if (!texto(v.data) || !/^\d{4}-\d{2}-\d{2}$/.test(v.data)) invalido("a data precisa estar no formato AAAA-MM-DD.");
  if (!Array.isArray(v.segmentos) || v.segmentos.length === 0) invalido("a transcrição está vazia.");
  for (const s of v.segmentos) {
    if (!s || !numero(s.i) || !numero(s.inicio) || !numero(s.fim) || !texto(s.texto)) invalido("todo segmento precisa de i, inicio, fim e texto.");
  }
  const itens = v.itensRegistrados ?? [];
  if (!Array.isArray(itens) || itens.some((it: any) => !it || !texto(it.id) || !texto(it.nome) || !texto(it.prescricao))) {
    invalido("itensRegistrados precisa ser uma lista de { id, nome, prescricao }.");
  }
  let anterior: EntradaOrganizacao["anterior"] = null;
  if (v.anterior !== undefined && v.anterior !== null) {
    const a = v.anterior;
    if (!texto(a.data) || !Array.isArray(a.linhas) || a.linhas.some((l: any) => !l || !texto(l.campo) || !texto(l.texto))) {
      invalido("anterior precisa ser null ou { data, linhas: [{ campo, texto }] }.");
    }
    anterior = { data: a.data, linhas: a.linhas.map((l: any) => ({ campo: l.campo, texto: l.texto })) };
  }
  return {
    pessoa: { nome: v.pessoa.nome.trim() },
    data: v.data,
    segmentos: v.segmentos.map((s: any) => ({ i: s.i, inicio: s.inicio, fim: s.fim, texto: s.texto })),
    itensRegistrados: itens.map((it: any) => ({ id: it.id, nome: it.nome, prescricao: it.prescricao })),
    anterior,
  };
}

// ---------------------------------------------------------------- resposta

/**
 * Confere o motivo de parada e lê o JSON. Depois de uma troca de modelo no meio
 * da resposta (bloco "fallback"), vale o texto que veio depois da última troca.
 */
export function interpretarResposta(msg: any): RespostaOrganizacao {
  if (msg?.stop_reason === "refusal") throw new ErroEstacao("A IA recusou esta tarefa.", 422);
  if (msg?.stop_reason === "max_tokens") throw new ErroEstacao("A resposta da IA veio incompleta.", 502);

  const blocos: any[] = Array.isArray(msg?.content) ? msg.content : [];
  let inicio = 0;
  blocos.forEach((b, posicao) => {
    if (b?.type === "fallback") inicio = posicao + 1;
  });
  const tentativas = [
    blocos.slice(inicio).filter((b) => b?.type === "text").map((b) => b.text).join(""),
    blocos.filter((b) => b?.type === "text").map((b) => b.text).join(""),
  ];
  for (const t of tentativas) {
    if (!t.trim()) continue;
    try {
      const json = JSON.parse(t);
      if (json && typeof json === "object" && Array.isArray(json.campos)) return json as RespostaOrganizacao;
    } catch {
      // tenta a próxima leitura
    }
  }
  throw new ErroEstacao("A resposta da IA não veio no formato esperado.", 502);
}

const PRECO_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  "claude-opus-5": { entrada: 5, saida: 25 },
  "claude-opus-4-8": { entrada: 5, saida: 25 },
};

/** Estimativa em dólar (tabela da Anthropic; modelo desconhecido usa o preço do claude-opus-5). */
export function custoEstimadoUsd(modelo: string, tokensEntrada: number, tokensSaida: number): number {
  const preco = PRECO_POR_MILHAO[modelo] ?? PRECO_POR_MILHAO["claude-opus-5"];
  const bruto = (tokensEntrada * preco.entrada + tokensSaida * preco.saida) / 1_000_000;
  return Math.round(bruto * 10_000) / 10_000;
}

export async function organizarConsulta(
  entrada: EntradaOrganizacao,
  client: ClienteIA,
  config: { modeloIA: string },
): Promise<ResultadoOrganizacao> {
  const { system, userText } = montarPedido(entrada);
  const inicio = Date.now();
  const stream = client.beta.messages.stream({
    model: config.modeloIA,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: ESQUEMA_ORGANIZACAO } },
    system,
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
  });
  const msg = await stream.finalMessage();
  const resposta = interpretarResposta(msg);
  const modelo = typeof msg?.model === "string" && msg.model ? msg.model : config.modeloIA;
  const tokensEntrada = Number(msg?.usage?.input_tokens ?? 0);
  const tokensSaida = Number(msg?.usage?.output_tokens ?? 0);
  return {
    resposta,
    modelo,
    uso: { entrada: tokensEntrada, saida: tokensSaida, custoUsd: custoEstimadoUsd(modelo, tokensEntrada, tokensSaida) },
    duracaoMs: Date.now() - inicio,
  };
}
