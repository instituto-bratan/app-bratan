// GESTÃO MENSAL + RELATÓRIOS PARA A CONTABILIDADE (03/08/2026).
// A planilha do Coordenador Financeiro virou tela: os números têm que sair dos
// lançamentos, sem nada digitado, e os CSVs têm que fechar com os totais.
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
  todayISO: () => "2026-08-03",
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

const CATS = [
  { id: "cat-aluguel", groupKey: "CUSTO_FIXO", name: "Aluguel", sortOrder: 1, isCapex: false, active: true },
  { id: "cat-salarios", groupKey: "MAO_DE_OBRA", name: "Salários", sortOrder: 2, isCapex: false, active: true },
  { id: "cat-insumos", groupKey: "CUSTO_VARIAVEL", name: "Insumos", sortOrder: 3, isCapex: false, active: true },
  { id: "cat-prov", groupKey: "POUPANCA", name: "Provisão 13º", sortOrder: 4, isCapex: false, active: true },
  { id: "cat-obra", groupKey: "CUSTO_VARIAVEL", name: "Obras", sortOrder: 5, isCapex: true, active: true },
];

function venda(dia, itens, pagamentos, paciente = "Paciente X") {
  return {
    id: `s-${dia}-${paciente}`,
    saleDate: dia,
    patientName: paciente,
    crmContactRef: "",
    notes: "",
    items: itens.map((item, index) => ({ id: `i${index}`, itemType: item.tipo, amount: item.valor, description: item.desc ?? "" })),
    payments: pagamentos.map((pag, index) => ({ id: `p${index}`, method: pag.metodo, amount: pag.valor, installments: 1 })),
    createdAt: `${dia}T10:00:00.000Z`,
  };
}

function despesa(dia, valor, cat, extra = {}) {
  return {
    id: `e-${dia}-${cat}-${valor}`,
    description: extra.description ?? "Conta",
    categoryRef: cat,
    amount: valor,
    dueDate: dia,
    paidAt: extra.paidAt ?? null,
    method: extra.method ?? "BOLETO",
    supplier: extra.supplier ?? "",
    installmentNum: null,
    installmentTotal: null,
    documentNote: "",
    isCapex: cat === "cat-obra",
    notes: "",
    createdAt: `${dia}T10:00:00.000Z`,
    recorrencia: null,
  };
}

const VENDAS = [
  venda("2026-07-05", [{ tipo: "TRATAMENTO", valor: 8000 }, { tipo: "CONSULTA", valor: 500 }], [{ metodo: "PIX", valor: 8500 }], "Ana"),
  venda("2026-07-18", [{ tipo: "TRATAMENTO", valor: 12000 }], [{ metodo: "CARTAO_CREDITO", valor: 12000 }], "Bruno"),
  venda("2026-07-22", [{ tipo: "BIOIMPEDANCIA", valor: 200 }, { tipo: "NUTRICIONISTA", valor: 300 }], [{ metodo: "DINHEIRO", valor: 500 }], "Carla"),
  venda("2026-06-10", [{ tipo: "TRATAMENTO", valor: 10000 }], [{ metodo: "PIX", valor: 10000 }], "Junho"),
];
const DESPESAS = [
  despesa("2026-07-05", 20000, "cat-aluguel", { paidAt: "2026-07-05", supplier: "Imobiliária" }),
  despesa("2026-07-28", 15000, "cat-salarios", { paidAt: "2026-07-28" }),
  despesa("2026-07-15", 3000, "cat-insumos"),
  despesa("2026-07-31", 1500, "cat-prov"),
  despesa("2026-07-20", 9000, "cat-obra", { paidAt: "2026-07-20", description: "Marcenaria" }),
  despesa("2026-06-05", 18000, "cat-aluguel", { paidAt: "2026-06-05" }),
];

test("indicadores do mês saem dos lançamentos (nada digitado)", () => {
  const g = fin.buildGestaoMensal(VENDAS, DESPESAS, CATS, "2026-07", []);
  assert.equal(g.faturamento, 21000, "8.500 + 12.000 + 500 (junho não entra)");
  assert.equal(g.entradasTratamento, 20000);
  assert.equal(g.entradasConsultas, 700, "consulta 500 + bioimpedância 200");
  assert.equal(g.outrasEntradas, 300, "nutricionista");
  assert.equal(g.custosFixos, 20000);
  assert.equal(g.folhaMeritocracia, 15000);
  assert.equal(g.custosVariaveis, 3000, "a obra NÃO entra em custo variável (é CAPEX)");
  assert.equal(g.provisoes, 1500);
  assert.equal(g.custosTotais, 39500);
  assert.equal(g.obra, 9000, "obra fica separada, fora do lucro");
  assert.equal(g.lucroLiquido, -18500, "21.000 − 39.500");
  assert.equal(g.comandas, 3);
  assert.equal(g.ticketMedio, 7000);
});

test("faturamento do indicador = soma dos itens das comandas do mês (fecha com a P12)", () => {
  const g = fin.buildGestaoMensal(VENDAS, DESPESAS, CATS, "2026-07", []);
  const matrix = fin.buildP12Matrix(VENDAS, DESPESAS, CATS, 2026, [], []);
  assert.equal(g.faturamento, Math.round((matrix.revenueMonths[6]?.total ?? 0) * 100) / 100, "mesma verdade da P12");
});

test("margem e crediário: crediário aparece separado e NÃO entra no lucro", () => {
  const g = fin.buildGestaoMensal(VENDAS, DESPESAS, CATS, "2026-07", [
    { id: "crediario-lucro-2026-07", monthRef: "2026-07", amount: 31250, note: "", includedAt: "" },
  ]);
  assert.equal(g.crediario, 31250, "visível como controle interno");
  assert.equal(g.lucroLiquido, -18500, "o lucro do indicador NÃO muda com o crediário");
  const positivo = fin.buildGestaoMensal(
    [venda("2026-09-01", [{ tipo: "TRATAMENTO", valor: 100000 }], [{ metodo: "PIX", valor: 100000 }])],
    [despesa("2026-09-10", 60000, "cat-aluguel")],
    CATS, "2026-09", [],
  );
  assert.equal(positivo.lucroLiquido, 40000);
  assert.equal(positivo.margem, 40, "40% de margem");
});

test("comparativo: variação em R$ e %, e seta certa (custo subir é ruim)", () => {
  const anterior = fin.buildGestaoMensal(VENDAS, DESPESAS, CATS, "2026-06", []);
  const atual = fin.buildGestaoMensal(VENDAS, DESPESAS, CATS, "2026-07", []);
  const linhas = fin.buildGestaoComparativo(anterior, atual);
  const faturamento = linhas.find((linha) => linha.key === "faturamento");
  assert.equal(faturamento.anterior, 10000);
  assert.equal(faturamento.atual, 21000);
  assert.equal(faturamento.variacao, 11000);
  assert.equal(faturamento.variacaoPercent, 110);
  assert.equal(faturamento.subirEhBom, true);
  const fixos = linhas.find((linha) => linha.key === "custosFixos");
  assert.equal(fixos.subirEhBom, false, "custo subindo é ruim — a seta pinta vermelho");
  const provisoes = linhas.find((linha) => linha.key === "provisoes");
  assert.equal(provisoes.anterior, 0);
  assert.equal(provisoes.variacaoPercent, null, "não existe % contra zero (evita 'Infinity%')");
});

test("evolução de 6 meses termina no mês escolhido e vira o ano corretamente", () => {
  const meses = fin.buildEvolucaoMeses(VENDAS, DESPESAS, CATS, "2026-02", 6, []);
  assert.equal(meses.length, 6);
  assert.deepEqual(meses.map((mes) => mes.monthKey).join(","), "2025-09,2025-10,2025-11,2025-12,2026-01,2026-02");
  const julho = fin.buildEvolucaoMeses(VENDAS, DESPESAS, CATS, "2026-07", 6, []);
  assert.equal(julho[5].monthKey, "2026-07");
  assert.equal(julho[5].faturamento, 21000);
  assert.equal(julho[4].faturamento, 10000, "junho fica na posição anterior");
});

test("previousMonthKey vira o ano em janeiro", () => {
  assert.equal(fin.previousMonthKey("2026-01"), "2025-12");
  assert.equal(fin.previousMonthKey("2026-08"), "2026-07");
  assert.equal(fin.monthKeyLabel("2026-07"), "Julho/2026");
});

test("CSV do faturamento: uma linha por item, total fecha com o indicador", () => {
  const csv = fin.buildFaturamentoCsv(VENDAS, "2026-07");
  const linhas = csv.split("\r\n");
  assert.ok(linhas[0].includes("Data;Paciente"), "cabeçalho com ponto e vírgula (Excel BR)");
  assert.ok(csv.startsWith("﻿"), "BOM UTF-8 para não quebrar acento no Excel");
  const itens = linhas.filter((linha) => /^\d{2}\/\d{2}\/\d{4};/.test(linha));
  assert.equal(itens.length, 5, "2 itens da Ana + 1 do Bruno + 2 da Carla");
  assert.ok(csv.includes("TOTAL DO FATURAMENTO;;;;21000,00"), "total do CSV = faturamento do indicador");
  assert.ok(csv.includes("8000,00"), "vírgula decimal");
  assert.ok(!csv.includes("Junho"), "comanda de junho fora do CSV de julho");
});

test("CSV dos gastos: separa operacional de obra e fecha os três totais", () => {
  const csv = fin.buildGastosCsv(DESPESAS, CATS, "2026-07");
  assert.ok(csv.includes("TOTAL OPERACIONAL (entra no lucro);;;;;;;39500,00"));
  assert.ok(csv.includes("TOTAL OBRA / CAPEX (fora do lucro);;;;;;;9000,00"));
  assert.ok(csv.includes("TOTAL GERAL PAGO/A PAGAR NO MÊS;;;;;;;48500,00"));
  assert.ok(csv.includes("EM ABERTO"), "conta não paga aparece marcada");
  assert.ok(csv.includes("Marcenaria;;Obras;3. Custos Variáveis;SIM"), "obra marcada como CAPEX");
  assert.ok(!csv.includes("2026-06"), "junho não entra");
});

test("CSV resumo: crediário aparece marcado como interno e o lucro bate", () => {
  const gestao = fin.buildGestaoMensal(VENDAS, DESPESAS, CATS, "2026-07", [
    { id: "crediario-lucro-2026-07", monthRef: "2026-07", amount: 31250, note: "", includedAt: "" },
  ]);
  const fechamento = fin.buildFechamentoContabil(VENDAS, DESPESAS, [], "2026-07", []);
  const csv = fin.buildResumoContabilCsv(gestao, fechamento, 18614.54);
  assert.ok(csv.includes("CONTROLE INTERNO — NÃO VAI PARA A CONTABILIDADE"));
  assert.ok(csv.includes("Crediário reconhecido no mês (caixa físico);31250,00"));
  assert.ok(csv.includes("Lucro líquido (faturamento − custos operacionais);-18500,00"));
  assert.ok(csv.includes("Lucro REAL do mês (sobrou no banco, sem crediário);18614,54"));
  assert.ok(csv.includes("Obra (CAPEX) paga no mês;9000,00"));
});

test("CSV escapa ponto e vírgula e aspas em nome de paciente/fornecedor", () => {
  const venda1 = venda("2026-07-09", [{ tipo: "CONSULTA", valor: 500, desc: 'Pacote "premium"; 3 sessões' }], [{ metodo: "PIX", valor: 500 }], "Silva; Maria");
  const csv = fin.buildFaturamentoCsv([venda1], "2026-07");
  assert.ok(csv.includes('"Silva; Maria"'), "nome com ponto e vírgula fica entre aspas");
  assert.ok(csv.includes('"Pacote ""premium""; 3 sessões"'), "aspas internas dobradas");
});

test("PONTE DO LUCRO: o operacional vira o contábil somando poupanças e abatendo obra", () => {
  const gestao = fin.buildGestaoMensal(VENDAS, DESPESAS, CATS, "2026-07", []);
  const moves = [
    { id: "m1", moveDate: "2026-07-10", direction: "SAIDA", amount: 12000, reason: "resgate CDB obra", source: "MANUAL", kind: "USO_OBRA", monthRef: "2026-07", createdAt: "" },
    { id: "m2", moveDate: "2026-07-25", direction: "ENTRADA", amount: 2000, reason: "devolução ao CDB", source: "MANUAL", kind: "DEVOLUCAO", monthRef: "2026-07", createdAt: "" },
  ];
  const fechamento = fin.buildFechamentoContabil(VENDAS, DESPESAS, moves, "2026-07", []);
  const ponte = fin.buildPonteLucro(gestao, fechamento, 18614.54);
  assert.equal(ponte[0].valor, -18500, "começa no lucro operacional");
  assert.equal(ponte[1].valor, 10000, "12.000 resgatados − 2.000 devolvidos");
  assert.equal(ponte[4].valor, 9000, "abate a obra do mês");
  const total = ponte.find((passo) => passo.label.startsWith("= Lucro contábil"));
  // faturamento contábil = 21.000 + 10.000 + 0 + 0 = 31.000; custos do mês = 48.500
  assert.equal(total.valor, -17500);
  const diff = fin.ponteLucroDiferenca(gestao, fechamento);
  assert.equal(diff.operacional, -18500);
  assert.equal(diff.contabil, -17500);
  assert.equal(diff.diferenca, 1000, "10.000 de poupança − 9.000 de obra");
  assert.equal(ponte[ponte.length - 1].valor, 18614.54, "o caixa entra como última linha");
});

test("PONTE: sem lucro real informado, a ponte para no contábil", () => {
  const gestao = fin.buildGestaoMensal(VENDAS, DESPESAS, CATS, "2026-07", []);
  const fechamento = fin.buildFechamentoContabil(VENDAS, DESPESAS, [], "2026-07", []);
  const ponte = fin.buildPonteLucro(gestao, fechamento, null);
  assert.ok(ponte[ponte.length - 1].label.startsWith("= Lucro contábil"));
});
