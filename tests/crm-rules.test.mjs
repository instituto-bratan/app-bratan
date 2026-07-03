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
  todayISO: () => "2026-06-30",
  writeLocalValue: () => undefined,
};

function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;

  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
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

  vm.runInNewContext(
    output,
    {
      require: localRequire,
      module,
      exports: module.exports,
      console,
      crypto: globalThis.crypto,
      Date,
      Intl,
      Math,
      Number,
      Object,
      JSON,
      Set,
      String,
      Map,
    },
    { filename: absolutePath },
  );

  return module.exports;
}

const crm = loadTsModule("src/features/crm/crmData.ts");
const data360 = loadTsModule("src/features/inteligencia360/inteligencia360Data.ts");

function cloneState() {
  return JSON.parse(JSON.stringify(crm.demoCrmFixtures));
}

function clone360() {
  return JSON.parse(JSON.stringify(data360.demoInteligencia360Fixtures));
}

test("findOrCreateCrmContact evita duplicidade por telefone", () => {
  const state = cloneState();
  const before = state.contacts.length;
  const result = crm.findOrCreateCrmContact(state, {
    fullName: "Marina A.",
    phone: "11 99999-0001",
    whatsapp: "11999990001",
  });

  assert.equal(result.created, false);
  assert.equal(result.contact.id, "crm-contact-lead-frio");
  assert.equal(result.state.contacts.length, before);
  assert.match(result.duplicateWarning, /Possível duplicidade/);
});

test("mover para fechou completo cria tarefas setoriais e alimenta o 360", () => {
  const state = cloneState();
  const moved = crm.moveDealStage(state, "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "FECHOU_COMPLETO",
    prescribedAmount: 22000,
    soldAmount: 22000,
    receivedAmount: 12000,
  });

  assert.equal(moved.ok, true);
  const roles = moved.state.tasks
    .filter((task) => task.dealId === "crm-deal-lead-quente")
    .map((task) => task.assignedToRole)
    .sort();

  assert.ok(roles.includes("CONCIERGE"));
  assert.ok(roles.includes("RECEPCAO"));
  assert.ok(roles.includes("ADMINISTRATIVO"));
  assert.equal(moved.state.contacts.find((contact) => contact.id === "crm-contact-lead-quente").lifecycleStage, "ACTIVE_PATIENT");

  const next360 = crm.deriveInteligencia360FromCrm(moved.state, clone360());
  assert.ok(next360.prescriptions.some((record) => record.id === "crm-rx-crm-deal-lead-quente" && record.status === "CLOSED_FULL"));
  assert.ok(next360.receivables.some((record) => record.id === "crm-recv-crm-deal-lead-quente"));
  assert.ok(next360.journeys.some((record) => record.id === "crm-journey-crm-deal-lead-quente"));
});

test("não fechou exige objeção e com objeção cria médico D+1 e gestor D+2", () => {
  const state = cloneState();
  const invalid = crm.moveDealStage(state, "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "NAO_FECHOU",
  });

  assert.equal(invalid.ok, false);

  const valid = crm.moveDealStage(state, "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "NAO_FECHOU",
    objection: "Precisa falar com familiar",
    objectionCategory: "SPOUSE_OR_FAMILY",
  });

  const roles = valid.state.tasks
    .filter((task) => task.dealId === "crm-deal-lead-quente")
    .map((task) => task.assignedToRole);
  assert.ok(roles.includes("MEDICO"));
  assert.ok(roles.includes("ADMIN_GESTAO"));
});

test("gerar cadência duas vezes não duplica tarefa aberta", () => {
  const state = cloneState();
  const once = crm.generateCadenceTasks(state, new Date("2026-07-01T12:00:00.000Z"));
  const twice = crm.generateCadenceTasks(once, new Date("2026-07-01T12:00:00.000Z"));

  const cadenceTasks = twice.tasks.filter((task) => task.cadenceId && task.cadenceStepId && task.status !== "DONE");
  const keys = cadenceTasks.map((task) => `${task.contactId}:${task.cadenceId}:${task.cadenceStepId}:${task.taskType}:${task.status}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("concluir tarefa registra touchpoint e pausa cadência quando houve resposta", () => {
  const state = cloneState();
  const updated = crm.completeCrmTask(state, "crm-task-d1-comercial", {
    actorId: "sdr",
    result: "RESPONDED",
    resultNotes: "Quer agendar consulta.",
  });

  assert.equal(updated.tasks.find((task) => task.id === "crm-task-d1-comercial").status, "DONE");
  assert.equal(updated.touchpoints[0].contactId, "crm-contact-lead-frio");
  assert.equal(updated.touchpoints[0].responseReceived, true);
  assert.equal(updated.cadenceEnrollments.find((item) => item.cadenceId === "cad-cold-lead").status, "PAUSED");
});

test("antifadiga sinaliza contato com muitos toques recentes", () => {
  const state = cloneState();
  state.touchpoints = Array.from({ length: 5 }, (_, index) => ({
    id: `touch-${index}`,
    contactId: "crm-contact-lead-frio",
    taskId: "",
    cadenceId: "cad-cold-lead",
    touchType: "WHATSAPP",
    channel: "WHATSAPP",
    sentByUserId: "sdr",
    sentAt: `2026-06-${26 + index}T10:00:00.000Z`,
    responseReceived: false,
    responseAt: null,
    responseSummary: "",
    sentiment: "NO_RESPONSE",
    createdAt: `2026-06-${26 + index}T10:00:00.000Z`,
  }));

  const fatigue = crm.checkContactFatigue(state, "crm-contact-lead-frio", new Date("2026-06-30T12:00:00.000Z"));
  assert.equal(fatigue.risk, true);
  assert.equal(fatigue.recentTouchesCount, 5);
});
