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
  todayISO: () => "2026-08-01",
  writeLocalValue: () => undefined,
  formatShortTime: () => "00:00",
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
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const crm = loadTsModule("src/features/crm/crmData.ts");

// Datas dinâmicas: enrolledAt usa o relógio REAL, então os passos −3/−1 têm que
// ser calculados a partir de hoje de verdade.
function diasDepois(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const HOJE = diasDepois(0);

function estadoComPaciente() {
  let state = { ...crm.loadCrmState(), contacts: [], deals: [], tasks: [], cadenceEnrollments: [], timelineEvents: [] };
  const criado = crm.findOrCreateCrmContact(state, { fullName: "Paciente Agenda", phone: "11987654321" }, "lucas");
  state = criado.state;
  return { state, contactId: criado.contact.id };
}

function tarefasDoCiclo(state, contactId) {
  return state.tasks.filter(
    (t) => t.contactId === contactId && t.cadenceId === "cad-return-cycle" && !["DONE", "CANCELED", "SKIPPED"].includes(t.status),
  );
}

test("agendar consulta coloca o paciente no 3·1: nasce o −3 e, resolvido ele, nasce o −1", () => {
  const { state, contactId } = estadoComPaciente();
  const consulta = diasDepois(5);
  const r = crm.scheduleConsultation(state, { contactId, eventDate: consulta, actorId: "lucas" });
  assert.equal(r.changed, true);
  // Regra de ouro nº 3 (1 tarefa ativa por pessoa por paciente): as tarefas do
  // ciclo aparecem UMA por vez — primeiro a confirmação −3…
  const abertas1 = tarefasDoCiclo(r.state, contactId);
  assert.equal(abertas1.length, 1);
  assert.equal(abertas1[0].cadenceStepId, "step-confirm-3");
  assert.equal(abertas1[0].dueAt.slice(0, 10), diasDepois(2), "consulta +5 → confirmação em +2");
  // …recepção resolve a −3 → o lembrete −1 nasce sozinho no próximo ciclo.
  const done = {
    ...r.state,
    tasks: r.state.tasks.map((t) => (t.id === abertas1[0].id ? { ...t, status: "DONE", completedAt: new Date().toISOString() } : t)),
  };
  const regen = crm.generateCadenceTasks(done);
  const abertas2 = tarefasDoCiclo(regen, contactId);
  assert.equal(abertas2.length, 1);
  assert.equal(abertas2[0].cadenceStepId, "step-reminder-1");
  assert.equal(abertas2[0].dueAt.slice(0, 10), diasDepois(4), "lembrete −1 em +4");
});

test("consulta marcada em cima da hora NÃO pare tarefas vencidas (−15/−7 são puladas)", () => {
  const { state, contactId } = estadoComPaciente();
  const r = crm.scheduleConsultation(state, { contactId, eventDate: diasDepois(2), actorId: "lucas" });
  const abertas = tarefasDoCiclo(r.state, contactId);
  const dias = abertas.map((t) => t.dueAt.slice(0, 10));
  assert.ok(dias.length >= 1, "pelo menos o lembrete −1 nasce");
  assert.ok(dias.every((d) => d >= HOJE), `nenhuma tarefa nasce no passado: ${dias.join(",")}`);
});

test("REMARCAÇÃO: mover a data cancela as tarefas antigas e cria as novas", () => {
  const { state, contactId } = estadoComPaciente();
  const dataA = diasDepois(5);
  const dataB = diasDepois(20);
  const primeiro = crm.scheduleConsultation(state, { contactId, eventDate: dataA, actorId: "lucas" });
  const remarcado = crm.scheduleConsultation(primeiro.state, { contactId, eventDate: dataB, actorId: "lucas" });
  assert.equal(remarcado.changed, true);
  const ativas = remarcado.state.cadenceEnrollments.filter(
    (e) => e.contactId === contactId && e.cadenceId === "cad-return-cycle" && e.status === "ACTIVE",
  );
  assert.equal(ativas.length, 1, "um ciclo ativo só");
  assert.equal(ativas[0].triggerDate, dataB);
  const canceladas = remarcado.state.cadenceEnrollments.filter((e) => e.status === "CANCELED");
  assert.match(canceladas[0].canceledReason, /remarcada de .* para /);
  const abertas = tarefasDoCiclo(remarcado.state, contactId);
  assert.ok(abertas.every((t) => t.dueAt.slice(0, 10) >= dataA), "nenhuma tarefa da data antiga sobrou aberta");
});

test("agendar de novo com a MESMA data é idempotente (clique duplo não duplica)", () => {
  const { state, contactId } = estadoComPaciente();
  const a = crm.scheduleConsultation(state, { contactId, eventDate: diasDepois(5), actorId: "lucas" });
  const b = crm.scheduleConsultation(a.state, { contactId, eventDate: diasDepois(5), actorId: "lucas" });
  assert.equal(b.changed, false);
  assert.equal(b.state, a.state, "estado idêntico");
});

test("paciente em OUTRA cadência (resgate) entra no 3·1 mesmo assim — a régua antiga encerra com motivo", () => {
  let { state, contactId } = estadoComPaciente();
  state = crm.enrollContactInCadence(state, {
    cadenceId: "cad-rescue-60d", contactId, dealId: "", triggerSource: "resgate",
    triggerDate: diasDepois(-10), ownerUserId: "concierge", ownerRole: "CONCIERGE",
  });
  assert.ok(state.cadenceEnrollments.some((e) => e.cadenceId === "cad-rescue-60d" && e.status === "ACTIVE"), "resgate ativo");
  const r = crm.scheduleConsultation(state, { contactId, eventDate: diasDepois(9), actorId: "lucas" });
  assert.equal(r.changed, true, "ANTES: a regra de 1 cadência descartava em silêncio; agora substitui");
  const resgate = r.state.cadenceEnrollments.find((e) => e.cadenceId === "cad-rescue-60d");
  assert.equal(resgate.status, "CANCELED");
  const ciclo = r.state.cadenceEnrollments.find((e) => e.cadenceId === "cad-return-cycle" && e.status === "ACTIVE");
  assert.ok(ciclo, "3·1 ativo");
});

test("mover o card para Consulta agendada SEM data é BARRADO com explicação", () => {
  let { state, contactId } = estadoComPaciente();
  state = crm.createDealForContact(state, { contactId, title: "1ª consulta", ownerUserId: "gestao", estimatedValue: 0, sourceChannel: "teste" });
  const deal = state.deals[0];
  const moved = crm.moveDealStage(state, deal.id, { actorId: "lucas", stage: "CONSULTA_AGENDADA" });
  assert.equal(moved.ok, false);
  assert.match(moved.message, /DATA da consulta/);
});

test("mover o card COM data inscreve no 3·1 sozinho (fim do furo)", () => {
  let { state, contactId } = estadoComPaciente();
  state = crm.createDealForContact(state, { contactId, title: "1ª consulta", ownerUserId: "gestao", estimatedValue: 0, sourceChannel: "teste" });
  const deal = state.deals[0];
  const moved = crm.moveDealStage(state, deal.id, { actorId: "lucas", stage: "CONSULTA_AGENDADA", scheduledAt: diasDepois(11) });
  assert.equal(moved.ok, true);
  const ciclo = moved.state.cadenceEnrollments.find((e) => e.contactId === contactId && e.cadenceId === "cad-return-cycle" && e.status === "ACTIVE");
  assert.ok(ciclo, "entrou no ciclo de retorno");
  assert.equal(ciclo.triggerDate, diasDepois(11));
  const generica = moved.state.tasks.find((t) => t.title === "Confirmar consulta e orientar chegada");
  assert.equal(generica, undefined, "a tarefa genérica solta não nasce quando o 3·1 assume");
});

test("radar: agendado sem ciclo ativo aparece; com ciclo, some", () => {
  let { state, contactId } = estadoComPaciente();
  state = crm.createDealForContact(state, { contactId, title: "1ª consulta", ownerUserId: "gestao", estimatedValue: 0, sourceChannel: "teste" });
  const deal = state.deals[0];
  // estado antigo: card em CONSULTA_AGENDADA sem ciclo (dados de antes da correção)
  state = { ...state, deals: state.deals.map((d) => (d.id === deal.id ? { ...d, stage: "CONSULTA_AGENDADA" } : d)) };
  assert.equal(crm.dealsScheduledWithoutConfirmation(state).length, 1, "furo detectado");
  const r = crm.scheduleConsultation(state, { contactId, dealId: deal.id, eventDate: diasDepois(14), actorId: "lucas" });
  assert.equal(crm.dealsScheduledWithoutConfirmation(r.state).length, 0, "furo fechado");
});
