import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-06-30", writeLocalValue: () => undefined };

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
const clone = () => JSON.parse(JSON.stringify(crm.demoCrmFixtures));
const DEAL = "crm-deal-lead-quente"; // existe nas fixtures
const ref = new Date("2026-06-30T09:00:00");

function gateTaskId(phase, key) {
  return crm.programGateTaskIdFor(DEAL, phase, key);
}
function complete(state, taskId, actorId) {
  return crm.completeCrmTask(state, taskId, { result: "SENT", actorId });
}

test("startProgramJourney entra em FECHAMENTO_D0 e o pipeline avança para TRES_CONTATOS_D1 com 3 tarefas-gate", () => {
  let s = crm.startProgramJourney(clone(), DEAL, "PROGRAMA_ACOMPANHAMENTO", "vendedor", ref);
  assert.equal(s.deals.find((d) => d.id === DEAL).programPhase, "FECHAMENTO_D0");
  s = crm.advanceAllProgramGates(s, ref); // FECHAMENTO_D0 tem gate vazio → avança sozinho
  const deal = s.deals.find((d) => d.id === DEAL);
  assert.equal(deal.programPhase, "TRES_CONTATOS_D1");
  const gates = s.tasks.filter((t) => t.isGate && t.gatePhase === "TRES_CONTATOS_D1" && t.dealId === DEAL);
  assert.equal(gates.length, 3);
  assert.deepEqual(Array.from(gates, (g) => g.assignedToRole).sort(), ["CONCIERGE", "ENFERMAGEM", "RECEPCAO"]);
});

test("gate parcial (2 de 3) NÃO avança; programGateStatus mostra o papel que falta", () => {
  let s = crm.advanceAllProgramGates(crm.startProgramJourney(clone(), DEAL, "PROGRAMA_ACOMPANHAMENTO", "v", ref), ref);
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "recepcao"), "recepcao");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "concierge"), "concierge");
  const deal = s.deals.find((d) => d.id === DEAL);
  assert.equal(deal.programPhase, "TRES_CONTATOS_D1", "não avança com gate parcial");
  const status = crm.programGateStatus(s, DEAL);
  assert.equal(status.done, 2);
  assert.equal(status.total, 3);
  assert.deepEqual(Array.from(status.missing, (m) => m.role), ["ENFERMAGEM"]);
});

test("gate completo (3 de 3) avança para AGENDAMENTO e cria a tarefa-gate de agendamento", () => {
  let s = crm.advanceAllProgramGates(crm.startProgramJourney(clone(), DEAL, "PROGRAMA_ACOMPANHAMENTO", "v", ref), ref);
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "recepcao"), "recepcao");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "concierge"), "concierge");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "enfermeira"), "enfermagem"); // 3ª fecha o gate
  const deal = s.deals.find((d) => d.id === DEAL);
  assert.equal(deal.programPhase, "AGENDAMENTO");
  assert.ok(s.tasks.some((t) => t.id === gateTaskId("AGENDAMENTO", "recepcao-agenda")), "nasce a tarefa de montar agenda");
});

test("não pula fase: cada avanço é de uma fase por vez (Programa: agenda → 1º atendimento → acompanhamento)", () => {
  let s = crm.advanceAllProgramGates(crm.startProgramJourney(clone(), DEAL, "PROGRAMA_ACOMPANHAMENTO", "v", ref), ref);
  // completa o gate do D+1 → AGENDAMENTO (não salta para frente)
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "recepcao"), "r");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "concierge"), "c");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "enfermeira"), "e");
  assert.equal(s.deals.find((d) => d.id === DEAL).programPhase, "AGENDAMENTO");
  // agenda fechada → 1º ATENDIMENTO (fase nova da enfermeira), não direto pro acompanhamento
  s = complete(s, gateTaskId("AGENDAMENTO", "recepcao-agenda"), "r");
  assert.equal(s.deals.find((d) => d.id === DEAL).programPhase, "PRIMEIRO_ATENDIMENTO");
  // 1ª aplicação feita → CADENCIA_PROGRAMA
  s = complete(s, gateTaskId("PRIMEIRO_ATENDIMENTO", "enfermeira-1atend"), "e");
  assert.equal(s.deals.find((d) => d.id === DEAL).programPhase, "CADENCIA_PROGRAMA");
});

test("esteira CLUBE: gate D+1 só Concierge + Recepção; agenda confirmada → Clube ativo (sem 1º atendimento)", () => {
  let s = crm.advanceAllProgramGates(crm.startProgramJourney(clone(), DEAL, "CLUBE_BRATAN", "v", ref), ref);
  const gates = s.tasks.filter((t) => t.isGate && t.gatePhase === "TRES_CONTATOS_D1" && t.dealId === DEAL);
  assert.deepEqual(Array.from(gates, (g) => g.assignedToRole).sort(), ["CONCIERGE", "RECEPCAO"]);
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "concierge"), "c");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "recepcao"), "r");
  assert.equal(s.deals.find((d) => d.id === DEAL).programPhase, "AGENDAMENTO");
  s = complete(s, gateTaskId("AGENDAMENTO", "recepcao-agenda"), "r");
  assert.equal(s.deals.find((d) => d.id === DEAL).programPhase, "CADENCIA_PROGRAMA", "Clube pula o 1º atendimento");
});

test("esteira SÓ TRATAMENTO: gate D+1 só Concierge + Enfermeira (agendar medicações); depois direto pro 1º atendimento", () => {
  let s = crm.advanceAllProgramGates(crm.startProgramJourney(clone(), DEAL, "SOMENTE_TRATAMENTO", "v", ref), ref);
  const gates = s.tasks.filter((t) => t.isGate && t.gatePhase === "TRES_CONTATOS_D1" && t.dealId === DEAL);
  assert.deepEqual(Array.from(gates, (g) => g.assignedToRole).sort(), ["CONCIERGE", "ENFERMAGEM"]);
  const enf = gates.find((g) => g.assignedToRole === "ENFERMAGEM");
  assert.ok(enf.title.includes("agendar as medicações"), "título da enfermeira muda no Só Tratamento");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "concierge"), "c");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "enfermeira"), "e");
  assert.equal(s.deals.find((d) => d.id === DEAL).programPhase, "PRIMEIRO_ATENDIMENTO", "pula o Agendamento da Recepção");
  s = complete(s, gateTaskId("PRIMEIRO_ATENDIMENTO", "enfermeira-1atend"), "e");
  assert.equal(s.deals.find((d) => d.id === DEAL).programPhase, "CADENCIA_PROGRAMA");
});

test("consulta AVULSA: fechar sem canal NÃO liga jornada nenhuma", () => {
  const s = clone();
  const moved = crm.moveDealStage(s, DEAL, { stage: "FECHOU_COMPLETO", actorId: "estevao", soldAmount: 900 });
  assert.equal(moved.ok, true);
  const deal = moved.state.deals.find((d) => d.id === DEAL);
  assert.equal(deal.programPhase ?? null, null, "sem canal → sem jornada (segue agenda normal)");
  assert.equal(moved.state.tasks.filter((t) => t.isGate && t.dealId === DEAL).length, 0);
});

test("idempotência: advanceAllProgramGates rodado 2x não duplica tarefas/inscrições", () => {
  let s = crm.advanceAllProgramGates(crm.startProgramJourney(clone(), DEAL, "PROGRAMA_ACOMPANHAMENTO", "v", ref), ref);
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "recepcao"), "r");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "concierge"), "c");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "enfermeira"), "e");
  const once = crm.advanceAllProgramGates(s, ref);
  const twice = crm.advanceAllProgramGates(once, ref);
  assert.equal(once.tasks.length, twice.tasks.length);
  assert.equal(once.cadenceEnrollments.length, twice.cadenceEnrollments.length);
});

test("CADENCIA_PROGRAMA inscreve a enfermagem 14 em 14 dias", () => {
  let s = crm.advanceAllProgramGates(crm.startProgramJourney(clone(), DEAL, "PROGRAMA_ACOMPANHAMENTO", "v", ref), ref);
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "recepcao"), "r");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "concierge"), "c");
  s = complete(s, gateTaskId("TRES_CONTATOS_D1", "enfermeira"), "e");
  s = complete(s, gateTaskId("AGENDAMENTO", "recepcao-agenda"), "r");
  s = complete(s, gateTaskId("PRIMEIRO_ATENDIMENTO", "enfermeira-1atend"), "e");
  assert.equal(s.deals.find((d) => d.id === DEAL).programPhase, "CADENCIA_PROGRAMA");
  const contactId = s.deals.find((d) => d.id === DEAL).contactId;
  assert.ok(
    s.cadenceEnrollments.some((e) => e.cadenceId === "cad-nursing-14" && e.contactId === contactId && e.status === "ACTIVE"),
    "inscrito na enfermagem 14d",
  );
});

test("override manual (coordenação) grava a fase e registra timeline", () => {
  const s = crm.setProgramPhase(clone(), DEAL, "ENCERRAMENTO", "lucas", ref);
  assert.equal(s.deals.find((d) => d.id === DEAL).programPhase, "ENCERRAMENTO");
  assert.ok(s.timelineEvents.some((e) => e.eventType === "PHASE_OVERRIDE"));
});

test("completar tarefa normal (não-gate) não mexe em fase", () => {
  const s = clone();
  const normalTask = s.tasks.find((t) => !t.isGate);
  const out = crm.completeCrmTask(s, normalTask.id, { result: "RESPONDED", actorId: "x" });
  assert.equal(out.tasks.find((t) => t.id === normalTask.id).status, "DONE");
  // nenhum deal ganhou programPhase por engano
  assert.equal(out.deals.filter((d) => d.programPhase).length, 0);
});
