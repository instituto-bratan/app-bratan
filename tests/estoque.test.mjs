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
