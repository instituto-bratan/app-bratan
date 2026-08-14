// PROCESSO À PROVA DE ERRO (10/08/2026) — os três buracos que causaram todos os
// erros da semana: comprovante invisível, fechamento sem contagem real, e o
// extrato do banco fora do app.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-10", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };

function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp,
    TextEncoder, TextDecoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, Blob, URL, Response, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}

const fin = loadTsModule("src/features/financeiro/financeiroData.ts");
const ex = loadTsModule("src/features/financeiro/extratoBanco.ts");

function venda(id, dia, pagamentos, paciente = "P" + id) {
  return {
    id, saleDate: dia, patientName: paciente, crmContactRef: "", notes: "", createdAt: "",
    items: [{ id: `${id}-i`, itemType: "TRATAMENTO", amount: pagamentos.reduce((s, p) => s + p.amount, 0), description: "" }],
    payments: pagamentos.map((p, i) => ({ id: `${id}-p${i}`, installments: 1, ...p })),
  };
}
function conta(id, dia, valor, descricao, pago = dia) {
  return { id, description: descricao, categoryRef: "cat-x", amount: valor, dueDate: dia, paidAt: pago, method: "PIX", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "", recorrencia: null };
}

// ---------------------------------------------------------- 1. COMPROVANTE
test("comprovante PENDENTE é o que gera aviso; aguardando e não-se-aplica não", () => {
  const vendas = [
    venda("a", "2026-08-05", [{ method: "PIX", amount: 1000 }]),                                        // sem status = PENDENTE
    venda("b", "2026-08-05", [{ method: "PIX", amount: 2000, comprovanteStatus: "ANEXADO" }]),
    venda("c", "2026-08-05", [{ method: "PIX", amount: 3000, comprovanteStatus: "AGUARDANDO" }]),
    venda("d", "2026-08-05", [{ method: "DINHEIRO", amount: 400, comprovanteStatus: "NAO_SE_APLICA" }]),
  ];
  const pendentes = fin.pagamentosSemComprovante(vendas);
  assert.equal(pendentes.length, 1, "só o que ninguém decidiu ainda");
  assert.equal(pendentes[0].sale.id, "a");
  assert.equal(fin.comprovanteStatusLabels.AGUARDANDO, "Aguardando o paciente");
});

test("comprovante: o aviso respeita o período pedido", () => {
  const vendas = [venda("a", "2026-07-30", [{ method: "PIX", amount: 100 }]), venda("b", "2026-08-05", [{ method: "PIX", amount: 200 }])];
  assert.equal(fin.pagamentosSemComprovante(vendas, "2026-08-01", "2026-08-31").length, 1);
  assert.equal(fin.pagamentosSemComprovante(vendas).length, 2);
});

// ------------------------------------------------- 2. FECHAMENTO COM CONTAGEM
test("fechamento: dia redondo bate e não pede justificativa", () => {
  const vendas = [venda("a", "2026-08-05", [{ method: "DINHEIRO", amount: 500 }, { method: "PIX", amount: 1000 }]),
                  venda("b", "2026-08-05", [{ method: "CARTAO_CREDITO", amount: 2000 }])];
  const c = fin.buildConferenciaDoDia(vendas, "2026-08-05", { dinheiro: 500, cartao: 2000, pix: 1000 }, 160);
  assert.equal(c.bate, true);
  assert.equal(c.diferencaTotal, 0);
  assert.equal(c.precisaJustificar, false);
  assert.equal(c.taxaPercentual, 8, "160 de taxa sobre 2.000 de cartão");
  assert.equal(c.taxaSuspeita, false);
});

test("fechamento: dinheiro sobrando aponta venda em espécie sem comanda (o erro de julho)", () => {
  const vendas = [venda("a", "2026-08-05", [{ method: "PIX", amount: 1000 }])];
  const c = fin.buildConferenciaDoDia(vendas, "2026-08-05", { dinheiro: 3000, cartao: null, pix: 1000 }, 0);
  const linha = c.linhas.find((l) => l.rotulo.includes("Dinheiro"));
  assert.equal(linha.esperado, 0, "as comandas não têm dinheiro");
  assert.equal(linha.diferenca, 3000);
  assert.equal(linha.bate, false);
  assert.match(linha.pista, /venda em espécie sem comanda/);
  assert.equal(c.precisaJustificar, true, "o dia só fecha com explicação");
});

test("fechamento: PIX faltando aponta forma de pagamento errada (o caso da Larissa)", () => {
  const vendas = [venda("a", "2026-08-04", [{ method: "PIX", amount: 950 }])];
  const c = fin.buildConferenciaDoDia(vendas, "2026-08-04", { dinheiro: 0, cartao: 0, pix: 0 }, 0);
  const linha = c.linhas.find((l) => l.rotulo.includes("PIX"));
  assert.equal(linha.diferenca, -950);
  assert.match(linha.pista, /confira a forma de pagamento/);
});

test("fechamento: taxa de cartão acima de 9% acende bandeira (28/07 marcou 24%)", () => {
  const vendas = [venda("a", "2026-07-28", [{ method: "CARTAO_CREDITO", amount: 10297 }])];
  const ruim = fin.buildConferenciaDoDia(vendas, "2026-07-28", { dinheiro: null, cartao: 10297, pix: null }, 2476.08);
  assert.equal(ruim.taxaPercentual, 24.05);
  assert.equal(ruim.taxaSuspeita, true);
  const bom = fin.buildConferenciaDoDia(vendas, "2026-07-28", { dinheiro: null, cartao: 10297, pix: null }, 800);
  assert.equal(bom.taxaSuspeita, false);
});

test("fechamento: campo não informado não vira falso erro", () => {
  const vendas = [venda("a", "2026-08-05", [{ method: "PIX", amount: 1000 }])];
  const c = fin.buildConferenciaDoDia(vendas, "2026-08-05", { dinheiro: null, cartao: null, pix: null }, 0);
  assert.equal(c.bate, false, "sem nada informado não dá para dizer que bate");
  assert.equal(c.precisaJustificar, false, "mas também não cobra justificativa");
  assert.equal(c.diferencaTotal, 0);
});

test("fechamento: diferença de até 1 real passa (arredondamento de maquininha)", () => {
  const vendas = [venda("a", "2026-08-05", [{ method: "PIX", amount: 1000 }])];
  const c = fin.buildConferenciaDoDia(vendas, "2026-08-05", { dinheiro: null, cartao: null, pix: 1000.9 }, 0);
  assert.equal(c.bate, true);
  assert.equal(c.precisaJustificar, false);
});

// ------------------------------------------------------------- 3. EXTRATO
const EXTRATO_CSV = [
  "Data;Lançamento;Razão Social;CPF/CNPJ;Valor (R$);Saldo (R$)",
  "31/07/2026;SALDO ANTERIOR;;;;53024,43",
  "03/08/2026;PIX RECEBIDO ELIAS;ELIAS TEODORO;053.824.187-05;2000,00;",
  "03/08/2026;PIX ENVIADO;ANDRYA NAARA;422.926.858-09;-18614,54;",
  "03/08/2026;SALDO TOTAL DISPONÍVEL DIA;;;;13393,29",
  "05/08/2026;TRANSFERÊNCIA AUTOM. RECEBIDA 0138.46448-2;;;5190,87;",
  "07/08/2026;SISPAG SALARIOS;;;-6971,00;",
].join("\n");

test("extrato: lê o CSV e ignora saldo, cabeçalho e linha vazia", () => {
  const entradas = ex.lerExtratoDeTexto(EXTRATO_CSV);
  assert.equal(entradas.length, 4, "2 PIX + transferência + SISPAG (saldos fora)");
  assert.equal(entradas[0].entryDate, "2026-08-03");
  assert.equal(entradas[0].amount, 2000);
  assert.equal(entradas[0].counterparty, "ELIAS TEODORO");
  assert.equal(entradas[1].amount, -18614.54, "saída vem negativa");
  assert.ok(!entradas.some((e) => /SALDO/i.test(e.description)), "nenhuma linha de saldo");
});

test("extrato: o id é determinístico — importar duas vezes não duplica", () => {
  const a = ex.lerExtratoDeTexto(EXTRATO_CSV);
  const b = ex.lerExtratoDeTexto(EXTRATO_CSV);
  assert.equal(a.map((e) => e.clientRef).join(","), b.map((e) => e.clientRef).join(","));
  assert.equal(new Set(a.map((e) => e.clientRef)).size, a.length, "cada linha tem id próprio");
  // REGRA REVISTA EM 14/08/2026: a descrição NÃO entra na chave, porque o Itaú
  // reescreve o texto do mesmo lançamento entre exports (era assim que a
  // reimportação duplicava). O que separa é data + valor + documento + ocorrência.
  assert.equal(
    ex.refDoLancamento("2026-08-03", 2000, "053.824.187-05", 0),
    ex.refDoLancamento("2026-08-03", 2000, "05382418705", 0),
    "o documento é comparado só pelos números",
  );
  assert.notEqual(
    ex.refDoLancamento("2026-08-03", 2000, "053.824.187-05", 0),
    ex.refDoLancamento("2026-08-03", 2000, "422.926.858-09", 0),
    "pessoas diferentes = lançamentos diferentes",
  );
});

test("conciliação: casa comanda com PIX e conta com pagamento", () => {
  const entradas = ex.lerExtratoDeTexto(EXTRATO_CSV);
  const vendas = [venda("a", "2026-08-03", [{ method: "PIX", amount: 2000 }], "Elias Teodoro")];
  const contas = [conta("e1", "2026-08-03", 18614.54, "DISTRIBUIÇÃO DE LUCRO")];
  const balde = ex.conciliarExtrato(entradas, vendas, contas, [], "2026-08-01", "2026-08-07");
  assert.equal(balde.entrouSemRegistro.length, 0, "o PIX do Elias casou");
  assert.equal(balde.comandaSemDinheiro.length, 0);
  assert.ok(balde.casadas.some((c) => c.tipo === "COMANDA"));
  assert.ok(balde.casadas.some((c) => c.tipo === "DESPESA"));
  assert.equal(balde.saiuSemRegistro.length, 1, "o SISPAG ainda não tem conta lançada");
  assert.equal(balde.totais.entrouBanco, 7190.87, "2.000 + 5.190,87");
});

test("conciliação: transferência automática e rendimento não viram 'venda sem comanda'", () => {
  const entradas = ex.lerExtratoDeTexto(EXTRATO_CSV);
  const balde = ex.conciliarExtrato(entradas, [], [], [], "2026-08-01", "2026-08-07");
  const transferencia = balde.casadas.find((c) => /TRANSFER/i.test(c.entry.description));
  assert.ok(transferencia, "a transferência da aplicação casa sozinha");
  assert.match(transferencia.comQue, /adiantamento da maquininha/);
  assert.ok(!balde.entrouSemRegistro.some((e) => /TRANSFER/i.test(e.description)));
});

test("conciliação: comanda sem dinheiro no banco aparece (os 1.450 de 04/08)", () => {
  const entradas = ex.lerExtratoDeTexto(EXTRATO_CSV);
  const vendas = [
    venda("a", "2026-08-03", [{ method: "PIX", amount: 2000 }], "Elias"),
    venda("b", "2026-08-04", [{ method: "PIX", amount: 950 }], "LARISSA PILAR"),
    venda("c", "2026-08-04", [{ method: "PIX", amount: 500 }], "Gabriel Zanelli"),
  ];
  const balde = ex.conciliarExtrato(entradas, vendas, [], [], "2026-08-01", "2026-08-07");
  assert.equal(balde.comandaSemDinheiro.length, 2);
  assert.equal(balde.comandaSemDinheiro.reduce((s, c) => s + c.valor, 0), 1450);
});

test("conciliação: dinheiro e cartão da comanda não entram no casamento do PIX", () => {
  const entradas = ex.lerExtratoDeTexto(EXTRATO_CSV);
  const vendas = [venda("a", "2026-08-03", [{ method: "DINHEIRO", amount: 700 }, { method: "CARTAO_CREDITO", amount: 900 }], "X")];
  const balde = ex.conciliarExtrato(entradas, vendas, [], [], "2026-08-01", "2026-08-07");
  assert.equal(balde.comandaSemDinheiro.length, 0, "dinheiro fica na gaveta e cartão cai depois — não é pendência");
});

test("conciliação: R$ 1 de diferença casa como 'com diferença', não como 2 problemas", () => {
  const entradas = ex.lerExtratoDeTexto(EXTRATO_CSV);
  const contas = [conta("e1", "2026-08-07", 6972.0, "SALARIO EQUIPE")];
  const balde = ex.conciliarExtrato(entradas, [], contas, [], "2026-08-01", "2026-08-07");
  assert.equal(balde.casadasComDiferenca.length, 1);
  assert.equal(balde.casadasComDiferenca[0].diferenca, -1);
  assert.ok(!balde.saiuSemRegistro.some((e) => /SISPAG/.test(e.description)), "o SISPAG não conta como pagamento sem lançamento");
  assert.equal(balde.contaSemSaida.length, 0, "nem a conta entra em 'não saiu do banco'");
  assert.equal(balde.saiuSemRegistro.length, 1, "sobra só o PIX da Andrya, que de fato não tem conta");
});

test("conciliação: conta paga em DOIS lançamentos é reconhecida (Mensal Gestor)", () => {
  const csv = [
    "Data;Lançamento;Razão Social;CPF/CNPJ;Valor;Saldo",
    "03/08/2026;PIX ENVIADO;ESTEVAO FARINA;475.654.928-41;-4000,00;",
    "07/08/2026;PIX ENVIADO;ESTEVAO FARINA;475.654.928-41;-2292,72;",
  ].join("\n");
  const entradas = ex.lerExtratoDeTexto(csv);
  const contas = [conta("e1", "2026-08-07", 6292.72, "MENSAL GESTOR")];
  const balde = ex.conciliarExtrato(entradas, [], contas, [], "2026-08-01", "2026-08-07");
  assert.equal(balde.casadasAgrupadas.length, 1);
  assert.equal(balde.casadasAgrupadas[0].entries.length, 2);
  assert.equal(balde.casadasAgrupadas[0].total, 6292.72);
  assert.equal(balde.saiuSemRegistro.length, 0);
  assert.equal(balde.contaSemSaida.length, 0);
});

test("conciliação: conta marcada paga que não saiu do banco aparece (a provisão)", () => {
  const entradas = ex.lerExtratoDeTexto(EXTRATO_CSV);
  const contas = [conta("e1", "2026-08-03", 16813.07, "IMPOSTOS - PROVISIONADO")];
  const balde = ex.conciliarExtrato(entradas, [], contas, [], "2026-08-01", "2026-08-07");
  assert.equal(balde.contaSemSaida.length, 1);
  assert.equal(balde.contaSemSaida[0].description, "IMPOSTOS - PROVISIONADO");
});

test("conciliação: lançamento marcado como IGNORADO sai da conta", () => {
  const entradas = ex.lerExtratoDeTexto(EXTRATO_CSV).map((e) => (e.amount === -6971 ? { ...e, matchKind: "IGNORADO" } : e));
  const balde = ex.conciliarExtrato(entradas, [], [], [], "2026-08-01", "2026-08-07");
  assert.ok(!balde.saiuSemRegistro.some((e) => /SISPAG/.test(e.description)), "o SISPAG foi ignorado de propósito");
  assert.equal(balde.totais.saiuBanco, 18614.54, "e sai do total também");
});

test("leitura: fala em português quantos casaram e quantos pontos olhar", () => {
  const vazio = ex.conciliarExtrato([], [], [], [], "2026-08-01", "2026-08-07");
  assert.match(ex.leituraDaConciliacao(vazio), /Importe o extrato/);
  const entradas = ex.lerExtratoDeTexto(EXTRATO_CSV);
  const comProblema = ex.conciliarExtrato(entradas, [], [], [], "2026-08-01", "2026-08-07");
  assert.match(ex.leituraDaConciliacao(comProblema), /ponto\(s\) para olhar/);
});
