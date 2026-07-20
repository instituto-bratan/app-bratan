import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-07-17", writeLocalValue: () => undefined };

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
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const crm = loadTsModule("src/features/crm/crmData.ts");
const REF = new Date("2026-07-17T09:00:00");

function stateWithRescue(triggerDate) {
  const base = JSON.parse(JSON.stringify(crm.demoCrmFixtures));
  const contact = { ...base.contacts[0], id: "c-resg", fullName: "Paciente Resgate", optOut: false };
  const enrollment = {
    id: "enr-resg",
    cadenceId: "cad-rescue-60d",
    contactId: "c-resg",
    dealId: "",
    status: "ACTIVE",
    enrolledAt: triggerDate + "T10:00:00.000Z",
    triggerSource: "teste",
    triggerDate,
    ownerUserId: "aline",
    ownerRole: "CONCIERGE",
    completedAt: null,
    canceledReason: "",
    createdAt: triggerDate + "T10:00:00.000Z",
    updatedAt: triggerDate + "T10:00:00.000Z",
  };
  return { ...base, contacts: [contact], deals: [], tasks: [], cadenceEnrollments: [enrollment] };
}

function openRescueTasks(state) {
  return state.tasks.filter(
    (t) => t.cadenceId === "cad-rescue-60d" && t.contactId === "c-resg" && !["DONE", "CANCELED", "SKIPPED"].includes(t.status),
  );
}

test("resgate com gatilho no passado gera SÓ 1 tarefa aberta, e ela não nasce atrasada", () => {
  const state = crm.generateCadenceTasks(stateWithRescue("2026-07-10"), REF);
  const open = openRescueTasks(state);
  assert.equal(open.length, 1, "uma tentativa aberta por vez");
  // due >= hoje (não nasce atrasada)
  assert.ok(open[0].dueAt.slice(0, 10) >= "2026-07-17", `due ${open[0].dueAt} deveria ser hoje ou depois`);
  assert.equal(crm.isTaskOverdue(open[0], REF), false, "não está atrasada");
});

test("concluir a tentativa abre a próxima — também não atrasada, uma de cada vez", () => {
  let state = crm.generateCadenceTasks(stateWithRescue("2026-07-10"), REF);
  const first = openRescueTasks(state)[0];
  state = crm.completeCrmTask(state, first.id, { result: "SENT", actorId: "aline" });
  state = crm.generateCadenceTasks(state, REF);
  const open = openRescueTasks(state);
  assert.equal(open.length, 1, "continua uma aberta por vez");
  assert.notEqual(open[0].id, first.id, "é a PRÓXIMA tentativa");
  assert.equal(crm.isTaskOverdue(open[0], REF), false, "a próxima também não nasce atrasada");
});

test("resposta do paciente pausa a régua e não abre novas tentativas", () => {
  let state = crm.generateCadenceTasks(stateWithRescue("2026-07-10"), REF);
  const first = openRescueTasks(state)[0];
  state = crm.completeCrmTask(state, first.id, { result: "RESPONDED", actorId: "aline" });
  state = crm.generateCadenceTasks(state, REF);
  assert.equal(openRescueTasks(state).length, 0, "respondeu → régua pausa, sem novas tentativas");
});

test("gerar duas vezes é estável (idempotente) — não acumula tarefas", () => {
  const once = crm.generateCadenceTasks(stateWithRescue("2026-07-10"), REF);
  const twice = crm.generateCadenceTasks(once, REF);
  assert.equal(once.tasks.length, twice.tasks.length);
});

test("uma NOVA inscrição (resgate rodando de novo) gera tarefa nova mesmo com execução antiga toda concluída", () => {
  // Execução 1: gatilho antigo, todas as tentativas concluídas/puladas.
  let state = crm.generateCadenceTasks(stateWithRescue("2026-05-01"), REF);
  for (let i = 0; i < 8; i += 1) {
    const open = openRescueTasks(state);
    if (!open.length) break;
    state = crm.completeCrmTask(state, open[0].id, { result: "NO_RESPONSE", actorId: "aline" });
    state = crm.generateCadenceTasks(state, REF);
  }
  assert.equal(openRescueTasks(state).length, 0, "execução 1 encerrada");
  // As tarefas da execução 1 foram criadas em maio (createTask carimba com o
  // relógio real nos testes; em produção o createdAt é a data real de criação).
  state = { ...state, tasks: state.tasks.map((t) => ({ ...t, createdAt: "2026-05-01T10:00:00.000Z" })) };
  // Nova inscrição (mesmo contato+cadência, gatilho novo) — deve renascer.
  const novaInscricao = {
    id: "enr-resg-2",
    cadenceId: "cad-rescue-60d",
    contactId: "c-resg",
    dealId: "",
    status: "ACTIVE",
    enrolledAt: "2026-07-17T10:00:00.000Z",
    triggerSource: "teste",
    triggerDate: "2026-07-17",
    ownerUserId: "aline",
    ownerRole: "CONCIERGE",
    completedAt: null,
    canceledReason: "",
    createdAt: "2026-07-17T10:00:00.000Z",
    updatedAt: "2026-07-17T10:00:00.000Z",
  };
  state = { ...state, cadenceEnrollments: [...state.cadenceEnrollments, novaInscricao] };
  state = crm.generateCadenceTasks(state, REF);
  const open = openRescueTasks(state);
  assert.equal(open.length, 1, "a re-inscrição gera UMA tentativa nova (não fica inerte)");
  assert.equal(crm.isTaskOverdue(open[0], REF), false, "e não nasce atrasada");
});

test("dedupe NÃO destrói a tarefa da re-inscrição por causa da conclusão antiga (chave por execução)", () => {
  // Execução 1 concluída.
  let state = crm.generateCadenceTasks(stateWithRescue("2026-05-01"), REF);
  const first = openRescueTasks(state)[0];
  state = crm.completeCrmTask(state, first.id, { result: "NO_RESPONSE", actorId: "aline" });
  state = { ...state, tasks: state.tasks.map((t) => ({ ...t, createdAt: "2026-05-01T10:00:00.000Z" })) };
  // Nova inscrição + geração.
  const novaInscricao = {
    ...state.cadenceEnrollments[0],
    id: "enr-resg-2",
    triggerDate: "2026-07-17",
    enrolledAt: "2026-07-17T10:00:00.000Z",
    createdAt: "2026-07-17T10:00:00.000Z",
    status: "ACTIVE",
  };
  state = { ...state, cadenceEnrollments: [...state.cadenceEnrollments, novaInscricao] };
  state = crm.generateCadenceTasks(state, REF);
  const beforeDedupe = openRescueTasks(state).length;
  const deduped = crm.dedupeCrmState(state);
  assert.equal(openRescueTasks(deduped).length, beforeDedupe, "o dedupe preserva a tarefa nova (não colide com a DONE antiga)");
  assert.ok(beforeDedupe >= 1, "há uma tentativa aberta da re-inscrição");
});

test("collapseSequentialLadders: várias tentativas abertas viram UMA (mantém a de menor ordem)", () => {
  // Escada legada: tentativas 1..4 abertas ao mesmo tempo (materializadas antes
  // da correção do motor). O auto-cura mantém a 1 e cancela 2,3,4.
  let state = crm.generateCadenceTasks(stateWithRescue("2026-07-10"), REF);
  // força a escada abrindo manualmente os próximos passos (simula histórico)
  const steps = crm.demoCrmFixtures.cadenceSteps.filter((s) => s.cadenceId === "cad-rescue-60d").sort((a, b) => a.stepOrder - b.stepOrder);
  const extra = steps.slice(1, 4).map((s, i) => ({
    ...state.tasks[0],
    id: `extra-${i}`,
    cadenceStepId: s.id,
    status: "PENDING",
    dueAt: "2026-07-1" + (2 + i) + "T10:00:00.000Z",
  }));
  state = { ...state, tasks: [...state.tasks, ...extra] };
  assert.equal(openRescueTasks(state).length, 4, "escada montada com 4 abertas");
  const healed = crm.collapseSequentialLadders(state);
  const open = openRescueTasks(healed);
  assert.equal(open.length, 1, "uma tentativa aberta por vez após o colapso");
  assert.equal(open[0].cadenceStepId, steps[0].id, "manteve a tentativa de menor ordem");
  // idempotente
  assert.equal(openRescueTasks(crm.collapseSequentialLadders(healed)).length, 1);
});

test("tarefa PULADA (régua pausou) não conta como atrasada mesmo com data no passado", () => {
  let state = crm.generateCadenceTasks(stateWithRescue("2026-07-10"), REF);
  const first = openRescueTasks(state)[0];
  state = crm.completeCrmTask(state, first.id, { result: "RESPONDED", actorId: "aline" });
  const skipped = state.tasks.filter((t) => t.status === "SKIPPED");
  const past = new Date("2027-01-01T09:00:00");
  for (const t of skipped) {
    assert.equal(crm.isTaskOverdue(t, past), false, "pulada nunca é atrasada");
  }
});

test("tarefa SEM PRAZO (dueAt vazio) nunca é atrasada — leads parados aguardando movimentação", () => {
  const parked = { status: "PENDING", dueAt: "" };
  const future = new Date("2030-01-01T00:00:00");
  assert.equal(crm.isTaskOverdue(parked, future), false, "sem prazo não atrasa nem no futuro distante");
  // sanidade: com prazo no passado, atrasa
  assert.equal(crm.isTaskOverdue({ status: "PENDING", dueAt: "2026-01-01T00:00:00.000Z" }, future), true);
});
