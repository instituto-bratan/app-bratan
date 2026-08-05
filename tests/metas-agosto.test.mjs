// METAS DE AGOSTO/2026 (03/08/2026) — planilha "Controle de Metas Agosto 2026"
// + apresentação da CEO. A régua subiu: cada mês guarda as metas que valeram
// nele, e as regras de meritocracia mudaram.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-03", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };

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
  vm.runInNewContext(output, { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, crypto: globalThis.crypto }, { filename: absolutePath });
  return module.exports;
}

const metas = loadTsModule("src/features/financeiro/metasData.ts");
const cfg = metas.defaultMetasConfig;

function venda(dia, valor) {
  return {
    id: `s-${dia}-${valor}`, saleDate: dia, patientName: "P", crmContactRef: "", notes: "",
    items: [{ id: "i", itemType: "TRATAMENTO", amount: valor, description: "" }],
    payments: [{ id: "p", method: "PIX", amount: valor, installments: 1 }], createdAt: `${dia}T10:00:00.000Z`,
  };
}

test("metas de AGOSTO: 330k mínima / 370k meta / 400k super / 68 pacientes", () => {
  const ago = metas.metasForMonth(cfg, "2026-08");
  assert.equal(ago.goalMinRevenue, 330000);
  assert.equal(ago.goalTargetRevenue, 370000);
  assert.equal(ago.goalSuperRevenue, 400000);
  assert.equal(ago.goalPatients, 68);
  assert.equal(ago.dailyGoalWithDoctor, 23188.41);
  assert.equal(ago.dailyGoalWithoutDoctor, 5797.1);
});

test("JULHO continua com a régua antiga (o histórico não é reescrito)", () => {
  const jul = metas.metasForMonth(cfg, "2026-07");
  assert.equal(jul.goalMinRevenue, 300000);
  assert.equal(jul.goalTargetRevenue, 330000);
  assert.equal(jul.goalSuperRevenue, 350000);
  assert.equal(jul.goalPatients, 45);
  assert.equal(jul.dailyGoalWithDoctor, 17948.72);
});

test("21 dias úteis: 16 com Dr. Daniel + 5 de medicação, somando 400 mil", () => {
  const board = metas.buildMetasBoard([], cfg, "2026-08");
  assert.equal(board.days.length, 21, "agosto/2026 tem 21 dias úteis");
  const comDoutor = board.days.filter((dia) => dia.withDoctor);
  const semDoutor = board.days.filter((dia) => !dia.withDoctor);
  assert.equal(comDoutor.length, 16);
  assert.equal(semDoutor.length, 5);
  // 31/08 é segunda, mas é dia só de medicação (override da planilha).
  assert.deepEqual(semDoutor.map((dia) => dia.date).join(","), "2026-08-07,2026-08-14,2026-08-21,2026-08-28,2026-08-31");
  assert.equal(Math.round(board.totalDailyGoals * 100) / 100, 400000.06, "16×23.188,41 + 5×5.797,10");
});

test("semanas: 4 semanas de 98.550,74 + a última de 5.797,10", () => {
  const board = metas.buildMetasBoard([], cfg, "2026-08");
  const metasSemana = board.weeks.map((semana) => Math.round(semana.weeklyGoal * 100) / 100);
  assert.equal(metasSemana.join(","), "98550.74,98550.74,98550.74,98550.74,5797.1");
  assert.equal(board.weeks[0].periodLabel, "03 a 07/08");
  assert.equal(board.weeks[4].periodLabel, "31 a 31/08");
});

test("meritocracia de agosto: as 4 faixas da apresentação", () => {
  const ago = metas.metasForMonth(cfg, "2026-08");
  assert.match(metas.meritocracyStatusText(320000, ago), /abaixo da meta mínima.*zeram/i);
  assert.match(metas.meritocracyStatusText(340000, ago), /Meta mínima atingida.*individual por função/i);
  assert.match(metas.meritocracyStatusText(380000, ago), /café da manhã/i);
  assert.match(metas.meritocracyStatusText(405000, ago), /SUPER META BATIDA.*jantar.*R\$ 200/i);
});

test("bônus por pessoa: R$ 200 ao passar + R$ 200 a cada 10 mil (sem teto)", () => {
  const ago = metas.metasForMonth(cfg, "2026-08");
  assert.equal(metas.meritocracyBonusPerPerson(399999, ago), 0, "abaixo da super meta não paga bônus de equipe");
  assert.equal(metas.meritocracyBonusPerPerson(400000, ago), 0, "exatamente na meta ainda é 0 (a regra é ACIMA)");
  assert.equal(metas.meritocracyBonusPerPerson(400001, ago), 200);
  assert.equal(metas.meritocracyBonusPerPerson(410000, ago), 400, "410 mil = R$ 400 cada (exemplo da CEO)");
  assert.equal(metas.meritocracyBonusPerPerson(420000, ago), 600, "420 mil = R$ 600 cada");
  assert.equal(metas.meritocracyBonusPerPerson(500000, ago), 2200, "sem teto");
});

test("board expõe as metas do mês e o bônus (a tela não recalcula nada)", () => {
  const board = metas.buildMetasBoard([venda("2026-08-03", 410000)], cfg, "2026-08");
  assert.equal(board.goals.min, 330000);
  assert.equal(board.goals.super, 400000);
  assert.equal(board.goals.patients, 68);
  assert.equal(board.meritocracyBonusPerPerson, 400);
  assert.equal(board.missingToSuper, 0, "passou da super meta");
  assert.equal(Math.round(board.avgTicketForSuper * 100) / 100, 5882.35, "400 mil / 68 pacientes");
});

test("crediário reconhecido soma no acumulado da meta (regra de 31/07)", () => {
  const board = metas.buildMetasBoard([venda("2026-08-04", 300000)], cfg, "2026-08", 31250);
  assert.equal(board.accumulatedRevenue, 331250);
  assert.equal(board.missingToMin, 0, "com o crediário passa a mínima");
  assert.equal(board.missingToTarget, 38750, "370.000 − 331.250");
});
