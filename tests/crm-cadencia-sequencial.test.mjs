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
