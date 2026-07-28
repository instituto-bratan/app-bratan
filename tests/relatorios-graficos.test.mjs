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

const charts = loadTsModule("src/lib/chartData.ts");
const fin = loadTsModule("src/features/financeiro/financeiroData.ts");

function sale(over = {}) {
  return {
    id: "s1",
    saleDate: "2026-07-15",
    patientName: "Paciente Teste",
    crmContactRef: "",
    notes: "",
    items: [{ id: "i1", itemType: "TRATAMENTO", amount: 8000, description: "" }],
    payments: [{ id: "p1", method: "PIX", amount: 8000, installments: 1 }],
    createdAt: "2026-07-15T10:00:00.000Z",
    ...over,
  };
}

const categorias = [
  { id: "cat-aluguel", name: "Aluguel", groupKey: "CUSTO_FIXO", sortOrder: 1, isCapex: false, active: true },
  { id: "cat-salarios", name: "Salários", groupKey: "MAO_DE_OBRA", sortOrder: 2, isCapex: false, active: true },
  { id: "cat-insumos", name: "Insumos", groupKey: "CUSTO_VARIAVEL", sortOrder: 3, isCapex: false, active: true },
  { id: "cat-obra", name: "Obra", groupKey: "CUSTO_FIXO", sortOrder: 4, isCapex: true, active: true },
];

function despesa(over = {}) {
  return {
    id: "e1",
    description: "Conta",
    categoryRef: "cat-aluguel",
    amount: 1000,
    dueDate: "2026-07-10",
    paidAt: null,
    method: null,
    supplier: "",
    installmentNum: null,
    installmentTotal: null,
    documentNote: "",
    isCapex: false,
    notes: "",
    createdAt: "2026-07-01T10:00:00.000Z",
    ...over,
  };
}

test("série mensal espelha a P12: faturamento, custos e lucro batem", () => {
  const sales = [sale(), sale({ id: "s2", saleDate: "2026-06-10" })];
  const expenses = [despesa({ amount: 3000 })];
  const matrix = fin.buildP12Matrix(sales, expenses, categorias, 2026, []);
  const serie = charts.buildMonthlyResultSeries(matrix);
  assert.equal(serie.faturamento[6], 8000, "julho");
  assert.equal(serie.faturamento[5], 8000, "junho");
  assert.equal(serie.custos[6], 3000);
  assert.equal(serie.lucro[6], 5000, "lucro de julho = 8000 − 3000");
  assert.equal(serie.lastActiveMonth, 6, "não desenha meses futuros vazios");
});

test("mapa de calor: calendário certo, melhor dia e total do mês", () => {
  const sales = [
    sale({ id: "a", saleDate: "2026-07-01" }), // quarta
    sale({ id: "b", saleDate: "2026-07-01", items: [{ id: "i", itemType: "CONSULTA", amount: 950, description: "" }] }),
    sale({ id: "c", saleDate: "2026-07-13" }), // segunda
  ];
  const heat = charts.buildCalendarHeat(sales, "2026-07");
  assert.equal(heat.weeks[0][2].dayOfMonth, 1, "01/07/2026 cai na quarta (coluna 3)");
  assert.equal(heat.weeks[0][2].total, 8950, "duas comandas do dia 1 somadas");
  assert.equal(heat.weeks[0][2].count, 2);
  assert.equal(heat.total, 16950);
  assert.equal(heat.bestDay.date, "2026-07-01");
  assert.equal(heat.weeks[0][0].inMonth, false, "seg e ter antes do dia 1 são vazios");
  const dias = heat.weeks.flat().filter((d) => d.inMonth).length;
  assert.equal(dias, 31, "julho tem 31 dias");
});

test("mapa de calor ignora comanda de outro mês", () => {
  const heat = charts.buildCalendarHeat([sale({ saleDate: "2026-06-30" })], "2026-07");
  assert.equal(heat.total, 0);
});

test("força por dia da semana soma no dia certo", () => {
  const pontos = charts.buildWeekdayStrength([
    sale({ saleDate: "2026-07-13" }), // segunda
    sale({ id: "s2", saleDate: "2026-07-20" }), // segunda
    sale({ id: "s3", saleDate: "2026-07-17" }), // sexta
  ]);
  assert.equal(pontos[0].label, "Segunda");
  assert.equal(pontos[0].value, 16000);
  assert.equal(pontos[4].value, 8000, "sexta");
  assert.equal(pontos[6].value, 0, "domingo sem nada");
});

test("donut de pagamento agrupa por forma e ordena do maior", () => {
  const slices = charts.buildPaymentDonut([
    sale({ payments: [{ id: "p", method: "PIX", amount: 5000, installments: 1 }] }),
    sale({
      id: "s2",
      payments: [
        { id: "p1", method: "CARTAO_CREDITO", amount: 6000, installments: 6 },
        { id: "p2", method: "PIX", amount: 2000, installments: 1 },
      ],
    }),
  ]);
  assert.equal(slices[0].value, 7000, "PIX na frente (5000+2000)");
  assert.equal(slices[1].value, 6000);
});

test("donut de grupos usa competência do vencimento e deixa a obra de fora", () => {
  const slices = charts.buildExpenseGroupDonut(
    [
      despesa({ amount: 20883, categoryRef: "cat-aluguel" }),
      despesa({ id: "e2", amount: 30000, categoryRef: "cat-salarios" }),
      despesa({ id: "e3", amount: 9000, categoryRef: "cat-obra" }), // CAPEX fora
      despesa({ id: "e4", amount: 500, categoryRef: "cat-insumos", dueDate: "2026-06-10" }), // outro mês
    ],
    categorias,
    "2026-07",
  );
  assert.equal(slices.length, 2);
  assert.equal(slices[0].label, "Mão de Obra", "sem o número da P12 na frente");
  assert.equal(slices[0].value, 30000);
  assert.equal(slices[1].value, 20883);
});

test("ranking de categorias agrupa o rabo em 'Outras'", () => {
  const muitas = Array.from({ length: 10 }, (_, index) =>
    despesa({ id: `e${index}`, amount: 100 * (index + 1), categoryRef: "cat-insumos" }),
  );
  // 10 despesas na mesma categoria = 1 linha só; adiciona 9 categorias fake
  const extraCats = Array.from({ length: 9 }, (_, index) => ({
    id: `cat-x${index}`, name: `Categoria ${index}`, groupKey: "CUSTO_VARIAVEL", sortOrder: 10 + index, isCapex: false, active: true,
  }));
  const extras = extraCats.map((cat, index) => despesa({ id: `x${index}`, amount: 50 + index, categoryRef: cat.id }));
  const rank = charts.buildExpenseCategoryRank(muitas.concat(extras), categorias.concat(extraCats), "2026-07", 3);
  assert.equal(rank.length, 4, "top 3 + Outras");
  assert.equal(rank[0].label, "Insumos");
  assert.equal(rank.at(-1).label, "Outras");
  const somaTotal = rank.reduce((sum, p) => sum + p.value, 0);
  const esperado = muitas.concat(extras).reduce((sum, e) => sum + e.amount, 0);
  assert.equal(somaTotal, esperado, "nada some no agrupamento");
});

test("ticket médio mensal divide pelo número de comandas do mês", () => {
  const pontos = charts.buildTicketMonthly(
    [
      sale({ saleDate: "2026-07-01" }),
      sale({ id: "s2", saleDate: "2026-07-20", items: [{ id: "i", itemType: "CONSULTA", amount: 2000, description: "" }] }),
      sale({ id: "s3", saleDate: "2025-07-20" }), // outro ano, fora
    ],
    2026,
  );
  assert.equal(pontos[6].value, 5000, "(8000+2000)/2");
  assert.equal(pontos[5].value, 0, "junho sem comanda");
});

test("funil de prescrições conta cada desfecho e esconde etapa zerada", () => {
  const funil = charts.buildPrescriptionFunnel([
    { status: "PRESCRIBED", soldAmount: 0 },
    { status: "PRESCRIBED", soldAmount: 0 },
    { status: "CLOSED_FULL", soldAmount: 9000 },
    { status: "NOT_CLOSED", soldAmount: 0 },
  ]);
  assert.equal(
    funil.map((step) => `${step.label}:${step.value}`).join(" | "),
    "Prescrito (aguardando):2 | Fechou completo:1 | Não fechou:1",
  );
});

test("moneyCompact e niceCeil deixam o eixo legível", () => {
  assert.equal(charts.moneyCompact(204562), "R$ 204,6 mil");
  assert.equal(charts.moneyCompact(1250000), "R$ 1,3 mi");
  assert.equal(charts.moneyCompact(-500), "−R$ 500");
  assert.equal(charts.niceCeil(204562), 250000);
  assert.equal(charts.niceCeil(8000), 10000);
  assert.equal(charts.niceCeil(0), 1);
});
