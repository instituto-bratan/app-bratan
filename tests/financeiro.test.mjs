import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadFinanceiroModule() {
  const absolutePath = path.resolve(repoRoot, "src/features/financeiro/financeiroData.ts");
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolutePath,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === "@/lib/localStore") {
      return { readLocalValue: (_key, fallback) => fallback, writeLocalValue: () => undefined, todayISO: () => "2026-07-03" };
    }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Array, Intl, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const fin = loadFinanceiroModule();

function sale(date, items, payments, id = "s1") {
  return {
    id,
    saleDate: date,
    patientName: "Paciente",
    crmContactRef: "",
    notes: "",
    createdAt: `${date}T12:00:00.000Z`,
    items: items.map(([itemType, amount], index) => ({ id: `i${index}`, itemType, amount, description: "" })),
    payments: payments.map(([method, amount, cardMachine], index) => ({ id: `p${index}`, method, amount, installments: 1, cardMachine: cardMachine ?? null })),
  };
}

test("cartão do dia soma por tipo e por forma como o cartão verde", () => {
  const sales = [
    sale("2026-07-02", [["TRATAMENTO", 78]], [["PIX", 78]], "s1"),
    sale("2026-07-02", [["PSICOLOGA", 2180.5], ["TRATAMENTO", 2719.5]], [["PIX", 4900]], "s2"),
    sale("2026-07-02", [["SINAL", 500]], [["PIX", 500]], "s3"),
    sale("2026-07-01", [["CONSULTA", 1100]], [["CARTAO_CREDITO", 1100, "ITAU"]], "s4"),
  ];
  const summary = fin.buildDailyCardSummary(sales, "2026-07-02");
  assert.equal(summary.salesCount, 3);
  assert.equal(summary.totalMedicacao, 78 + 2719.5);
  assert.equal(summary.totalPsicologa, 2180.5);
  assert.equal(summary.totalConsulta, 500);
  assert.equal(summary.totalDia, 5478);
  assert.equal(summary.byMethod.PIX, 5478);
  assert.equal(summary.cardByMachine.ITAU, 0);
  assert.equal(summary.mismatchedSales.length, 0);
});

test("cartão do dia acusa comanda cujo pagamento não fecha com os itens", () => {
  const sales = [sale("2026-07-02", [["CONSULTA", 900]], [["PIX", 800]])];
  const summary = fin.buildDailyCardSummary(sales, "2026-07-02");
  assert.equal(summary.mismatchedSales.length, 1);
});

test("P12 deriva faturamento das comandas e despesas por categoria/mês", () => {
  const categories = fin.seedFinCategories;
  const sales = [
    sale("2026-06-10", [["TRATAMENTO", 10000]], [["PIX", 10000]], "s1"),
    sale("2026-06-20", [["CONSULTA", 2000]], [["PIX", 2000]], "s2"),
    sale("2026-07-01", [["CONSULTA", 500]], [["PIX", 500]], "s3"),
    sale("2025-12-31", [["CONSULTA", 999]], [["PIX", 999]], "s4"),
  ];
  const expenses = [
    { id: "e1", description: "Aluguel", categoryRef: "cat-aluguel-iptu-agua", amount: 13982.77, dueDate: "2026-06-08", paidAt: "2026-06-09", method: "BOLETO", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "" },
    { id: "e2", description: "Drywall", categoryRef: "cat-compras-variaveis-obras-2026", amount: 6300, dueDate: "2026-06-01", paidAt: "2026-06-01", method: "PIX", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: true, notes: "", createdAt: "" },
    { id: "e3", description: "Salário", categoryRef: "cat-salarios-fixos", amount: 8689, dueDate: "2026-07-03", paidAt: null, method: "PIX", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "" },
  ];
  const matrix = fin.buildP12Matrix(sales, expenses, categories, 2026);

  assert.equal(matrix.revenueMonths[5].total, 12000);
  assert.equal(matrix.revenueMonths[6].total, 500);
  assert.equal(matrix.revenueYear, 12500);

  const custoFixo = matrix.groups.find((group) => group.groupKey === "CUSTO_FIXO");
  assert.equal(custoFixo.months[5].total, 13982.77);
  const aluguelRow = custoFixo.rows.find((row) => row.category.id === "cat-aluguel-iptu-agua");
  assert.equal(aluguelRow.yearTotal, 13982.77);

  const variaveis = matrix.groups.find((group) => group.groupKey === "CUSTO_VARIAVEL");
  assert.equal(variaveis.months[5].total, 6300);

  const maoDeObra = matrix.groups.find((group) => group.groupKey === "MAO_DE_OBRA");
  assert.equal(maoDeObra.months[6].total, 8689);

  assert.equal(matrix.totalExpensesMonths[5], 13982.77 + 6300);
  assert.ok(Math.abs(matrix.profitMonths[5] - (12000 - 20282.77)) < 0.001);
});

test("categorias seed cobrem os 4 grupos da P12 real", () => {
  const groups = new Set(fin.seedFinCategories.map((category) => category.groupKey));
  assert.deepEqual([...groups].sort(), ["CUSTO_FIXO", "CUSTO_VARIAVEL", "MAO_DE_OBRA", "POUPANCA"]);
  assert.ok(fin.seedFinCategories.length >= 55);
  const obras = fin.seedFinCategories.find((category) => category.id === "cat-compras-variaveis-obras-2026");
  assert.equal(obras.isCapex, true);
});
