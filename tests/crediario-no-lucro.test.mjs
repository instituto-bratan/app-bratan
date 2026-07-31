import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = {
  readLocalValue: (_key, fallback) => fallback,
  todayISO: () => "2026-07-31",
  writeLocalValue: () => undefined,
  formatShortTime: () => "00:00",
};

function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
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
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const fin = loadTsModule("src/features/financeiro/financeiroData.ts");
const pag = loadTsModule("src/features/pagamentos/pagamentosData.ts");

const categorias = [
  { id: "cat-aluguel", name: "Aluguel", groupKey: "CUSTO_FIXO", sortOrder: 1, isCapex: false, active: true },
];
function venda(dia, valor, id = "s1") {
  return {
    id, saleDate: dia, patientName: "Paciente", crmContactRef: "", notes: "",
    items: [{ id: "i", itemType: "TRATAMENTO", amount: valor, description: "" }],
    payments: [{ id: "p", method: "PIX", amount: valor, installments: 1 }],
    createdAt: `${dia}T10:00:00.000Z`,
  };
}
function conta(dia, valor, id = "e1") {
  return {
    id, description: "Aluguel", categoryRef: "cat-aluguel", amount: valor, dueDate: dia, paidAt: null,
    method: "BOLETO", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "",
    isCapex: false, notes: "", createdAt: `${dia}T10:00:00.000Z`, recorrencia: null,
  };
}
function incorporacao(mes, valor, id) {
  return { id: id ?? fin.crediarioProfitRef(mes), monthRef: mes, amount: valor, note: "", includedAt: `${mes}-31T12:00:00.000Z` };
}

test("sem apertar o botão, o crediário NÃO entra no lucro (comportamento de sempre)", () => {
  const m = fin.buildP12Matrix([venda("2026-07-10", 100000)], [conta("2026-07-05", 40000)], categorias, 2026, [], []);
  assert.equal(m.crediarioMonths[6], 0);
  assert.equal(m.crediarioYear, 0);
  assert.equal(m.profitMonths[6], 60000, "lucro = 100.000 − 40.000, o caixa do crediário fica fora");
});

test("apertando o botão, o valor entra no lucro DAQUELE mês só", () => {
  const m = fin.buildP12Matrix(
    [venda("2026-07-10", 100000)],
    [conta("2026-07-05", 40000)],
    categorias, 2026, [],
    [incorporacao("2026-07", 15763.82)],
  );
  assert.equal(m.crediarioMonths[6], 15763.82, "julho");
  assert.equal(m.crediarioMonths[7], 0, "agosto não é tocado");
  assert.equal(m.profitMonths[6], 75763.82, "60.000 + 15.763,82");
  assert.equal(m.profitYear, 75763.82);
});

test("id determinístico por mês: apertar duas vezes não duplica", () => {
  assert.equal(fin.crediarioProfitRef("2026-07"), "crediario-lucro-2026-07");
  const dedupe = new Map([
    [fin.crediarioProfitRef("2026-07"), incorporacao("2026-07", 15763.82)],
    [fin.crediarioProfitRef("2026-07"), incorporacao("2026-07", 15763.82)],
  ]);
  assert.equal(dedupe.size, 1, "o mesmo mês é sempre a mesma linha");
});

test("REGRA CENTRAL: a sugestão desconta o que já entrou em outros meses", () => {
  const saldo = 20000;
  // Nada incorporado ainda: sugere o saldo inteiro.
  assert.equal(fin.crediarioProfitSuggestion(saldo, [], "2026-07"), 20000);
  // Julho já levou 15.000; em agosto sobra só o que entrou depois.
  const jaFeito = [incorporacao("2026-07", 15000)];
  assert.equal(fin.crediarioProfitSuggestion(saldo, jaFeito, "2026-08"), 5000, "não conta o mesmo dinheiro duas vezes");
  // Reabrindo julho, sugere o próprio valor de julho (o botão vira "atualizar").
  assert.equal(fin.crediarioProfitSuggestion(saldo, jaFeito, "2026-07"), 20000);
});

test("sugestão nunca fica negativa (gastaram o dinheiro depois de incorporar)", () => {
  const jaFeito = [incorporacao("2026-07", 15000)];
  assert.equal(fin.crediarioProfitSuggestion(2000, jaFeito, "2026-08"), 0, "0 em vez de −13.000");
});

test("totais: por mês e do ano inteiro", () => {
  const rec = [incorporacao("2026-07", 15763.82), incorporacao("2026-08", 4000)];
  assert.equal(fin.crediarioProfitTotal(rec), 19763.82);
  assert.equal(fin.crediarioProfitOfMonth(rec, "2026-07"), 15763.82);
  assert.equal(fin.crediarioProfitOfMonth(rec, "2026-09"), 0);
});

test("resumo do mês mostra o crediário e soma no lucro operacional", () => {
  const metas = { goalSuperRevenue: 350000, goalTargetRevenue: 300000, goalMinRevenue: 250000 };
  const semBotao = fin.buildResumoMes([venda("2026-07-10", 100000)], [conta("2026-07-05", 40000)], categorias, [], metas, "2026-07", []);
  assert.equal(semBotao.crediarioNoLucro, 0);
  assert.equal(semBotao.lucroOperacional, 60000);
  const comBotao = fin.buildResumoMes([venda("2026-07-10", 100000)], [conta("2026-07-05", 40000)], categorias, [], metas, "2026-07", [incorporacao("2026-07", 10939.30)]);
  assert.equal(comBotao.crediarioNoLucro, 10939.30);
  assert.equal(comBotao.lucroOperacional, 70939.30);
  assert.equal(comBotao.faturamento, 100000, "o faturamento NÃO muda — o crediário entra no lucro, não na receita de comandas");
});

test("mês de outro ano não vaza para a matriz do ano corrente", () => {
  const m = fin.buildP12Matrix([], [], categorias, 2026, [], [incorporacao("2025-12", 9000)]);
  assert.equal(m.crediarioYear, 0);
});

test("o valor incorporado NÃO mexe no saldo do caixa do crediário (o dinheiro continua lá)", () => {
  const recebimentos = [
    { id: "r1", lembreteId: "l1", valor: 1042, forma: "DINHEIRO", recebidoEm: "2026-07-13", saleRef: null },
    { id: "r2", lembreteId: "l2", valor: 2800, forma: "DINHEIRO", recebidoEm: "2026-07-28", saleRef: null },
  ];
  const caixa = pag.crediarioCashMoves(recebimentos).reduce((sum, item) => sum + item.valor, 0);
  assert.equal(caixa, 3842, "incorporar no lucro é decisão contábil: não é sangria nem saída de dinheiro");
});
