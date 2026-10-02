// METAS DE OUTUBRO/2026 (02/10/2026) — documento da CEO "Nossa meta de outubro,
// passo a passo": 400 mil + 70 mil que faltaram em setembro = 470 mil; 57
// horários × 8 mil por consulta + 5 dias sem atendimento × 5 mil = 481 mil.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-10-02", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };

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

test("metas de OUTUBRO: 400 mil mínima / 470 mil meta / 481 mil super / 57 horários", () => {
  const out = metas.metasForMonth(cfg, "2026-10");
  assert.equal(out.goalMinRevenue, 400000);
  assert.equal(out.goalTargetRevenue, 470000, "400 mil + os 70 mil que faltaram em setembro");
  assert.equal(out.goalSuperRevenue, 481000, "a soma das semanas do documento");
  assert.equal(out.goalPatients, 57);
  assert.equal(out.dailyGoalWithoutDoctor, 5000, "R$ 5 mil por dia sem o Dr. Daniel");
});

test("outubro: o Dr. Daniel não atende nas sextas nem no feriado de 12/10", () => {
  assert.equal(metas.doctorAttendsOn("2026-10-02", cfg), false, "sexta");
  assert.equal(metas.doctorAttendsOn("2026-10-12", cfg), false, "feriado");
  assert.equal(metas.doctorAttendsOn("2026-10-13", cfg), true, "terça comum");
  assert.equal(metas.doctorAttendsOn("2026-10-30", cfg), false, "sexta");
});

test("outubro: a soma das metas diárias do painel bate com os 481 mil do documento", () => {
  const board = metas.buildMetasBoard([], cfg, "2026-10");
  const comDoutor = board.days.filter((d) => d.withDoctor).length;
  const semDoutor = board.days.filter((d) => !d.withDoctor).length;
  assert.equal(comDoutor, 16, "seg–qui menos o feriado");
  assert.equal(semDoutor, 6, "5 sextas + o feriado");
  assert.equal(Math.round(board.totalDailyGoals), 481000);
});

test("SETEMBRO continua com a régua de setembro (o histórico não é reescrito)", () => {
  const set = metas.metasForMonth(cfg, "2026-09");
  assert.equal(set.goalTargetRevenue, 399000);
  assert.equal(set.goalSuperRevenue, 400000);
  assert.equal(set.dailyGoalWithDoctor, 27000);
});
