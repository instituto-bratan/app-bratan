// ESTOQUE (19/08/2026): kardex, ponto de pedido, FEFO, contagem cíclica e o
// elo com as Compras.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-19", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const es = loadTsModule("src/features/estoque/estoqueData.ts");

const HOJE = "2026-08-19";
const item = (id, extra = {}) => ({
  id, setor: "ENFERMAGEM", nome: id, categoria: "Medicação", unidade: "un", minimo: 0, observacao: "",
  createdAt: "2026-08-01T10:00:00.000Z", ...extra,
});
let seq = 0;
const mov = (itemRef, tipo, quantidade, movDate, extra = {}) => ({
  id: `m${(seq += 1)}`, itemRef, setor: "ENFERMAGEM", tipo, quantidade, movDate,
  lote: "", validade: null, compraRef: null, motivo: "", createdAt: `${movDate}T10:00:0${seq % 10}.000Z`, ...extra,
});

test("kardex: entrada soma, saída subtrai, ajuste com sinal", () => {
  const moves = [
    mov("und", "ENTRADA", 10, "2026-08-01"),
    mov("und", "SAIDA", 3, "2026-08-05"),
    mov("und", "AJUSTE", -1, "2026-08-06", { motivo: "frasco quebrou" }),
    mov("und", "AJUSTE", 2, "2026-08-07", { motivo: "achei na gaveta" }),
  ];
  assert.equal(es.saldoDoItem(moves, "und"), 8);
});

test("contagem física RESETA a régua — a prateleira vence o papel", () => {
  const moves = [
    mov("und", "ENTRADA", 10, "2026-08-01"),
    mov("und", "CONTAGEM", 6, "2026-08-10"),
    mov("und", "SAIDA", 1, "2026-08-12"),
  ];
  assert.equal(es.saldoDoItem(moves, "und"), 5);
});

test("contagem fora de ordem de inserção ainda respeita a cronologia", () => {
  const contagem = mov("und", "CONTAGEM", 6, "2026-08-10");
  const entrada = mov("und", "ENTRADA", 10, "2026-08-01");
  assert.equal(es.saldoDoItem([contagem, entrada], "und"), 6);
});

test("ponto de pedido: zerado, comprar e OK — piores primeiro na posição", () => {
  const items = [item("a", { minimo: 5 }), item("b", { minimo: 5 }), item("c")];
  const moves = [mov("a", "ENTRADA", 20, "2026-08-01"), mov("b", "ENTRADA", 4, "2026-08-01")];
  const posicao = es.posicaoDoSetor(items, moves, "ENFERMAGEM");
  assert.deepEqual(posicao.map((linha) => `${linha.item.id}:${linha.status}`).join("|"), "c:ZERADO|b:COMPRAR|a:OK");
});

test("FEFO: a saída sugere o lote que vence primeiro; sem validade vai pro fim", () => {
  const moves = [
    mov("und", "ENTRADA", 5, "2026-08-01", { lote: "L2", validade: "2026-12-01" }),
    mov("und", "ENTRADA", 5, "2026-08-02", { lote: "L1", validade: "2026-09-15" }),
    mov("und", "ENTRADA", 5, "2026-08-03", { lote: "SEM" }),
  ];
  const lotes = es.lotesDoItem(moves, "und");
  assert.equal(lotes.map((l) => l.lote).join("|"), "L1|L2|SEM");
  assert.equal(es.loteSugerido(moves, "und").lote, "L1");
});

test("lote esvaziado sai da prateleira", () => {
  const moves = [
    mov("und", "ENTRADA", 5, "2026-08-01", { lote: "L1", validade: "2026-09-15" }),
    mov("und", "SAIDA", 5, "2026-08-05", { lote: "L1", validade: "2026-09-15" }),
    mov("und", "ENTRADA", 3, "2026-08-06", { lote: "L2", validade: "2026-10-01" }),
  ];
  assert.equal(es.lotesDoItem(moves, "und").map((l) => l.lote).join("|"), "L2");
});

test("alertas de validade: vencido vem primeiro e diz há quantos dias", () => {
  const items = [item("und")];
  const moves = [
    mov("und", "ENTRADA", 2, "2026-08-01", { lote: "V", validade: "2026-08-10" }),
    mov("und", "ENTRADA", 2, "2026-08-01", { lote: "P", validade: "2026-09-10" }),
    mov("und", "ENTRADA", 2, "2026-08-01", { lote: "LONGE", validade: "2027-05-01" }),
  ];
  const alertas = es.alertasDeValidade(items, moves, HOJE, 60);
  assert.equal(alertas.length, 2);
  assert.equal(alertas[0].lote.lote, "V");
  assert.equal(alertas[0].vencido, true);
  assert.equal(alertas[0].diasParaVencer, -9);
  assert.equal(alertas[1].lote.lote, "P");
  assert.equal(alertas[1].diasParaVencer, 22);
});

test("chegadas pendentes: compra marcada aparece até dar entrada — mesmo se já carimbada como recebida", () => {
  const compra = (id, setor, receivedAt = null) => ({
    id, purchaseDate: "2026-08-15", description: id, supplier: "", amount: 100, method: "PIX", card: null,
    installments: 1, nfNote: "", deliveryEta: null, receivedAt, expenseRef: null, notes: "", estoqueSetor: setor,
    createdAt: "2026-08-15T10:00:00.000Z",
  });
  const compras = [
    compra("stin-1", "ENFERMAGEM"),
    compra("stin-2", "ENFERMAGEM", "2026-08-16"), // "Chegou" carimbado no Financeiro, mas SEM entrada no estoque
    compra("papel", "RECEPCAO"),
    compra("obra", null),
  ];
  const moves = [mov("und", "ENTRADA", 10, "2026-08-16", { compraRef: "stin-1" })];
  const pendentes = es.chegadasPendentes(compras, moves, "ENFERMAGEM");
  // stin-1 já entrou; stin-2 ainda deve entrada; papel é da recepção; obra não é estoque.
  assert.equal(pendentes.map((p) => p.id).join("|"), "stin-2");
  assert.equal(es.chegadasPendentes(compras, moves, "RECEPCAO").map((p) => p.id).join("|"), "papel");
});

test("relatório de posição resume zerados, comprar e vencendo", () => {
  const items = [item("a", { minimo: 5, nome: "Agulha" }), item("b", { nome: "Undecilato" })];
  const moves = [
    mov("a", "ENTRADA", 3, "2026-08-01"),
    mov("b", "ENTRADA", 2, "2026-08-01", { lote: "L1", validade: "2026-09-01" }),
  ];
  const relatorio = es.relatorioPosicao(items, moves, "ENFERMAGEM", HOJE);
  assert.equal(relatorio.resumo.total, 2);
  assert.equal(relatorio.resumo.comprar, 1);
  assert.equal(relatorio.resumo.zerados, 0);
  assert.equal(relatorio.resumo.vencendo, 1);
  assert.equal(relatorio.linhas[0].nome, "Agulha");
  assert.equal(relatorio.linhas[0].status, "COMPRAR");
});

test("CSV dos movimentos: cabeçalho, período e ; no motivo vira ,", () => {
  const items = [item("und", { nome: "Undecilato" })];
  const moves = [
    mov("und", "ENTRADA", 10, "2026-08-02", { motivo: "compra; STIN" }),
    mov("und", "SAIDA", 1, "2026-09-01"), // fora do período
  ];
  const csv = es.csvMovimentos(items, moves, "ENFERMAGEM", "2026-08-01", "2026-08-31");
  const linhas = csv.split("\n");
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0], "Data;Item;Tipo;Quantidade;Lote;Validade;Origem;Motivo");
  assert.ok(linhas[1].includes("Undecilato"));
  assert.ok(linhas[1].includes("compra, STIN"));
  assert.ok(!csv.includes("2026-09"));
});

test("setores não vazam um no outro", () => {
  const items = [item("papel", { setor: "RECEPCAO", nome: "Papel A4" }), item("und", { nome: "Undecilato" })];
  const moves = [
    mov("papel", "ENTRADA", 10, "2026-08-01", { setor: "RECEPCAO" }),
    mov("und", "ENTRADA", 5, "2026-08-01"),
  ];
  assert.equal(es.posicaoDoSetor(items, moves, "RECEPCAO").length, 1);
  assert.equal(es.posicaoDoSetor(items, moves, "ENFERMAGEM").length, 1);
  const csvRec = es.csvMovimentos(items, moves, "RECEPCAO", "2026-08-01", "2026-08-31");
  assert.ok(csvRec.includes("Papel A4") && !csvRec.includes("Undecilato"));
});

// ------------------------- v2: bip, GS1 e reposição -------------------------

test("GS1 DataMatrix de medicação: um bip traz GTIN + validade + lote", () => {
  const GS = String.fromCharCode(29);
  // AI 01 (GTIN-14) + 17 (validade AAMMDD) + 10 (lote, variável)
  const lido = es.parseGs1(`01078987134500171727063010ABC123`);
  assert.equal(lido.gtin, "7898713450017");
  assert.equal(lido.validade, "2027-06-30");
  assert.equal(lido.lote, "ABC123");
  // Com série (21) no meio, separada por FNC1, e prefixo de simbologia ]d2
  const completo = es.parseGs1(`]d2010789871345001721XYZ99${GS}1727060010L44`);
  assert.equal(completo.gtin, "7898713450017");
  assert.equal(completo.validade, "2027-06-30", "dia 00 vira o último dia do mês");
  assert.equal(completo.lote, "L44");
});

test("EAN-13 puro e código desconhecido", () => {
  assert.equal(es.parseGs1("7891234567895").gtin, "7891234567895");
  assert.equal(es.parseGs1(""), null);
});

test("acharPorCodigo casa EAN-13 com GTIN-14 (zeros à esquerda não separam)", () => {
  const items = [item("und", { codigoBarras: "7898713450017" })];
  assert.equal(es.acharPorCodigo(items, "01078987134500171727063010ABC")?.id, "und");
  assert.equal(es.acharPorCodigo(items, "7898713450017")?.id, "und");
  assert.equal(es.acharPorCodigo(items, "7899999999999"), null);
  assert.equal(es.acharPorCodigo([item("sem")], "7898713450017"), null, "item sem código não casa");
});

test("consumo médio, cobertura e mínimo sugerido", () => {
  const moves = [
    mov("und", "SAIDA", 6, "2026-08-01"),
    mov("und", "SAIDA", 6, "2026-08-10"),
    mov("und", "ENTRADA", 50, "2026-07-01"),
    mov("und", "SAIDA", 99, "2026-05-01"), // fora da janela de 60 dias
  ];
  const consumo = es.consumoDiario(moves, "und", HOJE, 60);
  assert.equal(consumo, 0.2); // 12 unidades / 60 dias
  assert.equal(es.coberturaDias(10, consumo), 50);
  assert.equal(es.coberturaDias(10, 0), null, "sem consumo medido não inventa cobertura");
  assert.equal(es.minimoSugerido(consumo), 3); // 0,2 × 7 × 1,5 = 2,1 → 3
  assert.equal(es.minimoSugerido(0), 0);
});

test("lista de compras: só quem precisa, com sugestão de reposição (2× mínimo)", () => {
  const items = [item("a", { minimo: 10, nome: "Agulha" }), item("b", { nome: "Zerado" }), item("c", { minimo: 2, nome: "Cheio" })];
  const moves = [mov("a", "ENTRADA", 4, "2026-08-01"), mov("c", "ENTRADA", 30, "2026-08-01")];
  const lista = es.listaDeCompra(items, moves, "ENFERMAGEM");
  assert.equal(lista.length, 2);
  const agulha = lista.find((linha) => linha.item.nome === "Agulha");
  assert.equal(agulha.comprar, 16); // 2×10 − 4
  const zerado = lista.find((linha) => linha.item.nome === "Zerado");
  assert.equal(zerado.comprar, 1, "sem mínimo definido, pelo menos 1");
});
