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

test("fechamento do dia separa esperado por forma e maquininha", () => {
  const sales = [
    sale("2026-07-02", [["TRATAMENTO", 5000]], [["PIX", 2000], ["CARTAO_CREDITO", 2000, "ITAU"], ["CARTAO_CREDITO", 1000, "SAFRA"]], "s1"),
    sale("2026-07-02", [["CONSULTA", 300]], [["DINHEIRO", 300]], "s2"),
    sale("2026-07-03", [["CONSULTA", 900]], [["PIX", 900]], "s3"),
  ];
  const expected = fin.buildDayExpected(sales, "2026-07-02");
  assert.equal(expected.pix, 2000);
  assert.equal(expected.cardItau, 2000);
  assert.equal(expected.cardSafra, 1000);
  assert.equal(expected.dinheiro, 300);
  assert.equal(expected.total, 5300);
  assert.equal(expected.salesCount, 2);
  assert.deepEqual([...fin.monthDaysWithSales(sales, "2026-07")], ["2026-07-02", "2026-07-03"]);
});

test("saldo da poupança soma entradas e subtrai saídas", () => {
  const moves = [
    { id: "m1", moveDate: "2026-06-01", direction: "ENTRADA", amount: 15000.8, reason: "", source: "MANUAL", monthRef: "2026-06", createdAt: "" },
    { id: "m2", moveDate: "2026-06-29", direction: "SAIDA", amount: 71507.42, reason: "obra", source: "MANUAL", monthRef: "2026-06", createdAt: "" },
    { id: "m3", moveDate: "2026-06-18", direction: "ENTRADA", amount: 40001.64, reason: "", source: "MANUAL", monthRef: "2026-06", createdAt: "" },
  ];
  assert.ok(Math.abs(fin.savingsBalance(moves) - (15000.8 + 40001.64 - 71507.42)) < 0.001);
});

test("provisões do mês são idempotentes por referência determinística", () => {
  assert.equal(fin.provisionMoveRef("2026-07", "prov-13-socios"), "fsav-prov-2026-07-prov-13-socios");
  const moves = [{ id: "x", moveDate: "2026-07-28", direction: "ENTRADA", amount: 7272, reason: "", source: "PROVISAO", monthRef: "2026-07", createdAt: "" }];
  assert.equal(fin.monthProvisionsDone(moves, "2026-07"), true);
  assert.equal(fin.monthProvisionsDone(moves, "2026-08"), false);
  assert.equal(fin.seedProvisionRules.length, 7);
});

test("impostos de consulta batem com a planilha (NF 5927: R$ 200)", () => {
  const taxes = fin.invoiceTaxes("CONSULTA", 200);
  assert.ok(Math.abs(taxes.iss - 4) < 0.001);
  assert.ok(Math.abs(taxes.pis - 1.3) < 0.001);
  assert.ok(Math.abs(taxes.cofins - 6) < 0.001);
  assert.ok(Math.abs(taxes.irpj - 9.6) < 0.001);
  assert.ok(Math.abs(taxes.csll - 5.76) < 0.001);
  assert.ok(Math.abs(taxes.total - 200 * 0.1333) < 0.01);
});

test("impostos de tratamento batem com a planilha (NF 5928: R$ 4.720)", () => {
  const taxes = fin.invoiceTaxes("TRATAMENTO", 4720);
  assert.ok(Math.abs(taxes.iss - 94.4) < 0.001);
  assert.ok(Math.abs(taxes.pis - 30.68) < 0.001);
  assert.ok(Math.abs(taxes.cofins - 141.6) < 0.001);
  assert.ok(Math.abs(taxes.irpj - 56.64) < 0.001);
  assert.ok(Math.abs(taxes.csll - 50.976) < 0.001);
  assert.ok(Math.abs(taxes.mensal - (94.4 + 30.68 + 141.6)) < 0.001);
  assert.ok(Math.abs(taxes.trimestral - (56.64 + 50.976)) < 0.001);
});

test("trimestre agrega os meses certos e refs de guia são determinísticas", () => {
  assert.equal(fin.quarterOfMonth("2026-06"), "2026-Q2");
  assert.deepEqual([...fin.quarterMonths("2026-Q2")], ["2026-04", "2026-05", "2026-06"]);
  assert.equal(fin.monthlyTaxExpenseRef("2026-06"), "fexp-imp-mensal-2026-06");
  assert.equal(fin.quarterlyTaxExpenseRef("2026-Q2"), "fexp-imp-trim-2026-Q2");
  const invoices = [
    { id: "n1", saleRef: null, invoiceType: "CONSULTA", invoiceNumber: "1", issueDate: "2026-04-10", comandaDate: null, patientName: "", amount: 1000, notes: "", createdAt: "" },
    { id: "n2", saleRef: null, invoiceType: "CONSULTA", invoiceNumber: "2", issueDate: "2026-06-10", comandaDate: null, patientName: "", amount: 1000, notes: "", createdAt: "" },
    { id: "n3", saleRef: null, invoiceType: "CONSULTA", invoiceNumber: "3", issueDate: "2026-07-10", comandaDate: null, patientName: "", amount: 1000, notes: "", createdAt: "" },
  ];
  const trimestral = fin.quarterTrimestralTotal(invoices, "2026-Q2");
  assert.ok(Math.abs(trimestral - 2 * 1000 * (0.048 + 0.0288)) < 0.001);
});

test("fechamento das doutoras: plano soma Instituto→Dra e avulsa Dra→Instituto", () => {
  const entries = [
    { id: "p1", professional: "NUTRICIONISTA", entryDate: "2026-06-02", patientName: "Simone", saleItemRef: null, kind: "PLANO", amount: 110, notes: "", createdAt: "" },
    { id: "p2", professional: "NUTRICIONISTA", entryDate: "2026-06-09", patientName: "Carlos", saleItemRef: null, kind: "AVULSA", amount: 150, notes: "", createdAt: "" },
    { id: "p3", professional: "NUTRICIONISTA", entryDate: "2026-06-30", patientName: "Gabriela", saleItemRef: null, kind: "RETORNO", amount: 0, notes: "", createdAt: "" },
    { id: "p4", professional: "PSICOLOGA", entryDate: "2026-06-10", patientName: "Outra", saleItemRef: null, kind: "PLANO", amount: 110, notes: "", createdAt: "" },
    { id: "p5", professional: "NUTRICIONISTA", entryDate: "2026-07-01", patientName: "Fora do mês", saleItemRef: null, kind: "PLANO", amount: 110, notes: "", createdAt: "" },
  ];
  const summary = fin.partnerMonthSummary(entries, "NUTRICIONISTA", "2026-06");
  assert.equal(summary.institutoParaDra, 110);
  assert.equal(summary.draParaInstituto, 150);
  assert.equal(summary.net, -40);
  assert.equal(summary.entries.length, 3);
  assert.equal(fin.partnerClosingExpenseRef("NUTRICIONISTA", "2026-06"), "fexp-repasse-nutricionista-2026-06");
});

test("comandas sem NF listam valores sugeridos por tipo e itens psi/nutri geram sugestões de repasse", () => {
  const sales = [
    sale("2026-07-02", [["CONSULTA", 500], ["TRATAMENTO", 2719.5], ["PSICOLOGA", 2180.5]], [["PIX", 5400]], "sA"),
    sale("2026-07-03", [["PSICOLOGA", 300]], [["PIX", 300]], "sB"),
  ];
  const pending = fin.salesPendingInvoice(sales, [], "2026-07");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].consulta, 500);
  assert.equal(pending[0].tratamento, 2719.5);
  const invoiced = fin.salesPendingInvoice(sales, [{ id: "n", saleRef: "sA", invoiceType: "CONSULTA", invoiceNumber: "1", issueDate: "2026-07-02", comandaDate: null, patientName: "", amount: 500, notes: "", createdAt: "" }], "2026-07");
  assert.equal(invoiced.length, 0);
  const suggestions = fin.partnerSuggestions(sales, [], "PSICOLOGA", "2026-07");
  assert.equal(suggestions.length, 2);
  assert.equal(fin.partnerSuggestions(sales, [{ id: "e", professional: "PSICOLOGA", entryDate: "2026-07-02", patientName: "", saleItemRef: suggestions[0].saleItemRef, kind: "PLANO", amount: 110, notes: "", createdAt: "" }], "PSICOLOGA", "2026-07").length, 1);
});

test("LUCRO da P12 segue a planilha: faturamento + entradas de poupança − despesas", () => {
  const sales = [sale("2026-01-10", [["CONSULTA", 265051.20]], [["PIX", 265051.20]], "s1")];
  const expenses = [
    { id: "e1", description: "Despesas jan", categoryRef: "cat-salarios-fixos", amount: 219167.47, dueDate: "2026-01-28", paidAt: "2026-01-28", method: "PIX", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "" },
  ];
  const savings = [
    { id: "m1", moveDate: "2026-01-28", direction: "ENTRADA", amount: 13982.99, reason: "", source: "MANUAL", monthRef: "2026-01", createdAt: "" },
    { id: "m2", moveDate: "2026-01-29", direction: "SAIDA", amount: 999, reason: "não conta no lucro", source: "MANUAL", monthRef: "2026-01", createdAt: "" },
  ];
  const matrix = fin.buildP12Matrix(sales, expenses, fin.seedFinCategories, 2026, savings);
  assert.ok(Math.abs(matrix.savingsInMonths[0] - 13982.99) < 0.001);
  assert.ok(Math.abs(matrix.profitMonths[0] - 59866.72) < 0.001);
  assert.ok(Math.abs(matrix.profitYear - 59866.72) < 0.001);
});

// --- P12 por mês (14/07/2026): vencimento manda + crediário no lucro ---

test("P12: conta de junho paga em julho continua sendo despesa de JUNHO", () => {
  const expenses = [
    { id: "e-jun", description: "Boleto de junho pago atrasado", categoryRef: "cat-salarios-fixos", amount: 1000, dueDate: "2026-06-28", paidAt: "2026-07-07", method: "BOLETO", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "" },
  ];
  const matrix = fin.buildP12Matrix([], expenses, fin.seedFinCategories, 2026);
  assert.equal(matrix.totalExpensesMonths[5], 1000, "junho carrega a despesa");
  assert.equal(matrix.totalExpensesMonths[6], 0, "julho NÃO herda o acumulado de junho");
});

test("P12: crediário fica FORA da P12 (caixa separado, decisão do Lucas)", () => {
  const sales = [sale("2026-06-10", [["CONSULTA", 2000]], [["PIX", 2000]], "s1")];
  const expenses = [
    { id: "e1", description: "Despesa junho", categoryRef: "cat-salarios-fixos", amount: 5000, dueDate: "2026-06-05", paidAt: "2026-06-05", method: "PIX", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "" },
  ];
  const matrix = fin.buildP12Matrix(sales, expenses, fin.seedFinCategories, 2026, []);
  assert.equal("cashInMonths" in matrix, false, "matriz não tem crediário");
  assert.equal(matrix.profitMonths[5], 2000 - 5000, "lucro do mês = faturamento + poupança − despesas, sem crediário");
});

