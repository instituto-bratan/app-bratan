// CONCILIAÇÃO DE 28/08/2026. Duas coisas que o extrato do Itaú provou erradas:
//  1. a fatura do cartão VISA é da obra, mas a categoria "Fatura cartão de
//     crédito" não é capex — a fatura ficava fora do CAPEX;
//  2. distribuição de lucro é capex (fora do lucro) mas NÃO é obra, e estava
//     somada na linha da obra, inflando agosto em R$ 18.614,54.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-28", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const fin = loadTsModule("src/features/financeiro/financeiroData.ts");

const categorias = [
  { id: "cat-compras-variaveis-obras-2026", name: "Compras variáveis (Obras 2026)", groupKey: "CUSTO_VARIAVEL", isCapex: true },
  { id: "cat-distribuicao-lucro-socios", name: "Distribuição de lucro aos sócios", groupKey: "CUSTO_VARIAVEL", isCapex: true },
  { id: "cat-fatura-cartao-credito", name: "Fatura cartão de crédito", groupKey: "CUSTO_VARIAVEL", isCapex: false },
  { id: "cat-fixo", name: "Aluguel", groupKey: "CUSTO_FIXO", isCapex: false },
];
const conta = (id, valor, categoryRef, isCapex = false) => ({
  id, description: id, amount: valor, dueDate: "2026-08-10", paidAt: "2026-08-10",
  categoryRef, isCapex, method: "PIX", supplier: "", installmentNum: null, installmentTotal: null,
  documentNote: "", notes: "", createdAt: "2026-08-10T10:00:00.000Z",
});
const venda = (valor) => ({
  id: "s1", saleDate: "2026-08-10", patientName: "P", crmContactRef: "", notes: "",
  items: [{ id: "i", itemType: "TRATAMENTO", amount: valor, description: "" }],
  payments: [{ id: "p", method: "PIX", amount: valor, installments: 1 }], createdAt: "2026-08-10T10:00:00.000Z",
});

test("distribuição de lucro sai da linha da obra e ganha a sua própria", () => {
  const g = fin.buildGestaoMensal(
    [venda(100000)],
    [conta("obra", 40341.75, "cat-compras-variaveis-obras-2026"), conta("socios", 18614.54, "cat-distribuicao-lucro-socios")],
    categorias, "2026-08", [],
  );
  assert.equal(g.obra, 40341.75, "a obra é só obra");
  assert.equal(g.distribuicaoSocios, 18614.54, "a distribuição tem linha própria");
  assert.equal(g.lucroLiquido, 100000, "nenhuma das duas entra no lucro operacional");
});

test("lançamento marcado como obra conta como CAPEX mesmo com categoria que não é", () => {
  const semMarca = fin.buildGestaoMensal([venda(100000)], [conta("visa", 15994.29, "cat-fatura-cartao-credito")], categorias, "2026-08", []);
  assert.equal(semMarca.obra, 0);
  assert.equal(semMarca.custosVariaveis, 15994.29, "sem a marca, é custo operacional");

  const comMarca = fin.buildGestaoMensal([venda(100000)], [conta("visa", 15994.29, "cat-fatura-cartao-credito", true)], categorias, "2026-08", []);
  assert.equal(comMarca.obra, 15994.29, "a fatura do cartão da obra vira CAPEX");
  assert.equal(comMarca.custosVariaveis, 0);
  assert.equal(comMarca.lucroLiquido, 100000, "e sai do lucro operacional");
});

test("expenseEhCapex olha o lançamento E a categoria", () => {
  const catObra = categorias[0];
  const catNormal = categorias[3];
  assert.equal(fin.expenseEhCapex(conta("a", 1, "x", false), catObra), true, "categoria capex basta");
  assert.equal(fin.expenseEhCapex(conta("b", 1, "x", true), catNormal), true, "lançamento marcado basta");
  assert.equal(fin.expenseEhCapex(conta("c", 1, "x", false), catNormal), false);
  assert.equal(fin.expenseEhCapex(conta("d", 1, "x", false), null), false, "categoria órfã não vira obra");
});

test("a régua da distribuição fica num lugar só, nomeada", () => {
  assert.ok(fin.CATEGORIAS_FORA_DO_LUCRO_NAO_OBRA.has("cat-distribuicao-lucro-socios"));
  // 10/09/2026: a transferência de lucro aos sócios feita pelo Lucro Inteligente é a mesma coisa com nome novo.
  assert.ok(fin.CATEGORIAS_FORA_DO_LUCRO_NAO_OBRA.has("cat-lucro-inteligente-socios"));
  assert.equal(fin.CATEGORIAS_FORA_DO_LUCRO_NAO_OBRA.size, 2, "só distribuição de lucro — nada de salário/pró-labore aqui");
});

// 01/09/2026 (Lucas): "na P12, nos custos do mês, no contas a pagar, tire tudo
// que é de obra; deixe só realmente o que nós pagamos." A P12 bucketava por
// CATEGORIA, então a fatura VISA-OBRA (capex no lançamento, categoria comum)
// continuava dentro do custo do mês e do "a pagar".
test("P12: lançamento marcado como obra sai do custo do mês e cai na linha da obra", () => {
  const contas = [
    conta("aluguel", 10000, "cat-fixo"),
    conta("visa-obra", 15994.29, "cat-fatura-cartao-credito", true),
    conta("obra-direta", 5000, "cat-compras-variaveis-obras-2026"),
  ];
  const m = fin.buildP12Matrix([venda(100000)], contas, categorias, 2026, [], []);
  assert.equal(m.totalExpensesMonths[7], 10000, "custo operacional de agosto = só o aluguel");
  assert.equal(m.capexMonths[7], 15994.29 + 5000, "a fatura VISA-OBRA soma na obra");
  assert.equal(m.profitMonths[7], 90000, "o lucro não carrega a obra");
  const fatura = m.groups.flatMap((g) => g.rows).find((r) => r.category.id === "cat-fatura-cartao-credito");
  assert.equal(fatura.yearTotal, 0, "a linha da categoria fica limpa");
  const linhaObra = m.capexRows.find((r) => r.category.id === "cat-obra-marcada-no-lancamento");
  assert.equal(linhaObra.yearTotal, 15994.29, "a obra marcada no lançamento tem linha própria no CAPEX");
});

test("Resumo do mês: obra marcada no lançamento sai dos custos e do contas a pagar", () => {
  const aberta = { ...conta("visa-obra", 15994.29, "cat-fatura-cartao-credito", true), paidAt: "" };
  const metas = { goalSuperRevenue: 400000, goalTargetRevenue: 399000, goalMinRevenue: 300000 };
  const r = fin.buildResumoMes([venda(100000)], [conta("aluguel", 10000, "cat-fixo"), aberta], categorias, [], metas, "2026-08", []);
  assert.equal(r.custosOperacionais, 10000, "custos do mês sem a obra");
  assert.equal(r.aPagar, 0, "a fatura da obra em aberto não entra no contas a pagar");
  assert.equal(r.jaPago, 10000, "já pago = custos − a pagar continua fechando");
  assert.equal(r.obra, 15994.29, "ela aparece na obra");
});
