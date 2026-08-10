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
  todayISO: () => "2026-07-28",
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
const MES = "2026-07";

test("plano do mês lista as 7 provisões ativas e soma o total da planilha", () => {
  const plan = fin.buildProvisionPlan(fin.seedProvisionRules, [], MES);
  assert.equal(plan.lines.length, 7, "as 7 provisões da planilha");
  assert.equal(plan.lancadas, 0);
  assert.equal(plan.pendentes, 7);
  // 7272 + 2063 + 1000 + 2743 + 500 + 1000 + 909,09
  assert.equal(Math.round(plan.total * 100) / 100, 15487.09);
});

test("cada provisão cai numa categoria do grupo POUPANÇA do P12 (custo soma)", () => {
  const plan = fin.buildProvisionPlan(fin.seedProvisionRules, [], MES);
  const byId = new Map(fin.seedFinCategories.map((category) => [category.id, category]));
  for (const line of plan.lines) {
    const category = byId.get(line.categoryRef);
    assert.ok(category, `categoria ${line.categoryRef} existe`);
    assert.equal(category.groupKey, "POUPANCA", `${line.name} está no grupo Poupanças`);
    assert.equal(category.isCapex, false, "provisão não é CAPEX — entra nos custos");
  }
});

test("lançar gera contas a pagar com vencimento no último dia do mês", () => {
  const expenses = fin.buildProvisionExpenses(fin.seedProvisionRules, [], MES);
  assert.equal(expenses.length, 7);
  for (const expense of expenses) {
    assert.equal(expense.dueDate, "2026-07-31", "vence no fechamento do mês");
    assert.equal(expense.paidAt, null, "nasce em aberto");
    assert.equal(expense.isCapex, false);
    assert.ok(expense.description.startsWith("Provisão: "));
    assert.equal(expense.recorrencia, null, "provisão é gerada mês a mês pelo botão, não pelo motor de recorrência");
  }
  assert.equal(fin.monthLastDay("2026-02"), "2026-02-28", "fevereiro comum");
  assert.equal(fin.monthLastDay("2028-02"), "2028-02-29", "ano bissexto");
});

test("clicar duas vezes NÃO duplica (id determinístico por mês + regra)", () => {
  const primeira = fin.buildProvisionExpenses(fin.seedProvisionRules, [], MES);
  const segunda = fin.buildProvisionExpenses(fin.seedProvisionRules, primeira, MES);
  assert.equal(segunda.length, 0, "nada novo a lançar");
  const plan = fin.buildProvisionPlan(fin.seedProvisionRules, primeira, MES);
  assert.equal(plan.lancadas, 7);
  assert.equal(plan.pendentes, 0);
});

test("meses diferentes geram contas diferentes (não colide)", () => {
  const julho = fin.buildProvisionExpenses(fin.seedProvisionRules, [], "2026-07");
  const agosto = fin.buildProvisionExpenses(fin.seedProvisionRules, julho, "2026-08");
  assert.equal(agosto.length, 7, "agosto ainda precisa ser provisionado");
  const ids = new Set([...julho, ...agosto].map((expense) => expense.id));
  assert.equal(ids.size, 14, "14 contas distintas");
});

test("valor editado na conta manda no plano (não volta para o valor da regra)", () => {
  const [primeira] = fin.buildProvisionExpenses(fin.seedProvisionRules, [], MES);
  const editada = { ...primeira, amount: 9999 };
  const plan = fin.buildProvisionPlan(fin.seedProvisionRules, [editada], MES);
  const line = plan.lines.find((item) => item.expenseId === editada.id);
  assert.equal(line.amount, 9999, "o plano respeita o valor ajustado à mão");
});

test("baixa da provisão vira ENTRADA na poupança com o mesmo id-raiz", () => {
  const plan = fin.buildProvisionPlan(fin.seedProvisionRules, [], MES);
  const line = plan.lines[0];
  const move = fin.provisionSavingsMove(line, MES, "2026-07-31T10:00:00.000Z");
  assert.equal(move.id, fin.provisionMoveRef(MES, line.ruleId), "id linkado à provisão");
  assert.equal(move.direction, "ENTRADA", "dinheiro entra no cofre");
  assert.equal(move.source, "PROVISAO");
  assert.equal(move.kind, "PROVISAO");
  assert.equal(move.monthRef, MES);
  assert.equal(move.amount, line.amount);
});

test("provisão paga aparece como paga no plano", () => {
  const [primeira] = fin.buildProvisionExpenses(fin.seedProvisionRules, [], MES);
  const paga = { ...primeira, paidAt: "2026-07-31T10:00:00.000Z" };
  const plan = fin.buildProvisionPlan(fin.seedProvisionRules, [paga], MES);
  const line = plan.lines.find((item) => item.expenseId === paga.id);
  assert.equal(line.lancada, true);
  assert.equal(line.paga, true);
});

test("regra inativa não entra no plano", () => {
  const rules = fin.seedProvisionRules.map((rule) =>
    rule.id === "prov-urgencias" ? { ...rule, active: false } : rule,
  );
  const plan = fin.buildProvisionPlan(rules, [], MES);
  assert.equal(plan.lines.length, 6);
  assert.ok(!plan.lines.some((line) => line.ruleId === "prov-urgencias"));
});

test("provisões entram nos custos do P12 e reduzem o lucro do mês", () => {
  const expenses = fin.buildProvisionExpenses(fin.seedProvisionRules, [], MES);
  const matrix = fin.buildP12Matrix([], expenses, fin.seedFinCategories, 2026, []);
  const julhoIdx = 6;
  const total = Math.round((matrix.totalExpensesMonths[julhoIdx] ?? 0) * 100) / 100;
  assert.equal(total, 15487.09, "o custo do mês já sai somado");
  const lucro = Math.round((matrix.profitMonths[julhoIdx] ?? 0) * 100) / 100;
  assert.equal(lucro, -15487.09, "sem faturamento, o lucro cai exatamente o valor provisionado");
  const grupo = matrix.groups.find((item) => item.groupKey === "POUPANCA");
  assert.equal(Math.round(grupo.months[julhoIdx].total * 100) / 100, 15487.09, "aparece no grupo 4. Poupanças");
});

// ---------------------------------------------------------------- 31/07/2026
// Auditoria do lucro: rendimento gravado sem kind (Fechamento antigo) sumia dos
// juros da P12 — a mensagem prometia "entra na P12" e não entrava.
test("rendimento sem kind mas com razão 'Rendimento do banco' conta nos juros e no lucro", () => {
  const cats = [{ id: "c1", groupKey: "CUSTO_FIXO", name: "X", sortOrder: 1, isCapex: false, active: true }];
  const moves = [
    { id: "a", moveDate: "2026-07-23", direction: "ENTRADA", amount: 0.26, reason: "Rendimento do banco", source: "MANUAL", monthRef: "2026-07", createdAt: "" },
    { id: "b", moveDate: "2026-07-28", direction: "ENTRADA", amount: 0.87, reason: "Rendimento do banco", source: "MANUAL", monthRef: "2026-07", createdAt: "" },
    { id: "c", moveDate: "2026-07-01", direction: "ENTRADA", amount: 0.25, reason: "Rendimento do banco", source: "MANUAL", kind: "RENDIMENTO", monthRef: "2026-07", createdAt: "" },
    { id: "d", moveDate: "2026-07-01", direction: "ENTRADA", amount: 10015, reason: "Transferência Itaú → Poupança", source: "MANUAL", kind: "APORTE", monthRef: "2026-07", createdAt: "" },
  ];
  const m = fin.buildP12Matrix([], [], cats, 2026, moves, []);
  assert.equal(Math.round(m.financialIncomeMonths[6] * 100) / 100, 1.38, "0,26 + 0,87 (sem kind) + 0,25 (com kind)");
  assert.equal(Math.round(m.profitMonths[6] * 100) / 100, 1.38, "juros entram no lucro");
  assert.equal(m.savingsInMonths[6], 10016.38, "o aporte segue como tesouraria, fora do lucro");
});

test("aporte sem kind NÃO vira juros (a tolerância é só para razão de rendimento)", () => {
  const cats = [{ id: "c1", groupKey: "CUSTO_FIXO", name: "X", sortOrder: 1, isCapex: false, active: true }];
  const moves = [
    { id: "a", moveDate: "2026-07-05", direction: "ENTRADA", amount: 5000, reason: "Entrada de valores — poupança", source: "MANUAL", monthRef: "2026-07", createdAt: "" },
  ];
  const m = fin.buildP12Matrix([], [], cats, 2026, moves, []);
  assert.equal(m.financialIncomeMonths[6], 0);
});

// ---------------------------------------------------------------- 03/08/2026
// Fechamento contábil: 4 itens auto-somados, crediário fora, e a linha de
// impostos deslocada um mês (provisionou em junho = imposto de julho).
const catImpostos = { id: "cat-poup-impostos-mensais", name: "Impostos Mensais (provisão)", groupKey: "POUPANCA", sortOrder: 1, isCapex: false, active: true };
const catAluguel = { id: "cat-aluguel", name: "Aluguel", groupKey: "CUSTO_FIXO", sortOrder: 1, isCapex: false, active: true };
function vendaF(dia, valor, id) {
  return { id: id ?? ("s" + dia), saleDate: dia, patientName: "P", crmContactRef: "", notes: "",
    items: [{ id: "i", itemType: "TRATAMENTO", amount: valor, description: "" }],
    payments: [{ id: "p", method: "PIX", amount: valor, installments: 1 }], createdAt: dia + "T10:00:00.000Z" };
}
function despesaF(dia, valor, cat, id) {
  return { id: id ?? ("e" + dia + cat), description: "x", categoryRef: cat, amount: valor, dueDate: dia, paidAt: null,
    method: "BOLETO", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false,
    notes: "", createdAt: dia + "T10:00:00.000Z", recorrencia: null };
}

test("P12: a provisão de impostos é GASTO do próprio mês (03/08: 'os dezesseis mil foram um gasto de julho')", () => {
  const m = fin.buildP12Matrix(
    [],
    [despesaF("2026-06-28", 10924.08, "cat-poup-impostos-mensais"), despesaF("2026-06-05", 20883, "cat-aluguel")],
    [catImpostos, catAluguel], 2026, [], [],
  );
  assert.equal(Math.round(m.totalExpensesMonths[5] * 100) / 100, 31807.08, "junho = aluguel + provisão de junho");
  assert.equal(Math.round(m.totalExpensesMonths[6] * 100) / 100, 0, "julho NÃO herda o custo — herda o valor como faturamento no fechamento");
});

test("dois cofres: OBRA (uso/empréstimo/devolução) separado das PROVISÕES", () => {
  const moves = [
    { id: "a", moveDate: "2026-07-13", direction: "SAIDA", amount: 54005.45, reason: "obra", source: "MANUAL", kind: "USO_OBRA", monthRef: "2026-07", createdAt: "" },
    { id: "b", moveDate: "2026-07-13", direction: "SAIDA", amount: 39557.83, reason: "sobra", source: "MANUAL", kind: "EMPRESTIMO", monthRef: "2026-07", createdAt: "" },
    { id: "c", moveDate: "2026-07-29", direction: "ENTRADA", amount: 40000, reason: "volta", source: "MANUAL", kind: "DEVOLUCAO", monthRef: "2026-07", createdAt: "" },
    { id: "d", moveDate: "2026-07-30", direction: "ENTRADA", amount: 15487.09, reason: "provisões", source: "MANUAL", kind: "PROVISAO", monthRef: "2026-07", createdAt: "" },
    { id: "e", moveDate: "2026-07-01", direction: "ENTRADA", amount: 10015, reason: "aporte", source: "MANUAL", kind: "APORTE", monthRef: "2026-07", createdAt: "" },
  ];
  const dual = fin.buildDualSavings(moves);
  assert.equal(dual.obra.entradas, 40000);
  assert.equal(Math.round(dual.obra.saidas * 100) / 100, 93563.28);
  assert.equal(Math.round(dual.obra.saldo * 100) / 100, -53563.28);
  assert.equal(Math.round(dual.provisoes.entradas * 100) / 100, 25502.09);
  assert.equal(dual.provisoes.saidas, 0);
});

test("FECHAMENTO CONTÁBIL: 4 itens somam o Faturamento Bruto; crediário fica FORA", () => {
  const sales = [vendaF("2026-07-10", 300000)];
  const expenses = [
    despesaF("2026-06-28", 10924.08, "cat-poup-impostos-mensais"),   // impostos do mês anterior → item (iii)
    despesaF("2026-07-28", 16813.07, "cat-poup-impostos-mensais"),   // provisão de julho (é de agosto — NÃO entra)
  ];
  const moves = [
    { id: "a", moveDate: "2026-07-13", direction: "SAIDA", amount: 54005.45, reason: "obra", source: "MANUAL", kind: "USO_OBRA", monthRef: "2026-07", createdAt: "" },
    { id: "b", moveDate: "2026-07-13", direction: "SAIDA", amount: 39557.83, reason: "sobra", source: "MANUAL", kind: "EMPRESTIMO", monthRef: "2026-07", createdAt: "" },
    { id: "c", moveDate: "2026-07-20", direction: "SAIDA", amount: 2000, reason: "urgência do time", source: "MANUAL", kind: "PROVISAO", monthRef: "2026-07", createdAt: "" },
    { id: "d", moveDate: "2026-06-15", direction: "SAIDA", amount: 999, reason: "obra de junho", source: "MANUAL", kind: "USO_OBRA", monthRef: "2026-06", createdAt: "" },
  ];
  const f = fin.buildFechamentoContabil(sales, expenses, moves, "2026-07", [
    { id: "crediario-lucro-2026-07", monthRef: "2026-07", amount: 34309.10, note: "", includedAt: "" },
  ]);
  assert.equal(f.faturamentoSemCrediario, 300000, "comandas puras, sem crediário");
  // Regra do Lucas (03/08): TODO resgate do CDB é obra; devolução abate.
  // 54.005,45 + 39.557,83 (junho fica em junho; sem devolução neste cenário).
  assert.equal(f.entradaPoupancaObra, 93563.28, "todos os resgates do mês são obra");
  assert.equal(f.entradaPoupancaProvisoes, 2000, "saída de provisão do mês");
  assert.equal(f.impostosDoMesAnterior, 10924.08, "provisão separada em junho paga os impostos de julho");
  assert.equal(f.faturamentoBruto, 406487.36, "auto-soma dos 4 itens");
  assert.equal(f.crediarioInterno, 34309.10, "aparece só como visão interna");
  assert.ok(Math.abs(f.faturamentoBruto - (f.faturamentoSemCrediario + f.entradaPoupancaObra + f.entradaPoupancaProvisoes + f.impostosDoMesAnterior)) < 0.01);
  // Lucro p/ contabilidade: custos do mês = provisão de JULHO (16.813,07) — a
  // de junho é gasto de junho. Lucro = bruto − custos. Crediário fora dos dois lados.
  assert.equal(f.custosDoMes, 16813.07, "só a despesa com vencimento em julho");
  assert.equal(f.lucroContabil, Math.round((f.faturamentoBruto - 16813.07) * 100) / 100);
});

test("FECHAMENTO: devolução ao CDB no mesmo mês ABATE do item da obra (resgates − devoluções)", () => {
  const moves = [
    { id: "a", moveDate: "2026-07-13", direction: "SAIDA", amount: 93563.28, reason: "resgate CDB", source: "MANUAL", kind: "USO_OBRA", monthRef: "2026-07", createdAt: "" },
    { id: "b", moveDate: "2026-07-29", direction: "SAIDA", amount: 15856.18, reason: "resgates finais", source: "MANUAL", kind: "USO_OBRA", monthRef: "2026-07", createdAt: "" },
    { id: "c", moveDate: "2026-07-29", direction: "ENTRADA", amount: 40000, reason: "devolução ao CDB", source: "MANUAL", kind: "DEVOLUCAO", monthRef: "2026-07", createdAt: "" },
  ];
  const f = fin.buildFechamentoContabil([], [], moves, "2026-07", []);
  assert.equal(f.entradaPoupancaObra, 69419.46, "109.419,46 resgatados − 40.000 devolvidos");
});

test("aporte com 'obra'/'CDB' no motivo cai no cofre da OBRA (saldo inicial do CDB)", () => {
  const moves = [
    { id: "a", moveDate: "2026-07-01", direction: "ENTRADA", amount: 100000, reason: "Saldo inicial do CDB (obra)", source: "MANUAL", kind: "SALDO_INICIAL", monthRef: "2026-07", createdAt: "" },
    { id: "b", moveDate: "2026-07-01", direction: "ENTRADA", amount: 10015, reason: "Transferência Itaú → Poupança institucional", source: "MANUAL", kind: "APORTE", monthRef: "2026-07", createdAt: "" },
  ];
  const dual = fin.buildDualSavings(moves);
  assert.equal(dual.obra.entradas, 100000, "saldo inicial do CDB é da obra");
  assert.equal(dual.provisoes.entradas, 10015, "aporte comum segue nas provisões");
});

// ------------------------------------------------------------- 03/08/2026 (2)
// PROVA DO DINHEIRO: a conta do banco é a régua (pedido do Lucas: "faça chegar
// naqueles dezoito mil mais os trinta e um").
test("PROVA DO DINHEIRO: saldo Itaú − provisão do mês anterior + notas do cofre = na mão", () => {
  const expenses = [
    despesaF("2026-07-31", 16813.07, "cat-poup-impostos-mensais"), // reserva p/ agosto
    despesaF("2026-06-28", 10924.08, "cat-poup-impostos-mensais"), // junho: não é a reserva de hoje
  ];
  const profits = [
    { id: "crediario-lucro-2026-06", monthRef: "2026-06", amount: 999, note: "", includedAt: "" },
    { id: "crediario-lucro-2026-07", monthRef: "2026-07", amount: 31250, note: "", includedAt: "" },
  ];
  const prova = fin.buildProvaDoDinheiro(expenses, profits, 35427.61, "2026-08-03");
  assert.equal(prova.reservadoImpostos, 16813.07, "reserva = provisão separada em julho");
  assert.equal(prova.reservaMes, "07/2026");
  assert.equal(prova.livreNoBanco, 18614.54, "35.427,61 − 16.813,07");
  assert.equal(prova.notasNoCofre, 31250, "registro de crediário mais recente");
  assert.equal(prova.naMao, 49864.54, "18.614,54 + 31.250 — os números do Lucas");
});

test("PROVA DO DINHEIRO: virada de ano usa dezembro como mês anterior", () => {
  const expenses = [despesaF("2026-12-31", 15000, "cat-poup-impostos-mensais")];
  const prova = fin.buildProvaDoDinheiro(expenses, [], 20000, "2027-01-05");
  assert.equal(prova.reservadoImpostos, 15000);
  assert.equal(prova.reservaMes, "12/2026");
  assert.equal(prova.livreNoBanco, 5000);
});

test("PROVA DO DINHEIRO: provisão PAGA não desconta (o dinheiro já saiu da conta)", () => {
  // 03/08 à noite: os 16.813,07 debitaram (35.427,61 → 18.614,54). O saldo que
  // o Lucas digita já vem sem eles — descontar de novo daria 1.801,47 (errado).
  const paga = { ...despesaF("2026-07-31", 16813.07, "cat-poup-impostos-mensais"), paidAt: "2026-08-03" };
  const profits = [{ id: "crediario-lucro-2026-07", monthRef: "2026-07", amount: 31250, note: "", includedAt: "" }];
  const prova = fin.buildProvaDoDinheiro([paga], profits, 18614.54, "2026-08-03");
  assert.equal(prova.reservadoImpostos, 0, "paga = já fora da conta, não desconta");
  assert.equal(prova.livreNoBanco, 18614.54);
  assert.equal(prova.naMao, 49864.54, "18.614,54 + 31.250 — exatamente a conta do Lucas");
});

// ------------------------------------------------------------- 07/08/2026
// PROVISÃO É RESERVA, NÃO CONTA A PAGAR (regra do Lucas: "provisionamos para
// vários impostos, não para uma conta específica — não devia nem ter marcar
// como pago"). Ela continua sendo custo do mês na P12; o que muda é que não
// cobra pagamento nem entra no aviso de vencimento.
test("provisão é reconhecida pelo grupo POUPANÇA da categoria", () => {
  const cats = [
    { id: "cat-poup-impostos-mensais", groupKey: "POUPANCA", name: "Impostos Mensais (provisão)", sortOrder: 1, isCapex: false, active: true },
    { id: "cat-aluguel", groupKey: "CUSTO_FIXO", name: "Aluguel", sortOrder: 2, isCapex: false, active: true },
  ];
  const provisao = despesaF("2026-07-31", 16813.07, "cat-poup-impostos-mensais");
  const aluguel = despesaF("2026-07-09", 13989.23, "cat-aluguel");
  assert.equal(fin.isProvisaoExpense(provisao, cats), true);
  assert.equal(fin.isProvisaoExpense(aluguel, cats), false);
  assert.equal(fin.isProvisaoExpense({ ...aluguel, categoryRef: "categoria-que-nao-existe" }, cats), false, "categoria órfã não é provisão");
});

test("provisão fica FORA do aviso de vencimento (não é conta a cobrar)", () => {
  const cats = [
    { id: "cat-poup-impostos-mensais", groupKey: "POUPANCA", name: "Impostos (provisão)", sortOrder: 1, isCapex: false, active: true },
    { id: "cat-aluguel", groupKey: "CUSTO_FIXO", name: "Aluguel", sortOrder: 2, isCapex: false, active: true },
  ];
  const contas = [
    despesaF("2026-08-11", 16813.07, "cat-poup-impostos-mensais"),
    despesaF("2026-08-11", 13989.23, "cat-aluguel"),
    despesaF("2026-08-05", 500, "cat-aluguel"),
  ];
  const semProv = fin.semProvisoes(contas, cats);
  assert.equal(semProv.length, 2, "a provisão saiu da lista");
  const avisos = fin.upcomingExpenses(semProv, "2026-08-10", 3);
  assert.equal(avisos.chegando.length, 1, "só o aluguel chega");
  assert.equal(avisos.chegando[0].amount, 13989.23);
  assert.equal(avisos.vencidas.length, 1, "a de 05/08 está vencida");
  const comProvisao = fin.upcomingExpenses(contas, "2026-08-10", 3);
  assert.equal(comProvisao.chegando.length, 2, "antes da regra, a provisão aparecia cobrando pagamento");
});

test("provisão continua sendo CUSTO do mês na P12 (a regra não mudou)", () => {
  const cats = [catImpostos, catAluguel];
  const matrix = fin.buildP12Matrix(
    [],
    [despesaF("2026-07-31", 16813.07, "cat-poup-impostos-mensais"), despesaF("2026-07-09", 20883, "cat-aluguel")],
    cats, 2026, [], [],
  );
  assert.equal(Math.round(matrix.totalExpensesMonths[6] * 100) / 100, 37696.07, "provisão + aluguel entram no custo de julho");
});
