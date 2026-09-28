// ESTAÇÃO LOCAL: ORGANIZAR A CONSULTA COM A IA (28/09/2026).
//
// A estação monta o pedido com o roteiro da Dra. Géssica, pede saída
// estruturada (JSON Schema) e confere o motivo de parada antes de ler a
// resposta. Nenhum teste chama a API de verdade: o cliente é falso.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const organizar = await import("../tools/estacao-nutri/organizar.ts");
const { ROTEIRO } = await import("../src/features/nutricao/dominio/roteiro.ts");
const { ESQUEMA_ORGANIZACAO } = await import("../src/features/nutricao/dominio/esquemaOrganizacao.ts");

const SDK_INSTALADO = fs.existsSync(new URL("../tools/estacao-nutri/node_modules/@anthropic-ai/sdk/package.json", import.meta.url));

function entradaExemplo(extra = {}) {
  return {
    pessoa: { nome: "Marina Teixeira" },
    data: "2026-09-28",
    segmentos: [
      { i: 0, inicio: 0, fim: 4.2, texto: "Bom dia, como foi a semana?" },
      { i: 1, inicio: 65.4, fim: 70, texto: "Tô treinando três vezes por semana, musculação." },
      { i: 2, inicio: 3727.9, fim: 3731, texto: "A creatina eu tomo só quando lembro." },
    ],
    itensRegistrados: [{ id: "sup-1", nome: "Creatina", prescricao: "5 g por dia, após o treino" }],
    anterior: { data: "2026-08-28", linhas: [{ campo: "treino", texto: "Musculação 2x/sem" }, { campo: "sono", texto: "6 h por noite" }] },
    ...extra,
  };
}

const RESPOSTA_VALIDA = {
  campos: [
    {
      campo: "treino",
      texto: "Musculação 3x/sem",
      evidencias: [{ segmento: 1, trecho: "Tô treinando três vezes por semana, musculação.", quem: "pessoa" }],
      incerto: false,
      motivoIncerteza: "",
    },
  ],
  bio: { pesoKg: null, pgc: null, visceral: null, evidencias: [] },
  suplementos: [],
  conduta: null,
  acordosPlano: [],
  naoClassificados: [],
};

function mensagem(extra = {}) {
  return {
    id: "msg_teste",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(RESPOSTA_VALIDA) }],
    usage: { input_tokens: 10_000, output_tokens: 2_000 },
    ...extra,
  };
}

// ---------------------------------------------------------------- montarPedido

test("o pedido traz todos os temas do roteiro, com o que registrar em cada um", () => {
  const { system } = organizar.montarPedido(entradaExemplo());
  assert.equal(ROTEIRO.length, 14);
  for (const linha of ROTEIRO) {
    assert.ok(system.includes(linha.rotulo), `falta o tema ${linha.rotulo}`);
    assert.ok(system.includes(linha.oQueRegistrar), `falta o que registrar em ${linha.rotulo}`);
    assert.ok(system.includes(linha.id), `falta o campo ${linha.id}`);
  }
  assert.match(system, /Dra\. Géssica Barbara/);
  assert.match(system, /Instituto Bratan/);
  assert.match(system, /informações concisas e, ao mesmo tempo, não pode deixar de informar nada/);
});

test("regras centrais: não inventar, não prescrever, 'e' em vez de '&', anterior só como contexto", () => {
  const { system } = organizar.montarPedido(entradaExemplo());
  assert.match(system, /Nunca invente, deduza, complete ou generalize/);
  assert.match(system, /NUNCA crie, sugira ou altere uma prescrição, dose ou horário/);
  assert.match(system, /Escreva sempre "e", nunca "&"/);
  assert.match(system, /checkpoint anterior[^.]*SOMENTE como contexto/i);
  assert.match(system, /Nunca copie nada do checkpoint anterior/);
  assert.match(system, /nunca registre algo que não foi dito hoje/i);
  assert.match(system, /Nunca escreva "não" para algo que não foi perguntado/);
  assert.match(system, /não use emojis/i);
  assert.match(system, /português do Brasil/);
  assert.match(system, /motivoIncerteza/);
  for (const adesao of ["ok", "divergente", "nao_usa", "nao_informado"]) assert.ok(system.includes(adesao));
  assert.equal(system.split("&").length - 1, 1, "o & só aparece na própria regra");
});

test("texto do usuário: cabeçalho, lista registrada, anterior como contexto e transcrição [i] (mm:ss)", () => {
  const { userText } = organizar.montarPedido(entradaExemplo());
  assert.match(userText, /Marina Teixeira/);
  assert.match(userText, /28\/09\/2026/);
  assert.match(userText, /sup-1 \| Creatina \| 5 g por dia, após o treino/);
  assert.match(userText, /SOMENTE como contexto/);
  assert.match(userText, /Treino: Musculação 2x\/sem/);
  assert.match(userText, /Sono: 6 h por noite/);
  assert.ok(userText.includes("[0] (00:00) Bom dia, como foi a semana?"));
  assert.ok(userText.includes("[1] (01:05) Tô treinando três vezes por semana, musculação."));
  assert.ok(userText.includes("[2] (62:07) A creatina eu tomo só quando lembro."));
  // a transcrição vem depois do contexto
  assert.ok(userText.indexOf("[0] (00:00)") > userText.indexOf("Musculação 2x/sem"));
});

test("sem checkpoint anterior e sem itens registrados", () => {
  const { userText } = organizar.montarPedido(entradaExemplo({ anterior: null, itensRegistrados: [] }));
  assert.match(userText, /Sem checkpoint anterior\./);
  assert.match(userText, /Nenhum suplemento ou medicamento registrado\./);
});

test("formato do tempo mm:ss", () => {
  assert.equal(organizar.tempoMmSs(0), "00:00");
  assert.equal(organizar.tempoMmSs(59.99), "00:59");
  assert.equal(organizar.tempoMmSs(65.4), "01:05");
  assert.equal(organizar.tempoMmSs(3727.9), "62:07");
});

// ---------------------------------------------------------------- interpretarResposta

test("recusa da IA vira erro claro", () => {
  assert.throws(() => organizar.interpretarResposta(mensagem({ stop_reason: "refusal", content: [] })), /A IA recusou esta tarefa\./);
});

test("resposta cortada por max_tokens vira erro claro", () => {
  assert.throws(
    () => organizar.interpretarResposta(mensagem({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"campos": [' }] })),
    /A resposta da IA veio incompleta\./,
  );
});

test("JSON válido é lido com JSON.parse, ignorando blocos que não são texto", () => {
  const msg = mensagem({ content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text: JSON.stringify(RESPOSTA_VALIDA) }] });
  assert.deepEqual(organizar.interpretarResposta(msg), RESPOSTA_VALIDA);
});

test("depois de uma troca de modelo (fallback), vale o texto que veio depois da troca", () => {
  const msg = mensagem({
    content: [
      { type: "text", text: '{"campos": [{"cam' },
      { type: "fallback", from: { model: "claude-opus-5" }, to: { model: "claude-opus-4-8" } },
      { type: "text", text: JSON.stringify(RESPOSTA_VALIDA) },
    ],
  });
  assert.deepEqual(organizar.interpretarResposta(msg), RESPOSTA_VALIDA);
});

test("texto que não é JSON vira erro, sem tentar adivinhar", () => {
  assert.throws(() => organizar.interpretarResposta(mensagem({ content: [{ type: "text", text: "Aqui está: campos..." }] })), /formato esperado/);
  assert.throws(() => organizar.interpretarResposta(mensagem({ content: [] })), /formato esperado/);
});

// ---------------------------------------------------------------- validarEntrada

test("entrada inválida é recusada com mensagem em português", () => {
  assert.throws(() => organizar.validarEntradaOrganizacao(null), /Pedido inválido/);
  assert.throws(() => organizar.validarEntradaOrganizacao({ ...entradaExemplo(), pessoa: {} }), /nome/);
  assert.throws(() => organizar.validarEntradaOrganizacao({ ...entradaExemplo(), data: "28/09/2026" }), /data/);
  assert.throws(() => organizar.validarEntradaOrganizacao({ ...entradaExemplo(), segmentos: [] }), /transcrição/);
  assert.throws(() => organizar.validarEntradaOrganizacao({ ...entradaExemplo(), segmentos: [{ i: "0", texto: 1 }] }), /segmento/);
  assert.throws(() => organizar.validarEntradaOrganizacao({ ...entradaExemplo(), itensRegistrados: [{ id: 1 }] }), /itensRegistrados/);
  assert.throws(() => organizar.validarEntradaOrganizacao({ ...entradaExemplo(), anterior: { data: "2026-08-28" } }), /anterior/);
  const ok = organizar.validarEntradaOrganizacao(entradaExemplo());
  assert.equal(ok.pessoa.nome, "Marina Teixeira");
  assert.equal(organizar.validarEntradaOrganizacao({ ...entradaExemplo(), anterior: undefined }).anterior, null);
});

// ---------------------------------------------------------------- organizarConsulta

test("organizarConsulta: pedido com streaming, fallback padrão, pensamento adaptativo e saída estruturada", async () => {
  const pedidos = [];
  const cliente = {
    beta: {
      messages: {
        stream(pedido) {
          pedidos.push(pedido);
          return { finalMessage: async () => mensagem() };
        },
      },
    },
  };
  const r = await organizar.organizarConsulta(entradaExemplo(), cliente, { modeloIA: "claude-opus-5" });

  assert.equal(pedidos.length, 1);
  const p = pedidos[0];
  assert.equal(p.model, "claude-opus-5");
  assert.equal(p.max_tokens, 32000);
  assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(p.fallbacks, "default");
  assert.deepEqual(p.thinking, { type: "adaptive" });
  assert.equal(p.output_config.effort, "high");
  assert.equal(p.output_config.format.type, "json_schema");
  assert.deepEqual(p.output_config.format.schema, ESQUEMA_ORGANIZACAO);
  const { system, userText } = organizar.montarPedido(entradaExemplo());
  assert.equal(p.system, system);
  assert.deepEqual(p.messages, [{ role: "user", content: [{ type: "text", text: userText }] }]);

  assert.deepEqual(r.resposta, RESPOSTA_VALIDA);
  assert.equal(r.modelo, "claude-opus-5");
  assert.deepEqual(r.uso, { entrada: 10_000, saida: 2_000, custoUsd: 0.1 });
  assert.equal(typeof r.duracaoMs, "number");
});

test("organizarConsulta: usa o modelo configurado e repassa a recusa", async () => {
  const pedidos = [];
  const cliente = {
    beta: {
      messages: {
        stream(pedido) {
          pedidos.push(pedido);
          return { finalMessage: async () => mensagem({ stop_reason: "refusal", content: [] }) };
        },
      },
    },
  };
  await assert.rejects(organizar.organizarConsulta(entradaExemplo(), cliente, { modeloIA: "claude-opus-4-8" }), /A IA recusou esta tarefa\./);
  assert.equal(pedidos[0].model, "claude-opus-4-8");
});

test("custo estimado: US$ 5 por milhão de entrada e US$ 25 por milhão de saída", () => {
  assert.equal(organizar.custoEstimadoUsd("claude-opus-5", 1_000_000, 0), 5);
  assert.equal(organizar.custoEstimadoUsd("claude-opus-5", 0, 1_000_000), 25);
  assert.equal(organizar.custoEstimadoUsd("claude-opus-5", 12_000, 6_000), 0.21);
  assert.equal(organizar.custoEstimadoUsd("claude-opus-5", 1_234, 567), 0.0203);
});

// ---------------------------------------------------------------- erros do SDK

test("erros do SDK viram mensagens em português", { skip: SDK_INSTALADO ? false : "rode npm install em tools/estacao-nutri" }, async () => {
  const { Anthropic, traduzirErroIA } = await import("../tools/estacao-nutri/ia.ts");
  const cab = new Headers();

  const conexao = traduzirErroIA(new Anthropic.APIConnectionError({ message: "fetch failed" }));
  assert.equal(conexao.message, "Sem conexão com a IA.");
  assert.equal(conexao.status, 502);

  const limite = traduzirErroIA(new Anthropic.RateLimitError(429, undefined, "rate", cab));
  assert.match(limite.message, /muitos pedidos/);
  assert.equal(limite.status, 429);

  const chave = traduzirErroIA(new Anthropic.AuthenticationError(401, undefined, "auth", cab));
  assert.match(chave.message, /chave da IA foi recusada/);

  const fora = traduzirErroIA(new Anthropic.InternalServerError(529, undefined, "overloaded", cab));
  assert.match(fora.message, /indisponível/);

  const tempo = traduzirErroIA(new Anthropic.APIConnectionTimeoutError({ message: "timeout" }));
  assert.match(tempo.message, /demorou demais/);

  const desconhecido = traduzirErroIA(new Error("qualquer"));
  assert.equal(desconhecido, null);
});
