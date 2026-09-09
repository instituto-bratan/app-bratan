// EXPORTAÇÕES PARA A CONTABILIDADE (09/09/2026): PDCA só com tratamentos,
// controle de impostos por classe e entrada poupança × saída obra — no formato
// das planilhas antigas — e o PDF em formato de planilha (mesmos números).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-09-09", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request === "@/lib/remoteData") return {};
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise,
    TextEncoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, Blob, URL, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const pdca = loadTsModule("src/features/financeiro/pdcaData.ts");
const exp = loadTsModule("src/features/financeiro/exportContabilidade.ts");
const imp = loadTsModule("src/lib/planilhaImpressao.ts");
const j = (v) => JSON.parse(JSON.stringify(v));

let seq = 0;
const venda = (dia, nome, itens) => ({
  id: `s-${(seq += 1)}`, saleDate: dia, patientName: nome, crmContactRef: "", notes: "",
  items: itens.map((i, k) => ({ id: `i${k}`, itemType: i[0], amount: i[1], description: i[2] || "" })),
  payments: [{ id: "p", method: "PIX", amount: itens.reduce((s, i) => s + i[1], 0), installments: 1 }],
  createdAt: `${dia}T10:00:00.000Z`,
});
const MES = "2026-09";
const vendas = [
  venda("2026-09-02", "Ana Aderiu", [["CONSULTA", 1000], ["TRATAMENTO", 8000, "Plano de acompanhamento"]]),
  venda("2026-09-03", "Bruno Não", [["CONSULTA", 1300]]),
  venda("2026-09-04", "Carla Sinal", [["SINAL", 500]]),
  venda("2026-09-05", "Duda Continuidade", [["TRATAMENTO", 5427, "Tratamento hormonal"]]),
  venda("2026-09-06", "Eva Tirzepatida", [["MEDICACAO", 3170, "Tirzepatida 3 frascos"]]),
];

test("PDCA para a contabilidade: valor é SÓ o tratamento — consulta, sinal e medicação avulsa ficam fora", () => {
  const resumo = pdca.buildPdca(vendas, MES, new Map());
  const dados = { pdca: resumo, sales: vendas, monthKey: MES };
  const consultas = exp.abaPdcaConsultas(dados);
  assert.deepEqual(j(consultas.rows.map((l) => [l[0], l[2], l[4]])), [["Ana Aderiu", "ADERIU TRATAMENTO", 8000], ["Bruno Não", "NÃO ADERIU TRATAMENTO", 0]], "a consulta de 1.000 e 1.300 não soma; o sinal nem aparece");
  assert.equal(consultas.totalRow[4], 8000);
  assert.ok(String(consultas.rows[0][3]).includes("Plano de acompanhamento"), "diz qual tratamento foi aderido");
  const continuidade = exp.abaPdcaContinuidade(dados);
  assert.deepEqual(j(continuidade.rows.map((l) => [l[0], l[3]])), [["Duda Continuidade", 5427]], "tratamento sem consulta (abaixo do plano) vai para continuidade; tirzepatida avulsa fica fora");
  assert.equal(continuidade.totalRow[3], 5427);
  const res = exp.abaPdcaResumo(dados);
  assert.equal(res.totalRow[2], 13427, "total do mês = 8.000 + 5.427");
  assert.ok(res.rows.some((l) => l[0].startsWith("Porcentagem") && l[1] === "50,0%"), "1 de 2 aderiu");
  assert.ok(res.rows.some((l) => l[0].startsWith("Sinais aguardando") && l[1] === 1));
  assert.equal(exp.abasPdcaContabilidade(dados).length, 3);
});

const nota = (id, tipo, numero, valor, emissao, comanda) => ({ id, saleRef: null, invoiceType: tipo, invoiceNumber: numero, issueDate: emissao, comandaDate: comanda, patientName: "X", amount: valor, notes: "", createdAt: "" });
const notas = [
  nota("n1", "CONSULTA", "5927", 200, "2026-09-13", "2026-09-01"),
  nota("n2", "CONSULTA", "5930", 1150, "2026-09-25", "2026-09-03"),
  nota("n3", "BIOIMPEDANCIA", "5928", 200, "2026-09-12", "2026-09-01"),
  nota("n4", "TRATAMENTO", "5929", 7510, "2026-09-25", "2026-09-03"),
  nota("n5", "CONSULTA", "5800", 900, "2026-08-30", "2026-08-30"),
];

test("CONTROLE DE IMPOSTOS · CONSULTA: colunas da planilha antiga, 13,33%, total e subtotais mensal × trimestral", () => {
  const aba = exp.abaControleImpostos(notas, "CONSULTA", MES);
  assert.deepEqual(j(aba.columns.map((c) => c.header)), ["DATA EMISSÃO", "DATA DA COMANDA", "Nº NOTA", "VALOR NOTA", "ISS 2%", "PIS 0,65%", "COFINS 3%", "IRPJ 4,8%", "CSLL 2,88%", "13,33% IMP TOTAL"]);
  assert.equal(aba.rows.length, 2, "só as consultas de setembro (bio é tratamento; agosto fica fora)");
  // 200 → 4,00 · 1,30 · 6,00 · 9,60 · 5,76 (mesmos números da planilha antiga)
  assert.deepEqual(j(aba.rows[0]), ["2026-09-13", "2026-09-01", "5927", 200, 4, 1.3, 6, 9.6, 5.76, 26.66]);
  assert.deepEqual(j(aba.totalRow.slice(3)), [1350, 27, 8.78, 40.5, 64.8, 38.88, 179.96]);
  assert.match(aba.subtitle, /IMP MENSAL .*R\$\s?76,28/, "ISS+PIS+COFINS");
  assert.match(aba.subtitle, /IMP TRIMESTRAL .*R\$\s?103,68/, "IRPJ+CSLL");
});

test("CONTROLE DE IMPOSTOS · TRATAMENTO: bio e tratamento juntos a 7,93%", () => {
  const aba = exp.abaControleImpostos(notas, "PROCEDIMENTO", MES);
  assert.equal(aba.name, "IMPOSTOS TRATAMENTO");
  assert.deepEqual(j(aba.columns.slice(7).map((c) => c.header)), ["IRPJ 1,2%", "CSLL 1,08%", "7,93% IMP TOTAL"]);
  assert.deepEqual(j(aba.rows.map((l) => l[2])), ["5928", "5929"], "ordem por emissão");
  // 7.510 → 150,20 · 48,82 · 225,30 · 90,12 · 81,11 (planilha antiga)
  assert.deepEqual(j(aba.rows[1].slice(3, 9)), [7510, 150.2, 48.82, 225.3, 90.12, 81.11]);
  assert.equal(aba.totalRow[3], 7710);
});

test("ENTRADA POUPANÇA × SAÍDA OBRA lado a lado, com TOTAL de cada coluna", () => {
  const mv = (id, dia, direction, amount, kind, reason = "") => ({ id, moveDate: dia, direction, amount, reason, source: "MANUAL", kind, monthRef: dia.slice(0, 7), createdAt: "" });
  const moves = [
    mv("a", "2026-09-01", "ENTRADA", 15000.8, "APORTE"),
    mv("b", "2026-09-18", "ENTRADA", 40001.64, "APORTE"),
    mv("c", "2026-09-29", "SAIDA", 71507.42, "USO_OBRA"),
    mv("d", "2026-09-30", "ENTRADA", 230.17, "RENDIMENTO", "Rendimento"),
    mv("e", "2026-08-30", "ENTRADA", 999, "APORTE"),
  ];
  const aba = exp.abaEntradaPoupanca(moves, MES);
  assert.deepEqual(j(aba.columns.map((c) => c.header)), ["ENTRADA POUPANÇA · DATA", "VALOR", "", "SAÍDA OBRA · DATA", "VALOR"], "sem 'outras saídas' quando não há");
  assert.equal(aba.rows.length, 3);
  assert.deepEqual(j(aba.rows[0]), ["2026-09-01", 15000.8, "", "2026-09-29", 71507.42]);
  assert.deepEqual(j(aba.rows[2].slice(0, 2)), ["2026-09-30", 230.17]);
  assert.equal(aba.rows[2][3], "", "coluna da obra acaba antes");
  assert.deepEqual(j(aba.totalRow), ["TOTAL", 55232.61, "", "TOTAL", 71507.42]);
  const comOutras = exp.abaEntradaPoupanca([...moves, mv("f", "2026-09-10", "SAIDA", 500, "EMPRESTIMO", "Cobriu conta de luz")], MES);
  assert.equal(comOutras.columns.length, 9, "aparece o bloco OUTRAS SAÍDAS");
  assert.equal(comOutras.totalRow[7], 500);
});

test("PDF em formato de planilha: mesmos números, moeda e data em pt-BR, linha de total", () => {
  const aba = exp.abaControleImpostos(notas, "CONSULTA", MES);
  const html = imp.htmlDasPlanilhas("teste", [aba]);
  assert.ok(html.includes("<th>DATA EMISSÃO</th>"));
  assert.ok(html.includes("13/09/2026"), "data brasileira");
  assert.ok(/R\$\s?1\.150,00/.test(html), "moeda formatada");
  assert.ok(html.includes('<tr class="total">') && /TOTAL DE IMPOSTOS/.test(html));
  assert.ok(html.includes("size: A4 landscape"));
  const vazia = imp.htmlDasPlanilhas("x", [exp.abaControleImpostos([], "CONSULTA", MES)]);
  assert.ok(vazia.includes("Sem lançamentos no período."));
});

test("P12 para mandar: faturamento, grupos com categorias, total operacional, obra fora e lucro na linha final — igual à tela", () => {
  const meses = (valores) => Array.from({ length: 12 }, (_, i) => ({ total: valores[i] || 0, count: valores[i] ? 1 : 0 }));
  const nums = (valores) => Array.from({ length: 12 }, (_, i) => valores[i] || 0);
  const cat = (id, name, groupKey, isCapex = false) => ({ id, name, groupKey, sortOrder: 1, isCapex, active: true });
  const matrix = {
    year: 2026,
    revenueMonths: meses({ 7: 300000, 8: 120000 }), revenueYear: 420000,
    savingsInMonths: nums({ 7: 5230.17 }), savingsInYear: 5230.17,
    financialIncomeMonths: nums({ 7: 230.17 }), financialIncomeYear: 230.17,
    groups: [
      { groupKey: "FIXAS", label: "Despesas fixas", months: meses({ 7: 90000, 8: 40000 }), yearTotal: 130000, rows: [
        { category: cat("c1", "Aluguel", "FIXAS"), months: meses({ 7: 50000, 8: 25000 }), yearTotal: 75000 },
        { category: cat("c2", "Energia", "FIXAS"), months: meses({ 7: 40000, 8: 15000 }), yearTotal: 55000 },
        { category: cat("c3", "Categoria vazia", "FIXAS"), months: meses({}), yearTotal: 0 },
      ] },
    ],
    totalExpensesMonths: nums({ 7: 90000, 8: 40000 }), totalExpensesYear: 130000,
    capexRows: [], capexMonths: nums({ 7: 54005.45 }), capexYear: 54005.45,
    crediarioMonths: nums({}), crediarioYear: 0,
    profitMonths: nums({ 7: 210230.17, 8: 80000 }), profitYear: 290230.17,
  };
  const aba = exp.abaP12(matrix, { meses: null, soComValor: true });
  assert.equal(aba.columns.length, 14, "categoria + 12 meses + anual");
  assert.deepEqual(j(aba.rows.map((l) => l[0].trim())), ["FATURAMENTO BRUTO", "Rendimento financeiro (juros)", "DESPESAS FIXAS", "Aluguel", "Energia", "TOTAL DESPESAS OPERACIONAIS", "Obra / investimento (pago pelo cofre — fora do lucro)", "Aportes / entradas no cofre (tesouraria — fora do lucro)"], "categoria vazia escondida; sem crediário");
  assert.equal(aba.rows[0][8], 300000, "agosto na coluna certa (índice 7 → coluna 8)");
  assert.equal(aba.rows[0][13], 420000);
  assert.equal(aba.rows[7][8], 5000, "aportes = entradas no cofre − juros");
  assert.equal(aba.totalRow[0], "LUCRO OPERACIONAL DO MÊS");
  assert.equal(aba.totalRow[13], 290230.17);
  const umMes = exp.abaP12(matrix, { meses: [7], soComValor: false });
  assert.deepEqual(j(umMes.columns.map((c) => c.header)), ["CATEGORIA", "AGO/2026"], "por mês NÃO tem coluna anual (Lucas, 09/09)");
  assert.equal(umMes.rows.length, umMes.rows.filter((l) => l.length === 2).length, "todas as linhas só com categoria + mês");
  assert.equal(umMes.totalRow.length, 2);
  assert.equal(umMes.totalRow[1], 210230.17, "lucro do mês");
  assert.ok(umMes.rows.some((l) => l[0].trim() === "Categoria vazia"), "com soComValor=false a vazia aparece");
  const mesSemAluguel = exp.abaP12({ ...matrix, groups: [{ ...matrix.groups[0], rows: [matrix.groups[0].rows[0], { category: cat("c9", "Só em agosto", "FIXAS"), months: meses({ 7: 10 }), yearTotal: 10 }] }] }, { meses: [8], soComValor: true });
  assert.ok(!mesSemAluguel.rows.some((l) => l[0].trim() === "Só em agosto"), "no mês, categoria sem valor no mês fica de fora mesmo tendo valor no ano");
  assert.match(umMes.title, /AGO\/2026/);
  const html = imp.htmlDasPlanilhas("P12", [aba]);
  assert.ok(html.includes('class="larga"'), "14 colunas → fonte menor no PDF");
});
