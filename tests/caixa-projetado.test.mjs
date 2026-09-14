// CAIXA PROJETADO (14/09/2026): semana a semana, com entradas certas (cartão já
// vendido), entradas estimadas (ritmo de PIX/dinheiro/débito) e saídas (contas,
// mensais ainda não lançadas, transferências) — e a opção de antecipar o cartão.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-09-14", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const caixa = loadTsModule("src/features/financeiro/caixaProjetado.ts");
const plain = (v) => JSON.parse(JSON.stringify(v));

const venda = (id, saleDate, payments) => ({
  id, saleDate, patientName: id, crmContactRef: "", notes: "", createdAt: `${saleDate}T10:00:00.000Z`, items: [],
  payments: payments.map((p, i) => ({ id: `${id}-${i}`, method: p.method, amount: p.amount, installments: p.installments ?? 1, cardMachine: "ITAU" })),
});
const conta = (id, valor, dueDate, extra = {}) => ({
  id, description: id, amount: valor, dueDate, paidAt: null, categoryRef: "cat-fixo", method: "BOLETO", supplier: "",
  installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "2026-09-01T10:00:00.000Z", ...extra,
});

const HOJE = "2026-09-14"; // segunda-feira

test("semanas de 7 dias a partir de hoje, cartão cai no dia previsto (líquido) e conta vencida cai hoje", () => {
  const sales = [venda("cartao", "2026-08-25", [{ method: "CARTAO_CREDITO", amount: 1000, installments: 1 }])];
  const expenses = [conta("aluguel", 500, "2026-09-16"), conta("atrasada", 200, "2026-09-10"), conta("longe", 999, "2026-12-01")];
  const c = caixa.buildCaixaProjetado({ sales, expenses, hoje: HOJE, semanas: 4, saldoInicial: 1000 });
  assert.equal(c.semanas.length, 4);
  assert.equal(c.semanas[0].inicio, "2026-09-14");
  assert.equal(c.semanas[0].fim, "2026-09-20");
  assert.equal(c.semanas[0].label, "14/09 a 20/09");
  // 25/08 + 31 dias = 25/09 (sexta), na semana 2; taxa à vista do acordo Q-7594851 (vigente em 25/08): 1,40%.
  const cartao = c.semanas.flatMap((s) => s.eventos).find((e) => e.tipo === "CARTAO");
  assert.equal(cartao.dia, "2026-09-25");
  assert.equal(cartao.valor, 986, "1.000 − 1,40% do acordo de agosto");
  assert.equal(c.semanas[1].entradasCertas, 986);
  assert.equal(c.semanas[0].saidas, 700, "aluguel de 16/09 + a vencida de 10/09 cai hoje");
  const vencida = c.semanas[0].eventos.find((e) => e.tipo === "CONTA_VENCIDA");
  assert.match(vencida.label, /vencida em 10\/09/);
  assert.equal(c.semanas[0].saldoInicio, 1000);
  assert.equal(c.semanas[0].saldoFim, 300, "sem vendas recentes o ritmo é zero: 1.000 − 700");
  assert.equal(c.semanas[1].saldoFim, 1286);
  assert.equal(c.totais.saidas, 700, "a conta de dezembro está fora do horizonte");
  assert.equal(c.ritmoDiario, 0);
  assert.equal(c.saldoInicial, 1000);
});

test("ritmo estimado: média por dia útil de PIX/dinheiro/débito dos últimos 28 dias, com faixa de incerteza", () => {
  // 28 dias antes de 14/09 = 17/08 a 13/09: 19 dias úteis (07/09 é feriado).
  const sales = [
    venda("pix", "2026-09-10", [{ method: "PIX", amount: 10000 }]),
    venda("dinheiro", "2026-09-01", [{ method: "DINHEIRO", amount: 10000 }]),
    venda("credito-nao-conta", "2026-09-02", [{ method: "CARTAO_CREDITO", amount: 50000, installments: 6 }]),
    venda("antiga", "2026-07-01", [{ method: "PIX", amount: 99999 }]),
  ];
  const c = caixa.buildCaixaProjetado({ sales, expenses: [], hoje: HOJE, semanas: 2, saldoInicial: 0 });
  // PIX de 10.000 paga 0,6% (R$ 60, abaixo do teto de R$ 150) → 9.940; dinheiro 10.000 → 19.940 ÷ 19 dias úteis = 1.049,47.
  assert.equal(c.ritmoDiario, 1049.47);
  // Semana 1: dias úteis depois de hoje = 15,16,17,18 (4 dias).
  assert.equal(c.semanas[0].entradasEstimadas, 4197.88);
  assert.equal(c.semanas[0].saldoMin, 2728.62, "35% abaixo");
  assert.equal(c.semanas[0].saldoMax, 5667.14, "35% acima");
  assert.equal(c.semanas[0].eventos.at(-1).tipo, "ESTIMADO");
  // Semana 2 (21 a 27/09): 5 dias úteis.
  assert.equal(c.semanas[1].entradasEstimadas, 5247.35);
  assert.match(c.leitura, /no ritmo atual/);
});

test("conta mensal ainda não lançada no mês seguinte entra como saída prevista; se já existe, não duplica", () => {
  const expenses = [
    conta("internet", 300, "2026-09-05", { paidAt: "2026-09-05", recorrencia: "MENSAL" }),
    conta("energia", 800, "2026-09-08", { paidAt: "2026-09-08", recorrencia: "MENSAL" }),
    conta("energia", 850, "2026-10-08", { recorrencia: "MENSAL" }),
  ];
  const c = caixa.buildCaixaProjetado({ sales: [], expenses, hoje: HOJE, semanas: 5, saldoInicial: 5000 });
  const mensais = c.semanas.flatMap((s) => s.eventos).filter((e) => e.tipo === "CONTA_MENSAL");
  assert.deepEqual(plain(mensais.map((e) => [e.dia, e.valor])), [["2026-10-05", -300]], "internet projetada; energia de outubro já existe");
  const energia = c.semanas.flatMap((s) => s.eventos).find((e) => e.tipo === "CONTA" && e.label === "energia");
  assert.equal(energia.dia, "2026-10-08");
  assert.equal(c.totais.saidas, 1150);
});

test("transferências previstas, piso e ponto de aperto", () => {
  const expenses = [conta("folha", 4000, "2026-09-30")];
  const c = caixa.buildCaixaProjetado({
    sales: [], expenses, hoje: HOJE, semanas: 4, saldoInicial: 3000, piso: 1000,
    transferenciasPrevistas: [{ dia: "2026-09-25", label: "Sócios (dia 25)", valor: 1500 }, { dia: "2026-08-25", label: "passado", valor: 999 }],
  });
  assert.equal(c.semanas[1].eventos.some((e) => e.tipo === "TRANSFERENCIA" && e.valor === -1500), true);
  assert.equal(c.semanas[2].saldoFim, -2500, "3.000 − 1.500 − 4.000");
  assert.equal(c.pontoDeAperto.indice, 3);
  assert.equal(c.pontoDeAperto.aperto, true);
  assert.match(c.leitura, /ponto de aperto é a semana de 28\/09 a 04\/10/);
  assert.match(c.leitura, /abaixo do piso de R\$\s1\.000/);
});

test("com antecipação: o cartão a prazo cai no próximo dia útil, líquido do custo TAD", () => {
  // Venda em 10/09, 3x: liquida 11/10, 11/11, 11/12 (ajustados ao dia útil); só a 1ª cai dentro de 6 semanas (até 25/10).
  const sales = [venda("v", "2026-09-10", [{ method: "CARTAO_CREDITO", amount: 3000, installments: 3 }])];
  const sem = caixa.buildCaixaProjetado({ sales, expenses: [], hoje: HOJE, semanas: 6, saldoInicial: 0 });
  const com = caixa.buildCaixaProjetado({ sales, expenses: [], hoje: HOJE, semanas: 6, saldoInicial: 0, comAntecipacao: true, selicAnual: 0.15 });
  const semCartao = sem.semanas.flatMap((s) => s.eventos).filter((e) => e.tipo === "CARTAO");
  assert.equal(semCartao.length, 1, "só a 1ª parcela cai dentro das 6 semanas");
  assert.equal(semCartao[0].dia, "2026-10-13", "11/10 é domingo, 12/10 feriado → 13/10");
  const comCartao = com.semanas.flatMap((s) => s.eventos).filter((e) => e.tipo === "CARTAO");
  assert.equal(comCartao.length, 3, "antecipando, as três parcelas caem amanhã");
  assert.equal(comCartao[0].dia, "2026-09-15");
  assert.ok(comCartao.every((e) => e.custo > 0));
  assert.ok(com.totais.custoAntecipacao > 0);
  assert.ok(com.totais.entradasCertas > sem.totais.entradasCertas, "mais dinheiro dentro do horizonte, mas com custo");
  assert.match(com.leitura, /Antecipar o cartão custa/);
});

test("sem saldo do banco a leitura avisa que a curva é só a variação", () => {
  const c = caixa.buildCaixaProjetado({ sales: [], expenses: [], hoje: HOJE, semanas: 2 });
  assert.equal(c.saldoInicial, null);
  assert.match(c.leitura, /Sem o saldo do banco/);
  assert.equal(caixa.mesmoDiaMesSeguinte("2026-01-31"), "2026-02-28");
  assert.equal(caixa.mesmoDiaMesSeguinte("2026-12-10"), "2027-01-10");
});
