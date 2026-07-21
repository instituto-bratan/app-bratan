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
  todayISO: () => "2026-07-20",
  writeLocalValue: () => undefined,
};

function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolutePath,
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request.startsWith("@/")) {
      const resolved = request.replace("@/", "src/");
      return loadTsModule(path.extname(resolved) ? resolved : `${resolved}.ts`);
    }
    if (request.startsWith(".")) {
      const resolved = path.resolve(path.dirname(absolutePath), request);
      return loadTsModule(path.relative(repoRoot, path.extname(resolved) ? resolved : `${resolved}.ts`));
    }
    throw new Error(`Unexpected test import: ${request}`);
  };
  vm.runInNewContext(output, {
    require: localRequire, module, exports: module.exports,
    console, crypto: globalThis.crypto, Date, Intl, Math, Number, Object, JSON, Set, Map, String, Array,
  }, { filename: absolutePath });
  return module.exports;
}

const programa = loadTsModule("src/features/programa/programaData.ts");

function makeDeal(overrides = {}) {
  return {
    id: "deal-1", contactId: "c-1", title: "Paciente Teste", dealType: "FIRST_CONSULTATION",
    stage: "FECHOU_COMPLETO", estimatedValue: 0, prescribedAmount: 0, soldAmount: 9000, receivedAmount: 9000,
    probability: 100, status: "WON_FULL", mainObjection: "", objectionCategory: "OTHER", sourceChannel: "",
    ownerUserId: "", doctorId: "", expectedCloseDate: "", closedAt: "2026-05-10", createdAt: "2026-05-01",
    updatedAt: "2026-05-10", programPhase: "CADENCIA_PROGRAMA", adhesionChannel: "PROGRAMA_ACOMPANHAMENTO",
    programMilestonesDone: [], ...overrides,
  };
}

function makeState(deals, contacts = [{ id: "c-1", fullName: "Maria Silva", phone: "11999999999" }]) {
  return { deals, contacts, tasks: [], cadences: [], cadenceSteps: [], cadenceEnrollments: [] };
}

test("plano de marcos: 6 checkpoints + 6 bios mensais e 3 consultas nos meses 2/4/6", () => {
  const deal = makeDeal();
  const milestones = programa.buildMilestones(deal, "2026-07-20");
  assert.equal(milestones.length, 15);
  assert.equal(milestones.filter((m) => m.type === "CHECK").length, 6);
  assert.equal(milestones.filter((m) => m.type === "BIO").length, 6);
  assert.equal(milestones.filter((m) => m.type === "MEDICO").length, 3);
  // adesão 10/05 → check 1 em 10/06, médico 1 (mês 2) em 10/07, médico 3 em 10/11
  assert.equal(milestones.find((m) => m.key === "CHECK-1").expectedDate, "2026-06-10");
  assert.equal(milestones.find((m) => m.key === "MEDICO-1").expectedDate, "2026-07-10");
  assert.equal(milestones.find((m) => m.key === "MEDICO-3").expectedDate, "2026-11-10");
});

test("atraso e próximo passo: marco previsto no passado sem conclusão fica atrasado", () => {
  const deal = makeDeal({ programMilestonesDone: ["CHECK-1", "BIO-1"] });
  const board = programa.buildProgramaBoard(makeState([deal]), "2026-07-20");
  assert.equal(board.length, 1);
  const card = board[0];
  assert.equal(card.patientName, "Maria Silva");
  assert.equal(card.checksDone, 1);
  assert.equal(card.biosDone, 1);
  assert.equal(card.medicoDone, 0);
  assert.equal(card.monthOfProgram, 3); // 10/05 → 20/07 = 2 meses completos → mês 3
  // MEDICO-1 (10/07) e CHECK-2/BIO-2 (10/07) passaram sem conclusão → atrasados
  assert.ok(card.overdueCount >= 3);
  assert.equal(card.nextMilestone.expectedDate, "2026-07-10");
});

test("toggle marca e desmarca marco sem tocar os demais deals", () => {
  const state = makeState([makeDeal(), makeDeal({ id: "deal-2", contactId: "c-1" })]);
  const marked = programa.toggleProgramMilestone(state, "deal-1", "MEDICO-1");
  assert.equal(JSON.stringify(marked.deals.find((d) => d.id === "deal-1").programMilestonesDone), JSON.stringify(["MEDICO-1"]));
  assert.equal(JSON.stringify(marked.deals.find((d) => d.id === "deal-2").programMilestonesDone), "[]");
  const unmarked = programa.toggleProgramMilestone(marked, "deal-1", "MEDICO-1");
  assert.equal(JSON.stringify(unmarked.deals.find((d) => d.id === "deal-1").programMilestonesDone), "[]");
});

test("board: encerramento aparece até ter desfecho; perdidos e com desfecho saem", () => {
  const emEncerramento = makeDeal({ id: "d-enc", programPhase: "ENCERRAMENTO" });
  const comDesfecho = makeDeal({ id: "d-alta", programPhase: "ENCERRAMENTO", programOutcome: "ALTA" });
  const perdido = makeDeal({ id: "d-lost", status: "LOST" });
  const comercial = makeDeal({ id: "d-com", programPhase: null });
  const board = programa.buildProgramaBoard(makeState([emEncerramento, comDesfecho, perdido, comercial]), "2026-07-20");
  assert.deepEqual(board.map((c) => c.dealId), ["d-enc"]);
});

test("texto para a Assistente de Performance resume paciente, progresso e próximo passo", () => {
  const deal = makeDeal({ programMilestonesDone: ["CHECK-1", "BIO-1", "MEDICO-1"] });
  const board = programa.buildProgramaBoard(makeState([deal]), "2026-07-20");
  const text = programa.buildNutriShareText(board, "2026-07-20");
  assert.ok(text.includes("Maria Silva"));
  assert.ok(text.includes("Checkpoints: 1/6"));
  assert.ok(text.includes("Consultas Dr.: 1/3"));
  assert.ok(text.includes("Próximo:"));
});
