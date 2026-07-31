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
