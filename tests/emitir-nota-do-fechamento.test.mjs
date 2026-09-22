// O BOTÃO DE EMITIR NO FECHAMENTO (21/09/2026).
//
// Pedido do Lucas: *"agora faz o botão de emitir na tela do fechamento"*.
//
// O que estes testes protegem é o que dá errado em silêncio:
//  · pedir a nota antes da comanda existir no banco (a Focus procura pelo
//    client_ref e devolve "comanda não encontrada" — parece falha da nota, é
//    só pressa);
//  · mandar uma frase genérica em vez da discriminação da casa;
//  · uma nota recusada derrubar as outras, ou sumir num "deu erro".
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/crm/emitirNotaDoFechamento.ts");

const NOTA_CONSULTA = { natureza: "CONSULTA", valor: 1000, codigoServico: "04197", discriminacao: "CONSULTA MÉDICA REALIZADA NO DIA 01/09/2026", impostoEstimado: 133.3 };
const NOTA_BIO = { natureza: "BIOIMPEDANCIA", valor: 500, codigoServico: "04030", discriminacao: "EXAME DE BIOIMPEDÂNCIA", impostoEstimado: 39.65 };
const NOTA_TRAT = { natureza: "TRATAMENTO", valor: 5119, codigoServico: "04030", discriminacao: "REALIZAÇÃO DE PROCEDIMENTOS MÉDICOS", impostoEstimado: 405.94 };

/** Uma Focus de mentira que anota o que recebeu e responde o combinado. */
function focusFalsa(respostas) {
  const chamadas = [];
  let vez = 0;
  return {
    chamadas,
    invocar: async (slug, body) => {
      chamadas.push({ slug, body });
      const resposta = respostas[Math.min(vez, respostas.length - 1)];
      vez += 1;
      if (resposta instanceof Error) throw resposta;
      return resposta;
    },
  };
}

function pedido(extra = {}) {
  const focus = extra.focus ?? focusFalsa([{ ok: true, ref: "r1", status: "processando_autorizacao" }]);
  return {
    focus,
    entrada: {
      saleRef: "fsale-1",
      escolha: "REPARTIDA",
      notas: [NOTA_CONSULTA],
      pacienteNome: "Maria",
      cpf: "",
      solicitadoPor: "pessoa-1",
      comandaGravada: Promise.resolve(true),
      invocar: focus.invocar,
      ...extra.entrada,
    },
  };
}

test("a unificada é registrada como UNIFICADA; a repartida mantém a natureza", () => {
  assert.equal(mod.tipoDaNota("UNIFICADA", "TRATAMENTO"), "UNIFICADA", "senão a escolha do paciente some do registro");
  assert.equal(mod.tipoDaNota("REPARTIDA", "TRATAMENTO"), "TRATAMENTO");
  assert.equal(mod.tipoDaNota("REPARTIDA", "BIOIMPEDANCIA"), "BIOIMPEDANCIA");
  assert.equal(mod.tipoDaNota("REPARTIDA", "CONSULTA"), "CONSULTA");
});

test("sem notas no plano, não chama a prefeitura", async () => {
  const { focus, entrada } = pedido({ entrada: { notas: [] } });
  const resultado = await mod.emitirNotasDoFechamento(entrada);
  assert.equal(focus.chamadas.length, 0);
  assert.equal(resultado.tudoCerto, true);
  assert.equal(resultado.recado, "");
});

test("se a comanda não gravou, NÃO pede a nota — e diz o porquê", async () => {
  const { focus, entrada } = pedido({ entrada: { comandaGravada: Promise.resolve(false) } });
  const resultado = await mod.emitirNotasDoFechamento(entrada);
  assert.equal(focus.chamadas.length, 0, "pedir agora daria 'comanda não encontrada'");
  assert.equal(resultado.tudoCerto, false);
  assert.match(resultado.recado, /não terminou de gravar/i);
  assert.match(resultado.recado, /Impostos & NF/);
});

test("a promessa da comanda falhando é tratada como não gravada", async () => {
  const { focus, entrada } = pedido({ entrada: { comandaGravada: Promise.reject(new Error("rede")) } });
  const resultado = await mod.emitirNotasDoFechamento(entrada);
  assert.equal(focus.chamadas.length, 0);
  assert.equal(resultado.tudoCerto, false);
});

test("manda uma chamada por nota, com a discriminação da tela", async () => {
  const focus = focusFalsa([{ ok: true, ref: "a", status: "ok" }, { ok: true, ref: "b", status: "ok" }, { ok: true, ref: "c", status: "ok" }]);
  const { entrada } = pedido({ focus, entrada: { focus, invocar: focus.invocar, notas: [NOTA_CONSULTA, NOTA_BIO, NOTA_TRAT] } });
  const resultado = await mod.emitirNotasDoFechamento({ ...entrada, invocar: focus.invocar });

  assert.equal(focus.chamadas.length, 3);
  assert.deepEqual(
    focus.chamadas.map((chamada) => chamada.body.tipo),
    ["CONSULTA", "BIOIMPEDANCIA", "TRATAMENTO"],
    "a ordem acompanha o atendimento",
  );
  assert.equal(focus.chamadas[0].body.discriminacao, NOTA_CONSULTA.discriminacao, "o texto da casa tem que chegar na prefeitura");
  assert.equal(focus.chamadas[0].body.valor, 1000);
  assert.equal(focus.chamadas[0].body.saleRef, "fsale-1");
  assert.equal(focus.chamadas[0].slug, "focus-nfse");
  assert.equal(resultado.tudoCerto, true);
  assert.equal(resultado.notas.length, 3);
});

test("o CPF só vai quando existe — e o nome vai sempre", async () => {
  const focus = focusFalsa([{ ok: true, ref: "a" }]);
  const { entrada } = pedido({ focus });
  await mod.emitirNotasDoFechamento({ ...entrada, invocar: focus.invocar, cpf: "" });
  const semCpf = focus.chamadas[0].body.tomador;
  assert.equal(semCpf.nome, "Maria");
  assert.equal("cpf" in semCpf, false, "sem CPF na tela, o servidor pega o da ficha");

  const focusComCpf = focusFalsa([{ ok: true, ref: "a" }]);
  await mod.emitirNotasDoFechamento({ ...entrada, invocar: focusComCpf.invocar, cpf: "12345678901" });
  const comCpf = focusComCpf.chamadas[0].body.tomador;
  assert.equal(comCpf.nome, "Maria");
  assert.equal(comCpf.cpf, "12345678901");
});

test("uma nota recusada não derruba as outras, e o recado diz qual faltou", async () => {
  const focus = focusFalsa([
    { ok: true, ref: "a", status: "processando_autorizacao" },
    { ok: false, status: "erro_autorizacao", error: "Código NBS informado inválido" },
  ]);
  const { entrada } = pedido({ focus, entrada: { notas: [NOTA_CONSULTA, NOTA_TRAT] } });
  const resultado = await mod.emitirNotasDoFechamento({ ...entrada, invocar: focus.invocar });

  assert.equal(focus.chamadas.length, 2, "a segunda tem que ser tentada mesmo assim");
  assert.equal(resultado.notas[0].aceita, true);
  assert.equal(resultado.notas[1].aceita, false);
  assert.equal(resultado.tudoCerto, false);
  assert.match(resultado.recado, /consulta/i, "a que saiu");
  assert.match(resultado.recado, /tratamento: Código NBS informado inválido/, "a que não saiu, com o motivo da prefeitura");
});

test("rede caindo vira resultado, não exceção", async () => {
  const focus = focusFalsa([new Error("failed to fetch")]);
  const { entrada } = pedido({ focus });
  const resultado = await mod.emitirNotasDoFechamento({ ...entrada, invocar: focus.invocar });
  assert.equal(resultado.tudoCerto, false);
  assert.equal(resultado.notas[0].status, "ERRO");
  assert.match(resultado.recado, /failed to fetch/);
});

test("nota que já existia não é contada como nova nem como falha", async () => {
  const focus = focusFalsa([{ ok: true, ref: "r", status: "AUTORIZADO", jaEmitida: true }]);
  const { entrada } = pedido({ focus });
  const resultado = await mod.emitirNotasDoFechamento({ ...entrada, invocar: focus.invocar });
  assert.equal(resultado.tudoCerto, true, "a trava do servidor protegeu de nota em dobro — isso não é erro");
  assert.match(resultado.recado, /já existia/i);
  assert.doesNotMatch(resultado.recado, /pedida à prefeitura/i);
});

test("o recado da unificada fala em uma nota só", async () => {
  const focus = focusFalsa([{ ok: true, ref: "r" }]);
  const { entrada } = pedido({ focus, entrada: { escolha: "UNIFICADA", notas: [NOTA_TRAT] } });
  const resultado = await mod.emitirNotasDoFechamento({ ...entrada, invocar: focus.invocar });
  assert.equal(focus.chamadas[0].body.tipo, "UNIFICADA");
  assert.match(resultado.recado, /Nota de unificada pedida/i);
  assert.match(resultado.recado, /consulte em Impostos & NF/i);
});

test("o e-mail do paciente vai no tomador quando existe — e o recado diz que a nota foi por e-mail (22/09/2026)", async () => {
  const focus = focusFalsa([{ ok: true, ref: "r1", status: "AUTORIZADO", numero: "6210", emailEnviado: true }]);
  const { entrada } = pedido({ focus, entrada: { email: " maria@exemplo.com " } });
  const r = await mod.emitirNotasDoFechamento(entrada);
  assert.equal(focus.chamadas[0].body.tomador.email, "maria@exemplo.com", "vai sem espaços");
  assert.equal(focus.chamadas[0].body.tomador.cpf, undefined, "sem CPF na tela, sem CPF no pedido");
  assert.equal(r.notas[0].numero, "6210");
  assert.equal(r.notas[0].emailEnviado, true);
  assert.match(r.recado, /autorizada, nº 6210/);
  assert.match(r.recado, /Enviada por e-mail ao paciente/);
  assert.doesNotMatch(r.recado, /consulte em Impostos/, "com número não manda consultar");
});

test("sem e-mail, o tomador vai só com o nome e o recado continua o de antes", async () => {
  const focus = focusFalsa([{ ok: true, ref: "r1", status: "processando_autorizacao" }]);
  const { entrada } = pedido({ focus });
  const r = await mod.emitirNotasDoFechamento(entrada);
  assert.equal(focus.chamadas[0].body.tomador.email, undefined);
  assert.match(r.recado, /pedida à prefeitura/);
  assert.match(r.recado, /O número sai em alguns segundos/);
});
