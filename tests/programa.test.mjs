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

test("contagens viram marcos concluídos (limitadas a 6/6/3)", () => {
  const done = programa.programMilestonesFromCounts(3, 2, 1);
  assert.equal(JSON.stringify(done), JSON.stringify(["BIO-1", "BIO-2", "CHECK-1", "CHECK-2", "CHECK-3", "MEDICO-1"]));
  const capped = programa.programMilestonesFromCounts(99, 99, 99);
  assert.equal(capped.filter((k) => k.startsWith("CHECK")).length, 6);
  assert.equal(capped.filter((k) => k.startsWith("BIO")).length, 6);
  assert.equal(capped.filter((k) => k.startsWith("MEDICO")).length, 3);
});

test("cadastrar paciente antigo: reusa o deal ganho e marca o já feito", () => {
  const state = makeState([makeDeal({ programPhase: null, programMilestonesDone: [] })]);
  const next = programa.enrollPatientInProgram(state, {
    contactId: "c-1", startDate: "2026-04-01", channel: "PROGRAMA_ACOMPANHAMENTO", checksDone: 2, biosDone: 2, medicoDone: 1,
  });
  const board = programa.buildProgramaBoard(next, "2026-07-20");
  assert.equal(board.length, 1);
  assert.equal(board[0].checksDone, 2);
  assert.equal(board[0].medicoDone, 1);
  assert.equal(board[0].phase, "CADENCIA_PROGRAMA");
  // não criou deal novo — reusou o existente
  assert.equal(next.deals.length, 1);
  assert.equal(next.deals[0].adhesionChannel, "PROGRAMA_ACOMPANHAMENTO");
});

test("cadastrar paciente sem deal cria um deal do plano e ativa o contato", () => {
  const state = makeState([], [{ id: "c-9", fullName: "João Antigo", phone: "", lifecycleStage: "CLOSED_PATIENT" }]);
  const next = programa.enrollPatientInProgram(state, {
    contactId: "c-9", startDate: "2026-05-01", channel: "PROGRAMA_ACOMPANHAMENTO", checksDone: 0, biosDone: 0, medicoDone: 0,
  });
  assert.equal(next.deals.length, 1);
  assert.equal(next.deals[0].contactId, "c-9");
  assert.equal(next.contacts.find((c) => c.id === "c-9").lifecycleStage, "ACTIVE_PATIENT");
  assert.equal(programa.buildProgramaBoard(next, "2026-07-20").length, 1);
});

test("sugestões: pacientes ativos/fechados fora do plano aparecem para cadastrar", () => {
  const noPlano = makeDeal({ id: "d-plano" });
  const state = {
    deals: [noPlano],
    contacts: [
      { id: "c-1", fullName: "Maria Silva", phone: "", lifecycleStage: "ACTIVE_PATIENT" }, // já no plano (deal-1 aponta p/ c-1)
      { id: "c-2", fullName: "Ana Fora", phone: "", lifecycleStage: "ACTIVE_PATIENT" },
      { id: "c-3", fullName: "Lead Frio", phone: "", lifecycleStage: "COLD_LEAD" },
    ],
    tasks: [], cadences: [], cadenceSteps: [], cadenceEnrollments: [],
  };
  const sug = programa.patientsNotInProgram(state, "2026-07-20").map((c) => c.id);
  assert.ok(sug.includes("c-2")); // ativa fora do plano → sugerida
  assert.ok(!sug.includes("c-1")); // já no plano → não sugere
  assert.ok(!sug.includes("c-3")); // lead frio → não é paciente
});

test("relatório em tabela: colunas por paciente com feito e quanto falta", () => {
  const deal = makeDeal({ programMilestonesDone: ["CHECK-1", "BIO-1", "MEDICO-1"] });
  const board = programa.buildProgramaBoard(makeState([deal]), "2026-07-20");
  const table = programa.buildPerformanceReportTable(board);
  assert.equal(JSON.stringify(table.headers), JSON.stringify(["Paciente", "Fase", "Mês", "Checkpoints", "Bioimpedâncias", "Consultas Dr.", "Próximo passo"]));
  const row = table.rows[0];
  assert.equal(row[0], "Maria Silva");
  assert.equal(row[3], "1/6 · faltam 5");
  assert.equal(row[5], "1/3 · faltam 2");
  assert.ok(row[6].length > 0);
  const summary = programa.programSummaryLines(board);
  assert.ok(summary[0].includes("1 paciente"));
  assert.ok(summary[1].includes("checkpoint"));
});
