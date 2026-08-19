// UM PACIENTE, UMA JORNADA (19/08/2026) — o bug do "erro no Supabase" ao fechar
// de novo: o banco trava duas jornadas abertas por paciente
// (crm_deals_one_active_journey), mas o motor não encerrava a antiga ao abrir a
// nova, e o salvamento inteiro morria. Caso real: Gabriela Guagliano, 19/08.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-19", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const crm = loadTsModule("src/features/crm/crmData.ts");

function estadoComPaciente() {
  let state = crm.createInitialCrmState ? crm.createInitialCrmState() : { contacts: [], deals: [], tasks: [], cadences: [], cadenceSteps: [], cadenceEnrollments: [], messageTemplates: [], touchpoints: [], timelineEvents: [] };
  const created = crm.findOrCreateCrmContact(state, { fullName: "GABRIELA TESTE", phone: "11999990000" }, "u1");
  state = created.state;
  return { state, contactId: created.contact.id };
}

function fecharDeal(state, contactId, titulo) {
  const next = crm.createDealForContact(state, { contactId, title: titulo, ownerUserId: "u1", estimatedValue: 100, sourceChannel: "teste" });
  const deal = next.deals[0];
  return { state: next, dealId: deal.id };
}

const jornadasAbertas = (state, contactId) =>
  state.deals.filter((deal) => deal.contactId === contactId && deal.programPhase && !deal.programOutcome);

test("fechar de novo ENCERRA a jornada antiga como Renovação (a trava do banco nunca dispara)", () => {
  let { state, contactId } = estadoComPaciente();
  const primeira = fecharDeal(state, contactId, "Fechamento 1");
  state = crm.startProgramJourney(primeira.state, primeira.dealId, "SOMENTE_TRATAMENTO", "u1");
  assert.equal(jornadasAbertas(state, contactId).length, 1);

  const segunda = fecharDeal(state, contactId, "Fechamento 2");
  state = crm.startProgramJourney(segunda.state, segunda.dealId, "PROGRAMA_ACOMPANHAMENTO", "u1");

  const abertas = jornadasAbertas(state, contactId);
  assert.equal(abertas.length, 1, "só a jornada nova pode ficar aberta");
  assert.equal(abertas[0].id, segunda.dealId);
  const antiga = state.deals.find((deal) => deal.id === primeira.dealId);
  assert.equal(antiga.programOutcome, "RENOVACAO");
});

test("as tarefas de gate pendentes da jornada antiga são canceladas com motivo", () => {
  let { state, contactId } = estadoComPaciente();
  const primeira = fecharDeal(state, contactId, "Fechamento 1");
  state = crm.startProgramJourney(primeira.state, primeira.dealId, "SOMENTE_TRATAMENTO", "u1");
  // FECHAMENTO_D0 não tem gate; os gates nascem na fase seguinte (D+1).
  state = crm.setProgramPhase(state, primeira.dealId, "TRES_CONTATOS_D1", "u1");
  const pendentesAntes = state.tasks.filter((task) => task.dealId === primeira.dealId && task.isGate && task.status === "PENDING");
  assert.ok(pendentesAntes.length > 0, "a jornada antiga tinha gates pendentes");

  const segunda = fecharDeal(state, contactId, "Fechamento 2");
  state = crm.startProgramJourney(segunda.state, segunda.dealId, "PROGRAMA_ACOMPANHAMENTO", "u1");

  const daAntiga = state.tasks.filter((task) => task.dealId === primeira.dealId && task.isGate);
  assert.ok(daAntiga.every((task) => task.status !== "PENDING"), "nenhum gate da antiga fica pendente");
  assert.ok(daAntiga.some((task) => task.resultNotes.includes("substituída")));
});

test("gate já concluído na jornada antiga NÃO é mexido", () => {
  let { state, contactId } = estadoComPaciente();
  const primeira = fecharDeal(state, contactId, "Fechamento 1");
  state = crm.startProgramJourney(primeira.state, primeira.dealId, "SOMENTE_TRATAMENTO", "u1");
  state = crm.setProgramPhase(state, primeira.dealId, "TRES_CONTATOS_D1", "u1");
  const gate = state.tasks.find((task) => task.dealId === primeira.dealId && task.isGate);
  state = { ...state, tasks: state.tasks.map((task) => (task.id === gate.id ? { ...task, status: "DONE" } : task)) };

  const segunda = fecharDeal(state, contactId, "Fechamento 2");
  state = crm.startProgramJourney(segunda.state, segunda.dealId, "CLUBE_BRATAN", "u1");
  assert.equal(state.tasks.find((task) => task.id === gate.id).status, "DONE");
});

test("curativa: estado que JÁ carrega duas jornadas abertas é curado (fica a mais recente)", () => {
  let { state, contactId } = estadoComPaciente();
  const primeira = fecharDeal(state, contactId, "Fechamento 1");
  state = crm.startProgramJourney(primeira.state, primeira.dealId, "SOMENTE_TRATAMENTO", "u1");
  const segunda = fecharDeal(state, contactId, "Fechamento 2");
  state = crm.startProgramJourney(segunda.state, segunda.dealId, "PROGRAMA_ACOMPANHAMENTO", "u1");
  // Simula o estado quebrado que ficou preso no aparelho: reabre a antiga.
  state = { ...state, deals: state.deals.map((deal) => (deal.id === primeira.dealId ? { ...deal, programOutcome: null } : deal)) };
  assert.equal(jornadasAbertas(state, contactId).length, 2);

  const curado = crm.enforceOneActiveJourneyPerContact(state);
  const abertas = jornadasAbertas(curado, contactId);
  assert.equal(abertas.length, 1);
  assert.equal(abertas[0].id, segunda.dealId, "fica a jornada mais recente");
});

test("curativa não mexe em quem tem uma jornada só", () => {
  let { state, contactId } = estadoComPaciente();
  const primeira = fecharDeal(state, contactId, "Fechamento 1");
  state = crm.startProgramJourney(primeira.state, primeira.dealId, "SOMENTE_TRATAMENTO", "u1");
  const curado = crm.enforceOneActiveJourneyPerContact(state);
  assert.equal(curado, state, "estado saudável volta intacto (mesma referência)");
});
