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
  todayISO: () => "2026-07-30",
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

function conta(over = {}) {
  return {
    id: "fexp-boleto-ar",
    description: "Ar-condicionado (boleto)",
    categoryRef: "cat-lavanderia-flores-insumos-limpeza",
    amount: 500,
    dueDate: "2026-08-10",
    paidAt: null,
    method: "BOLETO",
    supplier: "Friocalor",
    installmentNum: 1,
    installmentTotal: 12,
    documentNote: "",
    isCapex: false,
    notes: "",
    createdAt: "2026-07-30T10:00:00.000Z",
    recorrencia: null,
    ...over,
  };
}

test("1/12 gera as 11 parcelas seguintes, uma por mês, no mesmo dia", () => {
  const base = conta();
  const geradas = fin.missingInstallments([base], base);
  assert.equal(geradas.length, 11, "faltavam 11 depois da primeira");
  assert.equal(geradas[0].installmentNum, 2);
  assert.equal(geradas[0].dueDate, "2026-09-10");
  assert.equal(geradas.at(-1).installmentNum, 12);
  assert.equal(geradas.at(-1).dueDate, "2027-07-10", "a última cai 11 meses depois");
  assert.ok(geradas.every((p) => p.amount === 500 && p.paidAt === null), "mesmo valor, todas em aberto");
});

test("parcela lançada no meio (5/10) só cria da 6 até a 10", () => {
  const base = conta({ installmentNum: 5, installmentTotal: 10, dueDate: "2026-08-10" });
  const geradas = fin.missingInstallments([base], base);
  assert.equal(geradas.length, 5);
  assert.equal(geradas.map((p) => p.installmentNum).join(","), "6,7,8,9,10");
  assert.equal(geradas.at(-1).dueDate, "2027-01-10");
});

test("vencimento dia 31 respeita mês curto (fevereiro não vira 31)", () => {
  const base = conta({ dueDate: "2026-12-31", installmentNum: 1, installmentTotal: 4 });
  const geradas = fin.missingInstallments([base], base);
  assert.equal(geradas[0].dueDate, "2027-01-31");
  assert.equal(geradas[1].dueDate, "2027-02-28", "fevereiro clampa");
  assert.equal(geradas[2].dueDate, "2027-03-31", "e volta para 31 no mês seguinte");
});

test("id é determinístico: lançar de outro aparelho não duplica parcela", () => {
  const base = conta();
  const primeira = fin.missingInstallments([base], base);
  const idsA = primeira.map((p) => p.id);
  const idsB = fin.missingInstallments([base], base).map((p) => p.id);
  assert.equal(idsA.join("|"), idsB.join("|"), "os mesmos ids sempre");
  assert.equal(idsA[0], "fexp-boleto-ar~par-02");
  // Rodando de novo com a série já gravada, nada é gerado outra vez.
  assert.equal(fin.missingInstallments([base, ...primeira], base).length, 0, "idempotente");
});

test("parcela NUNCA nasce recorrente (senão repetiria para sempre)", () => {
  const base = conta({ recorrencia: "MENSAL" });
  const geradas = fin.missingInstallments([base], base);
  assert.ok(geradas.every((p) => p.recorrencia === null));
});

test("conta sem parcela, 1/1 ou parcelamento absurdo não geram nada", () => {
  assert.equal(fin.missingInstallments([], conta({ installmentNum: null, installmentTotal: null })).length, 0);
  assert.equal(fin.missingInstallments([], conta({ installmentNum: 1, installmentTotal: 1 })).length, 0);
  assert.equal(fin.missingInstallments([], conta({ installmentNum: 12, installmentTotal: 12 })).length, 0, "última parcela");
  assert.equal(fin.missingInstallments([], conta({ installmentTotal: 9999 })).length, 0, "erro de digitação é barrado");
  assert.equal(fin.MAX_INSTALLMENTS, 72);
});

test("buraco no meio da série é preenchido sem tocar nas que já existem", () => {
  const base = conta();
  const todas = [base, ...fin.missingInstallments([base], base)];
  const semAQuinta = todas.filter((p) => p.installmentNum !== 5);
  const geradas = fin.missingInstallments(semAQuinta, base);
  assert.equal(geradas.length, 1);
  assert.equal(geradas[0].installmentNum, 5);
  assert.equal(geradas[0].dueDate, "2026-12-10", "vencimento da 5ª, contado da 1ª");
});

test("série e resumo contam o que falta pagar e quando termina", () => {
  const base = conta();
  const todas = [base, ...fin.missingInstallments([base], base)];
  const paga = todas.map((p) => (p.installmentNum <= 3 ? { ...p, paidAt: p.dueDate } : p));
  const serie = fin.installmentSeries(paga, base);
  assert.equal(serie.length, 12);
  assert.equal(serie[0].installmentNum, 1, "ordenada da primeira para a última");
  const resumo = fin.installmentSummary(paga, base);
  assert.equal(resumo.lancadas, 12);
  assert.equal(resumo.faltamLancar, 0);
  assert.equal(resumo.abertas, 9);
  assert.equal(resumo.valorAberto, 4500);
  assert.equal(resumo.ultimoVencimento, "2027-07-10");
});

test("resumo avisa quando a série está incompleta (conta antiga, de antes da correção)", () => {
  const base = conta();
  const resumo = fin.installmentSummary([base], base);
  assert.equal(resumo.lancadas, 1);
  assert.equal(resumo.faltamLancar, 11, "é o que o botão 'Lançar as parcelas que faltam' resolve");
});

test("correção alcança só as parcelas seguintes ainda em aberto", () => {
  const base = conta();
  const todas = [base, ...fin.missingInstallments([base], base)];
  const comPagas = todas.map((p) => (p.installmentNum === 4 ? { ...p, paidAt: "2026-11-10" } : p));
  const alvo = comPagas.find((p) => p.installmentNum === 3);
  const futuras = fin.futureOpenInstallments(comPagas, alvo);
  const nums = futuras.map((p) => p.installmentNum);
  assert.ok(!nums.includes(3), "não inclui ela mesma");
  assert.ok(!nums.includes(1) && !nums.includes(2), "não mexe em parcela passada");
  assert.ok(!nums.includes(4), "não mexe em parcela JÁ PAGA");
  assert.equal(nums.join(","), "5,6,7,8,9,10,11,12");
});

test("parcelas entram na P12 no mês do vencimento, cada uma no seu mês", () => {
  const base = conta({ amount: 1000, installmentTotal: 3, dueDate: "2026-07-10" });
  const todas = [base, ...fin.missingInstallments([base], base)];
  const categorias = [
    { id: "cat-lavanderia-flores-insumos-limpeza", groupKey: "CUSTO_VARIAVEL", name: "Insumos", sortOrder: 1, isCapex: false, active: true },
  ];
  const matrix = fin.buildP12Matrix([], todas, categorias, 2026, []);
  assert.equal(matrix.totalExpensesMonths[6], 1000, "julho");
  assert.equal(matrix.totalExpensesMonths[7], 1000, "agosto");
  assert.equal(matrix.totalExpensesMonths[8], 1000, "setembro");
  assert.equal(matrix.totalExpensesYear, 3000, "e não 1000 como antes");
});

test("recorrência mensal não é confundida com parcela (id de raiz separado)", () => {
  assert.equal(fin.installmentRootId("fexp-luz~rec-2026-09"), "fexp-luz");
  assert.equal(fin.installmentRootId("fexp-boleto~par-05"), "fexp-boleto");
  assert.equal(fin.installmentRootId("fexp-simples"), "fexp-simples");
});
