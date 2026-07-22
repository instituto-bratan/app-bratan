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
  assert.equal(variaveis.months[5].total, 0); // obra (CAPEX) não entra mais no grupo operacional

  const maoDeObra = matrix.groups.find((group) => group.groupKey === "MAO_DE_OBRA");
  assert.equal(maoDeObra.months[6].total, 8689);

  // Obra é CAPEX: consolidada à parte e FORA das despesas operacionais e do lucro.
  assert.equal(matrix.capexMonths[5], 6300);
  assert.equal(matrix.totalExpensesMonths[5], 13982.77); // só o aluguel (operacional)
  assert.ok(Math.abs(matrix.profitMonths[5] - (12000 - 13982.77)) < 0.001);
});

test("resumo do mês: lucro = faturamento + juros − custos; aportes/obra FORA (a conta fecha)", () => {
  const categories = fin.seedFinCategories;
  const sales = [
    sale("2026-07-05", [["TRATAMENTO", 100000]], [["PIX", 100000]], "s1"),
    sale("2026-07-10", [["CONSULTA", 53216]], [["PIX", 53216]], "s2"),
    sale("2026-06-30", [["CONSULTA", 9000]], [["PIX", 9000]], "s3"), // outro mês, ignorado
  ];
  const expenses = [
    { id: "e1", description: "Aluguel pago", categoryRef: "cat-aluguel-iptu-agua", amount: 20000, dueDate: "2026-07-08", paidAt: "2026-07-09", method: "BOLETO", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "" },
    { id: "e2", description: "Mercearia a pagar", categoryRef: "cat-salarios-fixos", amount: 40000, dueDate: "2026-07-20", paidAt: null, method: "PIX", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "" },
    { id: "e3", description: "Obra (VISA)", categoryRef: "cat-compras-variaveis-obras-2026", amount: 48000, dueDate: "2026-07-05", paidAt: "2026-07-05", method: "CARTAO_CREDITO", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: true, notes: "", createdAt: "" },
  ];
  const savings = [
    { id: "sv1", moveDate: "2026-07-02", direction: "ENTRADA", amount: 20015, kind: "APORTE", reason: "troca de contas", source: "MANUAL", monthRef: "2026-07", createdAt: "" },
    { id: "sv2", moveDate: "2026-07-02", direction: "ENTRADA", amount: 0.62, kind: "RENDIMENTO", reason: "juros", source: "MANUAL", monthRef: "2026-07", createdAt: "" },
  ];
  const metas = { goalSuperRevenue: 350000, goalTargetRevenue: 330000, goalMinRevenue: 300000 };
  const resumo = fin.buildResumoMes(sales, expenses, categories, savings, metas, "2026-07");

  assert.equal(resumo.faturamento, 153216);
  assert.ok(Math.abs(resumo.rendimento - 0.62) < 0.001); // só o juro conta
  assert.ok(Math.abs(resumo.aportes - 20015) < 0.001); // aporte/troca fora do lucro
  assert.ok(Math.abs(resumo.receita - (153216 + 0.62)) < 0.001); // faturamento + juros
  assert.equal(resumo.custosOperacionais, 60000); // 20k aluguel + 40k mercearia (obra fora)
  assert.equal(resumo.aPagar, 40000); // só a mercearia não paga
  assert.equal(resumo.jaPago, 20000); // aluguel pago
  assert.equal(resumo.obra, 48000); // CAPEX à parte
  // lucro = faturamento + juros − custos (aporte e obra FORA)
  assert.ok(Math.abs(resumo.lucroOperacional - (153216 + 0.62 - 60000)) < 0.001);
  // identidade que faltava para a conta "fechar": receita − custos = lucro, exato
  assert.ok(Math.abs((resumo.receita - resumo.custosOperacionais) - resumo.lucroOperacional) < 0.001);
  assert.equal(resumo.metaSuper, 350000);
  assert.equal(resumo.faltaMeta, 350000 - 153216);
  assert.ok(Math.abs(resumo.metaPercent - 153216 / 350000) < 0.001);
});

test("resumo do mês: aPagar nunca fica maior que os custos (jaPago não negativo)", () => {
  const categories = fin.seedFinCategories;
  const expenses = [
    { id: "e1", description: "Categoria órfã não paga", categoryRef: "cat-inexistente", amount: 5000, dueDate: "2026-07-10", paidAt: null, method: "PIX", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "" },
    { id: "e2", description: "Salário a pagar", categoryRef: "cat-salarios-fixos", amount: 3000, dueDate: "2026-07-15", paidAt: null, method: "PIX", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "" },
  ];
  const metas = { goalSuperRevenue: 350000, goalTargetRevenue: 330000, goalMinRevenue: 300000 };
  const resumo = fin.buildResumoMes([], expenses, categories, [], metas, "2026-07");
  // categoria órfã não entra nem no custo nem no "a pagar" (mesma base da P12)
  assert.equal(resumo.custosOperacionais, 3000);
  assert.equal(resumo.aPagar, 3000);
  assert.equal(resumo.jaPago, 0);
  assert.ok(resumo.jaPago >= 0);
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

test("dívida do operacional com o cofre = empréstimos − devoluções (obra não conta)", () => {
  const moves = [
    { id: "a", moveDate: "2026-07-13", direction: "SAIDA", amount: 34323.91, reason: "cobriu conta", source: "MANUAL", kind: "EMPRESTIMO", monthRef: "2026-07", createdAt: "" },
    { id: "b", moveDate: "2026-07-13", direction: "SAIDA", amount: 59239.37, reason: "obra", source: "MANUAL", kind: "USO_OBRA", monthRef: "2026-07", createdAt: "" },
    { id: "c", moveDate: "2026-07-20", direction: "ENTRADA", amount: 10000, reason: "devolveu", source: "MANUAL", kind: "DEVOLUCAO", monthRef: "2026-07", createdAt: "" },
  ];
  assert.ok(Math.abs(fin.operationalDebtToCofre(moves) - (34323.91 - 10000)) < 0.001);
  assert.ok(Math.abs(fin.cofreSpentOnObra(moves) - 59239.37) < 0.001);
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

test("comandas sem NF: fila por VALOR restante (N notas por comanda) e psi/nutri fora", () => {
  const sales = [
    sale("2026-07-02", [["CONSULTA", 500], ["TRATAMENTO", 2719.5], ["PSICOLOGA", 2180.5]], [["PIX", 5400]], "sA"),
    sale("2026-07-03", [["PSICOLOGA", 300]], [["PIX", 300]], "sB"),
  ];
  const pending = fin.salesPendingInvoice(sales, [], "2026-07");
  assert.equal(pending.length, 1); // sB é só psicóloga → não entra na fila de NF
  assert.equal(pending[0].breakdown.consulta, 500);
  assert.equal(pending[0].breakdown.tratamento, 2719.5);
  assert.equal(pending[0].remaining, 3219.5); // psi fica fora
  // Nota parcial (só a consulta) mantém a comanda na fila com o RESTANTE.
  const parcial = fin.salesPendingInvoice(sales, [{ id: "n", saleRef: "sA", invoiceType: "CONSULTA", invoiceNumber: "1", issueDate: "2026-07-02", comandaDate: null, patientName: "", amount: 500, notes: "", createdAt: "" }], "2026-07");
  assert.equal(parcial.length, 1, "comanda continua na fila pelo restante");
  assert.equal(parcial[0].remaining, 2719.5);
  // Nota UNIFICADA de tratamento cobrindo tudo → sai da fila (o modelo antigo
  // por tipo não permitia unificar; o novo por valor permite).
  const unificada = fin.salesPendingInvoice(sales, [
    { id: "n1", saleRef: "sA", invoiceType: "TRATAMENTO", invoiceNumber: "9", issueDate: "2026-07-02", comandaDate: null, patientName: "", amount: 3219.5, notes: "", createdAt: "" },
  ], "2026-07");
  assert.equal(unificada.length, 0, "nota unificada cobre o valor → comanda sai da fila");
  const suggestions = fin.partnerSuggestions(sales, [], "PSICOLOGA", "2026-07");
  assert.equal(suggestions.length, 2);
  assert.equal(fin.partnerSuggestions(sales, [{ id: "e", professional: "PSICOLOGA", entryDate: "2026-07-02", patientName: "", saleItemRef: suggestions[0].saleItemRef, kind: "PLANO", amount: 110, notes: "", createdAt: "" }], "PSICOLOGA", "2026-07").length, 1);
});

test("bioimpedância paga imposto de PROCEDIMENTO (7,93%), não de consulta", () => {
  const taxes = fin.invoiceTaxes("BIOIMPEDANCIA", 200);
  assert.ok(Math.abs(taxes.irpj - 200 * 0.012) < 0.001);
  assert.ok(Math.abs(taxes.csll - 200 * 0.0108) < 0.001);
  assert.ok(Math.abs(taxes.total - 200 * 0.0793) < 0.01); // 15,86 vs 26,66 se fosse consulta
  assert.equal(fin.invoiceTaxClass("BIOIMPEDANCIA"), "PROCEDIMENTO");
  assert.equal(fin.invoiceTaxClass("TRATAMENTO"), "PROCEDIMENTO");
  assert.equal(fin.invoiceTaxClass("CONSULTA"), "CONSULTA");
});

test("plano de emissão: consulta 1.100 vira bio 200 + consulta 900 (como a equipe faz)", () => {
  const comanda = sale("2026-07-10", [["CONSULTA", 1100]], [["PIX", 1100]], "sC");
  const plans = fin.suggestInvoicePlans(comanda, []);
  assert.equal(plans.length, 1); // sem tratamento → só o plano separado
  const linhas = plans[0].lines;
  assert.equal(JSON.stringify(linhas), JSON.stringify([
    { invoiceType: "BIOIMPEDANCIA", amount: 200 },
    { invoiceType: "CONSULTA", amount: 900 },
  ]));
  // economia real vs nota única de consulta: 1100×13,33% − (200×7,93% + 900×13,33%)
  const notaUnica = fin.invoiceTaxes("CONSULTA", 1100).total;
  assert.ok(plans[0].tax < notaUnica);
  assert.ok(Math.abs((notaUnica - plans[0].tax) - 200 * (0.1333 - 0.0793)) < 0.01);
});

test("plano de emissão: com tratamento, UNIFICADA (1 nota) tem o menor imposto e vem primeiro", () => {
  const comanda = sale("2026-07-10", [["CONSULTA", 1100], ["TRATAMENTO", 8000]], [["PIX", 9100]], "sD");
  const plans = fin.suggestInvoicePlans(comanda, []);
  assert.equal(plans.length, 2);
  assert.equal(plans[0].key, "UNIFICADA"); // menor imposto primeiro
  assert.equal(JSON.stringify(plans[0].lines), JSON.stringify([{ invoiceType: "TRATAMENTO", amount: 9100 }]));
  const separada = plans.find((plan) => plan.key === "SEPARADA");
  assert.equal(JSON.stringify(separada.lines), JSON.stringify([
    { invoiceType: "BIOIMPEDANCIA", amount: 200 },
    { invoiceType: "CONSULTA", amount: 900 },
    { invoiceType: "TRATAMENTO", amount: 8000 },
  ]));
  assert.ok(plans[0].tax < separada.tax);
  // consulta pequena (≤200) não divide; item de bio explícito usa o valor do item
  const pequena = fin.suggestInvoicePlans(sale("2026-07-11", [["CONSULTA", 200]], [["PIX", 200]], "sE"), []);
  assert.equal(JSON.stringify(pequena[0].lines), JSON.stringify([{ invoiceType: "CONSULTA", amount: 200 }]));
  const bioItem = fin.suggestInvoicePlans(sale("2026-07-12", [["BIOIMPEDANCIA", 250], ["CONSULTA", 800]], [["PIX", 1050]], "sF"), []);
  assert.equal(JSON.stringify(bioItem[0].lines), JSON.stringify([
    { invoiceType: "BIOIMPEDANCIA", amount: 250 },
    { invoiceType: "CONSULTA", amount: 800 },
  ]));
  // comanda com nota parcial → sugere completar o restante (sem re-dividir)
  const comNota = fin.suggestInvoicePlans(comanda, [
    { id: "n1", saleRef: "sD", invoiceType: "BIOIMPEDANCIA", invoiceNumber: "10", issueDate: "2026-07-10", comandaDate: null, patientName: "", amount: 200, notes: "", createdAt: "" },
  ]);
  assert.equal(comNota.length, 1);
  assert.equal(comNota[0].label, "Completar o restante");
  assert.equal(JSON.stringify(comNota[0].lines), JSON.stringify([{ invoiceType: "TRATAMENTO", amount: 8900 }]));
});

test("resumo por classe (bloco K/L da planilha) e número sequencial", () => {
  const invoices = [
    { id: "n1", saleRef: null, invoiceType: "CONSULTA", invoiceNumber: "5970", issueDate: "2026-07-10", comandaDate: null, patientName: "", amount: 900, notes: "", createdAt: "" },
    { id: "n2", saleRef: null, invoiceType: "BIOIMPEDANCIA", invoiceNumber: "5971", issueDate: "2026-07-10", comandaDate: null, patientName: "", amount: 200, notes: "", createdAt: "" },
    { id: "n3", saleRef: null, invoiceType: "TRATAMENTO", invoiceNumber: "5972", issueDate: "2026-07-11", comandaDate: null, patientName: "", amount: 4720, notes: "", createdAt: "" },
  ];
  const totals = fin.monthInvoiceTotals(invoices, "2026-07");
  assert.equal(totals.count, 3);
  assert.equal(totals.byClass.CONSULTA.count, 1);
  assert.equal(totals.byClass.PROCEDIMENTO.count, 2);
  assert.equal(totals.byClass.PROCEDIMENTO.amount, 4920);
  // classe consulta: mensal = 900×5,65%; trimestral = 900×7,68%
  assert.ok(Math.abs(totals.byClass.CONSULTA.mensal - 900 * 0.0565) < 0.01);
  assert.ok(Math.abs(totals.byClass.CONSULTA.trimestral - 900 * 0.0768) < 0.01);
  // procedimento: trimestral = (200+4720)×2,28%
  assert.ok(Math.abs(totals.byClass.PROCEDIMENTO.trimestral - 4920 * 0.0228) < 0.01);
  // mensal+trimestral por classe fecham com o total geral
  const soma = totals.byClass.CONSULTA.mensal + totals.byClass.CONSULTA.trimestral + totals.byClass.PROCEDIMENTO.mensal + totals.byClass.PROCEDIMENTO.trimestral;
  assert.ok(Math.abs(soma - (totals.mensal + totals.trimestral)) < 0.001);
  assert.equal(fin.nextInvoiceNumber(invoices), 5973);
  assert.equal(fin.nextInvoiceNumber([]), null);
});

test("LUCRO da P12: só JUROS (rendimento) entram; aportes/trocas de conta NÃO (decisão Lucas 21/07)", () => {
  const sales = [sale("2026-01-10", [["CONSULTA", 265051.20]], [["PIX", 265051.20]], "s1")];
  const expenses = [
    { id: "e1", description: "Despesas jan", categoryRef: "cat-salarios-fixos", amount: 219167.47, dueDate: "2026-01-28", paidAt: "2026-01-28", method: "PIX", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "" },
  ];
  const savings = [
    { id: "m1", moveDate: "2026-01-28", direction: "ENTRADA", kind: "RENDIMENTO", amount: 100.00, reason: "juros do banco", source: "MANUAL", monthRef: "2026-01", createdAt: "" },
    { id: "m2", moveDate: "2026-01-15", direction: "ENTRADA", kind: "APORTE", amount: 13882.99, reason: "troca de contas", source: "MANUAL", monthRef: "2026-01", createdAt: "" },
    { id: "m3", moveDate: "2026-01-29", direction: "SAIDA", amount: 999, reason: "não conta no lucro", source: "MANUAL", monthRef: "2026-01", createdAt: "" },
  ];
  const matrix = fin.buildP12Matrix(sales, expenses, fin.seedFinCategories, 2026, savings);
  // savingsIn = TODAS as entradas (informativo/cofre): 100 + 13882.99
  assert.ok(Math.abs(matrix.savingsInMonths[0] - 13982.99) < 0.001);
  // financialIncome = só o rendimento (juros): 100
  assert.ok(Math.abs(matrix.financialIncomeMonths[0] - 100) < 0.001);
  assert.ok(Math.abs(matrix.financialIncomeYear - 100) < 0.001);
  // lucro = faturamento + juros − despesas = 265051.20 + 100 − 219167.47 (APORTE fora)
  assert.ok(Math.abs(matrix.profitMonths[0] - 45983.73) < 0.001);
  assert.ok(Math.abs(matrix.profitYear - 45983.73) < 0.001);
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
  assert.equal(matrix.profitMonths[5], 2000 - 5000, "lucro do mês = faturamento + juros − despesas, sem crediário");
});


// --- Compras: controle puro, não entra no P12 (17/07/2026) ---

test("Compras: purchaseAccounting separa fatura / contas a pagar / caixa", () => {
  const credito = fin.purchaseAccounting({ method: "CARTAO_CREDITO", card: "SANTANDER" });
  assert.equal(credito.label, "Fatura Santander");
  assert.equal(credito.tone, "credito");
  const boleto = fin.purchaseAccounting({ method: "BOLETO", card: null });
  assert.equal(boleto.label, "Contas a Pagar");
  assert.equal(boleto.tone, "boleto");
  assert.equal(fin.purchaseAccounting({ method: "DINHEIRO", card: null }).tone, "caixa");
  assert.equal(fin.purchaseAccounting({ method: "PIX", card: null }).tone, "caixa");
});

test("Compras: totais por cartão, crédito/boleto e 'vai chegar'", () => {
  const buy = (over) => ({
    id: over.id, purchaseDate: over.purchaseDate ?? "2026-07-10", description: over.description ?? "x", supplier: "",
    amount: over.amount, method: over.method, card: over.card ?? null, installments: over.installments ?? 1,
    nfNote: "", deliveryEta: over.deliveryEta ?? null, receivedAt: over.receivedAt ?? null, expenseRef: null, notes: "", createdAt: "",
  });
  const purchases = [
    buy({ id: "a", amount: 1000, method: "CARTAO_CREDITO", card: "SANTANDER" }),
    buy({ id: "b", amount: 500, method: "CARTAO_CREDITO", card: "SANTANDER", deliveryEta: "2026-07-20" }),
    buy({ id: "c", amount: 300, method: "CARTAO_CREDITO", card: "ITAU" }),
    buy({ id: "d", amount: 2000, method: "BOLETO", deliveryEta: "2026-07-22" }),
    buy({ id: "e", amount: 80, method: "DINHEIRO" }),
    buy({ id: "f", amount: 999, method: "CARTAO_CREDITO", card: "ITAU", purchaseDate: "2026-06-30" }), // outro mês
  ];
  const t = fin.purchaseMonthTotals(purchases, "2026-07");
  assert.equal(t.total, 1000 + 500 + 300 + 2000 + 80);
  assert.equal(t.creditTotal, 1800);
  assert.equal(t.boletoTotal, 2000);
  assert.equal(t.byCard.get("SANTANDER"), 1500);
  assert.equal(t.byCard.get("ITAU"), 300, "compra de junho não conta em julho");
  assert.equal(t.toArrive.length, 2, "duas com previsão e não recebidas");
  assert.equal(t.toArriveTotal, 500 + 2000);
});
