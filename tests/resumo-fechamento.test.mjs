// RESUMO DE FECHAMENTO (25/08/2026): o documento da reunião de fechamento virou
// tela. Duas regras ditas pelo Lucas e guardadas aqui:
//  1. "é o fechamento na qual não tem nenhum valor do crediário";
//  2. "o lucro sempre vai ser dividido pra Andrya 80% e pro Daniel 20%".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-25", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const rf = loadTsModule("src/features/financeiro/resumoFechamento.ts");

const CAT_IMPOSTOS = "cat-impostos-provisao";
const categorias = [
  { id: "cat-fixo", name: "Fixo", groupKey: "CUSTO_FIXO", isCapex: false },
  { id: CAT_IMPOSTOS, name: "Impostos (provisão)", groupKey: "POUPANCA", isCapex: false },
  { id: "cat-obra", name: "Obra", groupKey: "CUSTO_VARIAVEL", isCapex: true },
];
const venda = (dia, valor, itemType = "TRATAMENTO") => ({
  id: `s-${dia}-${valor}`, saleDate: dia, patientName: "P", crmContactRef: "", notes: "",
  items: [{ id: "i", itemType, amount: valor, description: "" }],
  payments: [{ id: "p", method: "PIX", amount: valor, installments: 1 }], createdAt: `${dia}T10:00:00.000Z`,
});
const conta = (venc, valor, categoryRef) => ({
  id: `e-${venc}-${valor}`, description: "c", amount: valor, dueDate: venc, paidAt: null,
  categoryRef, createdAt: `${venc}T10:00:00.000Z`,
});
const regras = [
  { id: "r1", name: "13º Sócios", monthlyAmount: 7272, sortOrder: 1, active: true },
  { id: "r2", name: "13º Colaboradores", monthlyAmount: 2063, sortOrder: 2, active: true },
  { id: "r3", name: "Desativada", monthlyAmount: 999, sortOrder: 9, active: false },
];
const base = {
  sales: [venda("2026-07-10", 200000), venda("2026-07-20", 117968), venda("2026-06-30", 50000)],
  expenses: [conta("2026-07-05", 100000, "cat-fixo"), conta("2026-07-15", 16813.07, CAT_IMPOSTOS)],
  categories: categorias,
  provisionRules: regras,
  monthKey: "2026-07",
  meta: 350000,
  categoriaImpostos: CAT_IMPOSTOS,
};

test("entrada sem impostos é o faturamento do mês; junho fica fora", () => {
  const r = rf.buildResumoFechamento({ ...base, escrito: rf.fechamentoEscritoVazio });
  assert.equal(r.entradaSemImpostos, 317968, "os R$ 317.968,00 de julho");
  assert.equal(r.entradaTotalComImpostos, 334781.07, "soma a provisão de impostos, como no documento");
  assert.equal(r.impostosProvisionados, 16813.07);
});

test("a meta da equipe compara com a entrada SEM impostos", () => {
  const r = rf.buildResumoFechamento({ ...base, escrito: rf.fechamentoEscritoVazio });
  assert.equal(r.meta, 350000);
  assert.equal(r.faltaParaMeta, 32032);
  assert.equal(r.bateuMeta, false);
});

test("o lucro do mês NÃO leva crediário (regra do Lucas)", () => {
  const comCrediario = { ...base, escrito: rf.fechamentoEscritoVazio };
  const r = rf.buildResumoFechamento(comCrediario);
  // faturamento 317.968 − (fixo 100.000 + provisão 16.813,07) = 201.154,93
  assert.equal(r.saidaTotal, 116813.07);
  assert.equal(r.lucroDoMes, 201154.93);
});

test("a divisão é sempre 80/20 e fecha no total", () => {
  const r = rf.buildResumoFechamento({
    ...base,
    escrito: { ...rf.fechamentoEscritoVazio, lucroDistribuido: "50.000,00" },
  });
  assert.equal(r.lucroDistribuido, 50000);
  assert.equal(r.divisao.andrya, 40000);
  assert.equal(r.divisao.daniel, 10000);
  assert.equal(r.divisao.andrya + r.divisao.daniel, r.lucroDistribuido, "não pode sobrar centavo");
  assert.equal(rf.DIVISAO_LUCRO.andrya, 0.8);
  assert.equal(rf.DIVISAO_LUCRO.daniel, 0.2);
});

test("sem lucro distribuído digitado, usa o lucro do mês", () => {
  const r = rf.buildResumoFechamento({ ...base, escrito: rf.fechamentoEscritoVazio });
  assert.equal(r.lucroDistribuido, r.lucroDoMes);
  assert.equal(r.divisao.andrya + r.divisao.daniel, r.lucroDoMes);
});

test("as provisões saem das regras ativas, em ordem, com os impostos por cima", () => {
  const r = rf.buildResumoFechamento({ ...base, escrito: rf.fechamentoEscritoVazio });
  assert.equal(r.provisoesFixas.map((linha) => linha.nome).join(" | "), "13º Sócios | 13º Colaboradores");
  assert.equal(r.totalProvisoes, 16813.07 + 7272 + 2063);
});

test("saldos digitados em português entram como número e somam", () => {
  const r = rf.buildResumoFechamento({
    ...base,
    escrito: {
      ...rf.fechamentoEscritoVazio,
      saldoItau: "R$ 18.614,54",
      saldoSafra: "23.885,46",
      saldoSantander: "conta inativa",
      dinheiro: "0,00",
    },
  });
  assert.equal(r.saldos.itau, 18614.54);
  assert.equal(r.saldos.safra, 23885.46);
  assert.equal(r.saldos.santander, 0, "texto sem número vira zero, não NaN");
  assert.equal(r.saldos.total, 42500);
});

test("últimos meses: 24 por padrão, do mais novo para o mais velho, virando o ano", () => {
  const meses = rf.ultimosMeses("2026-02", 4);
  assert.equal(meses.join(" | "), "2026-02 | 2026-01 | 2025-12 | 2025-11");
  assert.equal(rf.ultimosMeses("2026-08").length, 24);
  assert.ok(rf.ultimosMeses("2026-08").includes("2025-09"), "alcança o ano passado");
});

test("a linha IMPOSTOS lê a categoria de poupança certa (a do documento)", () => {
  // Errei isso primeiro: usei "cat-impostos-provisao", que não existe na
  // produção — a provisão do mês mora em "cat-poup-impostos-mensais", onde
  // julho tem exatamente os R$ 16.813,07 do documento. Com o ref errado a
  // linha IMPOSTOS aparecia zerada e ninguém notaria.
  assert.equal(rf.CATEGORIA_IMPOSTOS_PROVISAO, "cat-poup-impostos-mensais");
  const r = rf.buildResumoFechamento({
    ...base,
    expenses: [conta("2026-07-15", 16813.07, rf.CATEGORIA_IMPOSTOS_PROVISAO)],
    categories: [...categorias, { id: rf.CATEGORIA_IMPOSTOS_PROVISAO, name: "Impostos Mensais (provisão)", groupKey: "POUPANCA", isCapex: false }],
    categoriaImpostos: rf.CATEGORIA_IMPOSTOS_PROVISAO,
    escrito: rf.fechamentoEscritoVazio,
  });
  assert.equal(r.impostosProvisionados, 16813.07);
});

test("julho/2026 de verdade: os números do documento saem dos lançamentos", () => {
  // Conferido na produção em 25/08/2026: faturamento 317.968,00 e saída
  // operacional 309.359,24 — os mesmos do papel. O documento traz
  // "ENTRADA TOTAL + IMPOSTOS PROV: 328.892,08" porque, em 03/08, a provisão
  // de imposto de julho ainda era 10.924,08 (hoje é 16.813,07; a diferença
  // virou o lançamento "Ajuste conferência P12 06/2026", de 28/06).
  const cat = rf.CATEGORIA_IMPOSTOS_PROVISAO;
  const r = rf.buildResumoFechamento({
    sales: [venda("2026-07-10", 317968)],
    expenses: [conta("2026-07-05", 292546.17, "cat-fixo"), conta("2026-07-20", 16813.07, cat)],
    categories: [...categorias, { id: cat, name: "Impostos Mensais (provisão)", groupKey: "POUPANCA", isCapex: false }],
    provisionRules: [
      { id: "p1", name: "13º Sócios", monthlyAmount: 7272, sortOrder: 1, active: true },
      { id: "p2", name: "13º Colaboradores", monthlyAmount: 2063, sortOrder: 2, active: true },
      { id: "p3", name: "Rescisões", monthlyAmount: 1000, sortOrder: 3, active: true },
      { id: "p4", name: "Férias + 1/3 colaboradores", monthlyAmount: 2743, sortOrder: 4, active: true },
      { id: "p5", name: "Urgências", monthlyAmount: 500, sortOrder: 5, active: true },
      { id: "p6", name: "Início de ano", monthlyAmount: 1000, sortOrder: 6, active: true },
      { id: "p7", name: "Festa de final de ano", monthlyAmount: 909.09, sortOrder: 7, active: true },
    ],
    monthKey: "2026-07",
    meta: 350000,
    categoriaImpostos: cat,
    escrito: { ...rf.fechamentoEscritoVazio, saldoItau: "R$ 18.614,54", saldoSafra: "23.885,46" },
  });
  assert.equal(r.entradaSemImpostos, 317968, "entrada SEM impostos do mês");
  assert.equal(r.saidaTotal, 309359.24, "saída total do documento");
  assert.equal(r.impostosProvisionados, 16813.07);
  assert.equal(r.totalProvisoes, 32300.16, "impostos + as 7 regras do documento");
  assert.equal(r.lucroDoMes, 8608.76, "o lucro que a produção mostra em julho");
  assert.equal(r.saldos.total, 42500, "18.614,54 + 23.885,46, com o Santander inativo valendo zero");
  assert.equal(r.divisao.andrya + r.divisao.daniel, r.lucroDistribuido, "a divisão não perde centavo");
  assert.equal(r.divisao.andrya, 6887.01);
  assert.equal(r.divisao.daniel, 1721.75);
});
