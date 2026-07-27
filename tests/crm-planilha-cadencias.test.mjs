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
  todayISO: () => "2026-07-27",
  writeLocalValue: () => undefined,
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
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const crm = loadTsModule("src/features/crm/crmData.ts");
const REF = new Date("2026-07-27T09:00:00");

function baseState() {
  const base = JSON.parse(JSON.stringify(crm.demoCrmFixtures));
  return { ...base, contacts: [], deals: [], tasks: [], cadenceEnrollments: [], touchpoints: [], timelineEvents: [] };
}

function withEnrollment(cadenceId, ownerRole, triggerDate, extra = {}) {
  const state = baseState();
  state.contacts = [
    {
      ...JSON.parse(JSON.stringify(crm.demoCrmFixtures)).contacts[0],
      id: "c-plan",
      fullName: "Paciente Da Planilha Completa",
      preferredName: "",
      phone: "11988887777",
      optOut: false,
    },
  ];
  state.cadenceEnrollments = [
    {
      id: "enr-plan",
      cadenceId,
      contactId: "c-plan",
      dealId: "",
      status: "ACTIVE",
      enrolledAt: `${triggerDate}T10:00:00.000Z`,
      triggerSource: "teste planilha",
      triggerDate,
      ownerUserId: "pessoa-teste",
      ownerRole,
      completedAt: null,
      canceledReason: "",
      createdAt: `${triggerDate}T10:00:00.000Z`,
      updatedAt: `${triggerDate}T10:00:00.000Z`,
      ...extra,
    },
  ];
  return state;
}

function openTasks(state, cadenceId) {
  return state.tasks.filter(
    (t) => t.cadenceId === cadenceId && t.contactId === "c-plan" && !["DONE", "CANCELED", "SKIPPED"].includes(t.status),
  );
}

// Esgota uma régua D1–D5 marcando "Sem resposta" em todas as tentativas.
function exhaustWithoutResponse(state, cadenceId) {
  for (let i = 0; i < 12; i += 1) {
    state = crm.generateCadenceTasks(state, REF);
    const open = openTasks(state, cadenceId);
    if (!open.length) break;
    const completion = crm.cadenceSheetCompletion("SEM_RESPOSTA");
    state = crm.completeCrmTask(state, open[0].id, { ...completion, actorId: "pessoa-teste" });
  }
  return state;
}

test("catálogo POP v3: boas-vindas da Concierge virou D1–D5 e o reenvio único aposentou", () => {
  const merged = crm.mergeCrmCatalogWithSeeds(baseState());
  const steps = merged.cadenceSteps.filter((s) => s.cadenceId === "cad-concierge-d1" && s.active);
  assert.equal(steps.length, 5, "boas-vindas tem 5 passos ativos (D1–D5)");
  const reenvio = merged.cadenceSteps.find((s) => s.id === "step-concierge-reenvio");
  assert.equal(reenvio?.active ?? false, false, "reenvio único está aposentado");
  const postApp = merged.cadenceSteps.filter((s) => s.cadenceId === "cad-post-application" && s.active);
  assert.equal(postApp.length, 5, "pós-aplicação da Enfermagem tem D1–D5");
});

test("linha da planilha nasce na aba do setor com D1 acionável e as demais células vazias", () => {
  let state = withEnrollment("cad-post-application", "ENFERMAGEM", "2026-07-26");
  state = crm.generateCadenceTasks(state, REF);
  const sheet = crm.buildCadenceSheet(state, { reference: REF });
  assert.equal(sheet.sectors.ENFERMAGEM.length, 1, "linha na aba Enfermagem");
  const row = sheet.sectors.ENFERMAGEM[0];
  assert.equal(row.patientName, "Paciente Da Planilha Completa", "nome completo do paciente linkado");
  assert.equal(row.cells.length, 5, "5 colunas D1–D5");
  assert.equal(row.cells[0].actionable, true, "D1 é a célula da vez");
  assert.equal(row.cells[1].taskId, null, "D2 ainda não nasceu (sequencial)");
  assert.equal(row.resultadoFinal, "Em andamento");
});

test("Sem resposta no D1 → D2 nasce; régua segue ativa", () => {
  let state = withEnrollment("cad-post-application", "ENFERMAGEM", "2026-07-25");
  state = crm.generateCadenceTasks(state, REF);
  const d1 = openTasks(state, "cad-post-application")[0];
  state = crm.completeCrmTask(state, d1.id, { ...crm.cadenceSheetCompletion("SEM_RESPOSTA"), actorId: "pessoa-teste" });
  state = crm.generateCadenceTasks(state, REF);
  const sheet = crm.buildCadenceSheet(state, { reference: REF });
  const row = sheet.sectors.ENFERMAGEM[0];
  assert.equal(row.cells[0].status, "SEM_RESPOSTA");
  assert.ok(row.cells[1].taskId, "D2 nasceu depois do D1 sem resposta");
  assert.equal(row.active, true);
});

test("Satisfeito encerra a régua: resultado final 'Resolvido no setor'", () => {
  let state = withEnrollment("cad-post-application", "ENFERMAGEM", "2026-07-25");
  state = crm.generateCadenceTasks(state, REF);
  const d1 = openTasks(state, "cad-post-application")[0];
  state = crm.completeCrmTask(state, d1.id, { ...crm.cadenceSheetCompletion("SATISFEITO"), actorId: "pessoa-teste" });
  const sheet = crm.buildCadenceSheet(state, { reference: REF });
  const row = sheet.sectors.ENFERMAGEM[0];
  assert.equal(row.cells[0].status, "SATISFEITO");
  assert.equal(row.resultadoFinal, "Resolvido no setor");
  assert.equal(openTasks(state, "cad-post-application").length, 0, "nenhum follow-up depois da resposta");
});

test("Insatisfeito → Concierge: reclamação criada no mesmo dia e flag ligada na linha", () => {
  let state = withEnrollment("cad-post-application", "ENFERMAGEM", "2026-07-25");
  state = crm.generateCadenceTasks(state, REF);
  const d1 = openTasks(state, "cad-post-application")[0];
  state = crm.completeCrmTask(state, d1.id, { ...crm.cadenceSheetCompletion("INSATISFEITO_CONCIERGE"), actorId: "pessoa-teste" });
  const complaint = state.tasks.find((t) => t.id === `task-reclamacao-${d1.id}`);
  assert.ok(complaint, "tarefa de reclamação existe");
  assert.equal(complaint.assignedToRole, "CONCIERGE", "reclamação é da Concierge");
  const sheet = crm.buildCadenceSheet(state, { reference: REF });
  const row = sheet.sectors.ENFERMAGEM[0];
  assert.equal(row.encaminhadoConcierge, true);
  assert.equal(row.resultadoFinal, "Insatisfação → Concierge");
});

test("D5 sem resposta → Estevão assume: flag na linha e caso na aba do Gestor com 5 ligações", () => {
  let state = withEnrollment("cad-post-application", "ENFERMAGEM", "2026-07-10");
  state = exhaustWithoutResponse(state, "cad-post-application");
  state = crm.escalateExhaustedCadences(state, REF);
  state = crm.generateCadenceTasks(state, REF);
  const sheet = crm.buildCadenceSheet(state, { reference: REF });
  const row = sheet.sectors.ENFERMAGEM[0];
  assert.equal(row.escalonadoGestor, true, "linha marca Escalonado ao Gestor");
  assert.equal(row.resultadoFinal, "Escalonado ao Gestor (Estevão)");
  assert.equal(sheet.gestor.length, 1, "caso aparece na aba Gestor Estevão");
  const gestorRow = sheet.gestor[0];
  assert.equal(gestorRow.calls.length, 5, "5 ligações na trilha");
  assert.equal(gestorRow.setorOrigem, "Enfermagem");
  assert.equal(gestorRow.patientName, "Paciente Da Planilha Completa");
});

test("boas-vindas da Concierge esgotada também escala ao Gestor (POP 3.5)", () => {
  let state = withEnrollment("cad-concierge-d1", "CONCIERGE", "2026-07-10");
  state = exhaustWithoutResponse(state, "cad-concierge-d1");
  state = crm.escalateExhaustedCadences(state, REF);
  const gestorEnrollment = state.cadenceEnrollments.find((e) => e.cadenceId === "cad-gestor-5lig");
  assert.ok(gestorEnrollment, "trilha do gestor aberta");
});

test("ligação do gestor registra data, hora e status (caixa postal ≠ não atendeu)", () => {
  let state = withEnrollment("cad-gestor-5lig", "ADMIN_GESTAO", "2026-07-20");
  state = crm.generateCadenceTasks(state, REF);
  const lig1 = openTasks(state, "cad-gestor-5lig")[0];
  state = crm.completeCrmTask(state, lig1.id, { ...crm.gestorCallCompletion("CAIXA_POSTAL"), actorId: "estevao" });
  const sheet = crm.buildCadenceSheet(state, { reference: REF });
  const row = sheet.gestor[0];
  assert.equal(row.calls[0].status, "CAIXA_POSTAL");
  assert.ok(row.calls[0].date, "data registrada");
  assert.ok(row.calls[0].hora, "hora registrada");
  assert.equal(row.resultadoFinal, "Em andamento");
});

test("observações da linha ficam na inscrição (updateCadenceEnrollmentNotes)", () => {
  let state = withEnrollment("cad-post-application", "ENFERMAGEM", "2026-07-26");
  state = crm.generateCadenceTasks(state, REF);
  state = crm.updateCadenceEnrollmentNotes(state, "enr-plan", "Paciente prefere contato à tarde.");
  const sheet = crm.buildCadenceSheet(state, { reference: REF });
  assert.equal(sheet.sectors.ENFERMAGEM[0].observacoes, "Paciente prefere contato à tarde.");
});

test("resumo conta casos, encaminhados e escalonados por aba (como a aba Instruções)", () => {
  let state = withEnrollment("cad-post-application", "ENFERMAGEM", "2026-07-25");
  state = crm.generateCadenceTasks(state, REF);
  const d1 = openTasks(state, "cad-post-application")[0];
  state = crm.completeCrmTask(state, d1.id, { ...crm.cadenceSheetCompletion("INSATISFEITO_CONCIERGE"), actorId: "pessoa-teste" });
  const sheet = crm.buildCadenceSheet(state, { reference: REF });
  const enf = sheet.summary.find((s) => s.sector === "ENFERMAGEM");
  assert.deepEqual({ casos: enf.casos, encaminhados: enf.encaminhados, escalonados: enf.escalonados }, { casos: 1, encaminhados: 1, escalonados: 0 });
});
