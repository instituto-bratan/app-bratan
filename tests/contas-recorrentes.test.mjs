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
      return { readLocalValue: (_key, fallback) => fallback, writeLocalValue: () => undefined, todayISO: () => "2026-07-15" };
    }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const fin = loadFinanceiroModule();
const ids = (list) => Array.from(list, (r) => r.id);

function expense(over = {}) {
  return {
    id: over.id ?? "fexp-aluguel",
    description: over.description ?? "Aluguel",
    categoryRef: over.categoryRef ?? "cat-fixo",
    amount: over.amount ?? 5000,
    dueDate: over.dueDate ?? "2026-07-10",
    paidAt: over.paidAt ?? null,
    method: over.method ?? "PIX",
    supplier: over.supplier ?? "Imobiliária",
    installmentNum: null,
    installmentTotal: null,
    documentNote: "",
    isCapex: false,
    notes: "",
    createdAt: "2026-07-01T10:00:00.000Z",
    recorrencia: over.recorrencia === undefined ? null : over.recorrencia,
  };
}

// ---- nextMonthlyDueDate -----------------------------------------------------

test("nextMonthlyDueDate avança um mês mantendo o dia", () => {
  assert.equal(fin.nextMonthlyDueDate("2026-07-05"), "2026-08-05");
  assert.equal(fin.nextMonthlyDueDate("2026-12-15"), "2027-01-15");
});

test("nextMonthlyDueDate clampa o dia em meses mais curtos", () => {
  assert.equal(fin.nextMonthlyDueDate("2026-01-31"), "2026-02-28");
  assert.equal(fin.nextMonthlyDueDate("2026-03-31"), "2026-04-30");
  assert.equal(fin.nextMonthlyDueDate("2028-01-31"), "2028-02-29"); // bissexto
});

// ---- materializeRecurringExpenses ------------------------------------------

test("conta sem recorrência não gera nada", () => {
  const out = fin.materializeRecurringExpenses([expense()], "2026-07-15");
  assert.equal(out.length, 0);
});

test("conta recorrente gera a cópia do mês seguinte, em aberto e com id determinístico", () => {
  const source = expense({ recorrencia: "MENSAL", paidAt: "2026-07-10" });
  const out = fin.materializeRecurringExpenses([source], "2026-07-15");
  assert.equal(out.length, 1);
  const copy = out[0];
  assert.equal(copy.id, "fexp-aluguel~rec-2026-08");
  assert.equal(copy.dueDate, "2026-08-10");
  assert.equal(copy.paidAt, null);
  assert.equal(copy.amount, 5000);
  assert.equal(copy.categoryRef, "cat-fixo");
  assert.equal(copy.recorrencia, "MENSAL");
});

test("não duplica quando a cópia do mês seguinte já existe", () => {
  const source = expense({ recorrencia: "MENSAL" });
  const copy = expense({ id: "fexp-aluguel~rec-2026-08", dueDate: "2026-08-10", recorrencia: "MENSAL" });
  const out = fin.materializeRecurringExpenses([source, copy], "2026-07-15");
  assert.equal(out.length, 0);
});

test("gera meses perdidos até o horizonte (mês atual + 1)", () => {
  // Última ocorrência foi maio; hoje é 15/07 → precisa nascer junho, julho e agosto.
  const source = expense({ recorrencia: "MENSAL", dueDate: "2026-05-10" });
  const out = fin.materializeRecurringExpenses([source], "2026-07-15");
  assert.deepEqual(
    Array.from(out, (e) => e.dueDate),
    ["2026-06-10", "2026-07-10", "2026-08-10"],
  );
  assert.deepEqual(ids(out), [
    "fexp-aluguel~rec-2026-06",
    "fexp-aluguel~rec-2026-07",
    "fexp-aluguel~rec-2026-08",
  ]);
});

test("a corrente para quando a última ocorrência foi desmarcada como recorrente", () => {
  const source = expense({ recorrencia: "MENSAL" });
  const latest = expense({ id: "fexp-aluguel~rec-2026-08", dueDate: "2026-08-10", recorrencia: null });
  const out = fin.materializeRecurringExpenses([source, latest], "2026-07-15");
  assert.equal(out.length, 0);
});

test("a cópia herda o valor da última ocorrência (edições valem para frente)", () => {
  const source = expense({ recorrencia: "MENSAL", amount: 5000, dueDate: "2026-06-10" });
  const edited = expense({ id: "fexp-aluguel~rec-2026-07", dueDate: "2026-07-10", amount: 5500, recorrencia: "MENSAL" });
  const out = fin.materializeRecurringExpenses([source, edited], "2026-07-15");
  assert.equal(out.length, 1);
  assert.equal(out[0].amount, 5500);
  assert.equal(out[0].id, "fexp-aluguel~rec-2026-08");
});

test("dia 31 clampa mês a mês sem drift", () => {
  const source = expense({ id: "fexp-luz", recorrencia: "MENSAL", dueDate: "2026-07-31" });
  const out = fin.materializeRecurringExpenses([source], "2026-07-15");
  assert.equal(out[0].dueDate, "2026-08-31");
});

// ---- upcomingExpenses -------------------------------------------------------

test("upcomingExpenses separa vencidas e chegando (3 dias), só não pagas", () => {
  const list = [
    expense({ id: "vencida", dueDate: "2026-07-10" }),
    expense({ id: "hoje", dueDate: "2026-07-15" }),
    expense({ id: "amanha", dueDate: "2026-07-16" }),
    expense({ id: "em3", dueDate: "2026-07-18" }),
    expense({ id: "longe", dueDate: "2026-07-19" }),
    expense({ id: "paga", dueDate: "2026-07-16", paidAt: "2026-07-14" }),
  ];
  const out = fin.upcomingExpenses(list, "2026-07-15", 3);
  assert.deepEqual(ids(out.vencidas), ["vencida"]);
  assert.deepEqual(ids(out.chegando), ["hoje", "amanha", "em3"]);
});

test("upcomingExpenses limita vencidas a 60 dias (histórico antigo fica de fora)", () => {
  const list = [
    expense({ id: "janeiro", dueDate: "2026-01-30" }),
    expense({ id: "recente", dueDate: "2026-07-05" }),
    expense({ id: "borda-ok", dueDate: "2026-05-16" }), // 60 dias antes de 15/07
    expense({ id: "borda-fora", dueDate: "2026-05-15" }),
  ];
  const out = fin.upcomingExpenses(list, "2026-07-15", 3);
  assert.deepEqual(ids(out.vencidas), ["borda-ok", "recente"]);
});

test("upcomingExpenses ordena por vencimento", () => {
  const list = [
    expense({ id: "b", dueDate: "2026-07-17" }),
    expense({ id: "a", dueDate: "2026-07-16" }),
  ];
  const out = fin.upcomingExpenses(list, "2026-07-15", 3);
  assert.deepEqual(ids(out.chegando), ["a", "b"]);
});
