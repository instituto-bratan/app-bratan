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
const DEAL = "crm-deal-lead-quente";
const ref = new Date("2026-06-30T09:00:00"); // terça-feira

function closeDeal(state) {
  return crm.moveDealStage(state, DEAL, {
    actorId: "vendedor",
    stage: "FECHOU_COMPLETO",
    soldAmount: 12000,
    adhesionChannel: "PROGRAMA_ACOMPANHAMENTO",
  }).state;
}

// ---- Papel: Assistente de Performance ---------------------------------------

test("nutricionista agora é Assistente de Performance (papel PERFORMANCE)", () => {
  assert.equal(crm.cargoToCrmRole("nutricionista"), "PERFORMANCE");
  assert.equal(crm.crmRoleLabels.PERFORMANCE, "Assistente de Performance");
  assert.equal(crm.cargoToCrmRole("enfermeira"), "ENFERMAGEM");
});

// ---- Rotina de segurança de segunda (vendedor) --------------------------------

test("rotina de segurança nasce para a próxima segunda-feira, uma vez só", () => {
  const state = clone();
  const once = crm.ensureMondaySafetyTask(state, ref); // ter 30/06 → segunda 06/07
  const tasks = once.tasks.filter((t) => t.id.startsWith("task-seguranca-"));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].assignedToRole, "RECEPCAO");
  assert.equal(tasks[0].dueAt.slice(0, 10), "2026-07-06");
  const twice = crm.ensureMondaySafetyTask(once, ref);
  assert.equal(twice.tasks.filter((t) => t.id.startsWith("task-seguranca-")).length, 1, "não duplica");
  assert.equal(twice, once, "estável quando nada muda");
});

// ---- Follow-up D2–D5 do pós-fechamento (Recepção conduz) ----------------------

test("gate Recepção D+1 concluído sem resposta abre o follow-up D2–D5 da recepção", () => {
  let s = crm.advanceAllProgramGates(closeDeal(clone()), ref);
  const gateId = crm.programGateTaskIdFor(DEAL, "TRES_CONTATOS_D1", "recepcao");
  s = crm.completeCrmTask(s, gateId, { result: "SENT", actorId: "recepcao" });
  const contactId = s.deals.find((d) => d.id === DEAL).contactId;
  const enrollment = s.cadenceEnrollments.find((e) => e.cadenceId === "cad-pos-fechamento-d2d5" && e.contactId === contactId);
  assert.ok(enrollment, "inscrição do follow-up existe");
  assert.equal(enrollment.status, "ACTIVE");
});

test("gate Recepção concluído com RESPOSTA não abre follow-up (paciente respondeu)", () => {
  let s = crm.advanceAllProgramGates(closeDeal(clone()), ref);
  const gateId = crm.programGateTaskIdFor(DEAL, "TRES_CONTATOS_D1", "recepcao");
  s = crm.completeCrmTask(s, gateId, { result: "RESPONDED", actorId: "recepcao" });
  const contactId = s.deals.find((d) => d.id === DEAL).contactId;
  assert.ok(!s.cadenceEnrollments.some((e) => e.cadenceId === "cad-pos-fechamento-d2d5" && e.contactId === contactId));
});

// ---- Contrato/SuperSign saiu do app (Lucas, 22/07) ----------------------------

test("fechar NÃO cria tarefa de contrato e não existe régua de assinatura no catálogo", () => {
  const s = closeDeal(clone());
  assert.ok(!s.tasks.some((t) => t.dealId === DEAL && t.taskType === "CONTRACT"), "nenhuma tarefa de contrato ao fechar");
  assert.ok(!s.cadences.some((c) => c.id === "cad-assinatura-d1d5"), "cadência de assinatura fora do catálogo");
  assert.ok(!s.cadenceSteps.some((step) => step.cadenceId === "cad-assinatura-d1d5"), "sem passos de assinatura");
});

// ---- Abraço Bratan / regra 2.3 -----------------------------------------------

test("tarefa concluída com paciente insatisfeito cria a tarefa da Concierge no MESMO dia", () => {
  let s = crm.advanceAllProgramGates(closeDeal(clone()), ref);
  const gateId = crm.programGateTaskIdFor(DEAL, "TRES_CONTATOS_D1", "enfermeira");
  s = crm.completeCrmTask(s, gateId, { result: "RESPONDED", resultNotes: "Dor no local da aplicação", actorId: "enfermagem", sentiment: "NEGATIVE" });
  const concierge = s.tasks.find((t) => t.id === `task-reclamacao-${gateId}`);
  assert.ok(concierge, "tarefa de acolhimento criada");
  assert.equal(concierge.assignedToRole, "CONCIERGE");
  assert.equal(concierge.priority, "CRITICAL");
  assert.ok(s.timelineEvents.some((e) => e.eventType === "COMPLAINT_TO_CONCIERGE"));
  // idempotente: concluir de novo (edge) não duplica
  const again = crm.completeCrmTask(s, gateId, { result: "RESPONDED", actorId: "enfermagem", sentiment: "NEGATIVE" });
  assert.equal(again.tasks.filter((t) => t.id === `task-reclamacao-${gateId}`).length, 1);
});

// ---- Escalonamento D5 → Gestor (5 ligações + encerramento 5.1) -----------------

test("cadência esgotada sem resposta escala para a trilha de 5 ligações do gestor", () => {
  let s = crm.advanceAllProgramGates(closeDeal(clone()), ref);
  const gateId = crm.programGateTaskIdFor(DEAL, "TRES_CONTATOS_D1", "recepcao");
  s = crm.completeCrmTask(s, gateId, { result: "SENT", actorId: "recepcao" });
  const contactId = s.deals.find((d) => d.id === DEAL).contactId;
  const genRef = new Date("2026-07-10T09:00:00");
  // Uma tentativa por vez: conclui sem resposta e deixa a próxima nascer, até esgotar.
  let done = 0;
  for (let i = 0; i < 8; i += 1) {
    s = crm.generateCadenceTasks(s, genRef);
    const open = s.tasks.find(
      (t) => t.cadenceId === "cad-pos-fechamento-d2d5" && t.contactId === contactId && !["DONE", "SKIPPED", "CANCELED"].includes(t.status),
    );
    if (!open) break;
    s = crm.completeCrmTask(s, open.id, { result: "NO_RESPONSE", actorId: "recepcao" });
    done += 1;
  }
  assert.ok(done >= 4, `esgotou os follow-ups (concluídos ${done})`);
  const escalated = crm.escalateExhaustedCadences(s, new Date("2026-07-10T09:00:00"));
  const gestor = escalated.cadenceEnrollments.find((e) => e.cadenceId === "cad-gestor-5lig" && e.contactId === contactId);
  assert.ok(gestor, "inscrição na trilha do gestor");
  const original = escalated.cadenceEnrollments.find((e) => e.cadenceId === "cad-pos-fechamento-d2d5" && e.contactId === contactId);
  assert.equal(original.status, "COMPLETED", "régua original encerrada");
  // idempotente
  const again = crm.escalateExhaustedCadences(escalated, new Date("2026-07-10T09:00:00"));
  assert.equal(
    again.cadenceEnrollments.filter((e) => e.cadenceId === "cad-gestor-5lig" && e.contactId === contactId).length,
    1,
  );
});

test("cadência com RESPOSTA (pausada) NÃO escala para o gestor", () => {
  let s = crm.advanceAllProgramGates(closeDeal(clone()), ref);
  const gateId = crm.programGateTaskIdFor(DEAL, "TRES_CONTATOS_D1", "recepcao");
  s = crm.completeCrmTask(s, gateId, { result: "SENT", actorId: "recepcao" });
  s = crm.generateCadenceTasks(s, new Date("2026-07-10T09:00:00"));
  const contactId = s.deals.find((d) => d.id === DEAL).contactId;
  const first = s.tasks.find((t) => t.cadenceId === "cad-pos-fechamento-d2d5" && t.contactId === contactId);
  s = crm.completeCrmTask(s, first.id, { result: "RESPONDED", actorId: "recepcao" }); // pausa a régua
  const escalated = crm.escalateExhaustedCadences(s, new Date("2026-07-20T09:00:00"));
  assert.ok(!escalated.cadenceEnrollments.some((e) => e.cadenceId === "cad-gestor-5lig" && e.contactId === contactId));
});

// ---- Catálogo: mensagem de encerramento 5.1 ------------------------------------

test("trilha do gestor termina com a mensagem-padrão de encerramento (POP 5.1)", () => {
  const state = clone();
  const steps = state.cadenceSteps.filter((s) => s.cadenceId === "cad-gestor-5lig").sort((a, b) => a.stepOrder - b.stepOrder);
  assert.equal(steps.length, 6, "5 ligações + encerramento");
  assert.ok(steps.slice(0, 5).every((s) => s.taskType === "CALL"));
  assert.equal(steps[5].taskType, "WHATSAPP");
  const template = state.messageTemplates.find((t) => t.id === steps[5].messageTemplateId);
  assert.match(template.body, /encerrando por aqui/i);
});
